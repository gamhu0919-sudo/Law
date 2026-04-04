import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { aiChat, clearSession } from '../api/lawApi'
import useStore from '../store/useStore'

// 탭별 고유 세션 ID
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const QUICK_QUESTIONS = [
  { icon: '🏠', text: '전세 보증금을 못 받으면 어떻게 해야 하나요?' },
  { icon: '👷', text: '부당해고를 당했을 때 대처 방법은?' },
  { icon: '🔒', text: '개인정보보호법에서 사업자가 지켜야 할 의무는?' },
  { icon: '📝', text: '조류충돌예방 시설을 구축해야 할 때 확인해야 할 법령은?' },
  { icon: '💼', text: '스타트업 앱 출시 전 확인해야 할 법령은?' },
  { icon: '⚖️', text: '소비자 분쟁 발생 시 관련 법령과 절차는?' },
]

// MCP 도구 레이블
const TOOL_LABELS = {
  search_law: '📋 법령검색',
  get_law_text: '📖 법령조문',
  search_all: '🔗 통합검색',
  search_admin_rule: '📑 행정규칙검색',
  get_admin_rule: '📑 행정규칙상세',
  get_annexes: '📋 별표조회',
  search_precedents: '⚖️ 판례검색',
  get_precedent_text: '⚖️ 판례상세',
  get_three_tier: '🔗 3단비교',
  search_interpretations: '💡 해석례검색',
  search_constitutional_decisions: '⚖️ 헌재결정',
  // Legacy
  search_precedent: '⚖️ 판례검색',
  get_law_detail: '📖 법령조문',
  search_administrative_rule: '📑 행정규칙',
}

