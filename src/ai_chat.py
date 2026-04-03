"""
ai_chat.py
Gemini 기반 한국 법령·판례 AI 비서
- 모델 Fallback: gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash
- 429 RESOURCE_EXHAUSTED 자동 retry (지수 백오프)
- 자연어 질문 → 법령/판례 API 자동 호출 (Tool Calling)
- 대화 컨텍스트 유지 (세션별 메모리)
- 문서 분석 (계약서, 기획서 등)
- 판례 AI 요약·비교
"""

import os
import json
import logging
import asyncio
import time
import re
from typing import Optional, List, Dict, Any
from google import genai
from google.genai import types
from cachetools import TTLCache

from .tools import (
    search_law,
    get_law_detail,
    search_precedent,
    get_precedent_detail,
    search_administrative_rule,
)

logger = logging.getLogger("law-mcp")

# ─────────────────────────────────────────────
# 모델 우선순위 (무료 티어 한도 높은 순)
# gemini-2.5-flash-lite: 무료 한도 높음, Tool Calling 지원
# gemini-2.5-flash: 하루 20req 무료
# gemini-2.0-flash: 하루 200req (분당 15req)
# ─────────────────────────────────────────────
MODEL_FALLBACK_LIST = [
    "gemini-2.5-flash-lite",   # 1순위: 무료 한도 가장 높음
    "gemini-2.0-flash",        # 2순위
    "gemini-2.5-flash",        # 3순위: 마지막 수단
]

# ─────────────────────────────────────────────
# Gemini 클라이언트 초기화
# ─────────────────────────────────────────────
_gemini_client: Optional[genai.Client] = None

def get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다.")
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _is_rate_limit_error(e: Exception) -> bool:
    """429 RESOURCE_EXHAUSTED 에러인지 확인"""
    msg = str(e)
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower()


def _get_retry_delay(e: Exception) -> float:
    """에러 메시지에서 retryDelay 파싱 (없으면 기본값)"""
    try:
        msg = str(e)
        # 'retryDelay': '15s' 형태 파싱
        m = re.search(r"'retryDelay':\s*'(\d+(?:\.\d+)?)s'", msg)
        if m:
            return min(float(m.group(1)) + 2.0, 30.0)
        # "retry in Xs" 형태
        m2 = re.search(r"retry\s+in\s+([\d.]+)s", msg, re.IGNORECASE)
        if m2:
            return min(float(m2.group(1)) + 2.0, 30.0)
    except Exception:
        pass
    return 12.0  # 기본 12초 대기


async def _generate_with_fallback(
    contents,
    config: types.GenerateContentConfig,
    preferred_model: Optional[str] = None,
) -> tuple:
    """
    모델 Fallback + Retry 로직으로 generate_content 호출.
    preferred_model: 이미 성공한 모델이 있으면 그 모델부터 시도
    Returns: (response, model_name_used)
    """
    client = get_gemini_client()
    last_error = None

    # preferred_model이 있으면 리스트 앞에 배치
    if preferred_model and preferred_model in MODEL_FALLBACK_LIST:
        model_list = [preferred_model] + [m for m in MODEL_FALLBACK_LIST if m != preferred_model]
    else:
        model_list = MODEL_FALLBACK_LIST

    for model_name in model_list:
        # 각 모델당 최대 2회 retry
        for attempt in range(2):
            try:
                logger.info("Gemini call: model=%s attempt=%d", model_name, attempt + 1)
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=contents,
                    config=config,
                )
                return response, model_name
            except Exception as e:
                last_error = e
                if _is_rate_limit_error(e):
                    delay = _get_retry_delay(e) if attempt == 0 else 20.0
                    logger.warning(
                        "Rate limit on %s (attempt %d), waiting %.1fs → next try",
                        model_name, attempt + 1, delay
                    )
                    if attempt == 0:
                        # 같은 모델 1회 재시도
                        await asyncio.sleep(delay)
                        continue
                    else:
                        # 다음 모델로 넘어감
                        break
                else:
                    # Rate limit 외 에러는 즉시 상위로
                    raise

    # 모든 모델 소진
    raise last_error or RuntimeError("모든 AI 모델 호출에 실패했습니다.")


# ─────────────────────────────────────────────
# 세션 메모리 (대화 컨텍스트 유지, 2시간 TTL)
# ─────────────────────────────────────────────
session_store: TTLCache = TTLCache(maxsize=500, ttl=7200)

