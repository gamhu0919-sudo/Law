"""
ai_chat.py
Gemini 기반 한국 법령·판례 AI 비서 (MCP 통합 버전)
- 공식 MCP 서버 (korean-law-mcp.fly.dev) 연동
- 모델 Fallback: gemini-2.5-flash-lite → gemini-2.0-flash → gemini-2.5-flash
- 429 RESOURCE_EXHAUSTED 자동 retry (지수 백오프)
- MCP Tool Pipeline: interpret → select_tool → fetch_data → analyze → show_sources
- 대화 컨텍스트 유지 (세션별 메모리)
- 문서 분석 / 판례 요약·비교
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

from .mcp_client import MCPClient, get_law_oc

logger = logging.getLogger("law-mcp")

# ─────────────────────────────────────────────
# 모델 우선순위 (무료 티어 한도 높은 순)
# ─────────────────────────────────────────────
MODEL_FALLBACK_LIST = [
    "gemini-2.5-flash-lite",   # 1순위
    "gemini-2.0-flash",        # 2순위
    "gemini-2.5-flash",        # 3순위
]

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
    msg = str(e)
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower()


def _get_retry_delay(e: Exception) -> float:
    try:
        msg = str(e)
        m = re.search(r"'retryDelay':\s*'(\d+(?:\.\d+)?)s'", msg)
        if m:
            return min(float(m.group(1)) + 2.0, 30.0)
        m2 = re.search(r"retry\s+in\s+([\d.]+)s", msg, re.IGNORECASE)
        if m2:
            return min(float(m2.group(1)) + 2.0, 30.0)
    except Exception:
        pass
    return 12.0


async def _generate_with_fallback(
    contents,
    config: types.GenerateContentConfig,
    preferred_model: Optional[str] = None,
) -> tuple:
    """모델 Fallback + Retry 로직"""
    client = get_gemini_client()
    last_error = None

    if preferred_model and preferred_model in MODEL_FALLBACK_LIST:
        model_list = [preferred_model] + [m for m in MODEL_FALLBACK_LIST if m != preferred_model]
    else:
        model_list = MODEL_FALLBACK_LIST

    for model_name in model_list:
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
                    logger.warning("Rate limit on %s (attempt %d), waiting %.1fs", model_name, attempt + 1, delay)
                    if attempt == 0:
                        await asyncio.sleep(delay)
                        continue
                    else:
                        break
                else:
                    raise

    raise last_error or RuntimeError("모든 AI 모델 호출에 실패했습니다.")


# ─────────────────────────────────────────────
# 세션 메모리
# ─────────────────────────────────────────────
session_store: TTLCache = TTLCache(maxsize=500, ttl=7200)

def get_session_history(session_id: str) -> List[Dict]:
    return session_store.get(session_id, [])

def save_session_history(session_id: str, history: List[Dict]):
    session_store[session_id] = history[-40:]


# ─────────────────────────────────────────────
# MCP Tool Declarations for Gemini Function Calling
# ─────────────────────────────────────────────
LAW_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="search_law",
            description=(
                "법령명 또는 키워드로 대한민국 법령을 검색합니다. "
                "법률, 대통령령, 부령, 조약 등을 검색할 수 있습니다. "
                "반환값에 MST(법령일련번호)와 lawId가 포함됩니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색 키워드 (예: 민법, 근로기준법, 조류충돌예방)"),
                    "display": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5, 최대: 20)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_law_text",
            description=(
                "법령 전문(조문 전체)을 조회합니다. "
                "반드시 search_law 결과의 MST 값을 사용하세요. "
                "특정 조문만 보려면 jo 파라미터에 조문번호를 입력하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "mst": types.Schema(type=types.Type.STRING, description="법령일련번호 - search_law 결과의 MST 값 (예: 276769)"),
                    "jo": types.Schema(type=types.Type.STRING, description="특정 조문번호 (예: '0008002' = 제8조의2, 옵션)"),
                },
                required=["mst"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_all",
            description=(
                "법령+행정규칙+자치법규를 동시에 통합검색합니다. "
                "법령 도메인이 불명확하거나 넓은 범위 검색 시 사용하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색 키워드"),
                    "display": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_admin_rule",
            description=(
                "행정규칙(훈령/예규/고시/지침)을 검색합니다. "
                "검색 결과에 행정규칙ID와 행정규칙일련번호가 포함됩니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색 키워드"),
                    "display": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5)"),
                    "knd": types.Schema(type=types.Type.STRING, description="종류 필터: 1=훈령, 2=예규, 3=고시 (옵션)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_admin_rule",
            description=(
                "행정규칙 상세 내용을 조회합니다. "
                "search_admin_rule 결과의 행정규칙ID를 사용하세요."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "id": types.Schema(type=types.Type.STRING, description="행정규칙ID - search_admin_rule 결과의 행정규칙ID 값"),
                },
                required=["id"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_annexes",
            description=(
                "법령의 별표(부록)와 서식을 조회합니다. "
                "금액 기준, 행정처분 기준 등이 별표에 있습니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "lawName": types.Schema(type=types.Type.STRING, description="법령명 (예: 야생생물 보호 및 관리에 관한 법률)"),
                    "knd": types.Schema(type=types.Type.STRING, description="종류: 1=별표, 2=서식 (옵션)"),
                },
                required=["lawName"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_precedents",
            description=(
                "판례를 키워드로 검색합니다. "
                "대법원, 헌법재판소 등의 판례를 찾을 수 있습니다."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색 키워드"),
                    "court": types.Schema(type=types.Type.STRING, description="법원 구분 (예: 대법원, 헌법재판소, 옵션)"),
                    "display": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5)"),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_precedent_text",
            description="판례 전문을 조회합니다. search_precedents 결과의 ID를 사용하세요.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "id": types.Schema(type=types.Type.STRING, description="판례 ID"),
                },
                required=["id"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_three_tier",
            description="법률-시행령-시행규칙 3단 비교를 조회합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "mst": types.Schema(type=types.Type.STRING, description="법령일련번호 (MST)"),
                },
                required=["mst"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_interpretations",
            description="법령해석례를 검색합니다. 특정 조문의 해석이 필요할 때 사용하세요.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="검색 키워드"),
                    "display": types.Schema(type=types.Type.INTEGER, description="결과 수 (기본값: 5)"),
                },
                required=["query"],
            ),
        ),
    ])
]

# ─────────────────────────────────────────────
# System Prompt
# ─────────────────────────────────────────────
SYSTEM_PROMPT = """당신은 대한민국 법령·판례 전문 AI 비서입니다. 공식 법령정보 MCP 서버의 도구를 활용하여 정확한 법률 정보를 제공합니다.

