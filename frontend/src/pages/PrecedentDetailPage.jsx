import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPrecedentDetail } from '../api/lawApi'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

const Section = ({ title, content, mono = false }) => {
  if (!content) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="w-1 h-5 bg-blue-500 rounded-full inline-block"></span>
        {title}
      </h3>
      <div className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${mono ? 'font-mono' : 'article-content'}`}>
        {content}
      </div>
    </div>
  )
}

export default function PrecedentDetailPage() {
  const { precedentId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPrecedentDetail(precedentId)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
        document.title = `${d.사건명 || '판례 상세'} · 한국 법령 검색`
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [precedentId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full spinner mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">판례를 불러오는 중...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-red-700 font-medium mb-2">{error}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          ← 뒤로가기
        </button>
      </div>
    </div>
  )

  const VERDICT_COLOR = {
    '파기환송': 'bg-red-100 text-red-800',
    '파기자판': 'bg-red-100 text-red-800',
    '인용': 'bg-blue-100 text-blue-800',
    '기각': 'bg-gray-100 text-gray-700',
    '상고기각': 'bg-gray-100 text-gray-700',
  }
  const verdictColor = VERDICT_COLOR[data?.선고] || 'bg-green-100 text-green-800'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-law-blue text-white py-5 px-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-200 hover:text-white text-sm mb-2 flex items-center gap-1 transition"
          >
            ← 검색 결과로
          </button>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold mb-2">{data?.사건명}</h1>
              <div className="flex flex-wrap gap-2 text-xs">
                {data?.법원명 && (
                  <span className="bg-white/20 rounded-full px-3 py-1">{data.법원명}</span>
                )}
                {data?.사건번호 && (
                  <span className="bg-white/20 rounded-full px-3 py-1">{data.사건번호}</span>
                )}
                {data?.선고일자 && (
                  <span className="bg-white/20 rounded-full px-3 py-1">
                    📅 {formatDate(data.선고일자)}
                  </span>
                )}
                {data?.사건종류명 && (
                  <span className="bg-white/20 rounded-full px-3 py-1">{data.사건종류명}</span>
                )}
              </div>
            </div>
            {data?.선고 && (
              <span className={`px-4 py-2 rounded-xl font-bold text-sm ${verdictColor} self-start`}>
                {data.선고}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* 참조조문 */}
        {data?.참조조문 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 mb-1">📎 참조조문</p>
            <p className="text-sm text-blue-800">{data.참조조문}</p>
          </div>
        )}
        {/* 참조판례 */}
        {data?.참조판례 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-purple-700 mb-1">🔗 참조판례</p>
            <p className="text-sm text-purple-800">{data.참조판례}</p>
          </div>
        )}

        <Section title="판시사항" content={data?.판시사항} />
        <Section title="판결요지" content={data?.판결요지} />

        {/* 판례 전문 */}
        {data?.판례내용 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded-full inline-block"></span>
              판례 전문
            </h3>
            <details>
              <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium mb-3">
                전문 보기/접기
              </summary>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap article-content border-t border-gray-100 pt-3 mt-3">
                {data.판례내용}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