def get_session_history(session_id: str) -> List[Dict]:
    return session_store.get(session_id, [])

def save_session_history(session_id: str, history: List[Dict]):
    session_store[session_id] = history[-40:]  # 최대 40턴 유지


# ─────────────────────────────────────────────
# Gemini Tool 정의 (Function Calling)
# ─────────────────────────────────────────────
LAW_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="search_law",
            description=(
                "법령명 또는 키워드로 대한민국 법령을 검색합니다. "
                "법률, 대통령령, 부령, 조약 등을 검색할 수 있습니다. "
                "법령이나 규정이 언급될 때마다 반드시 이 도구를 호출하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="검색할 법령 키워드 (예: 민법, 근로기준법, 개인정보보호법, 조류충돌예방)"
                    ),
                    "page": types.Schema(type=types.Type.INTEGER, description="페이지 번호 (기본값: 1)"),
                    "page_size": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5, 최대: 10)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_law_detail",
            description=(
                "법령일련번호(MST)를 이용해 특정 법령의 전체 조문을 조회합니다. "
                "반드시 search_law 검색 결과의 '법령일련번호' 값만 사용하세요. "
                "행정규칙 검색 결과의 '행정규칙일련번호'는 절대 사용하지 마세요. "
                "행정규칙과 법령은 완전히 다른 API입니다. "
                "조문 내용이 필요할 때 반드시 호출하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "law_id": types.Schema(
                        type=types.Type.STRING,
                        description="법령일련번호 - search_law 결과의 '법령일련번호' 값만 사용 (예: 276769, 284415). 행정규칙일련번호(예: 2100000261406) 사용 금지!"
                    ),
                },
                required=["law_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_precedent",
            description=(
                "키워드로 대한민국 법원 판례를 검색합니다. "
                "대법원, 헌법재판소 등의 판례를 찾을 수 있습니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="검색할 판례 키워드 (예: 부당해고, 손해배상, 임차인 보증금)"
                    ),
                    "page": types.Schema(type=types.Type.INTEGER, description="페이지 번호 (기본값: 1)"),
                    "page_size": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5, 최대: 10)"),
                    "court": types.Schema(
                        type=types.Type.STRING,
                        description="법원 필터 (예: 대법원, 헌법재판소. 없으면 전체)"
                    ),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_precedent_detail",
            description=(
                "판례일련번호로 특정 판례의 상세 내용(판시사항, 판결요지, 판례전문)을 조회합니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "precedent_id": types.Schema(
                        type=types.Type.STRING,
                        description="판례일련번호 (판례 검색 결과의 판례일련번호 값)"
                    ),
                },
                required=["precedent_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_administrative_rule",
            description=(
                "키워드로 각 부처의 행정규칙(고시, 훈령, 예규 등)을 검색합니다. "
                "법령 외에 행정규칙도 확인이 필요할 때 사용하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="검색할 행정규칙 키워드"
                    ),
                    "page_size": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5)"),
                },
                required=["query"],
            ),
        ),
    ])
]

# ─────────────────────────────────────────────
# Tool 실행 라우터
# ─────────────────────────────────────────────
def _execute_tool(name: str, args: Dict) -> Any:
    """Gemini가 요청한 도구를 실행하고 결과 반환"""
    try:
        if name == "search_law":
            return search_law(
                query=args["query"],
                page=int(args.get("page", 1)),
                page_size=min(int(args.get("page_size", 5)), 10),
            )
        elif name == "get_law_detail":
            law_id_val = str(args["law_id"])
            # 행정규칙 일련번호(13자리 이상)를 법령 API에 잘못 사용하는 것을 방지
            if len(law_id_val) > 10:
                return {
                    "error": (
                        f"law_id='{law_id_val}'는 행정규칙 일련번호입니다. "
                        "get_law_detail에는 search_law 결과의 '법령일련번호'(6~7자리)만 사용하세요. "
                        "행정규칙 내용은 search_administrative_rule 결과에 포함되어 있습니다."
                    )
                }
            return get_law_detail(law_id=law_id_val)
        elif name == "search_precedent":
            return search_precedent(
                query=args["query"],
                page=int(args.get("page", 1)),
                page_size=min(int(args.get("page_size", 5)), 10),
                court=args.get("court"),
            )
        elif name == "get_precedent_detail":
            return get_precedent_detail(precedent_id=str(args["precedent_id"]))
        elif name == "search_administrative_rule":
            return search_administrative_rule(
                query=args["query"],
                page_size=min(int(args.get("page_size", 5)), 20),
            )
        else:
            return {"error": f"알 수 없는 도구: {name}"}
    except Exception as e:
        logger.exception("Tool execution error: %s args=%s", name, args)
        return {"error": str(e)}


