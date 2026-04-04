"""
mcp_client.py
Remote MCP Client for korean-law-mcp.fly.dev
Connects to the official Korean Law MCP server via HTTP+SSE protocol
Supports all tools: search_all, search_law, get_law_text, search_admin_rule, 
get_admin_rule, get_annexes, search_ai_law, chain_full_research, etc.
"""

import os
import json
import logging
import requests
import time
import uuid
from typing import Optional, Dict, Any, List
from cachetools import TTLCache

logger = logging.getLogger("law-mcp")

# MCP Server endpoints
MCP_BASE_URL = "https://korean-law-mcp.fly.dev"
MCP_FULL_ENDPOINT = f"{MCP_BASE_URL}/mcp"
MCP_LITE_ENDPOINT = f"{MCP_BASE_URL}/mcp"  # with profile=lite param

# Cache for MCP results (30 min TTL)
_mcp_cache = TTLCache(maxsize=200, ttl=1800)
# Session cache (10 min TTL)
_session_cache = TTLCache(maxsize=50, ttl=600)


def get_law_oc() -> str:
    """Get the Law OC (API key) from environment"""
    return os.environ.get("LAW_OC", os.environ.get("LAW_API_KEY", ""))


class MCPClient:
    """
    HTTP-based MCP client for korean-law-mcp.fly.dev
    Implements the MCP protocol (initialize → call_tool) over HTTP
    """
    
    def __init__(self, oc: str = None, use_lite: bool = False):
        self.oc = oc or get_law_oc()
        self.use_lite = use_lite
        self.session_id: Optional[str] = None
        self._tools_cache: Optional[List[Dict]] = None
        
    def _get_endpoint(self) -> str:
        oc = self.oc
        if self.use_lite:
            return f"{MCP_LITE_ENDPOINT}?profile=lite&oc={oc}"
        return f"{MCP_FULL_ENDPOINT}?oc={oc}"
    
    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
        return headers
    
    def initialize(self) -> bool:
        """Initialize MCP session via HTTP POST"""
        # Check cached session
        cache_key = f"session_{self.oc}_{self.use_lite}"
        if cache_key in _session_cache:
            self.session_id = _session_cache[cache_key]
            logger.debug("Reusing cached MCP session: %s", self.session_id)
            return True
            
        endpoint = self._get_endpoint()
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "korean-law-webapp", "version": "2.0.0"}
            }
        }
        
        try:
            resp = requests.post(
                endpoint, 
                json=payload,
                headers=self._get_headers(),
                timeout=15
            )
            
            if resp.status_code == 200:
                # Extract session ID from headers
                self.session_id = resp.headers.get("mcp-session-id")
                if not self.session_id:
                    # Try to parse from body
                    try:
                        data = resp.json()
                        self.session_id = data.get("sessionId") or str(uuid.uuid4())
                    except Exception:
                        self.session_id = str(uuid.uuid4())
                
                # Cache the session
                if self.session_id:
                    _session_cache[cache_key] = self.session_id
                
                # Send initialized notification
                try:
                    notif_payload = {
                        "jsonrpc": "2.0",
                        "method": "notifications/initialized",
                        "params": {}
                    }
                    requests.post(
                        endpoint,
                        json=notif_payload,
                        headers=self._get_headers(),
                        timeout=5
                    )
                except Exception:
                    pass
                
                logger.info("MCP session initialized: %s", self.session_id)
                return True
            else:
                logger.warning("MCP init failed: %s %s", resp.status_code, resp.text[:200])
                return False
        except Exception as e:
            logger.error("MCP initialize error: %s", str(e))
            return False
    
    def list_tools(self) -> List[Dict]:
        """List available MCP tools"""
        if self._tools_cache:
            return self._tools_cache
            
        if not self.session_id and not self.initialize():
            return []
        
        endpoint = self._get_endpoint()
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        try:
            resp = requests.post(
                endpoint,
                json=payload,
                headers=self._get_headers(),
                timeout=15
            )
            if resp.status_code == 200:
                data = resp.json()
                tools = data.get("result", {}).get("tools", [])
                self._tools_cache = tools
                return tools
        except Exception as e:
            logger.error("MCP list_tools error: %s", str(e))
        return []
    
    def call_tool(self, tool_name: str, arguments: Dict[str, Any], 
                  retries: int = 2) -> Dict[str, Any]:
        """Call a specific MCP tool with arguments"""
        # Build cache key
        cache_key = f"tool_{tool_name}_{json.dumps(arguments, sort_keys=True, ensure_ascii=False)}"
        if cache_key in _mcp_cache:
            logger.debug("MCP cache hit: %s", tool_name)
            return _mcp_cache[cache_key]
        
        for attempt in range(retries + 1):
            if not self.session_id:
                if not self.initialize():
                    return {"error": "MCP 서버 연결 실패"}
            
            endpoint = self._get_endpoint()
            payload = {
                "jsonrpc": "2.0",
                "id": 10 + attempt,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }
            
            try:
                resp = requests.post(
                    endpoint,
                    json=payload,
                    headers=self._get_headers(),
                    timeout=30
                )
                
                if resp.status_code == 404 and "Session not found" in resp.text:
                    # Session expired, reinitialize
                    logger.warning("MCP session expired, reinitializing...")
                    self.session_id = None
                    cache_key_s = f"session_{self.oc}_{self.use_lite}"
                    _session_cache.pop(cache_key_s, None)
                    if attempt < retries:
                        continue
                    return {"error": "MCP 세션 만료"}
                
                if resp.status_code != 200:
                    logger.warning("MCP tool call failed: %s %s", resp.status_code, resp.text[:300])
                    if attempt < retries:
                        time.sleep(1)
                        continue
                    return {"error": f"MCP 서버 오류: {resp.status_code}"}
                
                # Parse response
                data = resp.json()
                
                if "error" in data:
                    err = data["error"]
                    err_msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                    if "Session not found" in err_msg and attempt < retries:
                        self.session_id = None
                        _session_cache.pop(f"session_{self.oc}_{self.use_lite}", None)
                        continue
                    return {"error": err_msg}
                
                result = data.get("result", {})
                
                # Parse content from MCP result
                content_list = result.get("content", [])
                parsed = _parse_mcp_content(content_list)
                
                # Cache successful results
                _mcp_cache[cache_key] = parsed
                return parsed
                
            except requests.exceptions.Timeout:
                logger.warning("MCP tool call timeout: %s (attempt %d)", tool_name, attempt + 1)
                if attempt < retries:
                    time.sleep(2)
                    continue
                return {"error": f"요청 시간 초과 ({tool_name})"}
            except Exception as e:
                logger.error("MCP call_tool error: %s", str(e))
                if attempt < retries:
                    time.sleep(1)
                    continue
                return {"error": f"MCP 호출 오류: {str(e)}"}
        
        return {"error": "MCP 호출 최대 재시도 초과"}


