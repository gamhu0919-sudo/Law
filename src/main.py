#!/usr/bin/env python3
"""
Korean Law & Precedent MCP Server using FastMCP
국가법령정보센터 Open API를 활용한 법률/판례 검색 서버
"""
import asyncio
import sys
import os
import logging
import io
from fastmcp import FastMCP
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from .tools import (
    search_law, 
    get_law_detail, 
    search_precedent, 
    get_precedent_detail,
    search_administrative_rule
)
from typing import Optional, List
from dotenv import load_dotenv
from contextlib import contextmanager

# .env 파일 로드
load_dotenv()

# FastAPI / FastMCP 앱 구성
api = FastAPI(title="한국 법령·판례 검색 API", version="1.0.0")

# CORS 미들웨어 추가
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
mcp_logger = logging.getLogger("law-mcp")
level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
mcp_logger.setLevel(level)
if not mcp_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    mcp_logger.addHandler(handler)
mcp_logger.propagate = True
mcp = FastMCP()


# Pydantic 모델 정의
class LawSearchRequest(BaseModel):
    query: str = Field(..., description="검색할 법령 키워드")
    page: int = Field(1, description="페이지 번호 (기본값: 1)", ge=1)
    page_size: int = Field(10, description="페이지당 결과 수 (기본값: 10, 최대: 50)", ge=1, le=50)


class LawDetailRequest(BaseModel):
    law_id: str = Field(..., description="조회할 법령 ID")


class PrecedentSearchRequest(BaseModel):
    query: str = Field(..., description="검색할 판례 키워드")
    page: int = Field(1, description="페이지 번호 (기본값: 1)", ge=1)
    page_size: int = Field(10, description="페이지당 결과 수 (기본값: 10, 최대: 50)", ge=1, le=50)
    court: Optional[str] = Field(None, description="법원 구분 (예: '대법원', '헌법재판소')")


class PrecedentDetailRequest(BaseModel):
    precedent_id: str = Field(..., description="조회할 판례 일련번호")


class AdminRuleSearchRequest(BaseModel):
    query: str = Field(..., description="검색할 행정규칙 키워드")
    page: int = Field(1, description="페이지 번호 (기본값: 1)", ge=1)
    page_size: int = Field(10, description="페이지당 결과 수 (기본값: 10, 최대: 50)", ge=1, le=50)


# 실제 구현 함수들
async def search_law_impl(req: LawSearchRequest, arguments: Optional[dict] = None):
    """법령 검색 구현"""
    try:
        if arguments is None:
            arguments = {}
        return await asyncio.to_thread(search_law, req.query, req.page, req.page_size, arguments)
    except Exception as e:
        return {"error": f"법령 검색 중 오류가 발생했습니다: {str(e)}"}


async def get_law_detail_impl(req: LawDetailRequest, arguments: Optional[dict] = None):
    """법령 상세 조회 구현"""
    try:
        if arguments is None:
            arguments = {}
        return await asyncio.to_thread(get_law_detail, req.law_id, arguments)
    except Exception as e:
        return {"error": f"법령 상세 조회 중 오류가 발생했습니다: {str(e)}"}


async def search_precedent_impl(req: PrecedentSearchRequest, arguments: Optional[dict] = None):
    """판례 검색 구현"""
    try:
        if arguments is None:
            arguments = {}
        return await asyncio.to_thread(
            search_precedent, 
            req.query, 
            req.page, 
            req.page_size, 
            req.court,
            arguments
        )
    except Exception as e:
        return {"error": f"판례 검색 중 오류가 발생했습니다: {str(e)}"}


async def get_precedent_detail_impl(req: PrecedentDetailRequest, arguments: Optional[dict] = None):
    """판례 상세 조회 구현"""
    try:
        if arguments is None:
            arguments = {}
        return await asyncio.to_thread(get_precedent_detail, req.precedent_id, arguments)
    except Exception as e:
        return {"error": f"판례 상세 조회 중 오류가 발생했습니다: {str(e)}"}


async def search_administrative_rule_impl(req: AdminRuleSearchRequest, arguments: Optional[dict] = None):
    """행정규칙 검색 구현"""
    try:
        if arguments is None:
            arguments = {}
        return await asyncio.to_thread(
            search_administrative_rule, 
            req.query, 
            req.page, 
            req.page_size,
            arguments
        )
    except Exception as e:
        return {"error": f"행정규칙 검색 중 오류가 발생했습니다: {str(e)}"}