# ─────────────────────────────────────────────
# 시스템 프롬프트
# ─────────────────────────────────────────────
SYSTEM_PROMPT = """당신은 대한민국 법령·판례 전문 AI 비서입니다. 국가법령정보센터 Open API와 연동되어 있어 실시간으로 최신 법령과 판례를 조회할 수 있습니다.

## 핵심 규칙 (반드시 준수)

### ⚠️ 도구 사용 제약 (절대 준수)
- **get_law_detail(law_id)**: 반드시 search_law 결과의 '법령일련번호'만 사용 (6~7자리 숫자, 예: 276769)
- **행정규칙일련번호(2100000261406 같은 13자리 번호)는 get_law_detail에 절대 사용 금지**
- 행정규칙(search_administrative_rule)과 법령(search_law)은 완전히 다른 API입니다
- search_administrative_rule 결과로 얻은 규칙명과 내용은 그대로 답변에 활용하세요

### 검색 전략 (매우 중요)
1. **법령·판례 관련 질문에는 반드시 search_law 또는 search_administrative_rule 도구를 먼저 호출**하세요.
2. **첫 번째 검색에서 결과가 0건이면 다른 키워드로 반드시 재검색**하세요.
   - 예: "조류충돌예방" → 결과 없음 → "야생생물 보호", "인공구조물 야생동물" 등으로 재검색
   - 예: "투명 방음벽 조류" → 결과 없음 → "야생동물 충돌", "방음벽 설치" 등으로 재검색
3. 법령 검색으로 관련 법령을 찾았으면, **get_law_detail로 조문을 반드시 조회**하세요.
   - 반드시 search_law 결과의 '법령일련번호' 값을 law_id로 사용하세요
   - get_law_detail 결과에서 관련 조문을 찾아 답변에 직접 인용하세요
   - 조류충돌예방 관련: 야생생물법(276769)의 제8조의2 참조
4. **search_administrative_rule**도 함께 검색하세요 (행정규칙이 구체적 기준을 담는 경우가 많습니다).
   - 행정규칙 결과: 규칙명, 소관부처, 시행일자를 답변에 활용하세요
5. 도구 조회 없이 추측으로 법령을 언급하지 마세요.

### 관련 법령 추론 (검색 키워드 예시)
- 조류충돌·야생동물 시설: "야생생물 보호", "인공구조물", "야생동물 충돌" → 행정규칙 "조류 충돌위험 감소"
- 건축물 안전: "건축법", "건설기준"
- 환경시설: "환경영향평가", "자연환경보전법"
- 근로자 보호: "산업안전보건법", "근로기준법"

## 응답 원칙
1. 반드시 실제 법령·판례를 조회한 후 답변하세요.
2. 관련 **법령명, 조문번호**를 명시하세요.
3. 법령 조문을 직접 인용(> 블록)하고 쉽게 해석하세요.
4. 법률 비전문가도 이해할 수 있도록 쉬운 말로 설명하세요.
5. 복잡한 내용은 번호 목록으로 정리하세요.
6. 마지막에 면책 문구를 추가하세요: "본 답변은 법률 정보 제공 목적이며 법률 자문을 대체하지 않습니다."
7. 답변에 사용된 법령과 판례는 **[참고 법령] [참고 판례]** 섹션으로 정리하세요.

## 응답 형식 (Markdown)
- 제목: ## 또는 ###
- 핵심 내용: **굵게**
- 법령 조문 인용: > 인용문
- 위험 요소: ⚠️ 표시
- 중요 포인트: ✅ 표시"""

DOCUMENT_ANALYSIS_PROMPT = """당신은 대한민국 법령 전문 AI 분석가입니다. 제공된 문서(계약서, 기획서, 약관 등)를 분석하여 법적 리스크와 관련 법령을 파악합니다.

## 핵심 규칙
- 문서 내용과 관련된 법령을 반드시 search_law 도구로 검색하세요.
- 검색된 법령의 조문이 필요하면 get_law_detail을 호출하세요.

## 분석 절차
1. 문서 유형 파악 (계약서/약관/기획서/기타)
2. 핵심 조항 또는 내용 식별
3. 관련 법령 검색 및 조회
4. 법적 리스크 평가 (높음/중간/낮음)
5. 개선 방향 제안

## 출력 형식
### 📋 문서 개요
### ⚖️ 관련 법령
### ⚠️ 법적 리스크 (위험도 순)
### ✅ 적법한 사항
### 💡 개선 권고사항
### [참고 법령]
### [참고 판례] (있는 경우)

각 리스크는 **[높음/중간/낮음]** 태그로 표시하세요."""


