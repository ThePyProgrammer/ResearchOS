import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout, { LayoutBare } from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import LibraryMap from './pages/LibraryMap'
import LibraryNotes from './pages/LibraryNotes'
import Paper from './pages/Paper'
import Agents from './pages/Agents'
import Proposals from './pages/Proposals'
import LibrarySettings from './pages/LibrarySettings'
import Website from './pages/Website'
import GitHubRepo from './pages/GitHubRepo'
import Authors from './pages/Authors'
import AuthorDetail from './pages/AuthorDetail'
import Projects from './pages/Projects'
import ProjectDetail, { ProjectOverview, ProjectLiterature, ProjectExperiments } from './pages/ProjectDetail'
import ProjectNotesIDE from './pages/ProjectNotesIDE'
import ProjectTasks from './pages/ProjectTasks'
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
            <Route path="library/map" element={<LibraryMap />} />
            <Route path="library/notes" element={<LibraryNotes />} />
            <Route path="library/settings" element={<LibrarySettings />} />
            <Route path="authors" element={<Authors />} />
            <Route path="authors/:id" element={<AuthorDetail />} />
            <Route path="agents" element={<Agents />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />}>
              <Route index element={<ProjectOverview />} />
              <Route path="literature" element={<ProjectLiterature />} />
              <Route path="experiments" element={<ProjectExperiments />} />
              <Route path="tasks" element={<ProjectTasks />} />
              <Route path="notes" element={<ProjectNotesIDE />} />
            </Route>
          </Route>
          <Route path="/" element={<LayoutBare />}>
            <Route path="library/paper/:id" element={<Paper />} />
            <Route path="library/website/:id" element={<Website />} />
            <Route path="library/github-repo/:id" element={<GitHubRepo />} />
            <Route path="proposals" element={<Proposals />} />
          </Route>
        </Routes>
      </LibraryProvider>
    </BrowserRouter>
  )
}
