import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { getLawDetail, getLawAnnexes, getLawThreeTier } from '../api/lawApi'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  const clean = d.replace(/\./g, '').replace(/-/g, '').trim()
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}`
  }
  return d
}

const getArticleStyle = (여부) => {
  switch (여부) {
    case '전문': return 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
    case '편': case '장': case '절': case '관':
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    default: return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
  }
}

// Annex card component
const AnnexCard = ({ annex }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            annex.종류 === '별표'
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}>
            {annex.종류}
          </span>
          <span className="text-xs text-gray-400">#{annex.일련번호}</span>
        </div>
        <p className="font-medium text-sm text-gray-900 dark:text-white leading-snug">{annex.별표명}</p>
        {annex.관련법령 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📚 {annex.관련법령}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        {annex.view_url && (
          <a
            href={annex.view_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-center"
          >
            보기
          </a>
        )}
        {annex.download_url && (
          <a
            href={annex.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition text-center"
          >
            다운로드
          </a>
        )}
      </div>
    </div>
  </div>
)

// Raw text display (for MCP text responses)
const RawTextDisplay = ({ text, searchTerm }) => {
  const highlight = useCallback((txt) => {
    if (!searchTerm || !txt) return txt
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = txt.split(new RegExp(`(${escaped})`, 'gi'))
    return parts.map((p, i) =>
      p.toLowerCase() === searchTerm.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
        : p
    )
  }, [searchTerm])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed article-content">
        {highlight(text)}
      </pre>
    </div>
  )
}

const TABS = [
  { id: 'text', label: '📖 조문', icon: '📖' },
  { id: 'annexes', label: '📋 별표/서식', icon: '📋' },
  { id: 'three-tier', label: '🔗 3단비교', icon: '🔗' },
]

export default function LawDetailPage() {
  const { lawId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const lawName = searchParams.get('name') || '법령 상세'
  const mst = searchParams.get('mst') || lawId

  const [activeTab, setActiveTab] = useState('text')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [annexes, setAnnexes] = useState(null)
  const [annexLoading, setAnnexLoading] = useState(false)
  const [threeTier, setThreeTier] = useState(null)
  const [threeTierLoading, setThreeTierLoading] = useState(false)

  const isRawText = data && (data.text || data.raw) && !data.조문

  useEffect(() => {
    document.title = `${lawName} · 한국 법령 검색`
    setLoading(true)
    setError(null)
    getLawDetail(mst || lawId)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
        setActiveIdx(0)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mst, lawId])

  const loadAnnexes = useCallback(async () => {
    if (annexes) return
    setAnnexLoading(true)
    try {
      const result = await getLawAnnexes(mst || lawId, data?.법령명 || lawName)
      setAnnexes(result)
    } catch (e) {
      setAnnexes({ error: e.message })
    } finally {
      setAnnexLoading(false)
    }
  }, [mst, lawId, data, lawName, annexes])

  const loadThreeTier = useCallback(async () => {
    if (threeTier) return
    setThreeTierLoading(true)
    try {
      const result = await getLawThreeTier(mst || lawId)
      setThreeTier(result)
    } catch (e) {
      setThreeTier({ error: e.message })
    } finally {
      setThreeTierLoading(false)
    }
  }, [mst, lawId, threeTier])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'annexes' && !annexes) loadAnnexes()
    if (tab === 'three-tier' && !threeTier) loadThreeTier()
  }

  const allArticles = data?.조문 || []
  const rawText = data?.text || data?.raw || ''

  const filteredArticles = search
    ? allArticles.filter(a =>
        a.조문번호?.includes(search) ||
        a.조문제목?.includes(search) ||
        a.조문내용?.includes(search)
      )
    : allArticles

  const highlight = (text) => {
    if (!search || !text) return text
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((p, i) =>
      p.toLowerCase() === search.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
        : p
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full spinner mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">법령을 불러오는 중...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4 dark:bg-gray-900">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center max-w-md">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-red-700 dark:text-red-400 font-medium mb-1">조회 실패</p>
        <p className="text-red-500 dark:text-red-400 text-sm mb-4">{error}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          ← 뒤로가기
        </button>
      </div>
    </div>
  )

  const activeArticle = filteredArticles[activeIdx]
  const displayName = data?.법령명 || rawText?.match(/법령명:\s*(.+)/)?.[1]?.trim() || lawName

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 헤더 */}
      <div className="bg-law-blue text-white py-5 px-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-200 hover:text-white text-sm mb-2 flex items-center gap-1 transition"
          >
            ← 검색 결과로
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">{displayName}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-blue-200">
            {data?.법령구분 && <span>📋 {data.법령구분}</span>}
            {data?.소관부처 && <span>🏢 {data.소관부처}</span>}
            {data?.공포일자 && <span>📅 공포: {formatDate(data.공포일자)}</span>}
            {data?.시행일자 && <span>✅ 시행: {formatDate(data.시행일자)}</span>}
            {allArticles.length > 0 && <span>📖 총 {allArticles.length}개 조문</span>}
            {mst && <span>🔑 MST: {mst}</span>}
          </div>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="max-w-6xl mx-auto flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 조문 탭 */}
        {activeTab === 'text' && (
          <>
            {isRawText ? (
              // Raw text from MCP (when 조문 array not available)
              <RawTextDisplay text={rawText} searchTerm={search} />
            ) : (
              <div className="flex gap-5">
                {/* 사이드바 목차 */}
                <aside className="hidden lg:block w-64 flex-shrink-0">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden sticky top-4">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        조문 목차 ({filteredArticles.length}개)
                      </p>
                      <input
                        type="text"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setActiveIdx(0) }}
                        placeholder="조문 검색..."
                        className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <div className="overflow-y-auto max-h-[70vh]">
                      {filteredArticles.length === 0 && (
                        <p className="text-xs text-gray-400 p-4 text-center">결과 없음</p>
                      )}
                      {filteredArticles.map((a, i) => {
                        const isSection = ['전문', '편', '장', '절', '관'].includes(a.조문여부)
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setActiveIdx(i)
                              const el = document.getElementById(`article-${i}`)
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }}
                            className={`w-full text-left px-3 py-2 text-xs transition border-b border-gray-50 dark:border-gray-700 last:border-0 ${
                              activeIdx === i
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                                : isSection
                                  ? 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 font-medium'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <span className={`font-medium ${isSection ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                              {a.조문번호 || a.조문여부}
                            </span>
                            {a.조문제목 && (
                              <span className="ml-1 text-gray-400 dark:text-gray-500">{a.조문제목}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </aside>

                {/* 본문 */}
                <main className="flex-1 min-w-0">
                  {/* 모바일 검색 */}
                  <div className="lg:hidden mb-4">
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="조문 검색 (번호, 제목, 내용)..."
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                  </div>

                  {/* 선택된 조문 강조 (데스크탑) */}
                  {activeArticle && !search && (
                    <div className="hidden lg:block bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-4 fade-in">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-blue-700 dark:text-blue-400 font-bold text-lg">{activeArticle.조문번호}</span>
                        {activeArticle.조문제목 && (
                          <span className="text-gray-700 dark:text-gray-300 font-medium">({activeArticle.조문제목})</span>
                        )}
                      </div>
                      <div className="article-content text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                        {activeArticle.조문내용}
                      </div>
                    </div>
                  )}

                  {filteredArticles.length === 0 && search && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-2">🔍</div>
                      <p>&ldquo;{search}&rdquo;에 해당하는 조문이 없습니다.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {filteredArticles.map((a, i) => {
                      const isSection = ['전문', '편', '장', '절', '관'].includes(a.조문여부)
                      return (
                        <div
                          id={`article-${i}`}
                          key={i}
                          className={`rounded-xl border p-4 fade-in cursor-pointer transition ${getArticleStyle(a.조문여부)} ${
                            activeIdx === i ? 'ring-2 ring-blue-300 dark:ring-blue-700 shadow-sm' : 'hover:shadow-sm'
                          }`}
                          onClick={() => setActiveIdx(i)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 min-w-[56px]">
                              <span className={`font-bold text-sm whitespace-nowrap ${isSection ? 'text-blue-700 dark:text-blue-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                {a.조문번호 || a.조문여부}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {a.조문제목 && (
                                <div className={`font-semibold text-sm mb-1 ${isSection ? 'text-blue-800 dark:text-blue-300' : 'text-gray-800 dark:text-white'}`}>
                                  {highlight(a.조문제목)}
                                </div>
                              )}
                              {a.조문내용 && (
                                <div className="article-content text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                                  {highlight(a.조문내용)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </main>
              </div>
            )}
          </>
        )}

        {/* 별표/서식 탭 */}
        {activeTab === 'annexes' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                📋 별표/서식 목록
                {annexes?.total ? ` (총 ${annexes.total}건)` : ''}
              </h2>
              <button
                onClick={loadAnnexes}
                className="text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 transition"
              >
                새로고침
              </button>
            </div>

            {annexLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!annexLoading && annexes?.error && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-4 text-center">
                <p className="text-red-700 dark:text-red-400 text-sm">{annexes.error}</p>
              </div>
            )}

            {!annexLoading && annexes?.annexes?.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p>이 법령에 별표/서식이 없습니다.</p>
              </div>
            )}

            {!annexLoading && annexes?.annexes?.length > 0 && (
              <div className="space-y-3">
                {annexes.annexes.map((annex, i) => (
                  <AnnexCard key={i} annex={annex} />
                ))}
              </div>
            )}

            {/* Raw text fallback */}
            {!annexLoading && annexes?.raw_text && !annexes?.annexes?.length && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {annexes.raw_text}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 3단비교 탭 */}
        {activeTab === 'three-tier' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
              🔗 법률-시행령-시행규칙 3단 비교
            </h2>

            {threeTierLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full spinner mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">3단 비교 데이터 로딩 중...</p>
                </div>
              </div>
            )}

            {!threeTierLoading && threeTier && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                {threeTier.error ? (
                  <p className="text-red-500 dark:text-red-400 text-sm">{threeTier.error}</p>
                ) : (
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {threeTier.text || threeTier.raw || JSON.stringify(threeTier, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {!threeTierLoading && !threeTier && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <button
                  onClick={loadThreeTier}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  3단 비교 불러오기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
