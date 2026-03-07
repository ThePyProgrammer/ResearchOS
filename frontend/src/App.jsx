import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout, { LayoutBare } from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import Paper from './pages/Paper'
import Agents from './pages/Agents'
import Proposals from './pages/Proposals'
import LibrarySettings from './pages/LibrarySettings'
import { LibraryProvider } from './context/LibraryContext'

export default function App() {
  return (
    <BrowserRouter>
      <LibraryProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="library" element={<Library />} />
            <Route path="library/settings" element={<LibrarySettings />} />
            <Route path="agents" element={<Agents />} />
          </Route>
          <Route path="/" element={<LayoutBare />}>
            <Route path="library/paper/:id" element={<Paper />} />
            <Route path="proposals" element={<Proposals />} />
          </Route>
        </Routes>
      </LibraryProvider>
    </BrowserRouter>
  )
}
