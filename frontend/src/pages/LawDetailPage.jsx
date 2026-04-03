import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { getLawDetail } from '../api/lawApi'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  const clean = d.replace(/\./g, '').replace(/-/g, '').trim()
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}`
  }
  return d
}

// 조문 여부에 따른 스타일 분기 (조문, 전문, 장, 편, 절 등)
const getArticleStyle = (여부) => {
  switch (여부) {
    case '전문': return 'bg-gray-50 border-gray-300'
    case '편': case '장': case '절': case '관':
      return 'bg-blue-50 border-blue-200'
    default: return 'bg-white border-gray-200'
  }
}

export default function LawDetailPage() {
  const { lawId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const lawName = searchParams.get('name') || '법령 상세'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const mainRef = useRef(null)

  useEffect(() => {
    document.title = `${lawName} · 한국 법령 검색`
    setLoading(true)
    setError(null)
    getLawDetail(lawId)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
        setActiveIdx(0)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lawId])

  const allArticles = data?.조문 || []

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
        ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{p}</mark>
        : p
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full spinner mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">법령 조문을 불러오는 중...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-red-700 font-medium mb-1">조회 실패</p>
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          ← 뒤로가기
        </button>
      </div>
    </div>
  )

  const activeArticle = filteredArticles[activeIdx]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-law-blue text-white py-5 px-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-200 hover:text-white text-sm mb-2 flex items-center gap-1 transition"
          >
            ← 검색 결과로
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">{data?.법령명 || lawName}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-blue-200">
            {data?.법령구분 && <span>📋 {data.법령구분}</span>}
            {data?.소관부처 && <span>🏢 {data.소관부처}</span>}
            {data?.공포일자 && <span>📅 공포: {formatDate(data.공포일자)}</span>}
            {data?.시행일자 && <span>✅ 시행: {formatDate(data.시행일자)}</span>}
            {allArticles.length > 0 && <span>📖 총 {allArticles.length}개 조문</span>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-5">
        {/* 사이드바 목차 */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                조문 목차 ({filteredArticles.length}개)
              </p>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setActiveIdx(0) }}
                placeholder="조문 검색..."
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                      // 모바일에서는 해당 조문으로 스크롤
                      const el = document.getElementById(`article-${i}`)
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition border-b border-gray-50 last:border-0 ${
                      activeIdx === i
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : isSection
                          ? 'text-gray-600 bg-gray-50 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`font-medium ${isSection ? 'text-blue-600' : ''}`}>
                      {a.조문번호 || a.조문여부}
                    </span>
                    {a.조문제목 && (
                      <span className="ml-1 text-gray-400">{a.조문제목}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* 본문 */}
        <main className="flex-1 min-w-0" ref={mainRef}>
          {/* 모바일 검색 */}
          <div className="lg:hidden mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="조문 검색 (번호, 제목, 내용)..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>

          {/* 데스크탑 선택된 조문 강조 표시 */}
          {activeArticle && (
            <div className="hidden lg:block bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4 fade-in">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-blue-700 font-bold text-lg">{activeArticle.조문번호}</span>
                {activeArticle.조문제목 && (
                  <span className="text-gray-700 font-medium">({activeArticle.조문제목})</span>
                )}
              </div>
              <div className="article-content text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                {highlight(activeArticle.조문내용)}
              </div>
            </div>
          )}

          {/* 검색 결과 없음 */}
          {filteredArticles.length === 0 && search && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-2">🔍</div>
              <p>"{search}"에 해당하는 조문이 없습니다.</p>
            </div>
          )}

          {/* 전체 조문 목록 */}
          <div className="space-y-2">
            {filteredArticles.map((a, i) => {
              const isSection = ['전문', '편', '장', '절', '관'].includes(a.조문여부)
              const styleClass = getArticleStyle(a.조문여부)
              return (
                <div
                  id={`article-${i}`}
                  key={i}
                  className={`rounded-xl border p-4 fade-in cursor-pointer transition ${styleClass} ${
                    activeIdx === i ? 'ring-2 ring-blue-300 shadow-sm' : 'hover:shadow-sm'
                  }`}
                  onClick={() => setActiveIdx(i)}
                >
                  <div className="flex items-start gap-3">
                    {/* 조문번호 */}
                    <div className="flex-shrink-0 min-w-[56px]">
                      {isSection ? (
                        <span className="text-blue-600 font-bold text-sm">{a.조문번호 || a.조문여부}</span>
                      ) : (
                        <span className="text-blue-600 font-bold text-sm whitespace-nowrap">{a.조문번호}</span>
                      )}
                    </div>
                    {/* 조문 내용 */}
                    <div className="flex-1 min-w-0">
                      {a.조문제목 && (
                        <div className={`font-semibold text-sm mb-1 ${isSection ? 'text-blue-800' : 'text-gray-800'}`}>
                          {highlight(a.조문제목)}
                        </div>
                      )}
                      {a.조문내용 && (
                        <div className="article-content text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
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
    </div>
  )
}