def _parse_mcp_content(content_list: List[Dict]) -> Dict[str, Any]:
    """Parse MCP content response into structured dict"""
    if not content_list:
        return {"error": "빈 응답"}
    
    # Combine all text content
    texts = []
    for item in content_list:
        if isinstance(item, dict):
            if item.get("type") == "text":
                texts.append(item.get("text", ""))
            elif "text" in item:
                texts.append(item["text"])
    
    combined = "\n".join(texts)
    
    # Try to parse as JSON
    if combined.strip().startswith("{") or combined.strip().startswith("["):
        try:
            return json.loads(combined)
        except json.JSONDecodeError:
            pass
    
    # Return as text
    return {"text": combined, "raw": combined}


# ─────────────────────────────────────────────
# High-level MCP Tool Wrappers
# ─────────────────────────────────────────────

def get_mcp_client(oc: str = None, use_lite: bool = False) -> MCPClient:
    """Get or create MCP client"""
    client = MCPClient(oc=oc, use_lite=use_lite)
    client.initialize()
    return client


def mcp_search_all(query: str, page: int = 1, page_size: int = 10, oc: str = None) -> Dict:
    """통합검색: 법령 + 행정규칙 + 조례를 한번에 검색"""
    client = get_mcp_client(oc)
    result = client.call_tool("search_all", {
        "query": query,
        "page": page,
        "page_size": page_size
    })
    return _normalize_search_result(result, "laws")


def mcp_search_law(query: str, page: int = 1, page_size: int = 10, oc: str = None) -> Dict:
    """법령 검색"""
    client = get_mcp_client(oc)
    result = client.call_tool("search_law", {
        "query": query,
        "page": page,
        "page_size": page_size
    })
    return _normalize_search_result(result, "laws")