# ─────────────────────────────────────────────
# 메인 채팅 함수 (Tool Calling 루프)
# ─────────────────────────────────────────────
async def chat_with_ai(
    message: str,
    session_id: str = "default",
    mode: str = "chat",
    extra_context: str = "",
) -> Dict:
    """
    Gemini와 대화하며 필요 시 법령/판례 도구를 자동 호출합니다.

    Returns:
        {
            "answer": str,          # 최종 답변 (Markdown)
            "tools_used": list,     # 사용된 도구 목록
            "references": list,     # 참조 법령/판례
            "session_id": str,
            "model_used": str,      # 실제 사용된 모델명
        }
    """
    history = get_session_history(session_id)
    tools_used = []
    references = []
    model_used = MODEL_FALLBACK_LIST[0]

    system = DOCUMENT_ANALYSIS_PROMPT if mode == "analyze" else SYSTEM_PROMPT

    user_content = message
    if extra_context:
        user_content = f"[분석 대상 문서]\n{extra_context}\n\n[사용자 요청]\n{message}"

    # 대화 히스토리를 Gemini Contents 형식으로 변환
    contents = []
    for turn in history:
        contents.append(types.Content(
            role=turn["role"],
            parts=[types.Part(text=turn["content"])]
        ))
    contents.append(types.Content(
        role="user",
        parts=[types.Part(text=user_content)]
    ))

    config = types.GenerateContentConfig(
        system_instruction=system,
        tools=LAW_TOOLS,
        temperature=0.3,
        max_output_tokens=8192,
    )

    final_answer = ""
    max_tool_rounds = 6

    for round_num in range(max_tool_rounds + 1):
        try:
            response, model_used = await _generate_with_fallback(
                contents, config, preferred_model=model_used
            )
        except Exception as e:
            logger.exception("Gemini API final error: %s", str(e))
            # 사용자 친화적 에러 메시지
            if _is_rate_limit_error(e):
                delay = _get_retry_delay(e)
                return {
                    "answer": (
                        f"⚠️ AI 서비스가 일시적으로 요청 한도에 도달했습니다.\n\n"
                        f"**{delay:.0f}초 후 다시 시도해 주세요.** (무료 API 한도 초과)\n\n"
                        "잠시 후 동일한 질문을 다시 입력해 주시면 정상적으로 답변드릴 수 있습니다."
                    ),
                    "tools_used": tools_used,
                    "references": references,
                    "session_id": session_id,
                    "model_used": model_used,
                    "error_type": "rate_limit",
                    "retry_after": int(delay),
                }
            return {
                "answer": f"AI 서비스 오류가 발생했습니다: {str(e)}",
                "tools_used": tools_used,
                "references": references,
                "session_id": session_id,
                "model_used": model_used,
            }

        candidate = response.candidates[0]

        # parts가 None인 경우 방어 처리
        parts = candidate.content.parts if candidate.content and candidate.content.parts else []

        tool_calls = []
        text_parts = []

        for part in parts:
            fc = getattr(part, "function_call", None)
            txt = getattr(part, "text", None)
            if fc and fc.name:
                tool_calls.append(fc)
            elif txt:
                text_parts.append(txt)

        # 도구 호출이 없으면 최종 답변
        if not tool_calls:
            final_answer = "\n".join(text_parts)
            contents.append(candidate.content)
            break

        # 도구 호출 처리
        contents.append(candidate.content)

        tool_response_parts = []
        for fc in tool_calls:
            tool_name = fc.name
            tool_args = dict(fc.args) if fc.args else {}

            logger.info(
                "Tool call [round %d/%s]: %s(%s)",
                round_num + 1, model_used,
                tool_name,
                json.dumps(tool_args, ensure_ascii=False)[:200]
            )

            result = await asyncio.to_thread(_execute_tool, tool_name, tool_args)

            tools_used.append({
                "tool": tool_name,
                "args": tool_args,
                "result_summary": _summarize_tool_result(tool_name, result),
            })

            _extract_references(tool_name, result, references)

            tool_response_parts.append(
                types.Part.from_function_response(
                    name=tool_name,
                    response={"result": json.dumps(result, ensure_ascii=False)},
                )
            )

        contents.append(types.Content(role="user", parts=tool_response_parts))

    # 세션 히스토리 업데이트
    new_history = history + [
        {"role": "user", "content": user_content},
        {"role": "model", "content": final_answer},
    ]
    save_session_history(session_id, new_history)

    return {
        "answer": final_answer or "답변을 생성하지 못했습니다.",
        "tools_used": tools_used,
        "references": references,
        "session_id": session_id,
        "model_used": model_used,
    }


