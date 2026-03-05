import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import Paper from './pages/Paper'
import Agents from './pages/Agents'
import Proposals from './pages/Proposals'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="library" element={<Library />} />
          <Route path="library/paper/:id" element={<Paper />} />
          <Route path="agents" element={<Agents />} />
          <Route path="proposals" element={<Proposals />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
