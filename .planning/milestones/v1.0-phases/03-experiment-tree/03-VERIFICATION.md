---
phase: 03-experiment-tree
verified: 2026-03-15T00:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 3: Experiment Tree Verification Report

**Phase Goal:** Hierarchical experiment tree with nested sub-experiments, config/metrics key-value editing, and experiment-paper linking
**Verified:** 2026-03-15
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/projects/{id}/experiments creates an experiment with name, status, config, metrics, optional parent_id and rq_id | VERIFIED | `backend/routers/experiments.py` line 29; service creates with all fields |
| 2 | GET /api/projects/{id}/experiments returns flat list of all experiments for a project | VERIFIED | `experiments.py` line 47; queries by project_id |
| 3 | PATCH /api/experiments/{id} updates any field including config/metrics JSONB | VERIFIED | `experiments.py` line 59; `update_experiment` uses exclude_unset |
| 4 | DELETE /api/experiments/{id} removes experiment and DB cascades children | VERIFIED | `experiments.py` line 67; migration has ON DELETE CASCADE on parent_id |
| 5 | POST /api/experiments/{id}/reorder updates position of sibling experiments | VERIFIED | `experiments.py` line 74; loops with position index |
| 6 | GET/POST/DELETE /api/experiments/{id}/papers manages experiment-paper/website links | VERIFIED | `experiments.py` lines 84-104; all three routes present |
| 7 | GET/POST /api/experiments/{id}/notes manages experiment notes | VERIFIED | `experiments.py` lines 111-124; note_service called with experiment_id |
| 8 | Frontend api.js has experimentsApi and notesApi.listForExperiment/createForExperiment | VERIFIED | `api.js` lines 233-234 (notesApi extensions), 346-355 (experimentsApi with 8 methods) |
| 9 | User can see Experiments tab in ProjectDetail left nav that renders the experiment tree | VERIFIED | `ProjectDetail.jsx` line 2227 nav item; line 2418 tab render |
| 10 | User can create an experiment via modal with name, status, and config key-value rows | VERIFIED | `ExperimentCreateModal` at line 581; calls experimentsApi.create on submit |
| 11 | User can create child experiments under a parent via context menu "Add sub-experiment" | VERIFIED | `ExperimentNode` context menu at line 1720; opens ExperimentCreateModal with parentId |
| 12 | User can add, edit, and remove config and metrics key-value pairs inline below each experiment node | VERIFIED | `KVEditor` at line 444; wired to experimentsApi.update for config and metrics |
| 13 | Parent experiment nodes display status counts as colored mini pills | VERIFIED | `aggregateDescendants` at line 90; rendered at lines 1552-1566 |
| 14 | User can expand an inline notes panel on an experiment node using tiptap (via NotesPanel) | VERIFIED | `NotesPanel` rendered at line 1690; fetch via `notesApi.listForExperiment` on expand (line 1386) |
| 15 | User can link papers and websites from the library to an individual experiment | VERIFIED | `MiniSearchPicker` wired at line 1644; calls experimentsApi.linkPaper/unlinkPaper |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/019_experiments.sql` | experiments table, experiment_papers join table, notes FK | VERIFIED | CREATE TABLE experiments with all columns; experiment_papers with CHECK constraint; ALTER TABLE notes ADD COLUMN experiment_id |
| `backend/models/experiment.py` | Experiment, ExperimentCreate, ExperimentUpdate, ExperimentPaper, ExperimentPaperCreate | VERIFIED | All 5 models inherit CamelModel; correct field types and optionality |
| `backend/services/experiment_service.py` | 9 CRUD + reorder + link functions | VERIFIED | All 9 functions present; rq_service pattern followed exactly |
| `backend/routers/experiments.py` | 10 API routes | VERIFIED | Counted: 2 project-scoped + PATCH + DELETE + reorder + GET/POST/DELETE papers + GET/POST notes = 10 routes |
| `backend/models/note.py` | experiment_id field | VERIFIED | Line 12: `experiment_id: Optional[str] = None` |
| `backend/services/note_service.py` | experiment_id in _SOURCE_FIELDS; list/create accept experiment_id | VERIFIED | Line 92: `_SOURCE_FIELDS` includes "experiment_id"; lines 31 and 68: params added |
| `backend/app.py` | experiments router registered | VERIFIED | Line 19: imported; line 53: `app.include_router(experiments.router)` |
| `frontend/src/services/api.js` | experimentsApi (8 methods) + notesApi extensions | VERIFIED | experimentsApi lines 346-355; listForExperiment/createForExperiment lines 233-234 |
| `frontend/src/pages/ProjectDetail.jsx` | All experiment UI components | VERIFIED | ExperimentSection (1755), ExperimentNode (1349), KVEditor (444), ExperimentCreateModal (581), ExperimentStatusDropdown (242), buildExperimentTree (63), flattenExperimentTree (78), detectType (117), aggregateDescendants (90) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `experiments.py` router | `experiment_service.py` | function calls | WIRED | All service functions called directly; `from services import experiment_service` |
| `app.py` | `experiments.py` router | include_router | WIRED | `app.include_router(experiments.router)` confirmed at line 53 |
| `api.js` experimentsApi | `/api/projects/{id}/experiments` | apiFetch | WIRED | `apiFetch('/projects/${projectId}/experiments')` at line 347 |
| `ExperimentSection` | `experimentsApi.list` | useEffect fetch | WIRED | `fetchExperiments` calls `experimentsApi.list(projectId)` at line 1786 |
| `ExperimentCreateModal` | `experimentsApi.create` | form submit | WIRED | `await experimentsApi.create(projectId, {...})` at line 611 |
| `ExperimentNode` | `experimentsApi.update` | inline edit handlers | WIRED | Name at 1395, status at 1406, config at 1593, metrics at 1607 |
| `LeftNav navItems` | `ExperimentSection` | tab routing | WIRED | `id: 'experiments', icon: 'science'` at line 2227; `activeTab === 'experiments'` at line 2418 |
| `ExperimentNode` notes panel | `notesApi.listForExperiment / createForExperiment` | useEffect + createFn | WIRED | Fetch at line 1386; createFn at line 1693 |
| `ExperimentNode` notes panel | `NotesPanel` component | import and render | WIRED | Imported at line 4; rendered at line 1690 |
| `ExperimentNode` literature picker | `experimentsApi.linkPaper / unlinkPaper` | MiniSearchPicker onLink | WIRED | linkPaper at line 1429; unlinkPaper at line 1441 |
| `ExperimentNode` parent summary | `aggregateDescendants` | function call on tree node | WIRED | `const aggregated = hasChildren ? aggregateDescendants(experiment) : null` at line 1453 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXP-01 | 03-01, 03-02 | User can create experiment nodes in a hierarchical tree per project | SATISFIED | POST /api/projects/{id}/experiments with parent_id; ExperimentSection + ExperimentCreateModal |
| EXP-02 | 03-01, 03-02 | User can create parent experiment nodes that group related experiments | SATISFIED | parent_id FK on experiments table; ExperimentNode renders children recursively |
| EXP-03 | 03-01, 03-02 | User can create leaf experiments with name, status, config, metrics | SATISFIED | ExperimentCreate model has all fields; ExperimentCreateModal form with KV config rows |
| EXP-04 | 03-01, 03-02 | User can edit experiment name, status, config, and metrics | SATISFIED | Inline name edit (double-click), ExperimentStatusDropdown, KVEditor for config and metrics |
| EXP-05 | 03-01, 03-02 | User can delete experiments (with cascade to children) | SATISFIED | DELETE route; migration has ON DELETE CASCADE on parent_id; confirm dialog in UI |
| EXP-06 | 03-03 | Parent nodes display aggregated summaries of child experiments | SATISFIED | aggregateDescendants (leaf-only walk); status count pills + metric range chips rendered |
| EXP-10 | 03-03 | User can add notes to individual experiments (reusing tiptap notes system) | SATISFIED | NotesPanel with tiptap rendered inline per experiment; scoped via notesApi.createForExperiment |
| LIT-02 | 03-03 | User can link specific papers to individual experiments as supporting literature | SATISFIED | MiniSearchPicker links papers/websites; batch-fetched expPapersMap; unlink via experimentsApi.unlinkPaper |
| NAV-03 | 03-01, 03-02 | Experiment tree shows status badges (color-coded by status) | SATISFIED | experimentStatusConfig: planned=blue, running=amber, completed=emerald, failed=red; ExperimentStatusDropdown |

**All 9 phase requirements satisfied.**

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stub implementations, empty handlers, or TODO/FIXME markers found in phase-modified files. The `placeholder` attribute occurrences in ProjectDetail.jsx are HTML input placeholder text (not code stubs).

---

## Human Verification Required

Plan 03-03 Task 2 was a blocking human-verification checkpoint. The SUMMARY documents it as "APPROVED by user" with all 22 test steps confirmed passing. The following items are noted for completeness as programmatic verification cannot substitute for this:

### 1. DnD Sibling Reorder

**Test:** Drag an experiment to a different position within the same parent group, then refresh the page.
**Expected:** Order persists after refresh (position written to DB via experimentsApi.reorder).
**Why human:** Real drag interaction cannot be simulated via grep/file checks. Backend reorder logic is wired and substantive.

### 2. Tiptap WYSIWYG Editing

**Test:** Open the notes panel on an experiment node, create a note, apply bold/lists formatting.
**Expected:** Rich text editor renders; formatting applied; note saved and retrievable.
**Why human:** tiptap editor rendering requires browser execution. NotesPanel wiring is confirmed correct.

### 3. Experiment Notes Isolation

**Test:** Create a note via the experiment notes panel, then check the project-level Notes tab.
**Expected:** The experiment note does NOT appear in the project Notes tab.
**Why human:** Requires UI inspection. Backend correctly scopes by experiment_id (list_notes filters by experiment_id only); project notes tab uses notesApi.listForProject (separate endpoint).

_All three items were confirmed passing by the human-verification checkpoint in Plan 03-03 Task 2._

---

## Gaps Summary

No gaps. All 15 must-have truths verified. All 9 phase requirements (EXP-01 through EXP-06, EXP-10, LIT-02, NAV-03) satisfied with concrete implementation evidence. Frontend build succeeds with zero errors. All 4 documented commits (feecbd6, 8311099, e56c769, 1720df6) confirmed present in git history.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