## 도구 사용 원칙

### 검색 전략
1. **법령 검색 우선**: 질문에 법령이 언급되면 즉시 `search_law`를 호출하세요
2. **통합검색 활용**: 법령 도메인이 불명확할 때는 `search_all`로 시작하세요
3. **조문 확인 필수**: 법령을 찾으면 반드시 `get_law_text(mst=법령일련번호)`로 실제 조문을 확인하세요
4. **행정규칙 구분**: 행정규칙은 `search_admin_rule`로 검색하고, 상세는 `get_admin_rule(id=행정규칙ID)`로 조회하세요
5. **별표 확인**: 기준·금액이 별표에 있을 때는 `get_annexes(lawName=법령명)`를 호출하세요

### 도구 파라미터 규칙
- `get_law_text`: `mst` 파라미터는 search_law 결과의 MST 값만 사용 (예: 276769)
- `get_admin_rule`: `id` 파라미터는 search_admin_rule 결과의 행정규칙ID 사용
- 행정규칙일련번호(13자리 숫자)를 get_law_text에 절대 사용하지 마세요

## 응답 형식

### 법령 해석 질문
1. 관련 법령 검색 및 조문 확인
2. 법령명, 조문번호, 조문 내용 인용
3. 조문의 의미와 적용 범위 해석
4. 관련 행정규칙·판례 제시 (있을 경우)
5. 실무적 조언

### 일반 법률 질문
1. 핵심 답변 먼저
2. 관련 법령·판례 근거
3. 주의사항 및 예외

## 중요 지침
- 조문 내용은 반드시 실제 API 조회 결과를 인용하세요 (추측 금지)
- "법적 자문이 아닙니다" 문구를 최종 응답에 포함하세요
- 마크다운 형식으로 구조화된 답변을 제공하세요
- 한국어로 답변하세요"""

DOCUMENT_ANALYSIS_PROMPT = """당신은 계약서·법률문서 분석 전문 AI입니다. MCP 도구로 관련 법령을 조회하여 문서를 분석합니다.

