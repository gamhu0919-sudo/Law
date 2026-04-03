import { useNavigate } from 'react-router-dom'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

const COURT_COLOR = {
  '대법원': 'bg-red-100 text-red-800',
  '헌법재판소': 'bg-purple-100 text-purple-800',
  '고등법원': 'bg-orange-100 text-orange-800',
  '지방법원': 'bg-yellow-100 text-yellow-800',
}

const VERDICT_COLOR = {
  '파기환송': 'text-red-600',
  '파기자판': 'text-red-600',
  '인용': 'text-blue-600',
  '기각': 'text-gray-600',
  '상고기각': 'text-gray-600',
  '원심확정': 'text-green-600',
}

export default function PrecedentCard({ prec }) {
  const navigate = useNavigate()
  const courtColor = COURT_COLOR[prec.법원명] || 'bg-gray-100 text-gray-700'
  const verdictColor = VERDICT_COLOR[prec.선고] || 'text-gray-700'

  const truncate = (text, len = 120) => {
    if (!text) return ''
    return text.length > len ? text.slice(0, len) + '...' : text
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition cursor-pointer fade-in"
      onClick={() => navigate(`/precedent/${prec.판례일련번호}`)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${courtColor}`}>
              {prec.법원명 || '법원'}
            </span>
            {prec.사건종류명 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {prec.사건종류명}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">
            {prec.사건명}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {prec.사건번호 && <span>📋 {prec.사건번호}</span>}
            {prec.선고일자 && <span>📅 {formatDate(prec.선고일자)}</span>}
            {prec.선고 && (
              <span className={`font-medium ${verdictColor}`}>
                ⚖️ {prec.선고}
              </span>
            )}
          </div>
          {(prec.판결요지 || prec.판시사항) && (
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              {truncate(prec.판결요지 || prec.판시사항)}
            </p>
          )}
        </div>
        <span className="text-blue-500 text-lg flex-shrink-0 mt-1">›</span>
      </div>
    </div>
  )
}