def mcp_get_law_text(law_id: str, oc: str = None) -> Dict:
    """법령 전문 조회 (get_law_text - 새 엔드포인트)"""
    client = get_mcp_client(oc)
    result = client.call_tool("get_law_text", {"law_id": law_id})
    return result


def mcp_search_admin_rule(query: str, page: int = 1, page_size: int = 10, oc: str = None) -> Dict:
    """행정규칙 검색"""
    client = get_mcp_client(oc)
    result = client.call_tool("search_admin_rule", {
        "query": query,
        "page": page,
        "page_size": page_size
    })
    return _normalize_search_result(result, "rules")


def mcp_get_admin_rule(rule_id: str, oc: str = None) -> Dict:
    """행정규칙 상세 조회"""
    client = get_mcp_client(oc)
    result = client.call_tool("get_admin_rule", {"rule_id": rule_id})
    return result


def mcp_get_annexes(law_id: str, oc: str = None) -> Dict:
    """법령 별표/서식 조회"""
    client = get_mcp_client(oc)
    result = client.call_tool("get_annexes", {"law_id": law_id})
    return result


def mcp_search_ai_law(query: str, oc: str = None) -> Dict:
    """AI 법령 검색 (자연어 기반)"""
    client = get_mcp_client(oc)
    result = client.call_tool("search_ai_law", {"query": query})
    return result


def mcp_chain_full_research(query: str, oc: str = None) -> Dict:
    """체인 전체 리서치 - 법령 + 행정규칙 + 조례 통합 분석"""
    client = get_mcp_client(oc)
    result = client.call_tool("chain_full_research", {"query": query})
    return result


def mcp_search_precedents(query: str, page: int = 1, page_size: int = 10, oc: str = None) -> Dict:
    """판례 검색"""
    client = get_mcp_client(oc)
    result = client.call_tool("search_precedents", {
        "query": query,
        "page": page,
        "page_size": page_size
    })
    return _normalize_search_result(result, "precedents")


def mcp_get_precedent_text(precedent_id: str, oc: str = None) -> Dict:
    """판례 전문 조회"""
    client = get_mcp_client(oc)
    result = client.call_tool("get_precedent_text", {"precedent_id": precedent_id})
    return result


def mcp_get_three_tier(law_id: str, oc: str = None) -> Dict:
    """3단 비교 (법령-시행령-시행규칙)"""
    client = get_mcp_client(oc)
    result = client.call_tool("get_three_tier", {"law_id": law_id})
    return result


def mcp_compare_old_new(law_id: str, oc: str = None) -> Dict:
    """법령 신구 조문 비교"""
    client = get_mcp_client(oc)
    result = client.call_tool("compare_old_new", {"law_id": law_id})
    return result


def _normalize_search_result(result: Dict, default_list_key: str) -> Dict:
    """Normalize MCP search result to consistent format"""
    if "error" in result:
        return result
    
    # If result has text key, try to parse it
    if "text" in result and default_list_key not in result:
        text = result.get("text", "")
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                result = parsed
            elif isinstance(parsed, list):
                result = {default_list_key: parsed, "total": len(parsed)}
        except Exception:
            pass
    
    # Ensure standard keys exist
    if default_list_key not in result:
        # Try common key names
        for key in ["items", "results", "data", "list"]:
            if key in result:
                result[default_list_key] = result[key]
                break
        else:
            result[default_list_key] = []
    
    if "total" not in result:
        result["total"] = len(result.get(default_list_key, []))
    if "page" not in result:
        result["page"] = 1
    if "page_size" not in result:
        result["page_size"] = 10
    
    return result


# ─────────────────────────────────────────────
# Fallback: Direct Law API (when MCP is unavailable)
# ─────────────────────────────────────────────

def search_law_direct(query: str, page: int = 1, page_size: int = 10) -> Dict:
    """Direct law API search (fallback)"""
    from .tools import search_law
    return search_law(query, page, page_size)


def get_law_detail_direct(law_id: str) -> Dict:
    """Direct law API detail (fallback)"""
    from .tools import get_law_detail
    return get_law_detail(law_id)


def search_admin_rule_direct(query: str, page: int = 1, page_size: int = 10) -> Dict:
    """Direct admin rule search (fallback)"""
    from .tools import search_administrative_rule
    return search_administrative_rule(query, page, page_size)