분석 구조:
1. **문서 유형 파악**: 계약서/약관/기획서/기타 구분
2. **주요 법적 쟁점**: 불공정 조항, 법령 위반 여부
3. **관련 법령 조회**: search_law → get_law_text로 관련 조문 확인
4. **리스크 평가**: 고위험/중위험/저위험 분류
5. **개선 권고**: 수정 제안

주의: 실제 법적 자문이 아니며, 전문 변호사 상담을 권장합니다."""


# ─────────────────────────────────────────────
# MCP Tool Executor
# ─────────────────────────────────────────────

def _get_mcp_client() -> MCPClient:
    """Get initialized MCP client"""
    oc = get_law_oc()
    client = MCPClient(oc=oc)
    client.initialize()
    return client


def _execute_mcp_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute MCP tool and return result"""
    try:
        client = _get_mcp_client()
        result = client.call_tool(tool_name, args)
        logger.info("MCP tool executed: %s args=%s", tool_name, list(args.keys()))
        return result
    except Exception as e:
        logger.error("MCP tool error: %s %s", tool_name, str(e))
        return {"error": f"도구 호출 오류: {str(e)}"}


def _summarize_tool_result(tool_name: str, result: Dict[str, Any]) -> str:
    """Summarize MCP tool result for AI context"""
    if "error" in result:
        return f"[{tool_name} 오류]: {result['error']}"
    
    text = result.get("text", result.get("raw", ""))
    
    # Limit length for context
    if len(text) > 3000:
        text = text[:3000] + "\n...(이후 내용 생략)"
    
    return f"[{tool_name} 결과]:\n{text}"


# ─────────────────────────────────────────────
# Reference Extraction
# ─────────────────────────────────────────────

def _extract_references(tool_calls_log: List[Dict]) -> List[Dict]:
    """Extract structured references from tool call log"""
    references = []
    seen = set()
    
    for call in tool_calls_log:
        tool = call.get("tool", "")
        args = call.get("args", {})
        result = call.get("result", {})
        text = result.get("text", result.get("raw", "")) if isinstance(result, dict) else str(result)
        
        if tool == "search_law":
            query = args.get("query", "")
            # Parse MST and law names from result text
            mst_matches = re.findall(r"MST:\s*(\d+)", text)
            name_matches = re.findall(r"\d+\.\s+([^\n]+)\n", text)
            for i, mst in enumerate(mst_matches[:5]):
                name = name_matches[i] if i < len(name_matches) else query
                name = name.strip()
                key = f"law_{mst}"
                if key not in seen:
                    seen.add(key)
                    references.append({
                        "type": "law",
                        "id": mst,
                        "name": name,
                        "query": query
                    })
        
        elif tool == "get_law_text":
            mst = args.get("mst", "")
            # Extract law name from result
            name_m = re.search(r"법령명:\s*(.+)", text)
            name = name_m.group(1).strip() if name_m else f"법령 ({mst})"
            key = f"law_text_{mst}"
            if key not in seen:
                seen.add(key)
                references.append({
                    "type": "law_detail",
                    "id": mst,
                    "name": name,
                })
        
        elif tool == "search_all":
            query = args.get("query", "")
            # Extract ordinance names
            ord_matches = re.findall(r"\[(\d+)\]\s+([^\n]+)", text)
            for seq, name in ord_matches[:3]:
                key = f"all_{seq}"
                if key not in seen:
                    seen.add(key)
                    references.append({
                        "type": "search_all",
                        "id": seq,
                        "name": name.strip(),
                        "query": query
                    })
        
        elif tool == "search_admin_rule":
            # Extract admin rule info
            rule_matches = re.findall(r"\d+\.\s+([^\n]+)\n.*?행정규칙ID:\s*(\d+)", text, re.DOTALL)
            for name, rid in rule_matches[:3]:
                key = f"admin_{rid}"
                if key not in seen:
                    seen.add(key)
                    references.append({
                        "type": "admin_rule",
                        "id": rid,
                        "name": name.strip(),
                    })
        
        elif tool == "get_admin_rule":
            rid = args.get("id", "")
            key = f"admin_detail_{rid}"
            if key not in seen and rid:
                seen.add(key)
                references.append({
                    "type": "admin_rule_detail",
                    "id": rid,
                    "name": f"행정규칙 ({rid})",
                })
        
        elif tool == "search_precedents":
            query = args.get("query", "")
            # Extract case names
            case_matches = re.findall(r"판례번호:\s*(\d+).*?사건명:\s*([^\n]+)", text, re.DOTALL)
            for pid, name in case_matches[:3]:
                key = f"prec_{pid}"
                if key not in seen:
                    seen.add(key)
                    references.append({
                        "type": "precedent",
                        "id": pid,
                        "name": name.strip(),
                        "query": query
                    })
        
        elif tool == "get_precedent_text":
            pid = args.get("id", "")
            key = f"prec_detail_{pid}"
            if key not in seen and pid:
                seen.add(key)
                references.append({
                    "type": "precedent_detail",
                    "id": pid,
                    "name": f"판례 ({pid})",
                })
    
    return references


