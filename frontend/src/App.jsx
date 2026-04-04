import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import LawDetailPage from './pages/LawDetailPage'
import PrecedentDetailPage from './pages/PrecedentDetailPage'
import ChatPage from './pages/ChatPage'
import DocumentAnalysisPage from './pages/DocumentAnalysisPage'
import PrecedentComparePage from './pages/PrecedentComparePage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/law/:lawId" element={<LawDetailPage />} />
            <Route path="/precedent/:precedentId" element={<PrecedentDetailPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/analyze" element={<DocumentAnalysisPage />} />
            <Route path="/compare" element={<PrecedentComparePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
