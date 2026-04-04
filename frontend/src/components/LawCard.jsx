import { useNavigate } from 'react-router-dom'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  const clean = d.replace(/\./g, '').replace(/-/g, '').trim()
  if (clean.length === 8) return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}`
  return d
}

const LAW_TYPE_COLOR = {
  '법률': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  '대통령령': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  '총리령': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  '부령': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  '조약': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
}

const highlight = (text, query) => {
  if (!query || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
      : p
  )
}

export default function LawCard({ law, query, rank }) {
  const navigate = useNavigate()
  const typeColor = LAW_TYPE_COLOR[law.법령구분] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'

  // Prefer MST (법령일련번호) for detail view, fallback to 법령ID
  const mst = law.MST || law.법령일련번호 || ''
  const lawId = law.법령ID || ''
  const detailId = mst || lawId

  const handleClick = () => {
    const name = law.법령명 || ''
    navigate(`/law/${detailId}?name=${encodeURIComponent(name)}&mst=${mst}`)
  }

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-600 transition cursor-pointer fade-in group"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {rank && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-5 text-center">{rank}</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
              {law.법령구분 || '법령'}
            </span>
            {law.제개정구분 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                {law.제개정구분}
              </span>
            )}
            {mst && (
              <span className="text-xs text-gray-400 dark:text-gray-500">MST: {mst}</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug group-hover:text-blue-700 dark:group-hover:text-blue-400 transition">
            {highlight(law.법령명, query)}
            {law.법령명_약칭 && law.법령명_약칭 !== law.법령명 && (
              <span className="ml-2 text-sm text-gray-400 dark:text-gray-500 font-normal">({law.법령명_약칭})</span>
            )}
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            {law.소관부처 && <span>🏢 {law.소관부처}</span>}
            {law.공포일자 && <span>📅 공포: {formatDate(law.공포일자)}</span>}
            {law.시행일자 && <span>✅ 시행: {formatDate(law.시행일자)}</span>}
          </div>
          {/* Snippet */}
          {law.snippet && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-2">
              {law.snippet}
            </p>
          )}
        </div>
        <span className="text-blue-500 dark:text-blue-400 text-lg flex-shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform">›</span>
      </div>
    </div>
  )
}
