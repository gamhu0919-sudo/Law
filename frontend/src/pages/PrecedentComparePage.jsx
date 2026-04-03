import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { searchPrecedent, summarizePrecedent, comparePrecedents } from '../api/lawApi'
import { useNavigate, useSearchParams } from 'react-router-dom'

const formatDate = (d) => {
  if (!d) return '-'
  const clean = d.replace(/\./g, '').replace(/-/g, '').trim()
  if (clean.length === 8) return `${clean.slice(0,4)}.${clean.slice(4,6)}.${clean.slice(6,8)}`
  return d
}

function PrecedentSelector({ selected, onToggle, onSearch }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const data = await searchPrecedent(query, 1, 8)
      setResults(data.precedents || [])
    } catch (e) {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-700 mb-3">
        ⚖️ 판례 선택 ({selected.length}/4)
      </h3>

      {/* 선택된 판례 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((p, i) => (
            <div key={p.판례일련번호} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
              <span className="w-4 h-4 bg-blue-600 text-white rounded text-xs flex items-center justify-center font-bold">{i + 1}</span>
              <span className="text-xs text-blue-800 max-w-[160px] truncate">{p.사건명}</span>
              <button onClick={() => onToggle(p)} className="text-blue-400 hover:text-red-500 text-sm">×</button>
            </div>
          ))}
        </div>
      )}

      {/* 검색 */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="판례 키워드 검색 (예: 부당해고, 손해배상)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          {loading ? '...' : '검색'}
        </button>
      </div>

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {results.map(p => {
            const isSelected = selected.some(s => s.판례일련번호 === p.판례일련번호)
            return (
              <div
                key={p.판례일련번호}
                onClick={() => {
                  if (!isSelected && selected.length >= 4) return
                  onToggle(p)
                }}
                className={`p-2.5 rounded-lg border cursor-pointer transition text-xs ${
                  isSelected
                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                    : selected.length >= 4
                    ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.사건명?.slice(0, 40)}{p.사건명?.length > 40 ? '...' : ''}</span>
                  {isSelected && <span className="text-blue-600">✓</span>}
                </div>
                <div className="text-gray-500 mt-0.5 flex gap-3">
                  <span>{p.법원명}</span>
                  <span>{formatDate(p.선고일자)}</span>
                  <span>{p.사건번호}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryView({ data }) {
  if (!data) return null
  const { precedent, summary } = data
  return (
    <div className="space-y-4">
      {/* 판례 기본정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap gap-2 text-xs mb-3">
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-lg font-medium">{precedent?.법원명}</span>
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg">{precedent?.사건번호}</span>
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg">📅 {formatDate(precedent?.선고일자)}</span>
          {precedent?.선고 && (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-lg font-medium">{precedent.선고}</span>
          )}
        </div>
        <h2 className="font-bold text-gray-900">{precedent?.사건명}</h2>
      </div>
      {/* AI 요약 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="prose prose-sm max-w-none text-gray-800
          prose-headings:text-gray-900 prose-h3:text-base prose-h3:font-bold
          prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50 prose-blockquote:rounded-r
          prose-li:my-0.5">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function CompareView({ data, navigate }) {
  if (!data) return null
  const { precedents, comparison } = data
  return (
    <div className="space-y-4">
      {/* 판례 카드 열 */}
      <div className={`grid gap-3 ${precedents.length === 2 ? 'grid-cols-2' : precedents.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {precedents.map((p, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 bg-blue-600 text-white rounded text-xs flex items-center justify-center font-bold">{i+1}</span>
              <span className="text-xs text-blue-600 font-medium">{p.법원명}</span>
              <span className="text-xs text-gray-400">{formatDate(p.선고일자)}</span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900 leading-tight mb-2">
              {p.사건명?.slice(0,50)}{p.사건명?.length > 50 ? '...' : ''}
            </h4>
            <button
              onClick={() => navigate(`/precedent/${p.판례일련번호}`)}
              className="text-xs text-blue-600 hover:underline"
            >
              상세보기 →
            </button>
          </div>
        ))}
      </div>
      {/* AI 비교 분석 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="prose prose-sm max-w-none text-gray-800
          prose-headings:font-bold prose-h3:text-base
          prose-table:border-collapse prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 prose-td:text-xs
          prose-th:border prose-th:border-gray-200 prose-th:px-3 prose-th:py-2 prose-th:bg-gray-50 prose-th:text-xs
          prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50
          prose-li:my-0.5">
          <ReactMarkdown>{comparison}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export default function PrecedentComparePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('compare') // 'compare' | 'summarize'
  const [selectedPrecedents, setSelectedPrecedents] = useState([])
  const [summarizeId, setSummarizeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // URL 파라미터로 요약 모드 자동 실행 (판례 상세 페이지 → AI 요약)
  useEffect(() => {
    document.title = '판례 AI 분석 · 한국 법령 검색'
    const summarizeParam = searchParams.get('summarize')
    if (summarizeParam) {
      setActiveTab('summarize')
      setSummarizeId(summarizeParam)
      // 자동 요약 실행
      setTimeout(() => {
        setLoading(true)
        setResult(null)
        setError(null)
        summarizePrecedent(summarizeParam)
          .then(data => {
            if (data.error) setError(data.error)
            else setResult(data)
          })
          .catch(e => setError(e.message))
          .finally(() => setLoading(false))
      }, 300)
    }
  }, [])

  const togglePrecedent = (p) => {
    setSelectedPrecedents(prev => {
      const exists = prev.some(s => s.판례일련번호 === p.판례일련번호)
      if (exists) return prev.filter(s => s.판례일련번호 !== p.판례일련번호)
      if (prev.length >= 4) return prev
      return [...prev, p]
    })
    setResult(null)
  }

  const handleCompare = async () => {
    if (selectedPrecedents.length < 2) {
      setError('비교하려면 2개 이상의 판례를 선택해주세요.')
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const data = await comparePrecedents(selectedPrecedents.map(p => p.판례일련번호))
      if (data.error) setError(data.error)
      else setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSummarize = async () => {
    if (!summarizeId.trim()) {
      setError('판례 일련번호를 입력해주세요.')
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const data = await summarizePrecedent(summarizeId.trim())
      if (data.error) setError(data.error)
      else setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">⚖️ 판례 AI 분석</h1>
          <p className="text-purple-200 text-sm">AI가 판례를 쉽게 요약하고, 여러 판례를 비교 분석합니다.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {[
            { key: 'compare', label: '📊 판례 비교 분석', desc: '2~4개 판례 비교' },
            { key: 'summarize', label: '📝 판례 AI 요약', desc: '어려운 판례 쉽게 이해' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setResult(null); setError(null) }}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition ${
                activeTab === tab.key
                  ? 'bg-white border-blue-400 text-blue-700 shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <div>{tab.label}</div>
              <div className="text-xs font-normal mt-0.5 opacity-70">{tab.desc}</div>
            </button>
          ))}
        </div>

        {activeTab === 'compare' && (
          <div className="space-y-4">
            <PrecedentSelector
              selected={selectedPrecedents}
              onToggle={togglePrecedent}
            />
            {selectedPrecedents.length >= 2 && (
              <button
                onClick={handleCompare}
                disabled={loading}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-xl font-bold transition"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    판례 비교 분석 중...
                  </span>
                ) : `📊 선택한 ${selectedPrecedents.length}개 판례 비교 분석`}
              </button>
            )}
          </div>
        )}

        {activeTab === 'summarize' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">판례 일련번호 입력</p>
              <p className="text-xs text-gray-400 mb-2">
                판례 검색 결과에서 판례 카드를 클릭하면 상세 페이지에 일련번호가 표시됩니다.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={summarizeId}
                  onChange={e => setSummarizeId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSummarize()}
                  placeholder="예: 616249"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <button
                  onClick={handleSummarize}
                  disabled={loading || !summarizeId.trim()}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg font-semibold text-sm transition"
                >
                  {loading ? '분석 중...' : 'AI 요약'}
                </button>
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
              💡 <strong>빠른 방법:</strong> 판례 검색에서 원하는 판례를 찾아 상세보기 후, 하단의 "AI 요약 보기" 버튼을 눌러도 됩니다.
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            ❌ {error}
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">AI가 판례를 분석하는 중입니다...</p>
          </div>
        )}

        {/* 결과 */}
        {!loading && result && (
          <div className="mt-2">
            {activeTab === 'summarize' && <SummaryView data={result} />}
            {activeTab === 'compare' && <CompareView data={result} navigate={navigate} />}
          </div>
        )}
      </div>
    </div>
  )
}
