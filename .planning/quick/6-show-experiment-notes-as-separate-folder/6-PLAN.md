---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/ProjectDetail.jsx
autonomous: true
requirements: [QUICK-6]
must_haves:
  truths:
    - "Project notes tab shows project-level notes at the root, same as today"
    - "Each experiment appears as a collapsible folder below project notes"
    - "Clicking an experiment folder expands it and lazy-loads experiment notes"
    - "Creating a note inside an experiment folder uses the experiment notes API"
    - "Creating a note at the root level uses the project notes API (unchanged)"
  artifacts:
    - path: "frontend/src/pages/ProjectDetail.jsx"
      provides: "Enhanced ProjectNotes component with experiment folders"
  key_links:
    - from: "ProjectNotes"
      to: "experimentsApi.list"
      via: "useEffect fetch on mount"
      pattern: "experimentsApi\\.list"
    - from: "ProjectNotes experiment folder"
      to: "notesApi.listForExperiment"
      via: "lazy load on folder toggle"
      pattern: "notesApi\\.listForExperiment"
---

<objective>
Replace the simple ProjectNotes wrapper with a richer component that shows project-level notes at the root and experiment notes grouped into collapsible folders below.

Purpose: Users can see and manage experiment notes alongside project notes in a single unified notes tab, without navigating to each experiment individually.
Output: Enhanced ProjectNotes component in ProjectDetail.jsx
</objective>

<context>
@frontend/src/pages/ProjectDetail.jsx (ProjectNotes export at line 4885, outlet context at line 4854)
@frontend/src/components/NotesPanel.jsx (NotesPanel — file tree + tiptap editor)
@frontend/src/pages/LibraryNotes.jsx (ItemFolder pattern reference at line 673)
@frontend/src/services/api.js (experimentsApi.list, notesApi.listForExperiment, notesApi.createForExperiment)

<interfaces>
From NotesPanel.jsx:
```jsx
// Props: notes (array), setNotes (setter), createFn (optional override for note creation)
export default function NotesPanel({ paperId, notes, setNotes, createFn })
// createFn receives { name, parentId, type } and should return the created note object
```

From api.js:
```js
experimentsApi.list(projectId)  // returns array of experiment objects with { id, name, ... }
notesApi.listForExperiment(expId)  // returns array of note objects
notesApi.createForExperiment(expId, data)  // creates note under experiment
notesApi.listForProject(projectId)  // returns array of project-level notes
notesApi.createForProject(projectId, data)  // creates note under project
```

