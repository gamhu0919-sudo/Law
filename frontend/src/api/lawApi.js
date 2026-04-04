/**
 * lawApi.js
 * 한국 법령·판례 AI 통합검색 API 클라이언트
 * - MCP 기반 새 엔드포인트 지원
 * - 레거시 엔드포인트 유지 (하위 호환)
 */
import axios from 'axios'

// Axios instance with timeout
const http = axios.create({
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

// Request debounce cache
const _cache = new Map()
const _cacheTimeout = 5 * 60 * 1000 // 5 min

function getCached(key) {
  const entry = _cache.get(key)
  if (entry && Date.now() - entry.ts < _cacheTimeout) return entry.data
  return null
}

function setCache(key, data) {
  _cache.set(key, { data, ts: Date.now() })
  if (_cache.size > 200) {
    const firstKey = _cache.keys().next().value
    _cache.delete(firstKey)
  }
}

// ── Search APIs ──────────────────────────────────────

/**
 * 통합검색: 법령 + 행정규칙 + 자치법규
 */
export const searchAll = async (query, page = 1, pageSize = 10) => {
  const cacheKey = `all:${query}:${page}:${pageSize}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const data = await http.post('/search/all', { query, page, page_size: pageSize })
    .then(r => r.data)
  setCache(cacheKey, data)
  return data
}

/**
 * 법령 검색 (MCP 기반)
 */
export const searchLaw = async (query, page = 1, pageSize = 10) => {
  const cacheKey = `law:${query}:${page}:${pageSize}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  // Try new endpoint first, fall back to legacy
  try {
    const data = await http.post('/search/law', { query, page, page_size: pageSize })
      .then(r => r.data)
    
    // Normalize result
    const normalized = normalizeSearchResult(data, 'laws')
    setCache(cacheKey, normalized)
    return normalized
  } catch (e) {
    // Legacy fallback
    const data = await http.post('/tools/search_law_tool', { query, page, page_size: pageSize })
      .then(r => r.data)
    const normalized = normalizeSearchResult(data, 'laws')
    setCache(cacheKey, normalized)
    return normalized
  }
}

/**
 * 판례 검색 (MCP 기반)
 */
export const searchPrecedent = async (query, page = 1, pageSize = 10, court = null) => {
  const cacheKey = `prec:${query}:${page}:${pageSize}:${court}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const body = { query, page, page_size: pageSize }
    if (court) body.court = court
    const data = await http.post('/search/precedent', body).then(r => r.data)
    const normalized = normalizeSearchResult(data, 'precedents')
    setCache(cacheKey, normalized)
    return normalized
  } catch (e) {
    const data = await http.post('/tools/search_precedent_tool', {
      query, page, page_size: pageSize, ...(court ? { court } : {})
    }).then(r => r.data)
    const normalized = normalizeSearchResult(data, 'precedents')
    setCache(cacheKey, normalized)
    return normalized
  }
}

/**
 * 행정규칙 검색 (MCP 기반)
 */
export const searchAdminRule = async (query, page = 1, pageSize = 10, knd = null) => {
  const cacheKey = `admin:${query}:${page}:${pageSize}:${knd}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const body = { query, page, page_size: pageSize }
    if (knd) body.knd = knd
    const data = await http.post('/search/admin-rule', body).then(r => r.data)
    const normalized = normalizeSearchResult(data, 'rules')
    setCache(cacheKey, normalized)
    return normalized
  } catch (e) {
    const data = await http.post('/tools/search_administrative_rule_tool', {
      query, page, page_size: pageSize
    }).then(r => r.data)
    const normalized = normalizeSearchResult(data, 'rules')
    setCache(cacheKey, normalized)
    return normalized
  }
}

// ── Detail APIs ──────────────────────────────────────

/**
 * 법령 전문 조회 (MST 기반, MCP get_law_text)
 */
export const getLawDetail = async (mstOrLawId, jo = null) => {
  const cacheKey = `lawdetail:${mstOrLawId}:${jo}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const body = { mst: String(mstOrLawId) }
    if (jo) body.jo = jo
    const data = await http.post('/law/detail', body).then(r => r.data)
    setCache(cacheKey, data)
    return data
  } catch (e) {
    // Fallback to legacy
    const data = await http.post('/tools/get_law_detail_tool', {
      law_id: String(mstOrLawId)
    }).then(r => r.data)
    setCache(cacheKey, data)
    return data
  }
}

/**
 * 법령 별표/서식 조회 (get_annexes)
 */
export const getLawAnnexes = async (mst, lawName = null) => {
  const cacheKey = `annexes:${mst}:${lawName}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const url = lawName
    ? `/law/annexes`
    : `/law/${mst}/annexes`
  
  const body = lawName ? { law_name: lawName } : null
  
  const data = body
    ? await http.post(url, body).then(r => r.data)
    : await http.get(url).then(r => r.data)
  
  setCache(cacheKey, data)
  return data
}

/**
 * 행정규칙 상세 조회 (get_admin_rule)
 */
export const getAdminRuleDetail = async (ruleId) => {
  const cacheKey = `admindetail:${ruleId}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const data = await http.get(`/admin-rule/${ruleId}`).then(r => r.data)
  setCache(cacheKey, data)
  return data
}

/**
 * 판례 상세 조회 (get_precedent_text)
 */
export const getPrecedentDetail = async (precedentId) => {
  const cacheKey = `precdetail:${precedentId}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const data = await http.get(`/precedent/${precedentId}`).then(r => r.data)
    setCache(cacheKey, data)
    return data
  } catch (e) {
    const data = await http.post('/tools/get_precedent_detail_tool', {
      precedent_id: String(precedentId)
    }).then(r => r.data)
    setCache(cacheKey, data)
    return data
  }
}

