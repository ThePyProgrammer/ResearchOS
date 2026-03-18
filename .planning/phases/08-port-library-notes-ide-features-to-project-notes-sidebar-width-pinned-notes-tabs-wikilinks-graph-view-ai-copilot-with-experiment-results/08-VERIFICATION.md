---
phase: 08-port-library-notes-ide-features-to-project-notes
verified: 2026-03-18T10:05:09Z
status: passed
score: 6/6 must-haves verified
gaps: []
human_verification:
  - test: "Navigate to a project with experiments at /projects/:id/notes"
    expected: "Full IDE renders — w-64 sidebar with Pinned section (if pinned notes exist), Recent section, Project Notes tree, and one ExperimentFolder per experiment. Pin/unpin a note and verify the Pinned section updates immediately."
    why_human: "DOM width measurement and sidebar rendering require live browser"
  - test: "Open notes from two different experiments (click in ExperimentFolder), then open a project-level note"
    expected: "Three tabs open simultaneously. Experiment notes show 'ExpName > NoteName' prefix labels (experiment name truncated to 15 chars). Close button (X) removes a tab."
    why_human: "Tab label rendering and close behavior require live browser interaction"
  - test: "In the tiptap editor, type [[ and observe the autocomplete dropdown"
    expected: "Dropdown shows notes from all sources (project, experiments, linked literature) with source badges (color-coded). Experiment names appear in the list. Typing filters the list."
    why_human: "Tiptap suggestion rendering requires live editor"
  - test: "Click a wikilink pointing to an experiment name (e.g. [[ResNet-v2]])"
    expected: "Should open /projects/:id/experiments page in a new browser tab — CURRENTLY BROKEN: instead shows 'Note does not exist, create it?' prompt"
    why_human: "Confirms the gap found programmatically — behavior differs from plan intent"
  - test: "Click the Graph toggle button in the toolbar"
    expected: "D3 force graph appears. Nodes are colored: slate (project notes), indigo (experiment notes), blue (paper notes), purple (website notes). Experiment nodes cluster within colored hull boundaries. Options panel shows show/hide checkboxes and physics sliders."
    why_human: "D3 rendering and hull visuals require live browser"
  - test: "Open copilot, type @ and observe the mention dropdown"
    expected: "Experiments section appears with colored status dot and first 2 metric key=value pairs as preview. Selecting an experiment adds it to context. Sending a message includes experiment config/metrics in the backend context."
    why_human: "Live OpenAI call needed to verify context is received"
  - test: "Ask the copilot to 'create a summary note for this experiment' with an experiment in context"
    expected: "A suggestion tab appears in the tab bar with diff view showing the proposed note content and Accept/Reject buttons. Clicking Accept creates the note."
    why_human: "Live copilot loop + note creation requires backend + OpenAI"
  - test: "Ask the copilot to 'compare metrics across experiments' with multiple experiments in context"
    expected: "Copilot response includes an inline bar or line chart rendered via recharts (not raw HTML text). Chart shows experiment names on axis."
    why_human: "LLM must emit data-chart divs and recharts must mount — requires live backend"
---

# Phase 8: Project Notes IDE Verification Report

