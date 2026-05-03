---
phase: quick
plan: 1
subsystem: frontend-routing
tags: [routing, react-router, nested-routes, refactor]
dependency_graph:
  requires: []
  provides: [URL-based tab navigation for ProjectDetail]
  affects: [frontend/src/pages/ProjectDetail.jsx, frontend/src/App.jsx]
tech_stack:
  added: []
  patterns: [React Router v6 nested routes, Outlet + useOutletContext, useLocation for active state]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
    - frontend/src/App.jsx
decisions:
  - LeftNav derives active state from useLocation().pathname instead of prop to eliminate state/URL drift
  - Four named exports (ProjectOverview/Literature/Experiments/Notes) added at file bottom — no file splitting to preserve tight coupling of internal helpers
  - Outlet context passes { project, setProject, notes, setNotes, id } — full data needed by all four tab wrappers
metrics:
  duration: 5 min
  completed: 2026-03-17T14:28:56Z
---

# Quick Task 1: Refactor ProjectDetail Tabs to URL-Based Nested Routes

Replaced local `activeTab` state in ProjectDetail with React Router v6 nested routes so each tab has a canonical URL, enabling deep-linking, browser history navigation, and refresh persistence.

## What Was Done

### Task 1: Convert ProjectDetail to route-based layout with nested child routes

**ProjectDetail.jsx:**
- Added `Outlet`, `useLocation`, `useOutletContext` to the react-router-dom import
- Refactored `LeftNav` component: removed `activeTab`/`onTabChange` props, added `projectId` prop; uses `useLocation().pathname` to derive `activeId` and `useNavigate()` to navigate on click
- Removed `const [activeTab, setActiveTab] = useState('overview')` from `ProjectDetail`
- Replaced four conditional tab renders with a single `<Outlet context={...} />`
- Added four named export wrapper components at file bottom: `ProjectOverview`, `ProjectLiterature`, `ProjectExperiments`, `ProjectNotes` — each calls `useOutletContext()` to get shared state

**App.jsx:**
- Updated import to include the four named exports
- Replaced `<Route path="projects/:id" element={<ProjectDetail />} />` with nested routes: index route for overview, plus `/literature`, `/experiments`, `/notes` child routes

## Verification

- Vite build: passed (17s, no errors — pre-existing chunk size warning only)
- Vitest: 76 passed, 2 pre-existing RED-phase TDD failures in `ProjectDetail.tableview.test.jsx` (unrelated to routing)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 632d74e | feat(quick-1): refactor ProjectDetail tabs to URL-based nested routes |

## Self-Check: PASSED

- `frontend/src/pages/ProjectDetail.jsx` — modified, confirmed Outlet + named exports present
- `frontend/src/App.jsx` — modified, confirmed nested routes structure
- Commit 632d74e — verified via git log
