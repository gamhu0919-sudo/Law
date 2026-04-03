import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { aiChat, clearSession } from '../api/lawApi'
import useStore from '../store/useStore'

// 세션 ID 생성 (탭별 고유)
const SESSION_ID = `session_${Date.now()}`

const QUICK_QUESTIONS = [
  { icon: '🏠', text: '전세 보증금을 못 받으면 어떻게 해야 하나요?' },
  { icon: '👷', text: '부당해고를 당했을 때 대처 방법은?' },
  { icon: '🔒', text: '개인정보보호법에서 사업자가 지켜야 할 의무는?' },
  { icon: '📝', text: '근로계약서 작성 시 필수 기재사항은?' },
  { icon: '💼', text: '스타트업 앱 출시 전 확인해야 할 법령은?' },
  { icon: '⚖️', text: '소비자 분쟁 발생 시 관련 법령과 절차는?' },
]

// Markdown 렌더러 컴포넌트
function MarkdownContent({ content }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed
      prose-headings:text-gray-900 prose-headings:font-bold
      prose-h2:text-base prose-h3:text-sm
      prose-strong:text-gray-900
      prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:rounded
      prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-xs
      prose-li:my-0.5">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// 참조 뱃지 컴포넌트
function ReferenceBadges({ references }) {
  const navigate = useNavigate()
  if (!references || references.length === 0) return null

  const laws = references.filter(r => r.type === 'law' || r.type === 'law_detail')
  const precs = references.filter(r => r.type === 'precedent' || r.type === 'precedent_detail')

  const uniqueLaws = laws.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
  const uniquePrecs = precs.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {uniqueLaws.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-gray-500 font-medium mr-2">📋 참고 법령:</span>
          <div className="inline-flex flex-wrap gap-1 mt-1">
            {uniqueLaws.map((law, i) => (
              <button
                key={i}
                onClick={() => law.id && navigate(`/law/${law.id}?name=${encodeURIComponent(law.name)}`)}
                className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition border border-blue-100"
              >
                {law.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {uniquePrecs.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 font-medium mr-2">⚖️ 참고 판례:</span>
          <div className="inline-flex flex-wrap gap-1 mt-1">
            {uniquePrecs.map((prec, i) => (
              <button
                key={i}
                onClick={() => prec.id && navigate(`/precedent/${prec.id}`)}
                className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs hover:bg-purple-100 transition border border-purple-100"
              >
                {prec.name?.slice(0, 20)}{prec.name?.length > 20 ? '...' : ''}
                {prec.court && <span className="text-purple-400 ml-1">({prec.court})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// 도구 사용 표시
function ToolsBadge({ tools }) {
  if (!tools || tools.length === 0) return null
  const unique = [...new Set(tools.map(t => t.tool))]
  const labels = {
    search_law: '📋 법령검색',
    get_law_detail: '📖 법령조문',
    search_precedent: '⚖️ 판례검색',
    get_precedent_detail: '📄 판례상세',
    search_administrative_rule: '📑 행정규칙',
  }
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {unique.map((t, i) => (
        <span key={i} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
          {labels[t] || t}
        </span>
      ))}
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(SESSION_ID)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const { addHistory } = useStore()

  useEffect(() => {
    document.title = 'AI 법률 비서 · 한국 법령 검색'
    // 초기 환영 메시지
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `안녕하세요! 저는 **한국 법령·판례 AI 비서**입니다. 🏛️

국가법령정보센터와 실시간으로 연동되어 있어, 여러분의 법률 질문에 정확한 법령과 판례를 바탕으로 답변합니다.

**이런 질문을 해보세요:**
- 계약서의 특정 조항이 법적으로 유효한지 궁금할 때
- 부당해고, 임금 미지급 등 노동 문제 관련 법령
- 사업 운영에 필요한 컴플라이언스 확인
- 소비자 권리, 임차권 등 일상 법률 정보

아래 빠른 질문을 클릭하거나 직접 입력해보세요! 💬`,
      references: [],
      tools_used: [],
    }])
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return

    setInput('')
    addHistory(q)

    const userMsg = { id: Date.now(), role: 'user', content: q }
    const thinkingMsg = { id: Date.now() + 1, role: 'assistant', content: '', thinking: true }

    setMessages(prev => [...prev, userMsg, thinkingMsg])
    setLoading(true)

    try {
      const data = await aiChat(q, sessionId, 'chat')
      setMessages(prev => prev.map(m =>
        m.thinking ? {
          ...m,
          thinking: false,
          content: data.answer || '답변을 생성하지 못했습니다.',
          references: data.references || [],
          tools_used: data.tools_used || [],
        } : m
      ))
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.thinking ? {
          ...m,
          thinking: false,
          content: `오류가 발생했습니다: ${e.message || '알 수 없는 오류'}`,
          references: [],
          tools_used: [],
          isError: true,
        } : m
      ))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, sessionId, addHistory])

  const handleClearSession = async () => {
    if (!window.confirm('대화 내역을 초기화하시겠습니까?')) return
    try {
      await clearSession(sessionId)
    } catch {}
    setMessages([{
      id: 'welcome_reset',
      role: 'assistant',
      content: '대화가 초기화되었습니다. 새로운 질문을 시작해보세요! 😊',
      references: [],
      tools_used: [],
    }])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
      {/* 상단 바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white text-lg">
            🤖
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">AI 법률 비서</h1>
            <p className="text-xs text-gray-500">Gemini 2.5 Flash · 법령·판례 실시간 연동</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            온라인
          </span>
          <button
            onClick={handleClearSession}
            className="text-xs text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition border border-gray-200"
          >
            🗑️ 초기화
          </button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white text-sm mr-2 flex-shrink-0 mt-1">
                🤖
              </div>
            )}
            <div className={`max-w-[85%] lg:max-w-[75%] ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-2xl rounded-tr-md px-4 py-3'
                : 'bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm'
            }`}>
              {msg.thinking ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-1">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span>법령·판례 검색 중...</span>
                </div>
              ) : msg.role === 'user' ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div>
                  {msg.isError ? (
                    <p className="text-red-600 text-sm">{msg.content}</p>
                  ) : (
                    <>
                      <ToolsBadge tools={msg.tools_used} />
                      <MarkdownContent content={msg.content} />
                      <ReferenceBadges references={msg.references} />
                    </>
                  )}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-gray-200 rounded-xl flex items-center justify-center text-sm ml-2 flex-shrink-0 mt-1">
                👤
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 빠른 질문 (메시지가 1개 = welcome일 때만 표시) */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 mb-2 text-center">💡 빠른 질문 예시</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q.text)}
                className="text-left text-xs bg-white border border-gray-200 rounded-xl px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50 transition shadow-sm"
              >
                <span className="mr-1">{q.icon}</span>
                {q.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="법률 질문을 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
              rows={2}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition"
              disabled={loading}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-semibold transition text-sm h-[60px] whitespace-nowrap"
          >
            {loading ? '⏳' : '전송 →'}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1.5">
          본 AI는 법률 정보를 제공하며, 법률 자문을 대체하지 않습니다.
        </p>
      </div>
    </div>
  )
}
