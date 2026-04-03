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
