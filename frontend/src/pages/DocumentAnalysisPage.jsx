import { useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { analyzeDocument, analyzeFile } from '../api/lawApi'
import { useNavigate } from 'react-router-dom'

const DOC_TYPES = [
  { value: 'auto', label: '🔍 자동 감지', desc: '문서 유형 자동 판단' },
  { value: 'contract', label: '📄 계약서', desc: '계약서·협약서 분석' },
  { value: 'plan', label: '💼 사업기획서', desc: '서비스·앱 기획서 법적 검토' },
  { value: 'terms', label: '📋 이용약관', desc: '약관·동의서 적법성 검토' },
]

function RiskBadge({ text }) {
  if (text?.includes('[높음]') || text?.includes('높음'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 mr-1">🔴 높음</span>
  if (text?.includes('[중간]') || text?.includes('중간'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800 mr-1">🟡 중간</span>
  if (text?.includes('[낮음]') || text?.includes('낮음'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 mr-1">🟢 낮음</span>
  return null
}

function AnalysisResult({ result, navigate }) {
  if (!result) return null
  if (result.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-3xl mb-2">❌</div>
        <p className="text-red-700 font-medium">{result.error}</p>
      </div>
    )
  }

  const answer = result.answer || ''
  const references = result.references || []
  const toolsUsed = result.tools_used || []
  const laws = references.filter(r => r.type === 'law' || r.type === 'law_detail')
  const precs = references.filter(r => r.type === 'precedent' || r.type === 'precedent_detail')
  const uniqueLaws = laws.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
  const uniquePrecs = precs.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)

  return (
    <div className="space-y-4 fade-in">
      {/* 사용된 도구 */}
      {toolsUsed.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-xs text-gray-500">
          <span>검색된 데이터:</span>
          {[...new Set(toolsUsed.map(t => t.tool))].map((t, i) => {
            const labels = {
              search_law: '📋 법령', get_law_detail: '📖 조문',
              search_precedent: '⚖️ 판례', get_precedent_detail: '📄 판례상세',
              search_administrative_rule: '📑 행정규칙',
            }
            return (
              <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                {labels[t] || t}
              </span>
            )
          })}
        </div>
      )}

      {/* 분석 내용 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="prose prose-sm max-w-none text-gray-800
          prose-headings:text-gray-900 prose-h3:text-base prose-h3:font-bold prose-h3:border-b prose-h3:pb-1 prose-h3:border-gray-100
          prose-strong:text-gray-900
          prose-blockquote:border-l-4 prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:rounded-r
          prose-li:my-0.5 prose-ul:my-1">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      </div>

      {/* 참조 법령·판례 */}
      {(uniqueLaws.length > 0 || uniquePrecs.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">📚 분석에 사용된 법령·판례</h3>
          {uniqueLaws.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">참고 법령</p>
              <div className="flex flex-wrap gap-2">
                {uniqueLaws.map((law, i) => (
                  <button
                    key={i}
                    onClick={() => law.id && navigate(`/law/${law.id}?name=${encodeURIComponent(law.name)}`)}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs hover:bg-blue-100 transition border border-blue-100 font-medium"
                  >
                    📋 {law.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {uniquePrecs.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">참고 판례</p>
              <div className="flex flex-wrap gap-2">
                {uniquePrecs.map((prec, i) => (
                  <button
                    key={i}
                    onClick={() => prec.id && navigate(`/precedent/${prec.id}`)}
                    className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs hover:bg-purple-100 transition border border-purple-100 font-medium"
                  >
                    ⚖️ {prec.name?.slice(0, 25)}{prec.name?.length > 25 ? '...' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocumentAnalysisPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('text') // 'text' | 'file'
  const [text, setText] = useState('')
  const [docType, setDocType] = useState('auto')
  const [userRequest, setUserRequest] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [charCount, setCharCount] = useState(0)
  const fileRef = useRef(null)

  useState(() => {
    document.title = '문서 분석 · 한국 법령 검색'
  })

  const handleTextChange = (e) => {
    setText(e.target.value)
    setCharCount(e.target.value.length)
  }

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
    if (f) setFile(f)
  }, [])

  const handleAnalyze = async () => {
    if (loading) return
    if (mode === 'text' && text.trim().length < 50) {
      alert('분석할 텍스트를 50자 이상 입력해주세요.')
      return
    }
    if (mode === 'file' && !file) {
      alert('파일을 선택해주세요.')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      let data
      if (mode === 'text') {
        data = await analyzeDocument(text, docType, userRequest)
      } else {
        data = await analyzeFile(file, docType, userRequest)
      }
      setResult(data)
      // 결과로 스크롤
      setTimeout(() => {
        document.getElementById('analysis-result')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (e) {
      setResult({ error: e.message || '분석 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">📄 법률 문서 분석</h1>
          <p className="text-blue-200 text-sm">
            계약서·약관·사업기획서를 붙여넣거나 업로드하면 AI가 관련 법령을 조회하고 법적 리스크를 분석합니다.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* 입력 방식 선택 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setMode('text')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition border ${
                mode === 'text' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              ✏️ 텍스트 직접 입력
            </button>
            <button
              onClick={() => setMode('file')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition border ${
                mode === 'file' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              📁 파일 업로드 (PDF·TXT)
            </button>
          </div>

          {/* 문서 유형 선택 */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">문서 유형</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {DOC_TYPES.map(dt => (
                <button
                  key={dt.value}
                  onClick={() => setDocType(dt.value)}
                  className={`p-2.5 rounded-xl text-xs text-left border transition ${
                    docType === dt.value
                      ? 'bg-blue-50 border-blue-400 text-blue-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200'
                  }`}
                >
                  <div className="font-medium">{dt.label}</div>
                  <div className="text-gray-400 mt-0.5">{dt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 텍스트 입력 */}
          {mode === 'text' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm font-medium text-gray-700">문서 내용 붙여넣기</p>
                <span className={`text-xs ${charCount > 7000 ? 'text-red-500' : 'text-gray-400'}`}>
                  {charCount.toLocaleString()} / 8,000자
                </span>
              </div>
              <textarea
                value={text}
                onChange={handleTextChange}
                placeholder="계약서, 약관, 기획서 등의 텍스트를 붙여넣으세요...
예시: 제1조(목적) 본 계약은 갑과 을 사이의 용역 제공에 관한 사항을 정함을 목적으로 한다..."
                rows={10}
                maxLength={8000}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              />
            </div>
          )}

          {/* 파일 업로드 */}
          {mode === 'file' && (
            <div
              onDrop={handleFileDrop}
              onDragOver={e => e.preventDefault()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileDrop}
                className="hidden"
              />
              {file ? (
                <div>
                  <div className="text-4xl mb-2">📄</div>
                  <p className="font-semibold text-blue-700">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="mt-2 text-xs text-red-500 hover:text-red-700"
                  >
                    × 파일 제거
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-3">📁</div>
                  <p className="font-medium text-gray-700">PDF 또는 텍스트 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-gray-400 mt-1">지원 형식: PDF, TXT, MD (최대 10MB)</p>
                </div>
              )}
            </div>
          )}

          {/* 추가 요청사항 */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-1">
              추가 요청사항 <span className="text-gray-400 font-normal">(선택)</span>
            </p>
            <input
              type="text"
              value={userRequest}
              onChange={e => setUserRequest(e.target.value)}
              placeholder="예: 특히 해지 조항의 법적 유효성을 중점 검토해주세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 분석 버튼 */}
          <button
            onClick={handleAnalyze}
            disabled={loading || (mode === 'text' && charCount < 50) || (mode === 'file' && !file)}
            className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-bold text-sm transition"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                AI가 법령을 검색하며 분석 중... (최대 30초)
              </span>
            ) : (
              '🔍 법적 분석 시작'
            )}
          </button>
        </div>

        {/* 분석 결과 */}
        {(result || loading) && (
          <div id="analysis-result">
            <h2 className="text-base font-bold text-gray-700 mb-3">📊 분석 결과</h2>
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-500 text-sm">관련 법령과 판례를 검색하며 분석 중입니다...</p>
                <p className="text-gray-400 text-xs mt-1">복잡한 문서는 최대 30초가 소요됩니다.</p>
              </div>
            ) : (
              <AnalysisResult result={result} navigate={navigate} />
            )}
          </div>
        )}

        {/* 사용 가이드 */}
        {!result && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-700 mb-3">💡 활용 예시</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: '📝', title: '계약서 검토', desc: '용역계약서, 근로계약서, 부동산 임대차계약서의 불공정 조항 파악' },
                { icon: '💼', title: '서비스 기획서', desc: '앱·플랫폼 기획서의 개인정보보호법·전자상거래법 준수 여부 확인' },
                { icon: '📋', title: '이용약관', desc: '약관의 규제에 관한 법률 기준으로 불공정 약관 조항 탐지' },
              ].map(item => (
                <div key={item.title} className="bg-gray-50 rounded-xl p-4">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="font-semibold text-sm text-gray-800 mb-1">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
