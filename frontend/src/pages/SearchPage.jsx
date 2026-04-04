import { useEffect, useCallback, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import SearchBar from '../components/SearchBar'
import TabNav from '../components/TabNav'
import LawCard from '../components/LawCard'
import PrecedentCard from '../components/PrecedentCard'
import AdminRuleCard from '../components/AdminRuleCard'
import Pagination from '../components/Pagination'
import { searchLaw, searchPrecedent, searchAdminRule, searchAll } from '../api/lawApi'

const COURTS = ['', '대법원', '헌법재판소', '고등법원', '지방법원']
const ADMIN_RULE_TYPES = [
  { label: '전체', value: '' },
  { label: '훈령', value: '1' },
  { label: '예규', value: '2' },
  { label: '고시', value: '3' },
]

// Result-count badge
const CountBadge = ({ count }) => (
  <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold ml-1.5">
    {count?.toLocaleString() || 0}
  </span>
)

// Skeleton card loader
const SkeletonCard = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
    <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
    <div className="h-3 bg-gray-100 rounded w-2/3" />
  </div>
)

// Empty state component
const EmptyState = ({ query, onReset }) => (
  <div className="text-center py-16 px-4">
    <div className="text-5xl mb-3">🔍</div>
    <p className="text-gray-700 font-semibold mb-1">
      &ldquo;{query}&rdquo; 검색 결과가 없습니다
    </p>
    <p className="text-gray-500 text-sm mb-4">
      다른 키워드로 검색하거나 검색어를 단순하게 변경해보세요.
    </p>
    <div className="flex flex-wrap gap-2 justify-center">
      {['민법', '근로기준법', '형법', '행정법'].map(kw => (
        <button
          key={kw}
          onClick={() => onReset(kw)}
          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition"
        >
          {kw} 검색
        </button>
      ))}
    </div>
  </div>
)

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const {
    activeTab, setActiveTab,
    query, setQuery,
    page, setPage,
    results, setResults,
    loading, setLoading,
    error, setError,
    courtFilter, setCourtFilter,
  } = useStore()

  const [adminRuleType, setAdminRuleType] = useState('')
  const [allResults, setAllResults] = useState(null)
  const [searchMode, setSearchMode] = useState('normal') // 'normal' | 'integrated'

  const qParam = searchParams.get('q') || ''
  const tabParam = searchParams.get('tab') || 'law'

  // Sync URL params with store
  useEffect(() => {
    if (qParam !== query) setQuery(qParam)
    if (tabParam !== activeTab) setActiveTab(tabParam)
  }, [qParam, tabParam])

  const doSearch = useCallback(async () => {
    if (!qParam) return
    setLoading(true)
    setError(null)
    setAllResults(null)

    try {
      let data

      if (searchMode === 'integrated' || tabParam === 'all') {
        // Integrated search across all types
        data = await searchAll(qParam, page, 10)
        setAllResults(data)
      } else if (tabParam === 'law') {
        data = await searchLaw(qParam, page, 10)
      } else if (tabParam === 'precedent') {
        data = await searchPrecedent(qParam, page, 10, courtFilter || null)
      } else if (tabParam === 'admrule') {
        data = await searchAdminRule(qParam, page, 10, adminRuleType || null)
      } else {
        data = await searchLaw(qParam, page, 10)
      }

      if (data?.error) throw new Error(data.error)
      setResults(data)
    } catch (e) {
      setError(e.message || '검색 중 오류가 발생했습니다.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [qParam, tabParam, page, courtFilter, adminRuleType, searchMode])

  useEffect(() => {
    setResults(null)
    setPage(1)
    doSearch()
    document.title = `"${qParam}" 검색 결과 · 한국 법령 검색`
  }, [qParam, tabParam, courtFilter, adminRuleType])

  useEffect(() => {
    doSearch()
  }, [page])

  const handlePage = (p) => {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleReset = (kw) => {
    navigate(`/search?q=${encodeURIComponent(kw)}&tab=${tabParam}`)
  }

  const getItems = () => {
    if (!results) return []
    return results.laws || results.precedents || results.rules || results.items || []
  }

  const getRawText = () => results?.raw_text || ''

  const total = results?.total || 0
  const items = getItems()

  // Build tab counts from integrated search
  const tabCounts = allResults ? {
    law: allResults.laws?.length || 0,
    precedent: allResults.precedents?.length || 0,
    admrule: allResults.rules?.length || 0,
    ordinance: allResults.ordinances?.length || 0,
  } : {}

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 상단 검색바 */}
      <div className="bg-law-blue py-5 px-4">
        <div className="max-w-4xl mx-auto">
          <SearchBar />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 탭 네비게이션 */}
        <div className="mb-5">
          <TabNav />
        </div>

        {/* 검색 모드 토글 */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => { setSearchMode('normal'); setPage(1); doSearch() }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              searchMode === 'normal'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            일반 검색
          </button>
          <button
            onClick={() => { setSearchMode('integrated'); setPage(1); doSearch() }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              searchMode === 'integrated'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            🔗 통합검색 (법령+행정규칙+자치법규)
          </button>
        </div>

        {/* 판례 법원 필터 */}
        {tabParam === 'precedent' && (
          <div className="mb-4 flex items-center gap-2 flex-wrap bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">법원:</span>
            {COURTS.map(c => (
              <button
                key={c || 'all'}
                onClick={() => { setCourtFilter(c); setPage(1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  courtFilter === c
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-600'
                }`}
              >
                {c || '전체'}
              </button>
            ))}
          </div>
        )}

        {/* 행정규칙 유형 필터 */}
        {tabParam === 'admrule' && (
          <div className="mb-4 flex items-center gap-2 flex-wrap bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">유형:</span>
            {ADMIN_RULE_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => { setAdminRuleType(t.value); setPage(1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  adminRuleType === t.value
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-orange-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* 결과 헤더 */}
        {!loading && results && (
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">&ldquo;{qParam}&rdquo;</span>
              <span> 검색 결과 </span>
              <span className="text-blue-600 font-bold">{total.toLocaleString()}건</span>
              {results.source === 'mcp' && (
                <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  ✓ MCP
                </span>
              )}
            </p>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {page} / {Math.max(1, Math.ceil(total / 10))} 페이지
            </span>
          </div>
        )}

        {/* 로딩 스켈레톤 */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* 에러 상태 */}
        {!loading && error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2">❌</div>
            <p className="text-red-700 dark:text-red-400 font-medium mb-1">검색 오류</p>
            <p className="text-red-500 dark:text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={() => { setPage(1); doSearch() }}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 결과 없음 */}
        {!loading && !error && results && items.length === 0 && (
          <EmptyState query={qParam} onReset={handleReset} />
        )}

        {/* 결과 목록 */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="space-y-3">
              {tabParam === 'law' && items.map((item, i) => (
                <LawCard
                  key={item.법령ID || item.MST || item.법령일련번호 || i}
                  law={item}
                  query={qParam}
                  rank={i + 1 + (page - 1) * 10}
                />
              ))}
              {tabParam === 'precedent' && items.map((item, i) => (
                <PrecedentCard
                  key={item.판례일련번호 || i}
                  prec={item}
                  query={qParam}
                />
              ))}
              {tabParam === 'admrule' && items.map((item, i) => (
                <AdminRuleCard
                  key={item.행정규칙ID || item.행정규칙일련번호 || i}
                  rule={item}
                  query={qParam}
                />
              ))}
            </div>

            {/* Raw text fallback when no structured items but raw_text exists */}
            {items.length === 0 && getRawText() && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 mb-2 font-medium">검색 결과 (원문)</p>
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {getRawText()}
                </pre>
              </div>
            )}
          </>
        )}

        {/* 통합검색 결과 표시 */}
        {!loading && searchMode === 'integrated' && allResults && (
          <div className="mt-6 space-y-4">
            {/* Ordinances section */}
            {allResults.ordinances?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  🏛️ 자치법규
                  <CountBadge count={allResults.ordinances.length} />
                </h3>
                <div className="space-y-2">
                  {allResults.ordinances.slice(0, 5).map((ord, i) => (
                    <div
                      key={i}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                    >
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{ord.자치법규명}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ord.지자체}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw text from search_all */}
            {allResults.raw_text && !allResults.ordinances?.length && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-2">🔗 통합검색 결과</p>
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {allResults.raw_text}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && total > 10 && (
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
