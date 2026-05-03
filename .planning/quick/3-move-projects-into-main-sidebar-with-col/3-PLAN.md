---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/layout/Sidebar.jsx
autonomous: true
requirements: [QUICK-3]
must_haves:
  truths:
    - "Each project appears as a collapsible node in the main sidebar"
    - "Expanding a project reveals 4 sub-links: Overview, Literature, Experiments, Notes"
    - "Sub-links navigate to /projects/:id, /projects/:id/literature, /projects/:id/experiments, /projects/:id/notes"
    - "Active sub-link is visually highlighted based on current route"
    - "Projects section still shows status dot, + button for new project, and empty state"
    - "Collapsed sidebar still shows a single projects icon"
  artifacts:
    - path: "frontend/src/components/layout/Sidebar.jsx"
      provides: "Refactored ProjectsTree with collapsible project nodes"
  key_links:
    - from: "Sidebar.jsx ProjectsTree"
      to: "App.jsx nested routes"
      via: "NavLink to /projects/:id/* sub-routes"
      pattern: "/projects/.*/(literature|experiments|notes)"
---

<objective>
Replace the flat project list in the sidebar with collapsible project nodes. Each project expands to show 4 sub-links (Overview, Literature, Experiments, Notes) that correspond to the nested routes already defined in App.jsx.

Purpose: Better project navigation — users can jump directly to a project's experiments or notes tab without first landing on overview and then clicking a tab.
Output: Updated Sidebar.jsx with collapsible project nodes.
</objective>

<execution_context>
@C:/Users/prann/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/prann/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/components/layout/Sidebar.jsx
@frontend/src/App.jsx

<interfaces>
<!-- Routes already defined in App.jsx -->
From frontend/src/App.jsx:
```jsx
<Route path="projects" element={<Projects />} />
<Route path="projects/:id" element={<ProjectDetail />}>
  <Route index element={<ProjectOverview />} />
  <Route path="literature" element={<ProjectLiterature />} />
  <Route path="experiments" element={<ProjectExperiments />} />
  <Route path="notes" element={<ProjectNotes />} />
</Route>
```

<!-- Current ProjectsTree in Sidebar.jsx (lines 717-829) -->
<!-- Renders flat NavLinks to /projects/:id with status dots -->
<!-- Uses projectsApi.list(), CreateProjectModal, CustomEvent bus -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor ProjectsTree into collapsible project nodes with sub-links</name>
  <files>frontend/src/components/layout/Sidebar.jsx</files>
  <action>
Modify the `ProjectsTree` component in Sidebar.jsx to make each project a collapsible node with sub-links.

**Changes to ProjectsTree:**

1. Add `expanded` state: `const [expandedProjects, setExpandedProjects] = useState({})` to track which projects are expanded.

2. Replace the flat `NavLink` per project (lines 791-811) with a `ProjectNode` sub-component that renders:
   - A clickable row with: status dot, project name, chevron icon (expand_more/chevron_right). Clicking the row toggles expand AND navigates to `/projects/:id` (overview). The row should be highlighted if the current path starts with `/projects/:id`.
   - When expanded, render 4 indented sub-links using NavLink:
     - "Overview" (icon: `dashboard`) -> `/projects/${project.id}` (end match)
     - "Literature" (icon: `menu_book`) -> `/projects/${project.id}/literature`
     - "Experiments" (icon: `science`) -> `/projects/${project.id}/experiments`
     - "Notes" (icon: `edit_note`) -> `/projects/${project.id}/notes`
   - Sub-links use `text-[12px]` font size and `pl-9` left padding (indented under the project name). Active sub-link gets `bg-white/10 text-white font-medium`, inactive gets `text-slate-500 hover:bg-white/5 hover:text-slate-300`.

3. Auto-expand logic: Use a `useEffect` that watches `location.pathname` — if the path matches `/projects/:id` or `/projects/:id/*`, auto-expand that project in `expandedProjects` state. This ensures navigating to a project sub-page always shows the sub-links.

4. Keep the "Home" NavLink to `/projects` (end match) at the top of the projects list as-is.

5. Keep the existing "New project" + button, CreateProjectModal, empty state, collapsed sidebar behavior, and CustomEvent bus (`researchos:projects-changed`) exactly as they are.

6. Keep the `projectStatusDotClass` mapping and status dot rendering.

**Styling details for the project row (non-sub-link):**
- Use the same `px-3 py-1.5 rounded-lg` pattern as existing links
- Chevron icon (14px, opacity-50) on the left side before the status dot, similar to CollectionNode's expand/collapse pattern
- The project row itself is NOT a NavLink — it is a `button` or `div` with onClick that both toggles expand and calls `navigate(/projects/${project.id})`
- Active state: highlight if `location.pathname.startsWith('/projects/' + project.id)`

**Do NOT change** LibraryTree, LibrarySwitcher, CollectionNode, or any other sidebar component. Only modify ProjectsTree.
  </action>
  <verify>
    <automated>cd C:/Users/prann/projects/researchos/frontend && npx eslint src/components/layout/Sidebar.jsx --no-eslintrc --rule '{"no-undef":"off","no-unused-vars":"warn","react/jsx-no-undef":"off"}' --parser-options=ecmaVersion:2022,ecmaFeatures:{jsx:true},sourceType:module 2>/dev/null; echo "---"; node -e "const fs=require('fs');const s=fs.readFileSync('src/components/layout/Sidebar.jsx','utf8');const checks=['expandedProjects','ProjectNode','literature','experiments','notes','chevron_right','expand_more'];const ok=checks.every(c=>s.includes(c));console.log(ok?'PASS: All expected patterns found':'FAIL: Missing patterns');checks.forEach(c=>{if(!s.includes(c))console.log('  Missing:',c)})"</automated>
  </verify>
  <done>
    - Each project in the sidebar is a collapsible node with a chevron toggle
    - Expanding shows 4 sub-links: Overview, Literature, Experiments, Notes
    - Sub-links navigate to the correct nested routes (/projects/:id/*)
    - Active project and active sub-link are visually highlighted
    - Auto-expand works when navigating directly to a project sub-route
    - Collapsed sidebar still shows single projects icon
  </done>
</task>

</tasks>

<verification>
- Run the dev server (`npm run dev` in frontend/) and verify:
  1. Projects section shows collapsible nodes with chevrons
  2. Clicking a project expands it and navigates to overview
  3. Sub-links (Overview, Literature, Experiments, Notes) appear indented
  4. Clicking sub-links navigates to correct routes
  5. Active sub-link is highlighted
  6. Direct navigation to /projects/:id/experiments auto-expands the project
  7. Collapsed sidebar still works
</verification>

<success_criteria>
Projects in the sidebar are collapsible nodes with 4 sub-links each, linking to the nested routes from quick task 1. Navigation and highlighting work correctly.
</success_criteria>

<output>
After completion, create `.planning/quick/3-move-projects-into-main-sidebar-with-col/3-SUMMARY.md`
</output>
