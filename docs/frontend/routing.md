# Frontend Routing

React Router v6, configured in `frontend/src/App.jsx`. Two layout variants wrap all routes.

## Layout Variants

| Layout | Component | Description |
|--------|-----------|-------------|
| `Layout` | `components/layout/Layout.jsx` | Full shell: Sidebar + Header + scrollable `<main>`. Used for most pages. |
| `LayoutBare` | `components/layout/Layout.jsx` | Sidebar only, no Header. Used for full-screen pages that render their own header (Paper, Website, GitHubRepo, Proposals). |

Both layouts include the collapsible `Sidebar`. `Layout` adds the `Header` (search bar + QuickAdd).

## Route Table

All routes are nested inside `LibraryProvider`.

### Standard Layout (`Layout`)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | — | Redirects to `/dashboard` |
| `/dashboard` | `Dashboard` | Activity feed, run stats, papers-over-time chart, library overview |
| `/library` | `Library` | Unified paper/website/GitHub repo table with filtering, search, detail panel, and bulk actions |
| `/library/map` | `LibraryMap` | UMAP 2D scatter plot of embedded library items |
| `/library/notes` | `LibraryNotes` | Library-wide Notes IDE (tiptap) with AI copilot |
| `/library/settings` | `LibrarySettings` | Rename library, AI Auto-Note-Taker settings, delete library |
| `/authors` | `Authors` | Author directory with search and paper counts |
| `/authors/:id` | `AuthorDetail` | Individual author profile: papers, potential matches, enrichment |
| `/agents` | `Agents` | Workflow catalog and active/historical run list with live logs |
| `/projects` | `Projects` | Project list with status overview |
| `/projects/:id` | `ProjectDetail` | Project shell with nested sub-routes (see below) |

### Project Sub-Routes (nested under `/projects/:id`)

`ProjectDetail` is a nested layout that renders an `<Outlet>`. Each sub-route is a tab within the project page.

| Path | Component | Description |
|------|-----------|-------------|
| `/projects/:id` (index) | `ProjectOverview` | Project summary, research questions, citation network, timeline, heatmap |
| `/projects/:id/literature` | `ProjectLiterature` | Papers, websites, and repos linked to the project; keyword extraction |
| `/projects/:id/experiments` | `ProjectExperiments` | Experiment tree (drag-reorder, CSV import, table/tree views) + Gap Analysis tab |
| `/projects/:id/tasks` | `ProjectTasks` | Kanban board with custom columns and task field definitions |
| `/projects/:id/notes` | `ProjectNotesIDE` | Project-scoped Notes IDE with AI copilot and experiment context |

### Bare Layout (`LayoutBare`)

| Path | Component | Description |
|------|-----------|-------------|
| `/library/paper/:id` | `Paper` | Full-screen PDF viewer + Notes IDE + AI Copilot |
| `/library/website/:id` | `Website` | Full-screen live iframe + Notes IDE + AI Copilot + Details panel |
| `/library/github-repo/:id` | `GitHubRepo` | Full-screen GitHub repo detail + Notes IDE + AI Copilot |
| `/proposals` | `Proposals` | Agent Proposals review: diff view, approve/reject, run trace |

## Notes on Navigation

- The `Sidebar` contains the primary navigation. The `LibraryTree` component in `Sidebar.jsx` navigates to `/library?col=<id>` for collection filtering; the base `/library` route shows "all papers".
- `ProjectsTree` in `Sidebar.jsx` expands per-project sub-links and auto-expands when the URL matches `/projects/<id>/*`.
- Library switching (`LibrarySwitcher` in `Sidebar.jsx`) calls `switchLibrary()` from `LibraryContext` and navigates to `/library`.
- The `Proposals` page badge in the sidebar reflects the count of pending proposals fetched on mount.
