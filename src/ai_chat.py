"""
ai_chat.py
Gemini 2.5 Flash 기반 한국 법령·판례 AI 비서
- 자연어 질문 이해 → 법령/판례 API 자동 호출 (Tool Calling)
- 대화 컨텍스트 유지 (세션별 메모리)
- 문서 분석 (계약서, 기획서 등)
- 판례 AI 요약·비교
"""

import os
import json
import logging
import asyncio
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
            description="법령명 또는 키워드로 대한민국 법령을 검색합니다. 법률, 대통령령, 부령, 조약 등을 검색할 수 있습니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색할 법령 키워드 (예: 민법, 근로기준법, 개인정보보호법)"),
                    "page": types.Schema(type=types.Type.INTEGER, description="페이지 번호 (기본값: 1)"),
                    "page_size": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5, 최대: 20)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_law_detail",
            description="법령일련번호(MST)를 이용해 특정 법령의 전체 조문을 조회합니다. 법령 검색 결과에서 법령일련번호를 얻어 사용하세요.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "law_id": types.Schema(type=types.Type.STRING, description="법령일련번호 (법령 검색 결과의 법령일련번호 값)"),
                },
                required=["law_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_precedent",
            description="키워드로 대한민국 법원 판례를 검색합니다. 대법원, 헌법재판소 등의 판례를 찾을 수 있습니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색할 판례 키워드 (예: 부당해고, 손해배상, 임차인 보증금)"),
                    "page": types.Schema(type=types.Type.INTEGER, description="페이지 번호 (기본값: 1)"),
                    "page_size": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5, 최대: 10)"),
                    "court": types.Schema(type=types.Type.STRING, description="법원 필터 (예: 대법원, 헌법재판소. 없으면 전체)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_precedent_detail",
            description="판례일련번호로 특정 판례의 상세 내용(판시사항, 판결요지, 판례전문)을 조회합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "precedent_id": types.Schema(type=types.Type.STRING, description="판례일련번호 (판례 검색 결과의 판례일련번호 값)"),
                },
                required=["precedent_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_administrative_rule",
            description="키워드로 각 부처의 행정규칙(고시, 훈령, 예규 등)을 검색합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색할 행정규칙 키워드"),
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
                page_size=min(int(args.get("page_size", 5)), 20),
            )
        elif name == "get_law_detail":
            return get_law_detail(law_id=str(args["law_id"]))
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

## 역할과 능력
- 자연어 질문을 이해하여 관련 법령·판례를 자동으로 검색합니다
- 법령 조문을 해석하고 사용자의 상황에 맞게 설명합니다
- 계약서·문서를 분석하고 법적 리스크를 파악합니다
- 유사 판례를 검색하고 비교 분석합니다
- 어려운 법률 용어를 쉬운 말로 설명합니다

## 응답 원칙
1. **반드시 실제 법령·판례를 조회**한 후 답변하세요. 추측으로 답변하지 마세요.
2. 관련 **법령명, 조문번호, 판례번호**를 명시하세요.
3. 법률 비전문가도 이해할 수 있도록 **쉬운 말로 설명**하세요.
4. 복잡한 내용은 **번호 목록**으로 정리하세요.
5. 마지막에 **면책 문구**를 추가하세요: "본 답변은 법률 정보 제공 목적이며 법률 자문을 대체하지 않습니다."
6. 답변에 사용된 법령과 판례는 **[참고 법령] [참고 판례]** 섹션으로 정리하세요.