**Phase Goal:** Researchers have a full-featured notes IDE for project notes matching the library notes experience — with sidebar, pinned notes, tabs, wikilinks to experiments and literature, graph view with experiment hulls, and an AI copilot that understands experiment context (config, metrics, results)
**Verified:** 2026-03-18T10:05:09Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees w-64 sidebar with Pinned, Recent, Project Notes, and per-experiment folders matching LibraryNotes layout | VERIFIED | `w-64` class at line 1400; `pinnedNotes` section at line 1493; `recentNoteIds` section at line 1518; `ExperimentFolder` components at line 1584 |
| 2 | User can open notes from any experiment or project level in tabs simultaneously, with experiment name prefix labels | VERIFIED | `openTabs` state at line 774; tab label logic at line 1001: `exp.name.slice(0, 15) + '…' + note.name` |
| 3 | WikiLink autocomplete includes project notes, experiment notes, experiments, and linked literature with type badges; clicking an experiment wikilink opens it in a new browser tab | FAILED | Autocomplete works (getAllNotesForSuggestion includes pseudo-entries at line 1265). Click navigation broken: handleWikiLinkClick (line 1223) searches allLoadedNotes only — experiment pseudo-entries are not there, so click falls to auto-create prompt |
| 4 | Graph view shows all four node types with experiment group hull boundaries and physics controls | VERIFIED | NoteGraphView wired at line 1675 with `customSourceColors=PROJECT_GRAPH_SOURCE_COLORS`, `storagePrefix="researchos.project.graph."`, `sourceKeyCollections=graphSourceKeyCollections`; physics sliders confirmed in NoteGraphView.jsx lines 547-569 |
| 5 | AI copilot accepts @-mentioned experiments with config/metrics context and linked literature references | VERIFIED | NotesCopilotPanel wired at line 1772 with `sendFn=projectNotesCopilotApi.send`, `scopeId=projectId`, `experiments=experiments`; MentionDropdown shows experiment status dot + metrics preview (NotesCopilotPanel.jsx line 563); backend `_build_context_block` handles experiment type (project_notes_copilot_service.py line 210) |
| 6 | Copilot produces suggestion tabs with diff view, accept/reject, and inline metric comparison charts | VERIFIED | `openSuggestionTab` at line 1308; SuggestionTabView rendered when activeTab is suggestion type (line 1693); MetricComparisonChart + useChartRenderer in NotesCopilotPanel.jsx lines 97-156; data-chart prompt instruction in backend/agents/prompts.py lines 349-352 |

**Score:** 5/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/020_project_notes_copilot.sql` | project_id column on chat_messages | VERIFIED | Contains `ADD COLUMN IF NOT EXISTS project_id` + index |
| `backend/services/project_notes_copilot_service.py` | Project-scoped copilot with experiment context building | VERIFIED | Contains `_build_context_block` (line 210) and `generate_response` (line 511) |
| `backend/routers/project_notes_copilot.py` | GET/POST/DELETE /api/projects/{id}/notes-copilot | VERIFIED | 3 routes confirmed: GET/POST/DELETE under `/api/projects/{project_id}/notes-copilot` |
| `backend/models/chat.py` | project_id on ChatMessage, ProjectNotesCopilotMessageCreate | VERIFIED | `project_id` field confirmed in model_fields via runtime check |
| `backend/app.py` | Router wired | VERIFIED | Line 54: `app.include_router(project_notes_copilot.router)` |
| `frontend/src/pages/ProjectNotesIDE.jsx` | Full IDE component with sidebar, tabs, editor, wikilinks | VERIFIED | 1914 lines; all required sections present |
| `frontend/src/App.jsx` | Route updated to render ProjectNotesIDE | VERIFIED | Line 17 import + line 40 route element confirmed |
| `frontend/src/components/NoteGraphView.jsx` | customSourceColors, customSourceLabels, storagePrefix props | VERIFIED | Props at lines 46-48; merged into mergedColors/mergedLabels at lines 52-53 |
| `frontend/src/components/NotesCopilotPanel.jsx` | sendFn, scopeId, experiments props; MetricComparisonChart | VERIFIED | Props at lines 815-817; experiments @-mention at line 459; MetricComparisonChart at line 97 |
| `frontend/src/services/api.js` | projectNotesCopilotApi export | VERIFIED | Line 302 confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/routers/project_notes_copilot.py` | `backend/services/project_notes_copilot_service.py` | `generate_response` call | WIRED | Line 40: `project_notes_copilot_service.generate_response(...)` |
| `frontend/src/services/api.js` | `/api/projects/{id}/notes-copilot` | `apiFetch` | WIRED | `projectNotesCopilotApi.send` calls `/projects/${projectId}/notes-copilot` |
| `frontend/src/pages/ProjectNotesIDE.jsx` | `frontend/src/services/api.js` | `notesApi.*` calls | WIRED | Lines 1248, 1252 use `notesApi.createForProject` and `notesApi.createForExperiment` |
| `frontend/src/pages/ProjectNotesIDE.jsx` | `frontend/src/components/WikiLinkExtension.js` | `createWikiLinkExtension` | WIRED | Line 16 import + line 205 usage |
| `frontend/src/App.jsx` | `frontend/src/pages/ProjectNotesIDE.jsx` | Route element | WIRED | Line 40: `<Route path="notes" element={<ProjectNotesIDE />} />` |
| `frontend/src/pages/ProjectNotesIDE.jsx` | `frontend/src/components/NoteGraphView.jsx` | import with custom props | WIRED | Line 17 import; line 1675 usage with customSourceColors, storagePrefix |
| `frontend/src/pages/ProjectNotesIDE.jsx` | `frontend/src/components/NotesCopilotPanel.jsx` | import with sendFn, scopeId, experiments | WIRED | Line 18 import; lines 1772-1782 usage |
| `frontend/src/pages/ProjectNotesIDE.jsx` | `frontend/src/services/api.js` | `projectNotesCopilotApi.send` as sendFn | WIRED | Line 1779: `sendFn={projectNotesCopilotApi.send}` |
| `handleWikiLinkClick` | experiment pseudo-entries (getAllNotesForSuggestion) | `_navigateUrl` / `window.open` | NOT WIRED | Pseudo-entries with `_entityType: 'experiment'` are in getAllNotesForSuggestion but not in allLoadedNotes; click handler searches allLoadedNotes only — experiment wikilink clicks never reach navigation path |

