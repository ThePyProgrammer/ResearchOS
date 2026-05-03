---
phase: quick-3
plan: "01"
subsystem: frontend/sidebar
tags: [navigation, sidebar, projects, ux]
dependency_graph:
  requires: [quick-1-project-detail-tabs-as-routes]
  provides: [collapsible-project-nodes-with-sub-links]
  affects: [Sidebar.jsx]
tech_stack:
  added: []
  patterns: [NavLink-nested-routes, useEffect-auto-expand, component-inline-subcomponent]
key_files:
  created: []
  modified:
    - frontend/src/components/layout/Sidebar.jsx
decisions:
  - ProjectNode defined as inner function inside ProjectsTree — keeps status dot mapping and expanded state in scope without prop drilling
  - Auto-expand uses regex match on location.pathname to extract proj_ prefixed IDs — robust to future ID format changes
  - Clicking project row always navigates to overview AND toggles expand — single affordance for both actions
  - Sub-link active state uses NavLink end=true for Overview route to avoid false positives on /projects/:id/literature etc.
metrics:
  duration: "4 min"
  completed: "2026-03-17"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 3: Move Projects into Main Sidebar with Collapsible Nodes — Summary

**One-liner:** Collapsible project nodes in the sidebar with 4 sub-links (Overview, Literature, Experiments, Notes) auto-expanding on direct navigation to /projects/:id/* routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor ProjectsTree into collapsible project nodes with sub-links | f85c896 | frontend/src/components/layout/Sidebar.jsx |

## What Was Built

Replaced the flat `NavLink` per project in `ProjectsTree` with a `ProjectNode` sub-component. Each project now renders as:

1. A clickable row with a chevron icon (expand_more/chevron_right), status dot, and project name. Clicking toggles expansion and navigates to `/projects/:id`.
2. When expanded: 4 indented sub-links at `pl-9` with 12px font — Overview (dashboard icon), Literature (menu_book), Experiments (science), Notes (edit_note).

Auto-expand fires via a `useEffect` watching `location.pathname` — any path matching `/projects/proj_*/...` auto-expands that project so direct URL navigation always shows context.

Active states: the project row is highlighted when `location.pathname.startsWith('/projects/' + project.id)`; sub-links use NavLink's built-in `isActive` with `end` for exact matching on the Overview route.

All existing behavior preserved: "Home" NavLink, collapsed sidebar icon, CreateProjectModal, `researchos:projects-changed` CustomEvent bus, status dot colors, and empty state.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `frontend/src/components/layout/Sidebar.jsx` modified
- [x] Commit f85c896 exists
- [x] Vite build succeeds (no errors)
- [x] All expected patterns verified: expandedProjects, ProjectNode, literature, experiments, notes, chevron_right, expand_more

## Self-Check: PASSED
