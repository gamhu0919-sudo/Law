import { useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import useStore from '../store/useStore'
import SearchBar from '../components/SearchBar'
import TabNav from '../components/TabNav'
import LawCard from '../components/LawCard'
import PrecedentCard from '../components/PrecedentCard'
import AdminRuleCard from '../components/AdminRuleCard'
import Pagination from '../components/Pagination'
import { searchLaw, searchPrecedent, searchAdminRule } from '../api/lawApi'

const COURTS = ['', '대법원', '헌법재판소', '고등법원', '지방법원']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const {
    activeTab, setActiveTab,
    query, setQuery,
    page, setPage,
    results, setResults,
    loading, setLoading,
    error, setError,
    courtFilter, setCourtFilter,
  } = useStore()

  const qParam = params.get('q') || ''
  const tabParam = params.get('tab') || 'law'

  // URL 파라미터와 store 동기화
  useEffect(() => {
    if (qParam !== query) setQuery(qParam)
    if (tabParam !== activeTab) setActiveTab(tabParam)
  }, [qParam, tabParam])

  const doSearch = useCallback(async () => {
    if (!qParam) return
    setLoading(true)
    setError(null)
    try {
      let data
      if (tabParam === 'law') {
        data = await searchLaw(qParam, page, 10)
      } else if (tabParam === 'precedent') {
        data = await searchPrecedent(qParam, page, 10, courtFilter || null)
      } else {
        data = await searchAdminRule(qParam, page, 10)
      }
      if (data.error) throw new Error(data.error)
      setResults(data)
    } catch (e) {
      setError(e.message || '검색 중 오류가 발생했습니다.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [qParam, tabParam, page, courtFilter])

  useEffect(() => {
    setResults(null)
    doSearch()
    document.title = `"${qParam}" 검색 결과 · 한국 법령 검색`
  }, [qParam, tabParam, page, courtFilter])

  const handlePage = (p) => {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const getItems = () => {
    if (!results) return []
    return results.laws || results.precedents || results.rules || []
  }

  const total = results?.total || 0
  const items = getItems()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 검색바 */}
      <div className="bg-law-blue py-5 px-4">
        <div className="max-w-4xl mx-auto">
          <SearchBar />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 탭 */}
        <div className="mb-5">
          <TabNav />
        </div>

        {/* 판례 법원 필터 */}
        {tabParam === 'precedent' && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 font-medium">법원:</span>
            {COURTS.map(c => (
              <button
                key={c || 'all'}
                onClick={() => { setCourtFilter(c); setPage(1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  courtFilter === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                }`}
              >
                {c || '전체'}
              </button>
            ))}
          </div>
        )}

        {/* 결과 헤더 */}
        {!loading && results && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">"{qParam}"</span> 검색 결과{' '}
              <span className="text-blue-600 font-bold">{total.toLocaleString()}건</span>
            </p>
            <span className="text-xs text-gray-400">
              {page} / {Math.ceil(total / 10) || 1} 페이지
            </span>
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full spinner"></div>
            <p className="text-gray-500 text-sm">검색 중...</p>
          </div>
        )}

        {/* 에러 */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2">❌</div>
            <p className="text-red-700 font-medium mb-1">검색 오류</p>
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={doSearch}
              className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 결과 없음 */}
        {!loading && !error && results && items.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-gray-700 font-semibold mb-1">검색 결과가 없습니다</p>
            <p className="text-gray-500 text-sm">다른 키워드로 검색해 보세요.</p>
          </div>
        )}

        {/* 결과 목록 */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {tabParam === 'law' && items.map(item => (
              <LawCard key={item.법령ID} law={item} />
            ))}
            {tabParam === 'precedent' && items.map(item => (
              <PrecedentCard key={item.판례일련번호} prec={item} />
            ))}
            {tabParam === 'admrule' && items.map(item => (
              <AdminRuleCard key={item.행정규칙ID} rule={item} />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && items.length > 0 && (
          <Pagination
            page={page}
            total={total}
            pageSize={10}
            onPageChange={handlePage}
          />
        )}
      </div>
    </div>
  )
}
