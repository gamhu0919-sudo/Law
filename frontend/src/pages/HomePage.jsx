import { useEffect } from 'react'
import SearchBar from '../components/SearchBar'
import TabNav from '../components/TabNav'
import useStore from '../store/useStore'

const FEATURES = [
  { icon: '📋', title: '법령 검색', desc: '민법·형법·상법 등 국내 모든 법령을 키워드로 검색하고 조문 전체를 확인하세요.' },
  { icon: '⚖️', title: '판례 검색', desc: '대법원·헌법재판소 판례를 검색하고 판결요지·참조조문을 빠르게 확인하세요.' },
  { icon: '📑', title: '행정규칙 검색', desc: '각 부처 행정규칙을 검색하고 소관부처·시행일자를 확인하세요.' },
  { icon: '⚡', title: '실시간 최신', desc: '국가법령정보센터 공식 API를 통해 항상 최신 법령·판례 정보를 제공합니다.' },
]

export default function HomePage() {
  const { setActiveTab } = useStore()

  useEffect(() => {
    document.title = '한국 법령·판례 통합검색'
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      {/* 히어로 섹션 */}
      <section className="bg-gradient-to-br from-law-blue via-blue-900 to-blue-800 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl mb-4">🏛️</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
            한국 법령·판례 통합검색
          </h1>
          <p className="text-blue-200 text-base sm:text-lg mb-8">
            국가법령정보센터 Open API 기반 · 실시간 법령 · 판례 · 행정규칙 검색
          </p>

          {/* 탭 */}
          <div className="max-w-lg mx-auto mb-5">
            <TabNav />
          </div>

          {/* 검색창 */}
          <SearchBar large />
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="py-14 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-center text-gray-700 mb-8">주요 기능</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(f => (
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
      <section className="pb-14 px-4">
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

      {/* 푸터 */}
      <footer className="mt-auto bg-gray-800 text-gray-400 text-xs text-center py-5 px-4">
        <p>데이터 출처: <a href="https://open.law.go.kr" target="_blank" rel="noopener noreferrer" className="hover:text-white underline">국가법령정보센터 Open API</a></p>
        <p className="mt-1">본 서비스는 법령 정보 제공 목적이며, 법률 자문을 대체하지 않습니다.</p>
      </footer>
    </div>
  )
}
