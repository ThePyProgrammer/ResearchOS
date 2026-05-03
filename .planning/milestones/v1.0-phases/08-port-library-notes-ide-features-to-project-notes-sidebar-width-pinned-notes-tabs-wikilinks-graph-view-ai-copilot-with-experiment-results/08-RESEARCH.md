# Phase 8: Port Library Notes IDE Features to Project Notes — Research

**Researched:** 2026-03-18
**Domain:** React component adaptation, tiptap editor, D3 force graph, FastAPI copilot endpoint extension
**Confidence:** HIGH (all findings from direct source code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**AI Copilot with Experiment Context**
- @-mention experiments to include as context — same pattern as LibraryNotes' @-mention for papers
- When an experiment is @-mentioned, copilot receives: config key-value pairs, metrics key-value pairs, experiment notes content, and child experiment summaries (if parent node)
- Both experiments and linked literature available in the @ menu — enables prompts like "compare my results to the baseline in @paper-X"
- Text + markdown tables + inline charts as output format — copilot can render comparison tables and simple inline charts (bar/line) from experiment metrics
- Copilot suggestion tabs with diff view + accept/reject — same as LibraryNotes

**Wikilink Scope & Resolution**
- Wikilinks can link to: project notes, experiment notes, linked literature, and experiments themselves
- Clicking a wikilink opens the entity's page in a new browser tab — navigates to the experiment/paper/website page rather than opening inline
- Autocomplete grouped by type — [[ triggers a dropdown with sections: Notes, Experiments, Literature (with type badges)
- Auto-create in current context — typing [[Non-Existent Note]] creates a new note in the same scope (project-level if editing project note, experiment-level if editing experiment note)

**Graph View Data Model**
- All four node types: project notes, experiment folder nodes, experiment notes, linked literature
- Hull per experiment group — each experiment and its notes enclosed in a colored hull boundary (same pattern as LibraryNotes paper/website hulls)
- Match LibraryNotes options panel — show/hide node types, physics sliders (clustering + gravity), search/filter
- Edges from wikilinks between notes, plus structural edges (experiment folder → experiment notes, project → project notes)

**Tab Behavior**
- Cross-experiment tabs — open notes from any experiment or project level simultaneously. Tab label shows experiment name prefix (e.g., "ResNet > Results")
- Full resource tabs for linked literature — PDF viewer and website iframe tabs available inside the project notes IDE, same as LibraryNotes
- Copilot suggestion tabs with diff view and accept/reject buttons — same as LibraryNotes

**Sidebar & Pinned Notes**
- Sidebar width matches LibraryNotes — w-64 (256px)
- Pinned notes use existing isPinned DB field and API pattern — star icon, "Pinned" section above tree, pinned notes sort first
- Recent notes section below Pinned, same as LibraryNotes

### Claude's Discretion
- Whether to extract a shared ProjectNotesIDE component or adapt LibraryNotes directly
- Chart rendering library choice for inline charts (lightweight — e.g., recharts subset or custom SVG)
- Exact physics defaults for the graph view
- Tab close behavior and max tab count
- Loading states and error handling
- Backlinks panel implementation details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 8 ports the full LibraryNotes IDE experience to `/projects/:id/notes`, replacing the existing `ProjectNotes` component (a simple `NotesPanel` wrapper with virtual experiment folders). The primary reference implementation is `LibraryNotes.jsx` (~2,582 lines), and the key reusable components are `NoteGraphView.jsx` (701 lines), `NotesCopilotPanel.jsx` (1,024 lines), and `WikiLinkExtension.js` (525 lines).

The core complexity sits in three areas: (1) adapting `allLoadedNotes` to aggregate project notes + all experiment notes with experiment-keyed `sourceKey` values; (2) extending the backend `notes_copilot_service` to a project-scoped endpoint that understands experiment context (config, metrics, child summaries); and (3) adapting `NoteGraphView`'s `sourceKeyCollections` prop to use experiment IDs for hulls instead of library collection IDs. Everything else is a data-wiring adaptation of existing, well-tested patterns.

The backend already has all needed DB columns (`project_id`, `experiment_id`, `is_pinned` on `notes`), all CRUD endpoints (`/api/projects/{id}/notes`, `/api/experiments/{id}/notes`), and the copilot agentic loop infrastructure. The new work is: (1) a new `POST /api/projects/{id}/notes-copilot` endpoint with experiment-aware context building, (2) a `ProjectNotesIDE` page component adapting LibraryNotes patterns, and (3) wiring the four entity types into the wikilink autocomplete and graph view.

**Primary recommendation:** Build `ProjectNotesIDE` as a new page-level component by adapting LibraryNotes patterns rather than importing LibraryNotes directly. The data model differences (experiments vs. papers/websites, cross-source note creation routing) are significant enough that copy-adapt is more maintainable than a shared abstraction.

---

## Standard Stack

### Core (already installed — no new dependencies needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@tiptap/react` + extensions | existing | Rich-text editor | All extensions already installed in project |
| `d3` | ^7.9.0 | Force-directed graph | Used by `NoteGraphView.jsx` |
| `recharts` | ^3.7.0 | Chart rendering | Already installed — use for inline metric charts |
| `katex` | existing | Math rendering | Used in `NotesCopilotPanel.jsx` |
| `react-router-dom` v6 | existing | Navigation | `useOutletContext`, `useParams` |

### Chart rendering decision (Claude's Discretion)
Recharts is already installed (`^3.7.0`). Use `BarChart` and `LineChart` from recharts for inline metric charts in copilot responses. Do NOT add a new library. Custom SVG is an option only if recharts proves too heavy for inline rendering.

**No new npm dependencies required for this phase.**

---

## Architecture Patterns

### Existing `ProjectNotes` Component (to be replaced)

```
frontend/src/pages/ProjectDetail.jsx (exported ProjectNotes function, ~line 4885-5033)
  - Wraps NotesPanel with combinedNotes (project + virtual exp folders)
  - Virtual folder IDs: `exp_{expId}`
  - Creates notes via combinedCreateFn routing to correct API
  - REPLACED by ProjectNotesIDE in this phase
```

### New Component Location
```
frontend/src/pages/ProjectNotesIDE.jsx   (new page file)
```
Import in `ProjectDetail.jsx`, replace `ProjectNotes` export or add alongside as a new export.

### `allLoadedNotes` Adaptation Pattern

LibraryNotes builds `allLoadedNotes` from `libraryNotes` + `itemNotes` (a `sourceKey → Note[]` map):
```js
// LibraryNotes pattern (sourceKey examples: 'library', 'paper:id', 'website:id', 'github:id')
const allLoadedNotes = useMemo(() => {
  const result = libraryNotes.map(n => ({ ...n, source: 'library', sourceName: 'Library', sourceKey: 'library' }))
  for (const [key, notes] of Object.entries(itemNotes)) {
    const [type, id] = key.split(':')
    // ...resolve sourceName from papers/websites/repos arrays
    result.push({ ...note, source: type, sourceName, sourceKey: key })
  }
  return result
}, [libraryNotes, itemNotes])
```

**ProjectNotesIDE adaptation** — use `sourceKey` values:
- `'project'` for project-level notes
- `'experiment:{expId}'` for each experiment's notes

```js
const allLoadedNotes = useMemo(() => {
  const result = projectNotes.map(n => ({
    ...n, source: 'project', sourceName: 'Project Notes', sourceKey: 'project'
  }))
  for (const [key, notes] of Object.entries(expNotes)) {
    // key = 'experiment:{expId}'
    const expId = key.slice(11) // 'experiment:'.length === 11
    const exp = experiments.find(e => e.id === expId)
    const sourceName = exp?.name || 'Experiment'
    for (const note of notes) {
      result.push({ ...note, source: 'experiment', sourceName, sourceKey: key })
    }
  }
  return result
}, [projectNotes, expNotes])
```

### `sourceKeyCollections` Adaptation for `NoteGraphView`

LibraryNotes maps `sourceKey → collectionIds[]` for hull grouping. For the project IDE, map `sourceKey → [experimentGroupKey]` — essentially use the experiment's `parentId` or the experiment ID itself as the hull group:

```js
const sourceKeyCollections = useMemo(() => {
  const map = {}
  // Each experiment's notes belong to a "hull group" keyed by parent experiment or self
  for (const exp of experiments) {
    const groupKey = exp.parentId || exp.id  // group siblings under the same parent hull
    map[`experiment:${exp.id}`] = [groupKey]
  }
  return map
}, [experiments])
```

Pass experiment group metadata as `collections` prop to `NoteGraphView` for the hull color/label system. This requires extending `NoteGraphView`'s `SOURCE_COLOR` and `SOURCE_LABEL` constants OR passing a custom color map prop. The simplest approach: add `'experiment'` and `'project'` keys to the local color map within `ProjectNotesIDE` and pass experiment groups as `collections`.

### Tab System — Cross-Experiment Tabs

Tab objects in LibraryNotes: `{ noteId, tabType: 'note'|'pdf'|'website'|'github'|'suggestion', source, name }`

For ProjectNotesIDE, add experiment name prefix to tab labels:
```js
function makeTabLabel(note, sourceKey, experiments) {
  if (!sourceKey.startsWith('experiment:')) return note.name
  const expId = sourceKey.slice(11)
  const exp = experiments.find(e => e.id === expId)
  const prefix = exp?.name?.slice(0, 15) || 'Exp'
  return `${prefix} > ${note.name}`
}
```

### WikiLink Extension Wiring

`createWikiLinkExtension` takes `{ getAllNotes, onWikiLinkClick }`:

```js
createWikiLinkExtension({
  getAllNotes: () => allLoadedNotes,   // project + all experiment notes
  onWikiLinkClick: (noteName) => {
    // 1. Try to find matching note in allLoadedNotes → open in tab
    // 2. Try to match experiment name → window.open(`/projects/${id}/experiments`)
    // 3. Try to match paper/website title → window.open(`/library/paper/${id}`)
    // 4. If no match → create new note in current editing context
  }
})
```

The wikilink autocomplete dropdown currently handles only notes. The `Suggestion` plugin inside `WikiLinkExtension.js` calls `getAllNotes()`. For the expanded autocomplete (Notes, Experiments, Literature with type badges), the simplest path is to add experiments and literature items to the `getAllNotes()` return value with a `_entityType` discriminator field that the autocomplete renders with a badge. Alternatively, pass a separate `getEntities()` callback — but this requires modifying `WikiLinkExtension.js`.

**Recommended approach:** Extend `getAllNotes` to also return pseudo-note objects for experiments and literature items (with `_entityType: 'experiment'|'paper'|'website'`, `_entityId`, `_navigateUrl`). The autocomplete renders these with type badges. On click, `onWikiLinkClick` checks `_navigateUrl` and uses `window.open()` instead of opening a tab.

### NotesCopilotPanel Adaptation

`NotesCopilotPanel` takes `{ libraryId, allNotes, papers, websites, githubRepos, collections, onAccept, onReject, onOpenNote }`. For the project IDE it needs:
- Replace `libraryId` with `projectId`
- Add `experiments` prop for @ mention dropdown
- Custom `sendFn` pointing to the new project copilot endpoint

The `MentionDropdown` component inside `NotesCopilotPanel.jsx` currently handles: papers, websites, githubRepos, collections, and special items. Add experiments as a new category.

The cleanest wiring: pass a `sendFn(projectId, data)` prop to `NotesCopilotPanel` that routes to the project endpoint, instead of hardcoding `notesCopilotApi.send(libraryId, data)`. This avoids forking the panel component.

### ItemFolder → Experiment Folders in Sidebar

`ItemFolder` component (inside `LibraryNotes.jsx`) renders a collapsible folder per item (paper/website/repo). For `ProjectNotesIDE`, use `ItemFolder` with:
- `item` = experiment object
- `itemType` = `'experiment'`
- `sourceKey` = `'experiment:{expId}'`
- Resource entries = linked papers/websites from `expPapersMap[expId]`

`ItemFolder` renders resource entries (PDF/website/GitHub tabs). This is directly reusable since `ItemFolder` is a plain React function inside `LibraryNotes.jsx`.

**Decision (Claude's Discretion):** Copy `ItemFolder` and related helper functions into `ProjectNotesIDE.jsx`. Do not try to extract shared components at this stage — both files are large monolithic pages by convention in this codebase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Force-directed graph | Custom physics engine | `NoteGraphView.jsx` + D3 | 701 lines of tuned physics already working |
| Diff view for suggestions | Custom diff algorithm | `SuggestionTabView` from `NotesCopilotPanel.jsx` | LCS diff, accept/reject already wired |
| WikiLink autocomplete | Custom [[ trigger | `WikiLinkExtension.js` `Suggestion` plugin | Tiptap ProseMirror integration is complex |
| Inline charts | Custom SVG math | `recharts` `BarChart`/`LineChart` | Already installed, handles responsive sizing |
| Note pinning UI | Custom drag logic | Existing `isPinned` DB field + sort pattern from `LibraryNotes.jsx` line ~628 | `is_pinned` column exists in migration 014 |
| Tab close / active state | Custom state machine | Copy `openTabs`/`activeTabId` pattern from LibraryNotes verbatim | Exact state shape required by `SuggestionTabView` |
| Agentic loop | Custom tool-call loop | `notes_copilot_service.py` `generate_response()` | `_MAX_ITERATIONS=6`, intent-detection, already battle-tested |

**Key insight:** Every UI pattern in this phase already exists in LibraryNotes or NotesCopilotPanel. The work is wiring new data sources (experiments) into those patterns, not building new UI primitives.

---

## Common Pitfalls

### Pitfall 1: Virtual Folder IDs Bleeding Into the New IDE
**What goes wrong:** The existing `ProjectNotes` component uses `exp_{expId}` virtual folder IDs injected into the combined notes array. If any of this logic leaks into `ProjectNotesIDE`, note creation routing will break.
**Why it happens:** `ProjectNotes` is exported from `ProjectDetail.jsx` and replaced by the route — easy to accidentally import old logic.
**How to avoid:** `ProjectNotesIDE` manages its own `expNotes` map (keyed `experiment:{expId}`) and NEVER injects virtual folder nodes. Experiments appear as real `ItemFolder` components in the sidebar, not as fake notes with special IDs.
**Warning signs:** Notes getting created with `parentId: 'exp_{id}'` strings in the database.

### Pitfall 2: `NoteGraphView` SOURCE_COLOR Key Mismatch
**What goes wrong:** `NoteGraphView` uses `SOURCE_COLOR = { library, paper, website, github }`. Project notes have `source: 'project'` and experiment notes have `source: 'experiment'`. Nodes render as grey (fallback `SOURCE_COLOR.library`) because the keys don't match.
**How to avoid:** Pass a `sourceColorOverride` prop to `NoteGraphView`, OR use the `sourceKey` pattern to map `'project'` → a chosen color and `'experiment'` → experiment-specific colors. Simpler: patch `SOURCE_COLOR` in `NoteGraphView` to add `project` and `experiment` keys, or accept a `customSourceColors` prop.
**Warning signs:** All graph nodes appearing the same color regardless of type.

### Pitfall 3: `useLocalStorage` Key Collisions with LibraryNotes Graph
**What goes wrong:** `NoteGraphView` stores physics settings in `localStorage` under keys like `researchos.graph.clusterStrength`. If both `LibraryNotes` and `ProjectNotesIDE` render `NoteGraphView`, they share the same settings, which is fine — but `hullCollections` stores collection IDs that don't exist in the project context, so the hull filter silently excludes all nodes.
**How to avoid:** Pass a `storagePrefix` prop to `NoteGraphView` (e.g., `'researchos.project-graph.'`) so project graph settings are independent. Alternatively, clear `hullCollections` on mount when in project context.
**Warning signs:** Graph showing zero nodes even though notes exist.

### Pitfall 4: Note Creation Routing for Cross-Source Notes
**What goes wrong:** In `ProjectNotesIDE`, when a user creates a note while an experiment note is active in the editor, the `createFn` must route to `/api/experiments/{expId}/notes`, not `/api/projects/{id}/notes`. If the routing logic doesn't track the "current editing source", notes land in the wrong bucket.
**How to avoid:** Track `activeEditorSource` (the `sourceKey` of the note currently open in the active tab). `createFn` checks this to determine which API endpoint to use.
**Warning signs:** All newly created notes appearing in project-level notes regardless of which experiment's folder they were created in.

### Pitfall 5: Backend `suggest_note_create` `target_type` Enum Missing 'project'/'experiment'
**What goes wrong:** The existing copilot tool definition only accepts `target_type` values: `"library"`, `"paper"`, `"website"`, `"github_repo"`. When the project copilot suggests creating notes, it needs `"project"` and `"experiment"` target types.
**How to avoid:** When creating the new `project_notes_copilot_service.py`, update the `suggest_note_create` tool's enum and the `_process_tool_call` handler to route creation to project/experiment note endpoints.
**Warning signs:** Copilot suggestions for new notes failing silently with "Unknown target_type" or notes not appearing after accept.

### Pitfall 6: Chat History Persistence — Missing `project_id` on `chat_messages`
**What goes wrong:** `notes_copilot_service.py` persists history using `library_id` on `chat_messages`. The project copilot needs `project_id` on that table. Without a migration, history doesn't persist across reloads.
**How to avoid:** Add migration `020_project_notes_copilot.sql` that adds `project_id` to `chat_messages` with FK to `projects`. The service degrades gracefully if the column is missing (already established pattern from migration 013).
**Warning signs:** Copilot chat history disappearing on page reload.

### Pitfall 7: Wikilink Autocomplete for Non-Note Entities
**What goes wrong:** `WikiLinkExtension.js` `getAllNotes()` is expected to return note objects with `id` and `name`. If experiments or papers are injected as pseudo-notes with extra fields like `_entityType`, the Tiptap Suggestion plugin may render them incorrectly or insert wrong attributes.
**How to avoid:** Ensure pseudo-entities have at minimum `{ id, name, type: 'file' }` to satisfy the Suggestion rendering logic. Add `_entityType` and `_navigateUrl` as extra fields that `onWikiLinkClick` checks.
**Warning signs:** Autocomplete popup showing blank entries, or clicking an experiment wikilink opening a note editor instead of navigating.

---

## Code Examples

### Source Key Pattern for ProjectNotesIDE

```js
// Project notes: sourceKey = 'project'
// Experiment notes: sourceKey = 'experiment:{expId}'

const expNotes = {}  // { 'experiment:{expId}': Note[] }

function getSourceNotes(sourceKey) {
  if (sourceKey === 'project') return projectNotes
  return expNotes[sourceKey] || []
}

function setSourceNotes(sourceKey, updater) {
  if (sourceKey === 'project') {
    setProjectNotes(prev => typeof updater === 'function' ? updater(prev) : updater)
  } else {
    setExpNotes(prev => ({
      ...prev,
      [sourceKey]: typeof updater === 'function' ? updater(prev[sourceKey] || []) : updater,
    }))
  }
}
```

### Note Creation Routing

```js
async function createNote(data) {
  // Determine target source from active editor context
  const activeSource = activeEditorSourceRef.current  // 'project' or 'experiment:{expId}'

  if (activeSource?.startsWith('experiment:')) {
    const expId = activeSource.slice(11)
    return notesApi.createForExperiment(expId, data)
  }
  return notesApi.createForProject(projectId, data)
}
```

### Experiment Context for Copilot API Payload

```js
// When user @-mentions an experiment:
{
  type: 'experiment',
  id: exp.id,
  name: exp.name,
  metadata: {
    status: exp.status,
    config: exp.config,    // JSONB key-value pairs
    metrics: exp.metrics,  // JSONB key-value pairs
    parentId: exp.parentId,
    // child summaries if parent node:
    children: childExperiments.filter(c => c.parentId === exp.id).map(c => ({
      id: c.id, name: c.name, status: c.status, metrics: c.metrics
    }))
  },
  notes: expNotes[`experiment:${exp.id}`] || []
}
```

### Backend: New Project Copilot Endpoint Pattern

```python
# backend/routers/project_notes_copilot.py
router = APIRouter(prefix="/api/projects", tags=["project-notes-copilot"])

@router.get("/{project_id}/notes-copilot")
def list_project_copilot(project_id: str): ...

@router.post("/{project_id}/notes-copilot")
def send_project_copilot(project_id: str, body: ProjectNotesCopilotMessageCreate): ...

@router.delete("/{project_id}/notes-copilot", status_code=204)
def clear_project_copilot(project_id: str): ...
```

### Backend: Extended Context Item Model

```python
# models/chat.py — add experiment support to NotesCopilotContextItem
class NotesCopilotContextItem(CamelModel):
    type: str  # 'paper' | 'website' | 'github_repo' | 'library' | 'experiment' | 'project'
    id: str
    name: str
    metadata: Optional[dict] = None  # For experiment: {status, config, metrics, children[]}
    notes: Optional[list[NotesCopilotContextItemNote]] = None
    include_pdf: Optional[bool] = False
```

### Graph Node Colors for Project Context

```js
// Inside ProjectNotesIDE.jsx — pass to NoteGraphView via a prop
const PROJECT_SOURCE_COLOR = {
  project:    '#64748b',   // slate — project-level notes
  experiment: '#f59e0b',   // amber — experiment notes (default)
  paper:      '#3b82f6',   // blue — linked papers
  website:    '#14b8a6',   // teal — linked websites
  github:     '#8b5cf6',   // violet — linked repos
}
```

### Inline Chart Rendering in Copilot (recharts)

```jsx
// Minimal bar chart for metric comparison — rendered inside copilot message content
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function MetricComparisonChart({ data }) {
  // data: [{ name: 'exp1', value: 0.92 }, { name: 'exp2', value: 0.87 }]
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="value" fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

Charts are detected in copilot responses by a JSON code block convention (e.g., ` ```chart { "type": "bar", "data": [...] } ``` `). The frontend parses and renders these blocks.

---

## Existing Infrastructure Inventory

### Backend: What Already Exists (No New Migration Needed for Notes)

| Feature | Status | Location |
|---------|--------|----------|
| `notes.project_id` FK | EXISTS (migration 016) | `idx_notes_project_id` on `notes` |
| `notes.experiment_id` FK | EXISTS (migration 019) | `idx_notes_experiment_id` on `notes` |
| `notes.is_pinned` column | EXISTS (migration 014) | `BOOLEAN NOT NULL DEFAULT FALSE` |
| `GET /api/projects/{id}/notes` | EXISTS | `backend/routers/notes.py:118` |
| `POST /api/projects/{id}/notes` | EXISTS | `backend/routers/notes.py:124` |
| `GET /api/experiments/{id}/notes` | EXISTS | (in notes router) |
| `POST /api/experiments/{id}/notes` | EXISTS | (in notes router) |
| `PATCH /api/notes/{id}` | EXISTS | `backend/routers/notes.py:134` |
| `DELETE /api/notes/{id}` | EXISTS | `backend/routers/notes.py:142` |
| `experimentsApi.list(projectId)` | EXISTS | `api.js:347` |
| `notesApi.listForProject` | EXISTS | `api.js:231` |
| `notesApi.createForProject` | EXISTS | `api.js:232` |
| `notesApi.listForExperiment` | EXISTS | `api.js:233` |
| `notesApi.createForExperiment` | EXISTS | `api.js:234` |

### Backend: What Must Be Created

| Feature | Action | Notes |
|---------|--------|-------|
| `POST /api/projects/{id}/notes-copilot` | NEW router + service | Adapt `notes_copilot_service.py` for project scope |
| `GET /api/projects/{id}/notes-copilot` | NEW | History list endpoint |
| `DELETE /api/projects/{id}/notes-copilot` | NEW | Clear history |
| `chat_messages.project_id` column | NEW migration `020_...` | For copilot history persistence |
| Experiment context building in `_build_context_block` | NEW service function | Config + metrics + child summaries serialization |
| Extended `NotesCopilotContextItem.type` enum | EXTEND `models/chat.py` | Add 'experiment' and 'project' types |
| Extended `suggest_note_create` tool enum | EXTEND service | Add 'project' and 'experiment' target_types |

### Frontend: What Already Exists (Reuse Directly)

| Asset | Reuse Strategy |
|-------|---------------|
| `NoteGraphView.jsx` | Import directly; adapt `sourceKeyCollections` data |
| `WikiLinkExtension.js` — `createWikiLinkExtension` | Import directly; extend `getAllNotes` callback |
| `NotesCopilotPanel.jsx` — default export | Import directly; pass `sendFn` prop for project endpoint |
| `NotesCopilotPanel.jsx` — `SuggestionTabView` | Import directly; same suggestion object shape |
| `LibraryNotes.jsx` — `ItemFolder` | Copy into `ProjectNotesIDE.jsx` (not exported) |
| `LibraryNotes.jsx` — `NoteRow`, `buildPath` | Copy into `ProjectNotesIDE.jsx` (not exported) |
| `LibraryNotes.jsx` — `ToolBtn`, `ExportMenu` | Copy into `ProjectNotesIDE.jsx` (not exported) |
| `useLocalStorage` hook | Import from `hooks/useLocalStorage.js` |

### Frontend: What Must Be Created

| Asset | Notes |
|-------|-------|
| `frontend/src/pages/ProjectNotesIDE.jsx` | Main new component |
| `frontend/src/services/api.js` — `projectNotesCopilotApi` | `{ list, send, clear }` for new endpoint |
| Update `App.jsx` route for `notes` path | Point to `ProjectNotesIDE` instead of `ProjectNotes` |

---

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|-----------------|---------------------|
| `ProjectNotes` flat list + virtual folders | `ProjectNotesIDE` full IDE | Complete replacement |
| No copilot for project notes | New `project_notes_copilot_service.py` | New backend service needed |
| WikiLinks only to library notes | WikiLinks to notes + experiments + literature | Extend `getAllNotes` callback |
| `NoteGraphView` with library-specific colors | `NoteGraphView` with experiment hull groups | Adapt `sourceKeyCollections` + color map |

---

## Open Questions

1. **`NotesCopilotPanel` `sendFn` prop**
   - What we know: `NotesCopilotPanel` currently calls `notesCopilotApi.send(libraryId, data)` directly (hardcoded import).
   - What's unclear: Whether `NotesCopilotPanel` accepts a `sendFn` prop or requires modification.
   - Recommendation: Add a `sendFn` prop defaulting to `notesCopilotApi.send`. ProjectNotesIDE passes `projectNotesCopilotApi.send` instead. This is a minimal, non-breaking change to `NotesCopilotPanel.jsx`.

2. **`NoteGraphView` custom source colors**
   - What we know: `SOURCE_COLOR` is a module-level constant in `NoteGraphView.jsx`. It has no `project` or `experiment` keys.
   - What's unclear: Whether to add a `customSourceColors` prop or modify the constant.
   - Recommendation: Add a `customSourceColors` prop that merges with `SOURCE_COLOR`. Keeps `NoteGraphView.jsx` backward-compatible.

3. **Inline chart protocol between backend and frontend**
   - What we know: The copilot returns HTML. Recharts is installed. The backend currently returns HTML strings.
   - What's unclear: How to embed chart data in copilot responses without breaking HTML rendering.
   - Recommendation: Use a `<div data-chart='{"type":"bar","data":[...]}'>` convention. Frontend post-processes copilot response HTML to mount React chart components into those divs via `createRoot`. This keeps the HTML pipeline intact.

4. **`ProjectNotesIDE` vs. `LibraryNotes` shared abstraction**
   - What we know: Both files would share ~60% of their code if extracted.
   - What's unclear: Whether sharing is worth the abstraction cost in this codebase.
   - Recommendation (Claude's Discretion): Do NOT extract a shared base yet. Both are large monolithic page components by project convention. Extract only after both are stable.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vite config) + React Testing Library |
| Config file | `frontend/vite.config.js` (test block) |
| Quick run command | `cd frontend && npm test -- --run --reporter=dot` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

This phase has no formal REQUIREMENTS.md IDs. Behavioral coverage:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| ProjectNotesIDE renders with project + experiment notes in sidebar | smoke | `npm test -- --run ProjectNotesIDE` | NO — Wave 0 |
| Tab opens on note click, label includes experiment prefix | unit | `npm test -- --run ProjectNotesIDE` | NO — Wave 0 |
| Pinned notes appear in "Pinned" section above tree | unit | `npm test -- --run ProjectNotesIDE` | NO — Wave 0 |
| WikiLink autocomplete includes experiment entities | unit | `npm test -- --run WikiLinkExtension` | NO — Wave 0 |
| Project copilot API call includes experiment context payload | unit | `npm test -- --run api` | NO — Wave 0 |
| Graph view renders nodes for all 4 entity types | smoke | `npm test -- --run NoteGraphView` | NO — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm test -- --run --reporter=dot`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/ProjectNotesIDE.test.jsx` — smoke test: renders sidebar, tabs, graph toggle
- [ ] `frontend/src/services/api.projectNotesCopilot.test.js` — API shape validation
- [ ] Backend: `backend/tests/test_project_notes_copilot.py` — experiment context building

*(Backend test runner: `cd backend && uv run pytest` if pytest is configured)*

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `frontend/src/pages/LibraryNotes.jsx` (2,582 lines) — allLoadedNotes pattern, tab system, sourceKeyCollections, openTabs shape
- Direct source code inspection of `frontend/src/components/NoteGraphView.jsx` (701 lines) — SOURCE_COLOR, sourceKeyCollections prop contract, hull rendering
- Direct source code inspection of `frontend/src/components/NotesCopilotPanel.jsx` (1,024 lines) — MentionDropdown, SuggestionTabView export, sendFn pattern
- Direct source code inspection of `frontend/src/components/WikiLinkExtension.js` (525 lines) — getAllNotes callback, Suggestion plugin
- Direct source code inspection of `backend/services/notes_copilot_service.py` — TOOLS array, _build_context_block, _process_tool_call, persistence pattern
- Direct source code inspection of `backend/models/chat.py` — NotesCopilotContextItem, NotesCopilotMessageCreate
- Direct source code inspection of `frontend/src/pages/ProjectDetail.jsx` lines 4885–5033 — existing ProjectNotes component (to be replaced)
- Direct source code inspection of `frontend/src/services/api.js` — notesApi, experimentsApi, notesCopilotApi
- Migration files 013–019 — confirmed: is_pinned, project_id, experiment_id on notes; library_id on chat_messages

### Secondary (MEDIUM confidence)
- `frontend/package.json` confirmed recharts ^3.7.0 and d3 ^7.9.0 installed
- `App.jsx` routing confirmed `/projects/:id/notes` → `ProjectNotes` outlet

---

## Metadata

**Confidence breakdown:**
- Existing component structure: HIGH — read all source files directly
- Backend copilot service patterns: HIGH — read notes_copilot_service.py in full
- New backend endpoint design: HIGH — follows identical pattern to existing notes_copilot router
- Inline chart protocol: MEDIUM — recharts confirmed installed; exact HTML embedding convention is a design choice not yet validated
- WikiLink extension for non-note entities: MEDIUM — read extension source, confirmed callback-based; pseudo-note approach is untested but low-risk

**Research date:** 2026-03-18
**Valid until:** 2026-04-17 (stable codebase, no external dependencies)