# ─────────────────────────────────────────────
# Main Chat Function
# ─────────────────────────────────────────────

async def chat_with_ai(
    message: str,
    session_id: str = "default",
    mode: str = "chat",
) -> Dict[str, Any]:
    """AI 법률 비서와 대화 - MCP 도구 파이프라인 활용"""
    
    history = get_session_history(session_id)
    system_prompt = SYSTEM_PROMPT if mode != "analyze" else DOCUMENT_ANALYSIS_PROMPT
    
    # Build conversation history for Gemini
    contents = []
    for turn in history[-10:]:  # last 10 turns
        contents.append(types.Content(
            role=turn["role"],
            parts=[types.Part(text=turn["content"])]
        ))
    
    # Add current user message
    contents.append(types.Content(
        role="user",
        parts=[types.Part(text=message)]
    ))
    
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=LAW_TOOLS,
        temperature=0.3,
        max_output_tokens=8192,
    )
    
    tools_used = []
    tool_calls_log = []
    model_used = MODEL_FALLBACK_LIST[0]
    preferred_model = None
    final_answer = ""
    
    try:
        # Tool calling loop (max 8 rounds)
        for round_num in range(8):
            response, model_used = await _generate_with_fallback(contents, config, preferred_model)
            preferred_model = model_used  # Use successful model for next round
            
            # Check if response has function calls
            has_tool_calls = False
            tool_results_parts = []
            
            if response.candidates:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, "function_call") and part.function_call:
                            has_tool_calls = True
                            fc = part.function_call
                            tool_name = fc.name
                            tool_args = dict(fc.args) if fc.args else {}
                            
                            logger.info("AI Tool call [round %d]: %s(%s)", round_num + 1, tool_name, list(tool_args.keys()))
                            
                            # Execute MCP tool
                            tool_result = await asyncio.to_thread(_execute_mcp_tool, tool_name, tool_args)
                            
                            # Log tool call
                            tool_calls_log.append({
                                "tool": tool_name,
                                "args": tool_args,
                                "result": tool_result,
                                "round": round_num + 1,
                            })
                            
                            if tool_name not in tools_used:
                                tools_used.append(tool_name)
                            
                            # Prepare result for Gemini
                            result_text = _summarize_tool_result(tool_name, tool_result)
                            tool_results_parts.append(
                                types.Part(
                                    function_response=types.FunctionResponse(
                                        name=tool_name,
                                        response={"result": result_text}
                                    )
                                )
                            )
            
            if has_tool_calls and tool_results_parts:
                # Add AI's tool call to contents
                contents.append(response.candidates[0].content)
                # Add tool results
                contents.append(types.Content(
                    role="tool",
                    parts=tool_results_parts
                ))
                continue
            
            # No more tool calls - extract final text answer
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "text") and part.text:
                        final_answer += part.text
            
            break
        
        if not final_answer:
            final_answer = "죄송합니다. 응답을 생성하지 못했습니다. 다시 시도해주세요."
        
        # Extract references from tool calls
        references = _extract_references(tool_calls_log)
        
        # Update session history
        history.append({"role": "user", "content": message})
        history.append({"role": "model", "content": final_answer})
        save_session_history(session_id, history)
        
        return {
            "answer": final_answer,
            "tools_used": tools_used,
            "references": references,
            "session_id": session_id,
            "model_used": model_used,
            "tool_calls_count": len(tool_calls_log),
        }
    
    except Exception as e:
        logger.exception("AI chat error: %s", str(e))
        
        if _is_rate_limit_error(e):
            return {
                "answer": (
                    "⚠️ **AI 서비스 일시 제한**\n\n"
                    "현재 Gemini API 요청 한도에 도달했습니다. "
                    "잠시 후 다시 시도해주세요 (약 30초~1분 대기 권장).\n\n"
                    "**대안:**\n"
                    "- 법령 검색 탭에서 직접 검색하세요\n"
                    "- 판례 검색으로 관련 사례를 찾아보세요"
                ),
                "tools_used": [],
                "references": [],
                "session_id": session_id,
                "model_used": "unavailable",
                "is_rate_limit": True,
            }
        
        return {
            "answer": f"⚠️ AI 서비스 오류가 발생했습니다: {str(e)}",
            "tools_used": [],
            "references": [],
            "session_id": session_id,
            "model_used": "error",
        }