// Markdown 렌더러
function MarkdownContent({ content }) {
  return (
    <div className="prose prose-sm max-w-none leading-relaxed prose-law
      text-gray-800 dark:text-gray-200
      prose-headings:text-blue-900 dark:prose-headings:text-blue-300
      prose-headings:font-bold prose-h2:text-base prose-h3:text-sm
      prose-strong:text-gray-900 dark:prose-strong:text-white
      prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-900/20
      prose-blockquote:py-1 prose-blockquote:rounded prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300
      prose-code:bg-gray-100 dark:prose-code:bg-gray-700 prose-code:px-1.5 prose-code:rounded prose-code:text-xs
      prose-li:my-0.5">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// 참조 뱃지
function ReferenceBadges({ references }) {
  const navigate = useNavigate()
  if (!references || references.length === 0) return null

  const laws = references.filter(r => r.type === 'law' || r.type === 'law_detail')
  const precs = references.filter(r => r.type === 'precedent' || r.type === 'precedent_detail')
  const adminRules = references.filter(r => r.type === 'admin_rule' || r.type === 'admin_rule_detail')
  const others = references.filter(r => r.type === 'search_all')

  const uniqueLaws = laws.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
  const uniquePrecs = precs.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
  const uniqueRules = adminRules.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
  const uniqueOthers = others.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)

  if (!uniqueLaws.length && !uniquePrecs.length && !uniqueRules.length && !uniqueOthers.length) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
      {uniqueLaws.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">📋 참고 법령:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {uniqueLaws.map((law, i) => (
              <button
                key={i}
                onClick={() => law.id && navigate(`/law/${law.id}?name=${encodeURIComponent(law.name)}&mst=${law.id}`)}
                className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition border border-blue-100 dark:border-blue-800"
              >
                {law.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {uniqueRules.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">📑 참고 행정규칙:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {uniqueRules.map((rule, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-xs border border-orange-100 dark:border-orange-800"
              >
                📑 {rule.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {uniqueOthers.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">🏛️ 자치법규:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {uniqueOthers.map((item, i) => (
              <span key={i} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded text-xs border border-teal-100 dark:border-teal-800">
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {uniquePrecs.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">⚖️ 참고 판례:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {uniquePrecs.map((prec, i) => (
              <button
                key={i}
                onClick={() => prec.id && navigate(`/precedent/${prec.id}`)}
                className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs hover:bg-purple-100 dark:hover:bg-purple-900/50 transition border border-purple-100 dark:border-purple-800"
              >
                {prec.name?.slice(0, 25)}{prec.name?.length > 25 ? '...' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// MCP 도구 사용 표시
function ToolsBadge({ tools }) {
  if (!tools || tools.length === 0) return null
  const unique = [...new Set(tools)]
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {unique.map((t, i) => (
        <span key={i} className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full border border-green-100 dark:border-green-800">
          {TOOL_LABELS[t] || t}
        </span>
      ))}
    </div>
  )
}

// Thinking indicator
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 bg-blue-400 rounded-full"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
      <span>법령·판례 검색 및 분석 중... (최대 60초)</span>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
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
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `안녕하세요! 저는 **한국 법령·판례 AI 비서**입니다. 🏛️

국가법령정보센터 공식 MCP 서버와 실시간으로 연동되어, 법령·행정규칙·판례·자치법규를 직접 조회하여 정확한 답변을 드립니다.

**사용 가능한 기능:**
- 📋 **법령 검색·조문 조회**: 법령명, 조문 번호 직접 확인
- 📑 **행정규칙 검색**: 훈령·예규·고시·지침 조회
- 🏛️ **자치법규**: 지역 조례·규칙 통합 검색
- ⚖️ **판례 검색**: 대법원·헌법재판소 판례
- 🔗 **3단 비교**: 법률-시행령-시행규칙 위임관계

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
          isRateLimit: data.is_rate_limit || false,
          modelUsed: data.model_used,
          toolCallsCount: data.tool_calls_count || 0,
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
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, loading, sessionId, addHistory])

  const handleClearSession = async () => {
    await clearSession(sessionId).catch(() => {})
    setMessages([{
      id: 'welcome_' + Date.now(),
      role: 'assistant',
      content: '대화 세션이 초기화되었습니다. 새로운 질문을 입력해주세요.',
      references: [],
      tools_used: [],
    }])
  }

  const isFirstMessage = messages.length <= 1

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* 헤더 */}
      <div className="bg-law-blue text-white px-4 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏛️</span>
          <div>
            <h1 className="font-bold text-sm sm:text-base">AI 법률 비서</h1>
            <p className="text-blue-200 text-xs hidden sm:block">
              MCP 기반 · 법령·행정규칙·판례 실시간 조회
            </p>
          </div>
        </div>
        <button
          onClick={handleClearSession}
          className="text-xs text-blue-200 hover:text-white border border-blue-400 rounded-lg px-2.5 py-1.5 transition hover:border-white"
        >
          🗑 초기화
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-w-3xl mx-auto w-full">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm flex-shrink-0 mr-2 mt-0.5">
                🏛
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[80%] ${msg.role === 'user' ? 'max-w-[75%]' : ''}`}>
              <div className={`rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : msg.isError
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-tl-sm'
                    : msg.isRateLimit
                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-tl-sm'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-tl-sm shadow-sm'
              }`}>
                {msg.thinking ? (
                  <ThinkingIndicator />
                ) : msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    {msg.tools_used?.length > 0 && <ToolsBadge tools={msg.tools_used} />}
                    <MarkdownContent content={msg.content} />
                    {msg.toolCallsCount > 0 && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        🔧 {msg.toolCallsCount}번 도구 호출 · {msg.modelUsed}
                      </p>
                    )}
                    <ReferenceBadges references={msg.references} />
                    {msg.isRateLimit && (
                      <div className="mt-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          ⏳ API 한도 도달. 30초 후 재시도하거나 검색 탭을 이용해주세요.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 빠른 질문 (초기 상태) */}
      {isFirstMessage && !loading && (
        <div className="max-w-3xl mx-auto w-full px-4 pb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">빠른 질문</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q.text)}
                className="text-left px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
              >
                <span className="mr-2">{q.icon}</span>
                <span className="leading-snug">{q.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 shadow-lg">
        <div className="max-w-3xl mx-auto flex gap-2">
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
            placeholder="법령, 판례, 법률 궁금증을 질문하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={1}
            disabled={loading}
            aria-label="AI 법률 질문 입력"
            className={[
              'flex-1 resize-none rounded-xl border-2 px-4 py-3 text-sm',
              'transition focus:outline-none',
              'bg-white text-gray-900 placeholder-gray-400',
              'border-gray-200 focus:border-blue-500',
              'dark:bg-gray-700 dark:text-white dark:placeholder-gray-400',
              'dark:border-gray-600 dark:focus:border-blue-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
            style={{ minHeight: '48px', maxHeight: '120px' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            aria-label="메시지 전송"
            className={[
              'px-5 rounded-xl font-semibold text-sm transition whitespace-nowrap',
              'focus:outline-none focus:ring-2 focus:ring-blue-400',
              loading || !input.trim()
                ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm',
            ].join(' ')}
          >
            {loading ? (
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spinner" />
              </span>
            ) : '전송 →'}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          본 서비스는 법령 정보 제공 목적이며 법적 자문을 대체하지 않습니다.
        </p>
      </div>
    </div>
  )
}