Current outlet context (line 4854):
```jsx
<Outlet context={{ project, setProject, notes, setNotes, id }} />
// notes = project-level notes fetched via notesApi.listForProject(id)
// id = project ID
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build ProjectNotes with experiment folders</name>
  <files>frontend/src/pages/ProjectDetail.jsx</files>
  <action>
Replace the `ProjectNotes` export (currently lines 4885-4894) with a richer component that:

1. **Fetches experiments** on mount via `experimentsApi.list(project.id)` using useEffect. Store in `experiments` state array.

2. **Manages experiment notes** with a `expNotesMap` state (object keyed by experiment ID, values are note arrays). Initially empty — notes are lazy-loaded.

3. **Tracks open experiment folders** with an `openExps` state (Set or object of expanded experiment IDs).

4. **Renders a two-section file tree layout** (not using NotesPanel directly for the outer shell — build the combined tree inline):

   **Section A — Project Notes:** Render NotesPanel with the existing `notes`/`setNotes`/`createFn` props exactly as today. This is the full-featured notes panel for project-level notes.

   Actually, a simpler approach that preserves NotesPanel entirely: Build a **wrapper component** around NotesPanel that adds experiment folder entries to the notes array as virtual folder nodes. This way the existing tree rendering, editor, context menu, etc. all work unchanged.

   **Revised approach — composite notes array:**
   - Start with the project-level `notes` array (from outlet context)
   - For each experiment, create a virtual "folder" node: `{ id: 'exp_' + exp.id, name: 'Experiment: ' + exp.name, type: 'folder', parentId: null }`
   - For each loaded experiment's notes, reparent them under the virtual folder: map each note's `parentId: null` to `parentId: 'exp_' + exp.id` (notes with non-null parentId keep their original parentId since they're already nested under another note in that experiment)
   - Merge all into a single `combinedNotes` array passed to NotesPanel

   **createFn override:**
   - The `createFn` must detect whether the new note is being created under an experiment folder or at project root
   - If `data.parentId` starts with `'exp_'`, extract the experiment ID, set `parentId: null` on the API call, and call `notesApi.createForExperiment(expId, {...data, parentId: null})`
   - If `data.parentId` is a note ID that belongs to an experiment (look it up in expNotesMap), call `notesApi.createForExperiment(expId, data)`
   - Otherwise, call `notesApi.createForProject(id, data)` (default behavior)

   **setNotes override:**
   - The `setNotes` function must route updates to either `setProjectNotes` (the original setNotes from context) or update the appropriate experiment's entry in `expNotesMap`
   - When NotesPanel calls `setNotes(prev => ...)`, intercept and split the update: project notes stay in `notes`, experiment notes stay in `expNotesMap`

   **Lazy loading:**
   - When NotesPanel's TreeNode calls onToggle on a virtual experiment folder, if that experiment's notes aren't loaded yet, fetch via `notesApi.listForExperiment(expId)` and store in `expNotesMap[expId]`
   - Track loaded state with a `loadedExps` Set to avoid re-fetching

   **Important implementation details:**
   - Virtual experiment folder nodes should NOT be deletable/renamable — they represent experiments, not real notes. Since NotesPanel's context menu calls `notesApi.update` and `notesApi.remove`, the virtual nodes will fail gracefully (404), but ideally filter them out. A pragmatic approach: let it fail silently on the virtual folder IDs (they won't match any real note).
   - Experiment folder icon: use `science` icon style by giving the virtual folder a special marker (or just accept the default folder icon for simplicity).
   - Sort: experiment folders should appear AFTER all project root notes, sorted alphabetically by experiment name.

   **Simpler alternative (PREFERRED):** Instead of the complex composite array approach, build a custom two-pane layout directly:

   Left pane (file tree):
   - Render project root notes using the same TreeNode component (import it or inline a simpler version)
   - Below project notes, render a "--- Experiments ---" divider
   - For each experiment, render a collapsible header row (chevron + science icon + experiment name)
   - When expanded and loaded, render experiment notes as TreeNode children
   - New file/folder buttons at the top create project notes; inside an experiment folder, create experiment notes

   Right pane (editor):
   - Single TiptapEditor instance (reuse from NotesPanel or import)
   - Selected note state tracks which note is active (could be project or experiment note)
   - Save calls `notesApi.update(noteId, ...)` which works for any note regardless of source

   **FINAL DECISION — Go with the composite array approach** because:
   - NotesPanel already handles the entire editor, context menu, create flow, rename, delete, auto-save
   - Rebuilding all that is massive duplication
   - The composite array approach is contained: merge arrays in, split updates out

   Implementation steps:
   1. Rename outlet context's `notes`/`setNotes` — use them as `projectNotes`/`setProjectNotes` internally
   2. Add state: `experiments` (array), `expNotesMap` (object), `loadedExps` (Set ref or state)
   3. Fetch experiments on mount
   4. Build `combinedNotes` via useMemo: projectNotes + virtual experiment folders + reparented experiment notes
   5. Build `combinedSetNotes` function that splits updates back to projectNotes vs expNotesMap
   6. Build `combinedCreateFn` that routes to correct API
   7. Pass `combinedNotes`, `combinedSetNotes`, `combinedCreateFn` to NotesPanel

   For `combinedSetNotes`: NotesPanel calls `setNotes(prev => prev.map(...))` or `setNotes(prev => [...prev, newNote])` or `setNotes(prev => prev.filter(...))`. The function receives either a new array or a function. Handle both cases:
   - If function: call it with `combinedNotes` to get the new array
   - Partition the resulting array: notes with IDs starting with 'exp_' are virtual folders (discard), notes whose ID exists in any expNotesMap entry are experiment notes (group by experiment), everything else is project notes
   - Update `setProjectNotes` and `setExpNotesMap` accordingly

   To determine which experiment a note belongs to, maintain a `noteToExpMap` (Map of noteId -> expId) built alongside combinedNotes.
  </action>
  <verify>
    <automated>cd C:/Users/prann/projects/researchos/frontend && npx eslint src/pages/ProjectDetail.jsx --no-eslintrc --rule '{"no-undef":"error","no-unused-vars":"warn"}' --parser-options=ecmaVersion:2022,ecmaFeatures:{jsx:true},sourceType:module 2>/dev/null; echo "---"; node -e "const fs=require('fs'); const src=fs.readFileSync('src/pages/ProjectDetail.jsx','utf8'); const hasExpApi=src.includes('experimentsApi.list'); const hasExpNotes=src.includes('expNotesMap')||src.includes('expNotes'); const hasVirtualFolder=src.includes('exp_'); console.log('experimentsApi.list:',hasExpApi); console.log('expNotesMap/expNotes:',hasExpNotes); console.log('virtual folder exp_:',hasVirtualFolder); if(!hasExpApi||!hasExpNotes||!hasVirtualFolder) process.exit(1)"</automated>
  </verify>
  <done>
    - ProjectNotes tab shows project-level notes at root (unchanged behavior)
    - Below project notes, each experiment appears as a collapsible folder
    - Expanding an experiment folder lazy-loads its notes via notesApi.listForExperiment
    - Creating a note inside an experiment folder calls notesApi.createForExperiment
    - Creating a note at root calls notesApi.createForProject (unchanged)
    - Editing/saving/deleting notes works for both project and experiment notes via existing notesApi.update/remove
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>ProjectNotes tab now shows experiment folders alongside project notes</what-built>
  <how-to-verify>
    1. Navigate to any project that has experiments: http://localhost:5173/projects/{projectId}/notes
    2. Verify project-level notes still appear at the root of the file tree
    3. Below project notes, verify each experiment appears as a collapsible folder (e.g., "Experiment: {name}")
    4. Click an experiment folder to expand it — its notes should load and appear nested inside
    5. Create a new note inside an experiment folder (right-click folder > New file) — it should save correctly
    6. Create a new note at the root level — it should still work as a project note
    7. Edit a note inside an experiment folder — auto-save should work
    8. Verify no console errors
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- Project notes tab renders without errors
- Experiment folders appear below project notes
- Lazy loading fetches experiment notes on first expand
- Note CRUD works correctly for both project and experiment notes
</verification>

<success_criteria>
- ProjectNotes shows a unified tree with project notes at root and experiment folders below
- Each experiment folder lazy-loads its notes on expand
- Note creation routes to correct API (project vs experiment)
- All existing NotesPanel functionality (edit, save, rename, delete, context menu) works unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/6-show-experiment-notes-as-separate-folder/6-SUMMARY.md`
</output>
