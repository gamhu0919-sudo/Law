import axios from 'axios'

const BASE = '/tools'

// localStorage에서 API 키 가져오기
const getApiKey = () => localStorage.getItem('law_api_key') || ''

const buildEnv = () => {
  const key = getApiKey()
  return key ? { env: { LAW_API_KEY: key } } : {}
}

// 법령 검색
export const searchLaw = (query, page = 1, pageSize = 10) =>
  axios.post(`${BASE}/search_law_tool`, {
    query,
    page,
    page_size: pageSize,
    ...buildEnv(),
  }).then(r => r.data)

// 법령 상세
export const getLawDetail = (lawId) =>
  axios.post(`${BASE}/get_law_detail_tool`, {
    law_id: lawId,
    ...buildEnv(),
  }).then(r => r.data)

// 판례 검색
export const searchPrecedent = (query, page = 1, pageSize = 10, court = null) =>
  axios.post(`${BASE}/search_precedent_tool`, {
    query,
    page,
    page_size: pageSize,
    ...(court ? { court } : {}),
    ...buildEnv(),
  }).then(r => r.data)

// 판례 상세
export const getPrecedentDetail = (precedentId) =>
  axios.post(`${BASE}/get_precedent_detail_tool`, {
    precedent_id: precedentId,
    ...buildEnv(),
  }).then(r => r.data)

// 행정규칙 검색
export const searchAdminRule = (query, page = 1, pageSize = 10) =>
  axios.post(`${BASE}/search_administrative_rule_tool`, {
    query,
    page,
    page_size: pageSize,
    ...buildEnv(),
  }).then(r => r.data)

// 헬스체크
export const checkHealth = () =>
  axios.get('/health').then(r => r.data)

// ── AI 비서 API ──────────────────────────────────────

// AI 채팅 (자연어 법률 질문)
export const aiChat = (message, sessionId = 'default', mode = 'chat') =>
  axios.post('/ai/chat', { message, session_id: sessionId, mode })
    .then(r => r.data)

// 텍스트 문서 분석
export const analyzeDocument = (text, docType = 'auto', userRequest = '', sessionId = 'default') =>
  axios.post('/ai/analyze', {
    text,
    doc_type: docType,
    user_request: userRequest,
    session_id: sessionId,
  }).then(r => r.data)

// PDF/파일 업로드 분석
export const analyzeFile = (file, docType = 'auto', userRequest = '') => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('doc_type', docType)
  fd.append('user_request', userRequest)
  return axios.post('/ai/analyze/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data)
}

// 판례 AI 요약
export const summarizePrecedent = (precedentId) =>
  axios.post('/ai/summarize', { precedent_id: precedentId }).then(r => r.data)

// 판례 비교 분석
export const comparePrecedents = (precedentIds) =>
  axios.post('/ai/compare', { precedent_ids: precedentIds }).then(r => r.data)

// 세션 초기화
export const clearSession = (sessionId) =>
  axios.delete(`/ai/session/${sessionId}`).then(r => r.data)
