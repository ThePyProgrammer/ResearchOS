---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/ProjectDetail.jsx
  - frontend/src/App.jsx
autonomous: true
requirements: [REFACTOR-TABS-01]
must_haves:
  truths:
    - "Navigating to /projects/:id shows the overview tab"
    - "Navigating to /projects/:id/literature shows the literature tab"
    - "Navigating to /projects/:id/experiments shows the experiments tab"
    - "Navigating to /projects/:id/notes shows the notes tab"
    - "LeftNav highlights the correct item based on URL, not local state"
    - "Browser back/forward navigates between tabs"
    - "Refreshing on a tab route stays on that tab"
  artifacts:
    - path: "frontend/src/pages/ProjectDetail.jsx"
      provides: "Layout wrapper with Outlet + route-based child components"
    - path: "frontend/src/App.jsx"
      provides: "Nested routes under /projects/:id"
  key_links:
    - from: "frontend/src/App.jsx"
      to: "frontend/src/pages/ProjectDetail.jsx"
      via: "React Router nested routes with Outlet"
      pattern: "Route.*projects/:id.*children"
    - from: "LeftNav"
      to: "URL location"
      via: "useLocation or NavLink for active state"
      pattern: "useLocation|NavLink"
---

<objective>
Refactor ProjectDetail tabs (overview, literature, experiments, notes) from local state switching to URL-based nested routes.

Purpose: Enable browser history navigation between tabs, deep-linking to specific tabs, and proper URL semantics (e.g., sharing /projects/abc123/experiments links directly to experiments).

Output: Updated ProjectDetail.jsx with route-based tab rendering and updated App.jsx with nested routes.
</objective>

<execution_context>
@C:/Users/prann/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/prann/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/pages/ProjectDetail.jsx
@frontend/src/App.jsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert ProjectDetail to route-based layout with nested child routes</name>
  <files>frontend/src/pages/ProjectDetail.jsx, frontend/src/App.jsx</files>
  <action>
**In ProjectDetail.jsx:**

1. Import `Outlet` and `useLocation` from react-router-dom (already imports useParams, useNavigate, Link).

2. Modify the `LeftNav` component:
   - Remove `activeTab` and `onTabChange` props.
   - Accept `projectId` prop instead.
   - Use `useLocation()` to derive active tab from pathname:
     ```
     const location = useLocation()
     const path = location.pathname
     const activeId = path.endsWith('/literature') ? 'literature'
       : path.endsWith('/experiments') ? 'experiments'
       : path.endsWith('/notes') ? 'notes'
       : 'overview'
     ```
   - Replace `onClick={() => onTabChange(item.id)}` with `onClick={() => navigate(item.id === 'overview' ? `/projects/${projectId}` : `/projects/${projectId}/${item.id}`)}`
   - Add `const navigate = useNavigate()` inside LeftNav.

3. Modify the main `ProjectDetail` export:
   - Remove `const [activeTab, setActiveTab] = useState('overview')`.
   - Replace the tab content conditional rendering block (lines ~4155-4173) with `<Outlet context={{ project, setProject: (updated) => setProject(updated), notes, setNotes, id }} />`.
   - Update LeftNav usage: replace `activeTab={activeTab} onTabChange={setActiveTab}` with `projectId={id}`.

4. Create and export four wrapper components at the bottom of the file (BEFORE the default export, or after — order does not matter since they are named exports):

   ```jsx
   export function ProjectOverview() {
     const { project, setProject } = useOutletContext()
     return <OverviewTab project={project} onUpdate={updated => setProject(updated)} />
   }

   export function ProjectLiterature() {
     const { project } = useOutletContext()
     return <LiteratureTab projectId={project.id} libraryId={project.libraryId} />
   }

   export function ProjectExperiments() {
     const { project } = useOutletContext()
     return <ExperimentSection projectId={project.id} libraryId={project.libraryId} />
   }

   export function ProjectNotes() {
     const { notes, setNotes, id } = useOutletContext()
     return (
       <NotesPanel
         notes={notes}
         setNotes={setNotes}
         createFn={(data) => notesApi.createForProject(id, data)}
       />
     )
   }
   ```

   Also import `useOutletContext` from react-router-dom in the import statement at line 2.

**In App.jsx:**

1. Import the four new named exports:
   ```jsx
   import ProjectDetail, { ProjectOverview, ProjectLiterature, ProjectExperiments, ProjectNotes } from './pages/ProjectDetail'
   ```

2. Replace the single route:
   ```jsx
   <Route path="projects/:id" element={<ProjectDetail />} />
   ```
   With nested routes:
   ```jsx
   <Route path="projects/:id" element={<ProjectDetail />}>
     <Route index element={<ProjectOverview />} />
     <Route path="literature" element={<ProjectLiterature />} />
     <Route path="experiments" element={<ProjectExperiments />} />
     <Route path="notes" element={<ProjectNotes />} />
   </Route>
   ```

**Do NOT:**
- Extract components into separate files (the file is large but all internal helpers are tightly coupled; splitting is a separate refactor).
- Change any component logic, styling, or behavior — only the routing/navigation mechanism changes.
- Touch the test files — they test internal functions (buildColumns, applyFilter, sortRows, CompareModal) which are unchanged.
  </action>
  <verify>
    <automated>cd C:/Users/prann/projects/researchos/frontend && npx vite build --mode development 2>&1 | tail -5</automated>
  </verify>
  <done>
    - /projects/:id renders OverviewTab (index route)
    - /projects/:id/literature renders LiteratureTab
    - /projects/:id/experiments renders ExperimentSection
    - /projects/:id/notes renders NotesPanel
    - LeftNav highlights based on URL pathname, not local state
    - No activeTab/setActiveTab state in ProjectDetail
    - Vite build succeeds with no errors
  </done>
</task>

</tasks>

<verification>
- `cd frontend && npx vite build --mode development` completes without errors
- Existing tests still pass: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
</verification>

<success_criteria>
- All four tab routes resolve to the correct content
- LeftNav active state derives from URL, not component state
- Browser back/forward works between tabs
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/1-refactor-projectdetail-tabs-into-separat/1-SUMMARY.md`
</output>
