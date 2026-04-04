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

  // Sync with external query changes
  useEffect(() => {
    setInputVal(query)
  }, [query])

  // Close dropdown on outside click
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
            placeholder={`${tabLabel[activeTab] || '법령'} 키워드를 입력하세요 (예: 민법, 손해배상)`}
            aria-label="법령 검색"
            className={[
              'w-full rounded-xl px-4 border-2 transition shadow-sm',
              'bg-white text-gray-900 placeholder-gray-400',
              'border-gray-200 focus:border-blue-500 focus:outline-none',
              'dark:bg-gray-800 dark:text-white dark:placeholder-gray-400',
              'dark:border-gray-600 dark:focus:border-blue-400',
              large ? 'py-4 text-base' : 'py-3 text-sm',
            ].join(' ')}
          />
          {inputVal && (
            <button
              onClick={() => { setInputVal(''); inputRef.current?.focus() }}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            >
              ×
            </button>
          )}

          {/* Dropdown */}
          {showDrop && history.length > 0 && (
            <div
              ref={dropRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">최근 검색</span>
                <button
                  onClick={clearHistory}
                  className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  전체 삭제
                </button>
              </div>
              {history.slice(0, 8).map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setInputVal(h); handleSubmit(h) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center gap-2 transition"
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
          aria-label="검색"
          className={[
            'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
            'text-white rounded-xl font-semibold transition shadow-sm whitespace-nowrap',
            'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
            large ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm',
          ].join(' ')}
        >
          🔍 검색
        </button>
      </div>

      {/* 빠른 검색 태그 */}
      {large && (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {QUICK_SEARCHES.map(kw => (
            <button
              key={kw}
              onClick={() => { setInputVal(kw); handleSubmit(kw) }}
              className={[
                'px-3 py-1.5 text-xs rounded-full border transition shadow-sm',
                'bg-white/90 text-gray-700 border-gray-200',
                'hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50',
                'dark:bg-gray-700/80 dark:text-gray-200 dark:border-gray-600',
                'dark:hover:border-blue-400 dark:hover:text-blue-300 dark:hover:bg-gray-600',
              ].join(' ')}
            >
              {kw}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
