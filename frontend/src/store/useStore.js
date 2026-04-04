import { create } from 'zustand'

const useStore = create((set, get) => ({
  // 탭 상태: 'law' | 'precedent' | 'admrule'
  activeTab: 'law',
  setActiveTab: (tab) => set({ activeTab: tab, results: null, page: 1 }),

  // 검색 상태
  query: '',
  setQuery: (q) => set({ query: q }),

  // 판례 법원 필터
  courtFilter: '',
  setCourtFilter: (c) => set({ courtFilter: c }),

  // 페이지네이션
  page: 1,
  setPage: (p) => set({ page: p }),

  // 검색 결과
  results: null,
  setResults: (r) => set({ results: r }),

  // 로딩/에러
  loading: false,
  setLoading: (v) => set({ loading: v }),
  error: null,
  setError: (e) => set({ error: e }),

  // 검색 히스토리 (localStorage 연동)
  history: JSON.parse(localStorage.getItem('search_history') || '[]'),
  addHistory: (query) => {
    const prev = get().history
    const next = [query, ...prev.filter(h => h !== query)].slice(0, 10)
    localStorage.setItem('search_history', JSON.stringify(next))
    set({ history: next })
  },
  clearHistory: () => {
    localStorage.removeItem('search_history')
    set({ history: [] })
  },

  // API 키 모달
  apiKeyModal: false,
  setApiKeyModal: (v) => set({ apiKeyModal: v }),
}))

export default useStore
