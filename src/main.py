#!/usr/bin/env python3
"""
Korean Law & Precedent MCP Server
공식 korean-law-mcp (https://korean-law-mcp.fly.dev) 통합 버전
- /mcp 프록시: 원격 MCP 서버로 요청 중계
- /search: 통합검색 (법령+행정규칙+조례)
- /law, /admin-rule, /precedent: 개별 검색 & 상세 조회
- /annexes: 별표/서식 조회
- /ai: AI 법률 비서 (MCP 도구 파이프라인)
"""
import asyncio
import sys
import os
import logging
import io
import json
from fastmcp import FastMCP
from fastapi import FastAPI, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# Logger
mcp_logger = logging.getLogger("law-mcp")
level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
mcp_logger.setLevel(level)
if not mcp_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    mcp_logger.addHandler(handler)
mcp_logger.propagate = True

# FastAPI 앱
api = FastAPI(title="한국 법령·판례 AI 통합 검색", version="2.0.0")

# CORS
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FastMCP (stdio mode용)
mcp = FastMCP()


# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., description="검색 키워드")
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=50)

class LawDetailRequest(BaseModel):
    mst: str = Field(..., description="법령일련번호 (MST)")
    jo: Optional[str] = Field(None, description="조문번호 (옵션)")

class AdminRuleDetailRequest(BaseModel):
    id: str = Field(..., description="행정규칙ID")

class AnnexRequest(BaseModel):
    law_name: str = Field(..., description="법령명")
    knd: Optional[str] = Field(None, description="종류: 1=별표, 2=서식")

class PrecedentDetailRequest(BaseModel):
    id: str = Field(..., description="판례ID")

class ChatRequest(BaseModel):
    message: str = Field(..., description="사용자 질문")
    session_id: str = Field("default", description="대화 세션 ID")
    mode: str = Field("chat", description="모드: chat | analyze")

class DocumentAnalyzeRequest(BaseModel):
    text: str = Field(..., description="분석할 문서 텍스트")
    doc_type: str = Field("auto", description="문서 유형: contract | plan | terms | auto")
    user_request: str = Field("", description="추가 요청사항")
    session_id: str = Field("default", description="세션 ID")

class SummarizeRequest(BaseModel):
    precedent_id: str = Field(..., description="판례 ID")

class CompareRequest(BaseModel):
    precedent_ids: List[str] = Field(..., description="비교할 판례 ID 목록 (2~4개)")


# ─────────────────────────────────────────────
# Health & Info
# ─────────────────────────────────────────────

@api.get("/health")
async def health_check():
    from .mcp_client import get_law_oc
    oc = get_law_oc()
    return {
        "status": "ok",
        "service": "Korean Law & Precedent MCP Server v2.0",
        "mcp_endpoint": "https://korean-law-mcp.fly.dev/mcp",
        "environment": {
            "law_api_key": "설정됨" if oc else "설정되지 않음",
            "api_key_preview": (oc[:10] + "...") if oc else "None",
            "gemini_api_key": "설정됨" if os.environ.get("GEMINI_API_KEY") else "설정되지 않음",
        }
    }

@api.post("/health")
async def health_check_post():
    return await health_check()


# ─────────────────────────────────────────────
# MCP Proxy Endpoint
# ─────────────────────────────────────────────

@api.post("/mcp/call")
async def mcp_call(request: Dict[str, Any]):
    """MCP 도구 직접 호출 프록시"""
    from .mcp_client import MCPClient, get_law_oc
    tool_name = request.get("tool")
    args = request.get("args", {})
    oc = request.get("oc") or get_law_oc()
    
    if not tool_name:
        return {"error": "tool 파라미터가 필요합니다"}
    
    client = MCPClient(oc=oc)
    if not client.initialize():
        return {"error": "MCP 서버 연결 실패"}
    
    result = await asyncio.to_thread(client.call_tool, tool_name, args)
    return result


@api.get("/mcp/tools")
async def list_mcp_tools():
    """사용 가능한 MCP 도구 목록 조회"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    if not client.initialize():
        return {"error": "MCP 서버 연결 실패", "tools": []}
    tools = client.list_tools()
    return {"total": len(tools), "tools": tools}


# ─────────────────────────────────────────────
# Search Endpoints (통합검색 + 개별검색)
# ─────────────────────────────────────────────

@api.get("/search/all")
async def search_all_get(
    q: str = Query(..., description="검색 키워드"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    """통합검색: 법령+행정규칙+자치법규"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    result = await asyncio.to_thread(
        client.call_tool, "search_all", {"query": q, "display": page_size}
    )
    return _enrich_search_result(result, q, page, page_size)


