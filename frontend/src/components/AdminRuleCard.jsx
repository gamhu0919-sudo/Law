const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

const RULE_TYPE_COLOR = {
  '고시': 'bg-teal-100 text-teal-800',
  '훈령': 'bg-blue-100 text-blue-800',
  '예규': 'bg-indigo-100 text-indigo-800',
  '지침': 'bg-cyan-100 text-cyan-800',
}

export default function AdminRuleCard({ rule }) {
  const typeColor = RULE_TYPE_COLOR[rule.행정규칙종류] || 'bg-gray-100 text-gray-700'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
              {rule.행정규칙종류 || '행정규칙'}
            </span>
            {rule.제개정구분 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700">
                {rule.제개정구분}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">
            {rule.행정규칙명}
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {rule.소관부처 && <span>🏢 {rule.소관부처}</span>}
            {rule.발령일자 && <span>📅 발령: {formatDate(rule.발령일자)}</span>}
            {rule.시행일자 && <span>✅ 시행: {formatDate(rule.시행일자)}</span>}
          </div>
        </div>
        <span className="text-teal-500 text-lg flex-shrink-0 mt-1">›</span>
      </div>
    </div>
  )
}