def _summarize_tool_result(tool_name: str, result: Dict) -> str:
    if "error" in result:
        return f"오류: {result['error']}"
    if tool_name == "search_law":
        laws = result.get("laws", [])
        return f"법령 {result.get('total', 0)}건 검색됨, 상위 {len(laws)}건 반환"
    elif tool_name == "get_law_detail":
        return f"법령명: {result.get('법령명', '')}, 조문수: {result.get('조문수', 0)}"
    elif tool_name == "search_precedent":
        precs = result.get("precedents", [])
        return f"판례 {result.get('total', 0)}건 검색됨, 상위 {len(precs)}건 반환"
    elif tool_name == "get_precedent_detail":
        return f"사건명: {result.get('사건명', '')}, 법원: {result.get('법원명', '')}"
    elif tool_name == "search_administrative_rule":
        rules = result.get("rules", [])
        names = [r.get("행정규칙명", "") for r in rules[:3] if r.get("행정규칙명")]
        return f"행정규칙 {result.get('total', 0)}건 검색됨: {', '.join(names) if names else '없음'}"
    return "처리 완료"


def _extract_references(tool_name: str, result: Dict, references: List):
    if "error" in result:
        return
    if tool_name == "search_law":
        for law in result.get("laws", [])[:5]:
            law_id = law.get("법령일련번호", "")
            if law_id:  # 일련번호가 있는 것만 추가
                references.append({
                    "type": "law",
                    "id": law_id,
                    "name": law.get("법령명", ""),
                    "category": law.get("법령구분", ""),
                    "date": law.get("시행일자", ""),
                })
    elif tool_name == "get_law_detail":
        references.append({
            "type": "law_detail",
            "name": result.get("법령명", ""),
            "category": result.get("법령구분", ""),
            "article_count": result.get("조문수", 0),
        })
    elif tool_name == "search_precedent":
        for prec in result.get("precedents", [])[:5]:
            references.append({
                "type": "precedent",
                "id": prec.get("판례일련번호", ""),
                "name": prec.get("사건명", ""),
                "court": prec.get("법원명", ""),
                "date": prec.get("선고일자", ""),
                "number": prec.get("사건번호", ""),
            })
    elif tool_name == "get_precedent_detail":
        references.append({
            "type": "precedent_detail",
            "id": result.get("판례일련번호", ""),
            "name": result.get("사건명", ""),
            "court": result.get("법원명", ""),
            "date": result.get("선고일자", ""),
            "number": result.get("사건번호", ""),
        })
    elif tool_name == "search_administrative_rule":
        for rule in result.get("rules", [])[:5]:
            rule_name = rule.get("행정규칙명", "")
            if rule_name:
                references.append({
                    "type": "admin_rule",
                    "id": rule.get("행정규칙일련번호", ""),
                    "name": rule_name,
                    "category": rule.get("행정규칙종류", ""),
                    "date": rule.get("시행일자", ""),
                })


# ─────────────────────────────────────────────
# 판례 AI 요약
# ─────────────────────────────────────────────
async def summarize_precedent(precedent_id: str) -> Dict:
    """판례 상세를 조회하고 AI로 요약·분석"""
    detail = await asyncio.to_thread(get_precedent_detail, precedent_id)
    if "error" in detail:
        return {"error": detail["error"]}

    prompt = f"""다음 판례를 분석하여 법률 비전문가도 이해할 수 있는 요약을 작성해주세요.

[판례 정보]
사건명: {detail.get('사건명', '')}
사건번호: {detail.get('사건번호', '')}
법원: {detail.get('법원명', '')}
선고일자: {detail.get('선고일자', '')}
결론(선고): {detail.get('선고', '')}

[판시사항]
{detail.get('판시사항', '없음')[:2000]}

[판결요지]
{detail.get('판결요지', '없음')[:2000]}

[참조조문]
{detail.get('참조조문', '없음')[:500]}

다음 형식으로 요약해주세요:
### 🏛️ 판례 핵심 요약
### 📌 쟁점 (이 사건의 핵심 법적 질문)
### ⚖️ 법원의 판단 (결론과 이유)
### 💡 실무적 시사점 (이 판례가 갖는 의미)
### 📋 관련 법령"""

    try:
        config = types.GenerateContentConfig(temperature=0.3, max_output_tokens=4096)
        response, model_used = await _generate_with_fallback(prompt, config)
        return {
            "precedent": detail,
            "summary": response.text,
            "model_used": model_used,
        }
    except Exception as e:
        if _is_rate_limit_error(e):
            delay = _get_retry_delay(e)
            return {
                "error": f"AI 요청 한도 초과. {delay:.0f}초 후 다시 시도해 주세요.",
                "precedent": detail
            }
        return {"error": str(e), "precedent": detail}


