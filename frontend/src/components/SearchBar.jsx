import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const QUICK_SEARCHES = [
  '민법', '형법', '상법', '근로기준법', '개인정보보호법',
  '주택임대차보호법', '소비자기본법', '저작권법', '행정소송법'
]

export default function SearchBar({ large = false }) {
  const navigate = useNavigate()
  const { query, setQuery, activeTab, history, addHistory, clearHistory } = useStore()
  const [inputVal, setInputVal] = useState(query)
  const [showDrop, setShowDrop] = useState(false)
  const inputRef = useRef(null)
  const dropRef = useRef(null)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = (val) => {
    const q = (val || inputVal).trim()
    if (!q) return
    setQuery(q)
    addHistory(q)
    setShowDrop(false)
    navigate(`/search?q=${encodeURIComponent(q)}&tab=${activeTab}`)
  }

  const tabLabel = { law: '법령', precedent: '판례', admrule: '행정규칙' }

  return (
    <div className={`w-full ${large ? 'max-w-2xl' : 'max-w-xl'} mx-auto`}>
      {/* 검색창 */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onFocus={() => setShowDrop(true)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={`${tabLabel[activeTab]} 키워드를 입력하세요 (예: 민법, 손해배상)`}
            className={`w-full border-2 border-gray-200 rounded-xl px-4 focus:outline-none focus:border-blue-500 transition bg-white shadow-sm ${
              large ? 'py-4 text-base' : 'py-3 text-sm'
            }`}
          />
          {inputVal && (
            <button
              onClick={() => { setInputVal(''); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
            >×</button>
          )}
          {/* 드롭다운 */}
          {showDrop && (history.length > 0) && (
            <div
              ref={dropRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                <span className="text-xs text-gray-500 font-medium">최근 검색</span>
                <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-600">전체 삭제</button>
              </div>
              {history.slice(0, 8).map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setInputVal(h); handleSubmit(h) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2 transition"
                >
                  <span className="text-gray-400 text-xs">🕐</span>
                  <span>{h}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleSubmit()}
          className={`bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition shadow-sm whitespace-nowrap ${
            large ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm'
          }`}
        >
          🔍 검색
        </button>
      </div>

      {/* 빠른 검색 */}
      {large && (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {QUICK_SEARCHES.map(kw => (
            <button
              key={kw}
              onClick={() => { setInputVal(kw); handleSubmit(kw) }}
              className="px-3 py-1.5 bg-white text-gray-700 text-xs rounded-full border border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition shadow-sm"
            >
              {kw}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
