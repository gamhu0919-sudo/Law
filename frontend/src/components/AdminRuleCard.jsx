import { useState } from 'react'
import { getAdminRuleDetail } from '../api/lawApi'

const formatDate = (d) => {
  if (!d || d.length < 8) return d || '-'
  const clean = d.replace(/\./g, '').replace(/-/g, '').trim()
  return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}`
}

const RULE_TYPE_COLOR = {
  '고시': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  '훈령': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  '예규': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  '지침': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
}

export default function AdminRuleCard({ rule, query }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const typeColor = RULE_TYPE_COLOR[rule.행정규칙종류] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  const ruleId = rule.행정규칙ID || rule.행정규칙일련번호

  const handleToggle = async () => {
    if (!expanded && !detail && ruleId) {
      setLoading(true)
      setError(null)
      try {
        const result = await getAdminRuleDetail(ruleId)
        setDetail(result)
      } catch (e) {
        setError(e.message || '상세 조회 실패')
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  const detailText = detail?.text || detail?.raw || ''
  const hasError = detail?.error || error

  // Highlight query in text
  const highlight = (text) => {
    if (!query || !text) return text
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">{p}</mark>
        : p
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border transition fade-in ${
      expanded
        ? 'border-teal-300 dark:border-teal-700 shadow-md'
        : 'border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-teal-200'
    }`}>
      {/* Card header */}
      <div
        className="p-5 cursor-pointer"
        onClick={handleToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                {rule.행정규칙종류 || '행정규칙'}
              </span>
              {rule.제개정구분 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                  {rule.제개정구분}
                </span>
              )}
              {ruleId && (
                <span className="text-xs text-gray-400 dark:text-gray-500">ID: {ruleId}</span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug">
              {highlight(rule.행정규칙명)}
            </h3>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {rule.소관부처 && <span>🏢 {rule.소관부처}</span>}
              {rule.발령일자 && <span>📅 발령: {formatDate(rule.발령일자)}</span>}
              {rule.시행일자 && <span>✅ 시행: {formatDate(rule.시행일자)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {ruleId && (
              <button
                className={`text-xs px-2.5 py-1 rounded-lg transition ${
                  expanded
                    ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-teal-50'
                }`}
              >
                {expanded ? '접기 ▲' : '상세보기 ▼'}
              </button>
            )}
            {!ruleId && (
              <span className="text-teal-500 dark:text-teal-400 text-lg flex-shrink-0">›</span>
            )}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-teal-500 rounded-full spinner" />
              상세 내용을 불러오는 중...
            </div>
          )}

          {hasError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-amber-700 dark:text-amber-400 text-sm font-medium mb-1">
                ⚠️ 전문 조회 불가
              </p>
              <p className="text-amber-600 dark:text-amber-400 text-xs">
                {detail?.error || error || '일부 행정규칙은 API 전문 조회가 지원되지 않습니다.'}
              </p>
              {/* External link fallback */}
              <a
                href={`https://www.law.go.kr/LSW/admRulLsInfoPLinkR.do?admRulSeq=${ruleId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                🔗 국가법령정보센터에서 보기 →
              </a>
            </div>
          )}

          {!loading && !hasError && detailText && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">📄 행정규칙 전문</p>
                <a
                  href={`https://www.law.go.kr/LSW/admRulLsInfoPLinkR.do?admRulSeq=${ruleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  원문 보기 →
                </a>
              </div>
              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                {detailText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