@api.post("/search/all")
async def search_all_post(req: SearchRequest):
    return await search_all_get(q=req.query, page=req.page, page_size=req.page_size)


@api.get("/search/law")
async def search_law_get(
    q: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    """법령 검색"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    result = await asyncio.to_thread(
        client.call_tool, "search_law", {"query": q, "display": page_size}
    )
    return _enrich_search_result(result, q, page, page_size)


@api.post("/search/law")
async def search_law_post(req: SearchRequest):
    return await search_law_get(q=req.query, page=req.page, page_size=req.page_size)


@api.get("/search/admin-rule")
async def search_admin_rule_get(
    q: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    knd: Optional[str] = Query(None, description="종류: 1=훈령, 2=예규, 3=고시"),
):
    """행정규칙 검색"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    args = {"query": q, "display": page_size}
    if knd:
        args["knd"] = knd
    result = await asyncio.to_thread(client.call_tool, "search_admin_rule", args)
    return _enrich_search_result(result, q, page, page_size)


@api.post("/search/admin-rule")
async def search_admin_rule_post(req: SearchRequest):
    return await search_admin_rule_get(q=req.query, page=req.page, page_size=req.page_size)


@api.get("/search/precedent")
async def search_precedent_get(
    q: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    court: Optional[str] = Query(None),
):
    """판례 검색"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    args = {"query": q, "display": page_size, "page": page}
    if court:
        args["court"] = court
    result = await asyncio.to_thread(client.call_tool, "search_precedents", args)
    return _enrich_search_result(result, q, page, page_size)


@api.post("/search/precedent")
async def search_precedent_post(req: SearchRequest):
    return await search_precedent_get(q=req.query, page=req.page, page_size=req.page_size)


# ─────────────────────────────────────────────
# Detail Endpoints
# ─────────────────────────────────────────────

@api.get("/law/{mst}")
async def get_law_detail_get(mst: str, jo: Optional[str] = None):
    """법령 전문 조회"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    args = {"mst": mst}
    if jo:
        args["jo"] = jo
    result = await asyncio.to_thread(client.call_tool, "get_law_text", args)
    return result


@api.post("/law/detail")
async def get_law_detail_post(req: LawDetailRequest):
    return await get_law_detail_get(mst=req.mst, jo=req.jo)


@api.get("/law/{mst}/annexes")
async def get_law_annexes(mst: str, law_name: Optional[str] = None):
    """법령 별표/서식 조회"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    
    # If law_name not provided, get it from law text first
    if not law_name:
        law_info = await asyncio.to_thread(client.call_tool, "get_law_text", {"mst": mst})
        text = law_info.get("text", "")
        import re
        name_m = re.search(r"법령명:\s*(.+)", text)
        law_name = name_m.group(1).strip() if name_m else mst
    
    result = await asyncio.to_thread(client.call_tool, "get_annexes", {"lawName": law_name})
    return _parse_annexes(result, mst, law_name)


@api.post("/law/annexes")
async def get_law_annexes_post(req: AnnexRequest):
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    args = {"lawName": req.law_name}
    if req.knd:
        args["knd"] = req.knd
    result = await asyncio.to_thread(client.call_tool, "get_annexes", args)
    return _parse_annexes(result, "", req.law_name)


@api.get("/admin-rule/{rule_id}")
async def get_admin_rule_get(rule_id: str):
    """행정규칙 상세 조회"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    result = await asyncio.to_thread(client.call_tool, "get_admin_rule", {"id": rule_id})
    return result


@api.post("/admin-rule/detail")
async def get_admin_rule_post(req: AdminRuleDetailRequest):
    return await get_admin_rule_get(rule_id=req.id)


@api.get("/precedent/{precedent_id}")
async def get_precedent_detail_get(precedent_id: str):
    """판례 상세 조회"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    result = await asyncio.to_thread(client.call_tool, "get_precedent_text", {"id": precedent_id})
    return result


@api.get("/law/{mst}/three-tier")
async def get_three_tier(mst: str):
    """법령-시행령-시행규칙 3단 비교"""
    from .mcp_client import MCPClient, get_law_oc
    client = MCPClient(oc=get_law_oc())
    client.initialize()
    result = await asyncio.to_thread(client.call_tool, "get_three_tier", {"mst": mst})
    return result


# ─────────────────────────────────────────────
# Legacy Compatibility Endpoints (tools/ prefix)
# ─────────────────────────────────────────────

@api.post("/tools/search_law_tool")
async def legacy_search_law(request_data: Dict[str, Any]):
    """하위 호환: 법령 검색"""
    query = request_data.get("query", "")
    page = int(request_data.get("page", 1))
    page_size = int(request_data.get("page_size", 10))
    return await search_law_get(q=query, page=page, page_size=page_size)


@api.post("/tools/get_law_detail_tool")
async def legacy_get_law_detail(request_data: Dict[str, Any]):
    """하위 호환: 법령 상세 (MST 또는 law_id)"""
    mst = request_data.get("mst") or request_data.get("law_id", "")
    jo = request_data.get("jo")
    return await get_law_detail_get(mst=str(mst), jo=jo)


@api.post("/tools/search_precedent_tool")
async def legacy_search_precedent(request_data: Dict[str, Any]):
    """하위 호환: 판례 검색"""
    query = request_data.get("query", "")
    page = int(request_data.get("page", 1))
    page_size = int(request_data.get("page_size", 10))
    court = request_data.get("court")
    return await search_precedent_get(q=query, page=page, page_size=page_size, court=court)


@api.post("/tools/get_precedent_detail_tool")
async def legacy_get_precedent_detail(request_data: Dict[str, Any]):
    """하위 호환: 판례 상세"""
    pid = request_data.get("precedent_id") or request_data.get("id", "")
    return await get_precedent_detail_get(precedent_id=str(pid))


@api.post("/tools/search_administrative_rule_tool")
async def legacy_search_admin_rule(request_data: Dict[str, Any]):
    """하위 호환: 행정규칙 검색"""
    query = request_data.get("query", "")
    page = int(request_data.get("page", 1))
    page_size = int(request_data.get("page_size", 10))
    return await search_admin_rule_get(q=query, page=page, page_size=page_size)


@api.get("/tools")
async def get_tools():
    """도구 목록 (레거시 호환)"""
    return await list_mcp_tools()


# ─────────────────────────────────────────────
# AI Endpoints
# ─────────────────────────────────────────────

@api.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    """AI 법률 비서 대화"""
    try:
        from .ai_chat import chat_with_ai
        result = await chat_with_ai(
            message=req.message,
            session_id=req.session_id,
            mode=req.mode,
        )
        return result
    except Exception as e:
        mcp_logger.exception("AI chat error: %s", str(e))
        return {"error": str(e), "answer": f"AI 서비스 오류: {str(e)}"}


@api.post("/ai/analyze")
async def ai_analyze_text(req: DocumentAnalyzeRequest):
    """텍스트 문서 법적 분석"""
    try:
        from .ai_chat import analyze_document
        result = await analyze_document(
            document_text=req.text,
            doc_type=req.doc_type,
            user_request=req.user_request,
        )
        return result
    except Exception as e:
        mcp_logger.exception("AI analyze error: %s", str(e))
        return {"error": str(e)}


@api.post("/ai/analyze/upload")
async def ai_analyze_file(
    file: UploadFile = File(...),
    doc_type: str = Form("auto"),
    user_request: str = Form(""),
):
    """PDF/텍스트 파일 업로드 후 법적 분석"""
    try:
        from .ai_chat import analyze_document
        import pdfplumber

        content = await file.read()
        filename = file.filename or ""
        text = ""

        if filename.lower().endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                pages_text = []
                for page in pdf.pages[:30]:
                    pt = page.extract_text()
                    if pt:
                        pages_text.append(pt)
                text = "\n".join(pages_text)
        else:
            for enc in ["utf-8", "cp949", "euc-kr"]:
                try:
                    text = content.decode(enc)
                    break
                except Exception:
                    continue

        if not text.strip():
            return {"error": "파일에서 텍스트를 추출할 수 없습니다."}

        result = await analyze_document(
            document_text=text,
            doc_type=doc_type,
            user_request=user_request or f"파일명: {filename}",
        )
        result["filename"] = filename
        result["extracted_chars"] = len(text)
        return result
    except Exception as e:
        mcp_logger.exception("File analyze error: %s", str(e))
        return {"error": str(e)}


@api.post("/ai/summarize")
async def ai_summarize_precedent(req: SummarizeRequest):
    """판례 AI 요약"""
    try:
        from .ai_chat import summarize_precedent
        return await summarize_precedent(req.precedent_id)
    except Exception as e:
        mcp_logger.exception("AI summarize error: %s", str(e))
        return {"error": str(e)}


@api.post("/ai/compare")
async def ai_compare_precedents(req: CompareRequest):
    """판례 비교 분석"""
    try:
        from .ai_chat import compare_precedents
        return await compare_precedents(req.precedent_ids)
    except Exception as e:
        mcp_logger.exception("AI compare error: %s", str(e))
        return {"error": str(e)}


@api.delete("/ai/session/{session_id}")
async def clear_session(session_id: str):
    """대화 세션 초기화"""
    try:
        from .ai_chat import session_store
        if session_id in session_store:
            del session_store[session_id]
        return {"status": "ok", "message": "세션이 초기화되었습니다."}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────

def _enrich_search_result(result: Dict, query: str, page: int, page_size: int) -> Dict:
    """MCP 검색 결과를 프론트엔드 친화적 형식으로 변환"""
    if "error" in result:
        return result
    
    text = result.get("text", result.get("raw", ""))
    
    # Parse structured data from text
    parsed = _parse_law_search_text(text)
    
    return {
        "query": query,
        "total": parsed.get("total", len(parsed.get("items", []))),
        "page": page,
        "page_size": page_size,
        "laws": parsed.get("items", []),  # unified key
        "rules": parsed.get("rules", []),
        "precedents": parsed.get("precedents", []),
        "ordinances": parsed.get("ordinances", []),
        "raw_text": text[:2000] if text else "",
        "source": "mcp"
    }


def _parse_law_search_text(text: str) -> Dict:
    """Parse law search result text into structured data"""
    import re
    
    items = []
    rules = []
    precedents = []
    ordinances = []
    total = 0
    
    if not text:
        return {"total": 0, "items": [], "rules": [], "precedents": [], "ordinances": []}
    
    # Extract total count
    total_m = re.search(r"총\s*(\d+)건", text)
    if total_m:
        total = int(total_m.group(1))
    
    # Parse law entries (format: N. 법령명\n   - 법령ID: xxx\n   - MST: xxx)
    law_pattern = re.compile(
        r"(\d+)\.\s+(.+?)\n"
        r"(?:.*?법령ID:\s*(\w+)\n)?"
        r"(?:.*?MST:\s*(\d+)\n)?"
        r"(?:.*?공포일:\s*(\d+)\n)?"
        r"(?:.*?구분:\s*(.+?)\n)?",
        re.DOTALL
    )
    
    for m in law_pattern.finditer(text):
        name = m.group(2).strip() if m.group(2) else ""
        law_id = m.group(3) or ""
        mst = m.group(4) or ""
        pub_date = m.group(5) or ""
        law_type = m.group(6) or ""
        
        if name and (law_id or mst):
            items.append({
                "법령명": name,
                "법령ID": law_id,
                "법령일련번호": mst,
                "MST": mst,
                "공포일자": pub_date,
                "법령구분": law_type,
                "snippet": ""
            })
    
    # Parse admin rule entries
    rule_pattern = re.compile(
        r"(\d+)\.\s+(.+?)\n"
        r"(?:.*?행정규칙일련번호:\s*(\d+)\n)?"
        r"(?:.*?행정규칙ID:\s*(\d+)\n)?"
        r"(?:.*?공포일:\s*(\d+)\n)?"
        r"(?:.*?구분:\s*(.+?)\n)?",
        re.DOTALL
    )
    
    # Determine section - if it's admin rule result
    if "행정규칙" in text or "훈령" in text or "고시" in text or "예규" in text:
        for m in rule_pattern.finditer(text):
            name = m.group(2).strip() if m.group(2) else ""
            seq = m.group(3) or ""
            rid = m.group(4) or ""
            pub_date = m.group(5) or ""
            rule_type = m.group(6) or ""
            if name and (seq or rid):
                rules.append({
                    "행정규칙명": name,
                    "행정규칙일련번호": seq,
                    "행정규칙ID": rid,
                    "발령일자": pub_date,
                    "행정규칙종류": rule_type,
                    "snippet": ""
                })
    
    # Parse ordinances from search_all result
    ordin_pattern = re.compile(r"\[(\d+)\]\s+(.+?)\n.*?지자체:\s*(.+?)\n", re.DOTALL)
    for m in ordin_pattern.finditer(text):
        seq = m.group(1) or ""
        name = m.group(2).strip() if m.group(2) else ""
        region = m.group(3).strip() if m.group(3) else ""
        if name:
            ordinances.append({
                "자치법규일련번호": seq,
                "자치법규명": name,
                "지자체": region,
                "snippet": ""
            })
    
    # If nothing parsed from items but text is non-empty, wrap it
    if not items and not rules and not ordinances and text:
        # Try JSON parsing
        try:
            data = json.loads(text)
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                items = data.get("laws", data.get("items", [data]))
        except Exception:
            pass
    
    return {
        "total": total or len(items) + len(rules) + len(ordinances),
        "items": items,
        "rules": rules,
        "precedents": precedents,
        "ordinances": ordinances,
    }


def _parse_annexes(result: Dict, mst: str, law_name: str) -> Dict:
    """Parse annexes result into structured format"""
    import re
    
    if "error" in result:
        return result
    
    text = result.get("text", result.get("raw", ""))
    
    annexes = []
    
    # Parse annex entries: N. [seqNo] 별표명 (서식/별표)
    pattern = re.compile(
        r"(\d+)\.\s+\[(\d+)\]\s+(.+?)\s+\((별표|서식)\)\n"
        r"(?:\s+📚\s+관련법령:\s*(.+?)\n)?",
        re.DOTALL
    )
    
    for m in pattern.finditer(text):
        seq_no = m.group(2) or ""
        name = m.group(3).strip() if m.group(3) else ""
        kind = m.group(4) or ""
        related_law = m.group(5).strip() if m.group(5) else ""
        
        annexes.append({
            "일련번호": seq_no,
            "별표명": name,
            "종류": kind,
            "관련법령": related_law,
            "MST": mst,
            "law_name": law_name,
            # Download link using law.go.kr DRF
            "download_url": f"https://www.law.go.kr/DRF/lawService.do?OC={os.environ.get('LAW_API_KEY','')}&target=byl&MST={mst}&bylSeq={seq_no}&type=PDF" if mst else None,
            "view_url": f"https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq={mst}&bylSeq={seq_no}" if mst else None,
        })
    
    total_m = re.search(r"총\s*(\d+)건", text)
    total = int(total_m.group(1)) if total_m else len(annexes)
    
    return {
        "law_name": law_name,
        "mst": mst,
        "total": total,
        "annexes": annexes,
        "raw_text": text[:3000],
    }


# ─────────────────────────────────────────────
# MCP Tools (for stdio mode)
# ─────────────────────────────────────────────

@mcp.tool()
async def health():
    """서비스 상태 확인"""
    return await health_check()


@mcp.tool()
async def search_law_tool(query: str, display: int = 10):
    """법령을 키워드로 검색합니다."""
    return await search_law_get(q=query, page=1, page_size=display)


@mcp.tool()
async def get_law_text_tool(mst: str, jo: Optional[str] = None):
    """법령 전문을 조회합니다."""
    return await get_law_detail_get(mst=mst, jo=jo)


@mcp.tool()
async def search_admin_rule_tool(query: str, display: int = 10):
    """행정규칙을 검색합니다."""
    return await search_admin_rule_get(q=query, page=1, page_size=display)


# ─────────────────────────────────────────────
# Frontend Static Files
# ─────────────────────────────────────────────
_frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(_frontend_dist):
    api.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @api.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(_frontend_dist, "index.html"))

    @api.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # API 경로는 제외
        api_prefixes = ("tools", "health", "docs", "openapi", "search", "law", "admin-rule", 
                       "precedent", "mcp", "ai")
        if any(full_path.startswith(p) for p in api_prefixes):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))


async def main():
    """MCP stdio 모드"""
    print("MCP Korean Law Server v2.0 starting...", file=sys.stderr)
    try:
        await mcp.run_stdio_async()
    except Exception as e:
        print(f"Server error: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    if os.environ.get("HTTP_MODE") == "1":
        import uvicorn
        port = int(os.environ.get("PORT", 8096))
        uvicorn.run("src.main:api", host="0.0.0.0", port=port, reload=False)
    else:
        asyncio.run(main())
