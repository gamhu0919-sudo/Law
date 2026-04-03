import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { getLawDetail } from '../api/lawApi'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
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
  const [activeArticle, setActiveArticle] = useState(null)
  const contentRef = useRef(null)

  useEffect(() => {
    document.title = `${lawName} · 한국 법령 검색`
    setLoading(true)
    setError(null)
    getLawDetail(lawId)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
        if (d.조문?.length > 0) setActiveArticle(d.조문[0])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lawId])

  const filteredArticles = data?.조문?.filter(a =>
    !search || a.조문번호?.includes(search) || a.조문제목?.includes(search) || a.조문내용?.includes(search)
  ) || []

  const highlight = (text) => {
    if (!search || !text) return text
    const parts = text.split(new RegExp(`(${search})`, 'gi'))
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
            {data?.조문수 !== undefined && <span>📖 총 {data.조문수}개 조문</span>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-5">
        {/* 사이드바 - 목차 */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="조문 검색..."
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="overflow-y-auto max-h-[70vh]">
              {filteredArticles.length === 0 && (
                <p className="text-xs text-gray-400 p-4 text-center">결과 없음</p>
              )}
              {filteredArticles.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setActiveArticle(a)}
                  className={`w-full text-left px-3 py-2 text-xs transition border-b border-gray-50 last:border-0 ${
                    activeArticle?.조문번호 === a.조문번호
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{a.조문번호}</span>
                  {a.조문제목 && <span className="ml-1 text-gray-500">{a.조문제목}</span>}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 본문 */}
        <main className="flex-1 min-w-0" ref={contentRef}>
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

          {/* 선택된 조문 (데스크탑) */}
          {activeArticle && (
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 p-6 mb-4 fade-in">
              <div className="flex items-center gap-3 mb-3">
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

          {/* 전체 조문 목록 */}
          <div className="space-y-3">
            {filteredArticles.length === 0 && search && (
              <div className="text-center py-12 text-gray-500">
                <p>"{search}"에 대한 조문이 없습니다.</p>
              </div>
            )}
            {filteredArticles.map((a, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border p-5 fade-in ${
                  activeArticle?.조문번호 === a.조문번호
                    ? 'border-blue-300 shadow-sm'
                    : 'border-gray-200'
                }`}
                onClick={() => setActiveArticle(a)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 font-bold text-sm whitespace-nowrap">{a.조문번호}</span>
                  <div className="flex-1 min-w-0">
                    {a.조문제목 && (
                      <div className="font-medium text-gray-800 text-sm mb-1">
                        {highlight(a.조문제목)}
                      </div>
                    )}
                    <div className="article-content text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                      {highlight(a.조문내용)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