# ─────────────────────────────────────────────
# 판례 비교 분석
# ─────────────────────────────────────────────
async def compare_precedents(precedent_ids: List[str]) -> Dict:
    """여러 판례를 조회하고 AI로 비교 분석"""
    if len(precedent_ids) < 2:
        return {"error": "비교하려면 2개 이상의 판례가 필요합니다."}
    if len(precedent_ids) > 4:
        precedent_ids = precedent_ids[:4]

    details = await asyncio.gather(*[
        asyncio.to_thread(get_precedent_detail, pid) for pid in precedent_ids
    ])

    valid = [d for d in details if "error" not in d]
    if len(valid) < 2:
        return {"error": "유효한 판례를 2개 이상 조회하지 못했습니다."}

    cases_text = ""
    for i, d in enumerate(valid, 1):
        cases_text += f"""
[판례 {i}]
사건명: {d.get('사건명', '')}
사건번호: {d.get('사건번호', '')}
법원: {d.get('법원명', '')} / 선고: {d.get('선고일자', '')}
결론: {d.get('선고', '')}
판시사항: {d.get('판시사항', '')[:800]}
판결요지: {d.get('판결요지', '')[:800]}
"""

    col3 = "| 판례 3" if len(valid) >= 3 else ""
    col4 = "| 판례 4" if len(valid) >= 4 else ""
    sep3 = "|--------" if len(valid) >= 3 else ""
    sep4 = "|--------" if len(valid) >= 4 else ""

    prompt = f"""다음 {len(valid)}개 판례를 비교 분석해주세요.

{cases_text}

다음 형식으로 비교 분석을 작성해주세요:

### 📊 판례 비교 개요 (표 형식)
| 항목 | 판례 1 | 판례 2 {col3}{col4} |
|------|--------|--------{sep3}{sep4}|

### 🔍 공통 쟁점
### ⚖️ 법원 판단 비교 (어떻게 다른가)
### 📈 판례 흐름 분석 (시간순 변화가 있다면)
### 💡 결론 및 실무적 시사점"""

    try:
        config = types.GenerateContentConfig(temperature=0.3, max_output_tokens=4096)
        response, model_used = await _generate_with_fallback(prompt, config)
        return {
            "precedents": valid,
            "comparison": response.text,
            "model_used": model_used,
        }
    except Exception as e:
        if _is_rate_limit_error(e):
            delay = _get_retry_delay(e)
            return {
                "error": f"AI 요청 한도 초과. {delay:.0f}초 후 다시 시도해 주세요.",
                "precedents": valid
            }
        return {"error": str(e), "precedents": valid}


# ─────────────────────────────────────────────
# 문서 분석
# ─────────────────────────────────────────────
async def analyze_document(
    document_text: str,
    doc_type: str = "auto",
    user_request: str = "",
) -> Dict:
    """문서 텍스트를 분석하여 법적 리스크와 관련 법령을 파악합니다."""
    if not document_text or len(document_text.strip()) < 50:
        return {"error": "분석할 문서 내용이 너무 짧습니다 (최소 50자)."}

    type_labels = {
        "contract": "계약서",
        "plan": "사업기획서/서비스기획서",
        "terms": "이용약관",
        "auto": "문서",
    }
    label = type_labels.get(doc_type, "문서")
    request_part = f"\n\n[특별 요청사항]\n{user_request}" if user_request else ""
    message = f"다음 {label}를 분석해주세요.{request_part}"

    return await chat_with_ai(
        message=message,
        session_id=f"doc_{hash(document_text[:100])}",
        mode="analyze",
        extra_context=document_text[:8000],
    )