async def health_impl():
    """서비스 상태 확인 구현"""
    api_key = os.environ.get("LAW_API_KEY", "")
    api_key_status = "설정됨" if api_key else "설정되지 않음"
    return {
        "status": "ok",
        "service": "Korean Law & Precedent MCP Server",
        "environment": {
            "law_api_key": api_key_status,
            "api_key_preview": api_key[:10] + "..." if api_key else "None"
        }
    }


# 일시 환경 변수 적용용 컨텍스트 매니저
@contextmanager
def temporary_env(overrides: dict):
    saved_values = {}
    try:
        for key, value in (overrides or {}).items():
            saved_values[key] = os.environ.get(key)
            if value is not None:
                os.environ[key] = str(value)
        yield
    finally:
        for key, original in saved_values.items():
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original


# HTTP 엔드포인트
@api.get("/health")
async def health_check_get():
    """HTTP GET 엔드포인트: 서비스 상태 확인"""
    return await health_impl()

@api.post("/health")
async def health_check_post():
    """HTTP POST 엔드포인트: 서비스 상태 확인"""
    return await health_impl()


# HTTP 엔드포인트: 도구 목록 조회
@api.get("/tools")
async def get_tools_http():
    """HTTP 엔드포인트: 사용 가능한 도구 목록 조회"""
    try:
        # FastMCP의 내부 도구 목록 가져오기
        tools_list = []
        server = getattr(mcp, 'server', None)  # type: ignore
        if server and hasattr(server, 'tools'):
            tools = getattr(server, 'tools', {})  # type: ignore
            for tool_name, tool in tools.items():
                tool_info = {
                    "name": tool_name,
                    "description": getattr(tool, 'description', '') or '',
                }
                if hasattr(tool, 'parameters'):
                    tool_info["parameters"] = getattr(tool, 'parameters', {})
                else:
                    tool_info["parameters"] = {}
                tools_list.append(tool_info)
        
        # FastMCP 접근 실패 시 하드코딩된 목록 반환
        if not tools_list:
            mcp_logger.warning("FastMCP tools not accessible, returning hardcoded tool list")
            tools_list = [
                {
                    "name": "health",
                    "description": "서비스 상태 확인",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "search_law_tool",
                    "description": "법령을 키워드로 검색합니다.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "검색할 법령 키워드 (예: '민법', '상법')"},
                            "page": {"type": "integer", "description": "페이지 번호 (기본값: 1)", "default": 1, "minimum": 1},
                            "page_size": {"type": "integer", "description": "페이지당 결과 수 (기본값: 10, 최대: 50)", "default": 10, "minimum": 1, "maximum": 50}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "get_law_detail_tool",
                    "description": "특정 법령의 상세 정보 및 전문(조문)을 조회합니다.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "law_id": {"type": "string", "description": "법령 ID (법령 검색 결과에서 얻은 법령ID)"}
                        },
                        "required": ["law_id"]
                    }
                },
                {
                    "name": "search_precedent_tool",
                    "description": "판례를 키워드로 검색합니다.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "검색할 판례 키워드 (예: '손해배상', '계약')"},
                            "page": {"type": "integer", "description": "페이지 번호 (기본값: 1)", "default": 1, "minimum": 1},
                            "page_size": {"type": "integer", "description": "페이지당 결과 수 (기본값: 10, 최대: 50)", "default": 10, "minimum": 1, "maximum": 50},
                            "court": {"type": "string", "description": "법원 구분 (예: '대법원', '헌법재판소')"}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "get_precedent_detail_tool",
                    "description": "특정 판례의 상세 정보를 조회합니다.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "precedent_id": {"type": "string", "description": "판례 일련번호"}
                        },
                        "required": ["precedent_id"]
                    }
                },
                {
                    "name": "search_administrative_rule_tool",
                    "description": "행정규칙을 키워드로 검색합니다.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "검색할 행정규칙 키워드"},
                            "page": {"type": "integer", "description": "페이지 번호 (기본값: 1)", "default": 1, "minimum": 1},
                            "page_size": {"type": "integer", "description": "페이지당 결과 수 (기본값: 10, 최대: 50)", "default": 10, "minimum": 1, "maximum": 50}
                        },
                        "required": ["query"]
                    }
                }
            ]
        
        return tools_list
    except Exception as e:
        mcp_logger.exception("Error getting tools list: %s", str(e))
        return []


