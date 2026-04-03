import { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import { checkHealth } from '../api/lawApi'

export default function ApiKeyModal() {
  const { apiKeyModal, setApiKeyModal } = useStore()
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null) // null | 'ok' | 'error'
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (apiKeyModal) {
      setKey(localStorage.getItem('law_api_key') || '')
      setStatus(null)
    }
  }, [apiKeyModal])

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('law_api_key', key.trim())
    } else {
      localStorage.removeItem('law_api_key')
    }
    setApiKeyModal(false)
    window.location.reload()
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const res = await checkHealth()
      setStatus(res.status === 'ok' ? 'ok' : 'error')
    } catch {
      setStatus('error')
    } finally {
      setTesting(false)
    }
  }

  if (!apiKeyModal) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md fade-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">⚙️ API 키 설정</h2>
            <button
              onClick={() => setApiKeyModal(false)}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >×</button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            국가법령정보센터 Open API 키를 입력하세요.
            <a
              href="https://open.law.go.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline ml-1"
            >
              키 발급받기 ↗
            </a>
          </p>

          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="예: kang_0919"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />

          {status === 'ok' && (
            <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
              ✅ 서버 연결 정상
            </div>
          )}
          {status === 'error' && (
            <div className="mt-2 text-sm text-red-500 flex items-center gap-1">
              ❌ 서버 연결 실패
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {testing ? '테스트 중...' : '🔌 연결 테스트'}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
            >
              💾 저장
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            ※ API 키는 브라우저 로컬 스토리지에만 저장되며 서버로 전송되지 않습니다.
            서버에 기본 키가 설정된 경우 입력하지 않아도 됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