/**
 * 법령-시행령-시행규칙 3단 비교
 */
export const getLawThreeTier = async (mst) => {
  const data = await http.get(`/law/${mst}/three-tier`).then(r => r.data)
  return data
}

/**
 * MCP 도구 직접 호출
 */
export const callMcpTool = async (toolName, args = {}) => {
  const data = await http.post('/mcp/call', { tool: toolName, args }).then(r => r.data)
  return data
}

// ── Health ──────────────────────────────────────────

export const checkHealth = () =>
  http.get('/health').then(r => r.data)

// ── AI APIs ──────────────────────────────────────────

export const aiChat = (message, sessionId = 'default', mode = 'chat') =>
  http.post('/ai/chat', { message, session_id: sessionId, mode }, { timeout: 120000 })
    .then(r => r.data)

export const analyzeDocument = (text, docType = 'auto', userRequest = '', sessionId = 'default') =>
  http.post('/ai/analyze', {
    text,
    doc_type: docType,
    user_request: userRequest,
    session_id: sessionId,
  }, { timeout: 120000 }).then(r => r.data)

export const analyzeFile = (file, docType = 'auto', userRequest = '') => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('doc_type', docType)
  fd.append('user_request', userRequest)
  return http.post('/ai/analyze/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  }).then(r => r.data)
}

export const summarizePrecedent = (precedentId) =>
  http.post('/ai/summarize', { precedent_id: precedentId }, { timeout: 120000 })
    .then(r => r.data)

export const comparePrecedents = (precedentIds) =>
  http.post('/ai/compare', { precedent_ids: precedentIds }, { timeout: 120000 })
    .then(r => r.data)

export const clearSession = (sessionId) =>
  http.delete(`/ai/session/${sessionId}`).then(r => r.data)

// ── Helpers ──────────────────────────────────────────

/**
 * Normalize search result to consistent format
 */
function normalizeSearchResult(data, defaultKey = 'laws') {
  if (!data || data.error) return data

  // Already normalized
  if (data[defaultKey] !== undefined) return data

  // Try to find list in various keys
  const candidates = ['laws', 'rules', 'precedents', 'items', 'results', 'data']
  for (const key of candidates) {
    if (Array.isArray(data[key])) {
      return {
        ...data,
        [defaultKey]: data[key],
        total: data.total || data[key].length,
        page: data.page || 1,
        page_size: data.page_size || 10,
      }
    }
  }

  // Last resort: parse raw_text
  return {
    ...data,
    [defaultKey]: [],
    total: 0,
    page: 1,
    page_size: 10,
  }
}

/**
 * Extract text snippet from MCP result
 */
export function extractSnippet(item, query) {
  const text = item.raw_text || item.text || item.조문내용 || item.판결요지 || ''
  if (!text || !query) return ''
  
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 120) + '...'
  
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + query.length + 80)
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
}

/**
 * Highlight query in text
 */
export function highlightText(text, query) {
  if (!text || !query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}
