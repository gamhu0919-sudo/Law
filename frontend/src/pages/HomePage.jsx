import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import TabNav from '../components/TabNav'
import useStore from '../store/useStore'

const SEARCH_FEATURES = [
  { icon: '📋', title: '법령 검색', desc: '민법·형법·상법 등 국내 모든 법령을 키워드로 검색하고 조문 전체를 확인하세요.' },
  { icon: '⚖️', title: '판례 검색', desc: '대법원·헌법재판소 판례를 검색하고 판결요지·참조조문을 빠르게 확인하세요.' },
  { icon: '📑', title: '행정규칙 검색', desc: '각 부처 행정규칙을 검색하고 소관부처·시행일자를 확인하세요.' },
  { icon: '⚡', title: '실시간 최신', desc: '국가법령정보센터 공식 API를 통해 항상 최신 법령·판례 정보를 제공합니다.' },
]

const AI_FEATURES = [
  {
    icon: '🤖',
    title: 'AI 법률 비서',
    desc: '자연어로 질문하면 관련 법령과 판례를 자동으로 검색하고 쉽게 설명해드립니다.',
    to: '/chat',
    color: 'from-blue-600 to-indigo-700',
    badge: 'NEW',
    examples: ['전세 보증금 미반환 시 대처법', '부당해고 시 법적 절차', '개인정보보호법 사업자 의무'],
  },
  {
    icon: '📄',
    title: '법률 문서 분석',
    desc: '계약서·약관·사업기획서를 붙여넣거나 PDF를 업로드하면 AI가 법적 리스크를 분석합니다.',
    to: '/analyze',
    color: 'from-indigo-600 to-purple-700',
    badge: 'AI',
    examples: ['계약서 불공정 조항 탐지', '이용약관 적법성 검토', '스타트업 서비스 법률 리스크'],
  },
  {
    icon: '⚖️',
    title: '판례 AI 분석',
    desc: '어려운 판례를 쉽게 요약하고, 여러 판례를 AI로 비교 분석합니다.',
    to: '/compare',
    color: 'from-purple-600 to-pink-700',
    badge: 'AI',
    examples: ['판례 핵심 쟁점 요약', '유사 판례 비교', '판례 흐름 분석'],
  },
]

export default function HomePage() {
  const { setActiveTab } = useStore()

  useEffect(() => {
    document.title = '한국 법령·판례 통합검색'
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      {/* 히어로 섹션 */}
      <section className="bg-gradient-to-br from-law-blue via-blue-900 to-blue-800 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl mb-4">🏛️</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
            한국 법령·판례 통합검색
          </h1>
          <p className="text-blue-200 text-base sm:text-lg mb-2">
            국가법령정보센터 Open API 기반 · 실시간 법령 · 판례 · 행정규칙 검색
          </p>
          <p className="text-blue-300 text-sm mb-8">
            🤖 Gemini AI 연동 · 자연어 법률 질문 · 문서 분석 · 판례 비교
          </p>

          {/* 탭 */}
          <div className="max-w-lg mx-auto mb-5">
            <TabNav />
          </div>

          {/* 검색창 */}
          <SearchBar large />
        </div>
      </section>

      {/* AI 기능 섹션 */}
      <section className="py-14 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold mb-3">🤖 AI 기능</span>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">AI 법률 비서 서비스</h2>
            <p className="text-gray-500 text-sm">Gemini 2.5 Flash AI가 법령·판례를 자동 검색하고 분석합니다</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {AI_FEATURES.map(f => (
              <Link
                key={f.to}
                to={f.to}
                className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                <div className={`bg-gradient-to-r ${f.color} p-5 text-white`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-3xl">{f.icon}</span>
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{f.badge}</span>
                  </div>
                  <h3 className="font-bold text-lg">{f.title}</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-gray-600 mb-3 leading-relaxed">{f.desc}</p>
                  <div className="space-y-1">
                    {f.examples.map(ex => (
                      <div key={ex} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="text-blue-400">✓</span>
                        {ex}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-blue-600 text-sm font-medium group-hover:text-blue-700">
                    시작하기 →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 검색 기능 소개 */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-center text-gray-700 mb-8">검색 기능</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SEARCH_FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-gray-800 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 자주 검색하는 법령 */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-center text-gray-700 mb-6">자주 검색하는 법령</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { name: '민법', icon: '⚖️', desc: '계약·불법행위·물권' },
              { name: '근로기준법', icon: '👷', desc: '임금·근로시간·해고' },
              { name: '개인정보보호법', icon: '🔒', desc: '정보처리·보호원칙' },
              { name: '주택임대차보호법', icon: '🏠', desc: '임차인 권리·보증금' },
              { name: '형법', icon: '🚔', desc: '범죄·처벌 규정' },
              { name: '상법', icon: '🏢', desc: '회사·상거래 법규' },
            ].map(item => (
              <button
                key={item.name}
                onClick={() => {
                  setActiveTab('law')
                  window.location.href = `/search?q=${encodeURIComponent(item.name)}&tab=law`
                }}
                className="bg-white rounded-xl p-4 text-left border border-gray-200 hover:border-blue-300 hover:shadow-md transition"
              >
                <div className="text-xl mb-1">{item.icon}</div>
                <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* AI 활용 사례 */}
      <section className="py-12 px-4 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-center text-gray-700 mb-8">활용 사례</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                title: '법률 전문가',
                icon: '👨‍⚖️',
                items: ['계약서 검토: AI가 관련 법령 자동 참조', '판례 연구: 유사 판례 빠른 검색·비교', '법률 자문: 관련 법령·판례 즉시 조회'],
              },
              {
                title: '기업 법무팀',
                icon: '🏢',
                items: ['컴플라이언스: 사업 관련 법령 실시간 조회', '노무 관리: 근로기준법 관련 판례 검색', '소송 준비: 관련 판례·법령 자동 수집'],
              },
              {
                title: '스타트업·개발자',
                icon: '💻',
                items: ['서비스 법률 검토: 개인정보보호법 등 확인', '약관 작성: 관련 법령 참조 자동화', '법률 리스크 분석: AI가 기획서 분석'],
              },
              {
                title: '일반 사용자',
                icon: '👤',
                items: ['법률 상담: AI로 기본 법률 정보 조회', '권리 확인: 소비자·임차인 권리 검색', '민원 준비: 소송 준비를 위한 정보 수집'],
              },
            ].map(item => (
              <div key={item.title} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{item.icon}</span>
                  <h3 className="font-bold text-gray-800">{item.title}</h3>
                </div>
                <ul className="space-y-2">
                  {item.items.map(it => (
                    <li key={it} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">✓</span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="mt-auto bg-gray-800 text-gray-400 text-xs text-center py-5 px-4">
        <p>데이터 출처: <a href="https://open.law.go.kr" target="_blank" rel="noopener noreferrer" className="hover:text-white underline">국가법령정보센터 Open API</a></p>
        <p className="mt-1">본 서비스는 법령 정보 제공 목적이며, 법률 자문을 대체하지 않습니다.</p>
      </footer>
    </div>
  )
}
