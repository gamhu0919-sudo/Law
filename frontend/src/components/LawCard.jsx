import { useNavigate } from 'react-router-dom'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

const LAW_TYPE_COLOR = {
  '법률': 'bg-blue-100 text-blue-800',
  '대통령령': 'bg-purple-100 text-purple-800',
  '총리령': 'bg-indigo-100 text-indigo-800',
  '부령': 'bg-cyan-100 text-cyan-800',
  '조약': 'bg-teal-100 text-teal-800',
}

export default function LawCard({ law }) {
  const navigate = useNavigate()
  const typeColor = LAW_TYPE_COLOR[law.법령구분] || 'bg-gray-100 text-gray-700'

  // 상세 조회에는 법령일련번호(MST)를 사용, 없으면 법령ID fallback
  const detailId = law.법령일련번호 || law.법령ID

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition cursor-pointer fade-in"
      onClick={() => navigate(`/law/${detailId}?name=${encodeURIComponent(law.법령명)}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
              {law.법령구분 || '법령'}
            </span>
            {law.제개정구분 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700">
                {law.제개정구분}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">
            {law.법령명}
            {law.법령명_약칭 && law.법령명_약칭 !== law.법령명 && (
              <span className="ml-2 text-sm text-gray-400 font-normal">({law.법령명_약칭})</span>
            )}
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {law.소관부처 && <span>🏢 {law.소관부처}</span>}
            {law.공포일자 && <span>📅 공포: {formatDate(law.공포일자)}</span>}
            {law.시행일자 && <span>✅ 시행: {formatDate(law.시행일자)}</span>}
          </div>
        </div>
        <span className="text-blue-500 text-lg flex-shrink-0 mt-1">›</span>
      </div>
    </div>
  )
}