# HTTP 엔드포인트: 도구 호출
@api.post("/tools/{tool_name}")
async def call_tool_http(tool_name: str, request_data: dict):
    mcp_logger.debug("HTTP call_tool | tool=%s request=%s", tool_name, request_data)
    env = request_data.get("env", {}) if isinstance(request_data, dict) else {}

    async def run_sync(func, *args, **kwargs):
        return await asyncio.to_thread(func, *args, **kwargs)
    
    # 공통 타입 변환 함수들
    def convert_float_to_int(data: dict, keys: list):
        """지정된 키의 float 값을 int로 변환"""
        for key in keys:
            if key in data and isinstance(data[key], float):
                data[key] = int(data[key])
    
    def convert_to_str(data: dict, keys: list):
        """지정된 키의 값을 문자열로 변환"""
        for key in keys:
            if key in data and data[key] is not None and not isinstance(data[key], str):
                data[key] = str(data[key])

    try:
        # 크레덴셜 추출
        creds = {}
        if isinstance(env, dict):
            for k in ("LAW_API_KEY", "LAW_API_URL"):
                if k in env:
                    creds[k] = env[k]
        
        if creds:
            masked = dict(creds)
            if "LAW_API_KEY" in masked and masked["LAW_API_KEY"]:
                masked["LAW_API_KEY"] = masked["LAW_API_KEY"][:6] + "***"
            mcp_logger.debug("Applying temp env | %s", masked)

        async def run_with_env(func, *args, **kwargs):
            with temporary_env(creds):
                return await run_sync(func, *args, **kwargs)

        if tool_name == "health":
            return await health_impl()

        if tool_name == "search_law_tool":
            query = request_data.get("query")
            if not query:
                return {"error": "Missing required parameter: query"}
            # 타입 변환
            convert_float_to_int(request_data, ["page", "page_size"])
            convert_to_str(request_data, ["query"])
            page = request_data.get("page", 1)
            page_size = request_data.get("page_size", 10)
            return await run_with_env(
                search_law, query, page, page_size, arguments=request_data
            )

        if tool_name == "get_law_detail_tool":
            law_id = request_data.get("law_id")
            if not law_id:
                return {"error": "Missing required parameter: law_id"}
            convert_to_str(request_data, ["law_id"])
            return await run_with_env(
                get_law_detail, law_id, arguments=request_data
            )

        if tool_name == "search_precedent_tool":
            query = request_data.get("query")
            if not query:
                return {"error": "Missing required parameter: query"}
            # 타입 변환
            convert_float_to_int(request_data, ["page", "page_size"])
            convert_to_str(request_data, ["query", "court"])
            page = request_data.get("page", 1)
            page_size = request_data.get("page_size", 10)
            court = request_data.get("court")
            return await run_with_env(
                search_precedent, query, page, page_size, court, arguments=request_data
            )

        if tool_name == "get_precedent_detail_tool":
            precedent_id = request_data.get("precedent_id")
            if not precedent_id:
                return {"error": "Missing required parameter: precedent_id"}
            convert_to_str(request_data, ["precedent_id"])
            return await run_with_env(
                get_precedent_detail, precedent_id, arguments=request_data
            )

        if tool_name == "search_administrative_rule_tool":
            query = request_data.get("query")
            if not query:
                return {"error": "Missing required parameter: query"}
            # 타입 변환
            convert_float_to_int(request_data, ["page", "page_size"])
            convert_to_str(request_data, ["query"])
            page = request_data.get("page", 1)
            page_size = request_data.get("page_size", 10)
            return await run_with_env(
                search_administrative_rule, query, page, page_size, arguments=request_data
            )

        return {"error": "Tool not found"}
    except Exception as e:
        mcp_logger.exception("Error in call_tool_http: %s", str(e))
        return {"error": f"Error calling tool: {str(e)}"}


# ─────────────────────────────────────────────
# AI 채팅 / 문서분석 엔드포인트
# ─────────────────────────────────────────────

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
    precedent_id: str = Field(..., description="판례 일련번호")

class CompareRequest(BaseModel):
    precedent_ids: List[str] = Field(..., description="비교할 판례 일련번호 목록 (2~4개)")


@api.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    """AI 법률 비서와 대화 - 자연어 질문으로 법령·판례 자동 조회"""
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
    """텍스트 문서(계약서, 기획서 등) 법적 분석"""
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
                for page in pdf.pages[:30]:  # 최대 30페이지
                    pt = page.extract_text()
                    if pt:
                        pages_text.append(pt)
                text = "\n".join(pages_text)
        else:
            # txt, md, 기타 텍스트 파일
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
    """판례 AI 요약 - 어려운 판례를 쉽게 설명"""
    try:
        from .ai_chat import summarize_precedent
        return await summarize_precedent(req.precedent_id)
    except Exception as e:
        mcp_logger.exception("AI summarize error: %s", str(e))
        return {"error": str(e)}


