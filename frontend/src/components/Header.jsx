import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useStore from '../store/useStore'
import ApiKeyModal from './ApiKeyModal'

const NAV_LINKS = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/chat', label: 'AI 법률 비서', icon: '🤖' },
  { to: '/analyze', label: '문서 분석', icon: '📄' },
  { to: '/compare', label: '판례 분석', icon: '⚖️' },
]

export default function Header() {
  const { setApiKeyModal } = useStore()
  const hasKey = !!localStorage.getItem('law_api_key')
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      <header className="bg-law-blue shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-white hover:opacity-90 transition flex-shrink-0">
            <span className="text-2xl">🏛️</span>
            <div>
              <div className="font-bold text-lg leading-tight">한국 법령·판례 검색</div>
              <div className="text-xs text-blue-200 leading-tight">국가법령정보센터 Open API</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-blue-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <a
              href="https://open.law.go.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-200 hover:text-white transition hidden lg:block"
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
              <span className="hidden sm:inline">{hasKey ? 'API 키 설정됨' : 'API 키 설정'}</span>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="md:hidden text-white p-1.5 rounded-lg hover:bg-white/10 transition"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-blue-700 bg-blue-800">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm border-b border-blue-700 transition ${
                    isActive ? 'bg-white/10 text-white font-medium' : 'text-blue-100 hover:bg-white/5'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </header>
      <ApiKeyModal />
    </>
  )
}
