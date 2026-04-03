import { useState } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../store/useStore'
import ApiKeyModal from './ApiKeyModal'

export default function Header() {
  const { setApiKeyModal } = useStore()
  const hasKey = !!localStorage.getItem('law_api_key')

  return (
    <>
      <header className="bg-law-blue shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white hover:opacity-90 transition">
            <span className="text-2xl">🏛️</span>
            <div>
              <div className="font-bold text-lg leading-tight">한국 법령·판례 검색</div>
              <div className="text-xs text-blue-200 leading-tight">국가법령정보센터 Open API</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="https://open.law.go.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-200 hover:text-white transition hidden sm:block"
            >
              law.go.kr ↗
            </a>
            <button
              onClick={() => setApiKeyModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                hasKey
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
              }`}
            >
              <span>⚙️</span>
              <span>{hasKey ? 'API 키 설정됨' : 'API 키 설정'}</span>
            </button>
          </div>
        </div>
      </header>
      <ApiKeyModal />
    </>
  )
}