# ─────────────────────────────────────────────
# Document Analysis
# ─────────────────────────────────────────────

async def analyze_document(
    document_text: str,
    doc_type: str = "auto",
    user_request: str = "",
) -> Dict[str, Any]:
    """법률 문서 분석"""
    
    # Detect document type
    doc_type_hints = {
        "contract": "계약서",
        "terms": "이용약관",
        "plan": "사업기획서",
        "auto": "문서"
    }
    doc_label = doc_type_hints.get(doc_type, "문서")
    
    prompt = f"""다음 {doc_label}을 법적 관점에서 분석해주세요.

{f"분석 요청: {user_request}" if user_request else ""}

--- 문서 내용 ---
{document_text[:8000]}
--- 끝 ---

분석 시 관련 법령을 search_law와 get_law_text 도구로 직접 조회하여 근거를 제시해주세요."""
    
    result = await chat_with_ai(
        message=prompt,
        session_id=f"analyze_{int(time.time())}",
        mode="analyze"
    )
    
    result["doc_type"] = doc_type
    result["analyzed_chars"] = len(document_text)
    return result


# ─────────────────────────────────────────────
# Precedent Summary & Compare
# ─────────────────────────────────────────────

async def summarize_precedent(precedent_id: str) -> Dict[str, Any]:
    """판례 AI 요약"""
    
    # Get precedent text via MCP
    prec_text = await asyncio.to_thread(_execute_mcp_tool, "get_precedent_text", {"id": precedent_id})
    
    if "error" in prec_text:
        return {"error": prec_text["error"]}
    
    text_content = prec_text.get("text", prec_text.get("raw", ""))
    
    prompt = f"""다음 판례를 일반인이 이해하기 쉽게 요약해주세요:

{text_content[:6000]}

요약 형식:
1. 사건 개요 (3~5줄)
2. 핵심 쟁점
3. 법원 판단 (판결 요지)
4. 의미와 시사점
5. 관련 법령"""
    
    result = await chat_with_ai(
        message=prompt,
        session_id=f"summary_{precedent_id}",
    )
    result["precedent_id"] = precedent_id
    return result


async def compare_precedents(precedent_ids: List[str]) -> Dict[str, Any]:
    """판례 비교 분석"""
    
    if len(precedent_ids) < 2:
        return {"error": "비교할 판례가 2개 이상 필요합니다."}
    
    # Fetch all precedents
    prec_texts = []
    for pid in precedent_ids[:4]:
        result = await asyncio.to_thread(_execute_mcp_tool, "get_precedent_text", {"id": pid})
        text = result.get("text", result.get("raw", ""))[:2000]
        prec_texts.append(f"판례 {pid}:\n{text}")
    
    combined = "\n\n---\n\n".join(prec_texts)
    
    prompt = f"""다음 판례들을 비교 분석해주세요:

{combined}

비교 분석 형식:
1. 각 판례 개요
2. 공통점
3. 차이점 (쟁점, 판단, 법령 해석)
4. 판례 흐름 및 변화
5. 실무적 시사점"""
    
    result = await chat_with_ai(
        message=prompt,
        session_id=f"compare_{'_'.join(precedent_ids[:4])}",
    )
    result["precedent_ids"] = precedent_ids
    return result