## 응답 형식 (Markdown)
- 제목: ## 또는 ###
- 핵심 내용: **굵게**
- 법령 조문 인용: > 인용문
- 위험 요소: ⚠️ 표시
- 중요 포인트: ✅ 표시"""

DOCUMENT_ANALYSIS_PROMPT = """당신은 대한민국 법령 전문 AI 분석가입니다. 제공된 문서(계약서, 기획서, 약관 등)를 분석하여 법적 리스크와 관련 법령을 파악합니다.

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
    mode: str = "chat",  # "chat" | "analyze" | "summarize"
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
        }
    """
    client = get_gemini_client()
    history = get_session_history(session_id)
    tools_used = []
    references = []

    # 시스템 프롬프트 선택
    system = DOCUMENT_ANALYSIS_PROMPT if mode == "analyze" else SYSTEM_PROMPT

    # 현재 메시지 구성
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

    # Tool Calling 루프 (최대 5회 도구 호출)
    final_answer = ""
    max_tool_rounds = 5

    for round_num in range(max_tool_rounds + 1):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    tools=LAW_TOOLS,
                    temperature=0.3,
                    max_output_tokens=8192,
                ),
            )
        except Exception as e:
            logger.exception("Gemini API error: %s", str(e))
            return {
                "answer": f"AI 서비스 오류가 발생했습니다: {str(e)}",
                "tools_used": tools_used,
                "references": references,
                "session_id": session_id,
            }

        candidate = response.candidates[0]
        
        # 도구 호출이 있는지 확인
        tool_calls = []
        text_parts = []
        
        for part in candidate.content.parts:
            if hasattr(part, 'function_call') and part.function_call:
                tool_calls.append(part.function_call)
            elif hasattr(part, 'text') and part.text:
                text_parts.append(part.text)

        # 도구 호출이 없으면 최종 답변
        if not tool_calls:
            final_answer = "\n".join(text_parts)
            # 모델 응답을 히스토리에 추가
            contents.append(candidate.content)
            break

        # 도구 호출 처리
        # 1) 모델의 function_call 응답을 contents에 추가
        contents.append(candidate.content)

        # 2) 각 도구 실행 후 function_response 추가
        tool_response_parts = []
        for fc in tool_calls:
            tool_name = fc.name
            tool_args = dict(fc.args) if fc.args else {}
            
            logger.info("Tool call [round %d]: %s(%s)", round_num + 1, tool_name, json.dumps(tool_args, ensure_ascii=False)[:200])
            
            # 도구 실행
            result = await asyncio.to_thread(_execute_tool, tool_name, tool_args)
            
            tools_used.append({
                "tool": tool_name,
                "args": tool_args,
                "result_summary": _summarize_tool_result(tool_name, result),
            })
            
            # 참조 추출
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
    }


def _summarize_tool_result(tool_name: str, result: Dict) -> str:
    """도구 결과를 짧게 요약"""
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
        return f"행정규칙 {result.get('total', 0)}건 검색됨"
    return "처리 완료"


def _extract_references(tool_name: str, result: Dict, references: List):
    """도구 결과에서 참조 법령/판례 정보 추출"""
    if "error" in result:
        return
    if tool_name == "search_law":
        for law in result.get("laws", [])[:5]:
            references.append({
                "type": "law",
                "id": law.get("법령일련번호", ""),
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


# ─────────────────────────────────────────────
# 판례 AI 요약
# ─────────────────────────────────────────────
async def summarize_precedent(precedent_id: str) -> Dict:
    """판례 상세를 조회하고 AI로 요약·분석"""
    client = get_gemini_client()
    
    # 판례 상세 조회
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
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=4096),
        )
        return {
            "precedent": detail,
            "summary": response.text,
        }
    except Exception as e:
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

    client = get_gemini_client()
    
    # 병렬로 판례 상세 조회
    details = await asyncio.gather(*[
        asyncio.to_thread(get_precedent_detail, pid) for pid in precedent_ids
    ])

    valid = [d for d in details if "error" not in d]
    if len(valid) < 2:
        return {"error": "유효한 판례를 2개 이상 조회하지 못했습니다."}

    # 비교 프롬프트 구성
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

    prompt = f"""다음 {len(valid)}개 판례를 비교 분석해주세요.

{cases_text}

다음 형식으로 비교 분석을 작성해주세요:

### 📊 판례 비교 개요 (표 형식)
| 항목 | 판례 1 | 판례 2 {'| 판례 3' if len(valid) >= 3 else ''} |
|------|--------|--------|

### 🔍 공통 쟁점
### ⚖️ 법원 판단 비교 (어떻게 다른가)
### 📈 판례 흐름 분석 (시간순 변화가 있다면)
### 💡 결론 및 실무적 시사점"""

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=4096),
        )
        return {
            "precedents": valid,
            "comparison": response.text,
        }
    except Exception as e:
        return {"error": str(e), "precedents": valid}


# ─────────────────────────────────────────────
# 문서 분석 (계약서, 기획서 등)
# ─────────────────────────────────────────────
async def analyze_document(
    document_text: str,
    doc_type: str = "auto",  # "contract" | "plan" | "terms" | "auto"
    user_request: str = "",
) -> Dict:
    """
    문서 텍스트를 분석하여 법적 리스크와 관련 법령을 파악합니다.
    """
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
        extra_context=document_text[:8000],  # 최대 8000자
    )