@api.post("/ai/compare")
async def ai_compare_precedents(req: CompareRequest):
    """판례 비교 분석 - 여러 판례를 AI로 비교"""
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


# MCP 도구 정의
@mcp.tool()
async def health():
    """서비스 상태 확인"""
    return await health_impl()


@mcp.tool()
async def search_law_tool(
    query: str,
    page: int = 1,
    page_size: int = 10
):
    """
    법령을 키워드로 검색합니다.
    
    Args:
        query: 검색할 법령 키워드 (예: '민법', '상법', '근로기준법')
        page: 페이지 번호 (기본값: 1)
        page_size: 페이지당 결과 수 (기본값: 10, 최대: 50)
    
    Returns:
        검색된 법령 목록
    """
    req = LawSearchRequest(query=query, page=page, page_size=page_size)
    return await search_law_impl(req, None)


@mcp.tool()
async def get_law_detail_tool(law_id: str):
    """
    특정 법령의 상세 정보 및 전문(조문)을 조회합니다.
    
    Args:
        law_id: 법령 ID (법령 검색 결과에서 얻은 법령ID)
    
    Returns:
        법령의 상세 정보와 조문 내용
    """
    req = LawDetailRequest(law_id=law_id)
    return await get_law_detail_impl(req, None)


@mcp.tool()
async def search_precedent_tool(
    query: str,
    page: int = 1,
    page_size: int = 10,
    court: Optional[str] = None
):
    """
    판례를 키워드로 검색합니다.
    
    Args:
        query: 검색할 판례 키워드 (예: '손해배상', '계약', '부당해고')
        page: 페이지 번호 (기본값: 1)
        page_size: 페이지당 결과 수 (기본값: 10, 최대: 50)
        court: 법원 구분 (예: '대법원', '헌법재판소')
    
    Returns:
        검색된 판례 목록
    """
    req = PrecedentSearchRequest(
        query=query, 
        page=page, 
        page_size=page_size, 
        court=court
    )
    return await search_precedent_impl(req, None)


@mcp.tool()
async def get_precedent_detail_tool(precedent_id: str):
    """
    특정 판례의 상세 정보를 조회합니다.
    
    Args:
        precedent_id: 판례 일련번호 (판례 검색 결과에서 얻은 판례일련번호)
    
    Returns:
        판례의 상세 정보 (판결요지, 판례내용 등)
    """
    req = PrecedentDetailRequest(precedent_id=precedent_id)
    return await get_precedent_detail_impl(req, None)


@mcp.tool()
async def search_administrative_rule_tool(
    query: str,
    page: int = 1,
    page_size: int = 10
):
    """
    행정규칙을 키워드로 검색합니다.
    
    Args:
        query: 검색할 행정규칙 키워드
        page: 페이지 번호 (기본값: 1)
        page_size: 페이지당 결과 수 (기본값: 10, 최대: 50)
    
    Returns:
        검색된 행정규칙 목록
    """
    req = AdminRuleSearchRequest(query=query, page=page, page_size=page_size)
    return await search_administrative_rule_impl(req, None)


async def main():
    """MCP 서버를 실행합니다."""
    print("MCP Korean Law & Precedent Server starting...", file=sys.stderr)
    print("Server: korean-law-service", file=sys.stderr)
    print("Available tools: health, search_law_tool, get_law_detail_tool, search_precedent_tool, get_precedent_detail_tool, search_administrative_rule_tool", file=sys.stderr)
    
    try:
        await mcp.run_stdio_async()
    except Exception as e:
        print(f"Server error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise


# 프론트엔드 정적 파일 서빙 (빌드 후)
_frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(_frontend_dist):
    api.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @api.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(_frontend_dist, "index.html"))

    @api.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # API 경로는 제외
        if full_path.startswith("tools") or full_path.startswith("health") or full_path.startswith("docs") or full_path.startswith("openapi"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))


if __name__ == "__main__":
    # MCP 서버로 실행 (stdio 모드)
    # HTTP 서버로 실행하려면 환경 변수 HTTP_MODE=1 설정
    if os.environ.get("HTTP_MODE") == "1":
        import uvicorn
        port = int(os.environ.get('PORT', 8096))
        uvicorn.run("src.main:api", host="0.0.0.0", port=port, reload=False)
    else:
        # MCP stdio 모드
        asyncio.run(main())