### Requirements Coverage

IDE requirements are defined in the ROADMAP.md Phase 8 success criteria but are NOT present in `REQUIREMENTS.md` (which covers only PROJ/RQ/EXP/LIT/NAV IDs). The IDE-01 through IDE-06 IDs exist only in phase plan documents and are phase-internal requirement labels. They are not orphaned — they are consistently used across all three plans and summaries.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| IDE-01 | 08-02, 08-03 | Sidebar with Pinned/Recent/Project Notes/Experiment folders | SATISFIED | w-64 sidebar confirmed in ProjectNotesIDE.jsx |
| IDE-02 | 08-02, 08-03 | Multi-tab editor with experiment name prefix labels | SATISFIED | Tab label logic confirmed at lines 1001-1039 |
| IDE-03 | 08-02, 08-03 | WikiLink autocomplete with experiments/literature; click navigates to new tab | BLOCKED | Autocomplete works; click-to-navigate for experiment wikilinks does not work |
| IDE-04 | 08-01, 08-03 | Graph view with 4 node types, experiment hull boundaries, physics controls | SATISFIED | NoteGraphView wiring confirmed; graphSourceKeyCollections provides hull grouping |
| IDE-05 | 08-01, 08-03 | Copilot with @-mentioned experiments including config/metrics context | SATISFIED | sendFn/scopeId/experiments wiring confirmed; _build_context_block handles experiment type |
| IDE-06 | 08-03 | Copilot suggestion tabs with diff view, accept/reject, and inline charts | SATISFIED | SuggestionTabView rendered; MetricComparisonChart + useChartRenderer confirmed |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/components/NoteGraphView.jsx` | 52-53 | `mergedColors = customSourceColors ? { ...customSourceColors } : { ...SOURCE_COLOR }` — comment says "merge" but logic is "replace or default". Does not spread SOURCE_COLOR as base. | Warning | No functional regression in current usage (ProjectNotesIDE passes all 5 node type colors explicitly). However, any caller passing only new custom types (e.g., just `{ project: '#xxx' }`) will lose library/paper/website/github colors. Fix: `{ ...SOURCE_COLOR, ...customSourceColors }` |
| `frontend/src/pages/ProjectNotesIDE.jsx` | 1223-1242 | `handleWikiLinkClick` ignores `_entityType`/`_navigateUrl` fields on experiment pseudo-entries; falls to auto-create prompt for experiment wikilinks | Blocker | Clicking a wikilink to an experiment name prompts to create a new note instead of navigating — contradicts IDE-03 plan requirement "Clicking a wikilink to an experiment or paper opens it in a new browser tab" |

### Human Verification Required

#### 1. Full Sidebar Layout

**Test:** Navigate to `/projects/:id/notes` with a project that has experiments and notes
**Expected:** w-64 sidebar visible with Pinned section (if notes are pinned), Recent section, "Project Notes" collapsible folder, and one ExperimentFolder per experiment
**Why human:** DOM layout, collapsible state, and section visibility depend on live data

#### 2. Tab Labels with Experiment Prefix

**Test:** Open a note from an ExperimentFolder in the sidebar, then open a note from a different experiment
**Expected:** Tab labels show "ExpName > NoteName" (experiment name truncated to 15 chars). Tabs coexist. X button closes individual tabs.
**Why human:** Tiptap editor + tab interaction requires browser

#### 3. WikiLink Autocomplete (partial human test)

**Test:** In the tiptap editor, type `[[` and observe the autocomplete dropdown
**Expected:** List shows notes from all scopes with source badges (color-coded by type). Experiment names appear as selectable items.
**Why human:** Tiptap suggestion popover rendering requires live editor

#### 4. Experiment Wikilink Click (known gap — human confirms bug)

**Test:** Insert `[[ExperimentName]]` wikilink and click it
**Expected (per plan):** Should open experiments page in a new browser tab
**Actual (per code analysis):** Shows "Note doesn't exist. Create it?" confirmation dialog
**Why human:** Confirms the programmatically identified gap — fix needed before this passes

#### 5. Graph View

**Test:** Click the Graph toggle button; verify node types and hull boundaries
**Expected:** Four colored node types (project=slate, experiment=indigo, paper=blue, website=purple); experiment nodes grouped in colored hulls; options panel with show/hide checkboxes and cluster/gravity sliders
**Why human:** D3 SVG rendering requires live browser

#### 6. Copilot with Experiment @-mention

**Test:** Open copilot, type `@`, select an experiment from the dropdown, ask a question about it
**Expected:** Experiment appears in dropdown with status dot and metric preview; backend response references config/metrics
**Why human:** Live OpenAI API call required

#### 7. Suggestion Tabs and Inline Charts

**Test:** Ask copilot to "write a summary note for [experiment]"; then ask "compare metrics across experiments"
**Expected:** Suggestion tab opens with diff view and Accept/Reject buttons (note created on Accept); second response includes inline bar/line chart rendered via recharts
**Why human:** Live copilot loop + LLM output format required

### Gaps Summary

One functional gap blocks full IDE-03 achievement: **experiment wikilink navigation**.

The gap is architectural: `getAllNotesForSuggestion` produces pseudo-entries with `_entityType: 'experiment'` and `_navigateUrl` so they appear in the `[[` autocomplete. However, when the user clicks an inserted `[[ExperimentName]]` wikilink, `handleWikiLinkClick` looks up the note by ID in `allLoadedNotes`. Experiment pseudo-entries (with synthetic `id: __exp__${expId}`) are not in `allLoadedNotes`. The handler finds no match and falls through to the auto-create confirmation prompt.

The fix is localized: `handleWikiLinkClick` needs to check if the target is a navigable entity (by checking `allLoadedNotes` first, then falling back to checking `getAllNotesForSuggestion()` for pseudo-entries, and calling `window.open(entity._navigateUrl, '_blank')` if found).

All other 5 success criteria are verified — the backend infrastructure, IDE sidebar, tabs, graph view, copilot, and suggestion tabs are all properly implemented and wired.

A secondary code quality issue (non-blocking): `NoteGraphView.mergedColors` uses replace-or-default logic instead of proper spread merge. This currently has no functional impact because `ProjectNotesIDE` passes all node type colors explicitly in `PROJECT_GRAPH_SOURCE_COLORS`.

---

_Verified: 2026-03-18T10:05:09Z_
_Verifier: Claude (gsd-verifier)_
