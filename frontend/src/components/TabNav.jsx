import { useNavigate, useSearchParams } from 'react-router-dom'
import useStore from '../store/useStore'

const TABS = [
  { key: 'law', label: '📋 법령', desc: '법률·시행령·시행규칙' },
  { key: 'precedent', label: '⚖️ 판례', desc: '대법원·헌법재판소' },
  { key: 'admrule', label: '📑 행정규칙', desc: '각 부처 행정규칙' },
]

export default function TabNav() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { activeTab, setActiveTab, query } = useStore()

  const handleTab = (key) => {
    setActiveTab(key)
    const q = params.get('q') || query
    if (q) navigate(`/search?q=${encodeURIComponent(q)}&tab=${key}`)
  }

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => handleTab(tab.key)}
          className={`flex-1 flex flex-col items-center py-2.5 px-3 rounded-lg text-sm font-medium transition ${
            activeTab === tab.key
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <span className={activeTab === tab.key ? 'font-bold' : ''}>{tab.label}</span>
          <span className="text-xs text-gray-400 mt-0.5 hidden sm:block">{tab.desc}</span>
        </button>
      ))}
    </div>
  )
}
