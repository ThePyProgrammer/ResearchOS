---
phase: 05-integration-polish
verified: 2026-03-16T23:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Project cards on the projects list page display the number of experiments in each project"
  gaps_remaining: []
  regressions: []
---

# Phase 5: Integration Polish Verification Report

**Phase Goal:** Fix integration gaps found during milestone audit — library-scoped experiment search and experiment counts on project cards
**Verified:** 2026-03-16T23:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit b6a42de)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Experiment literature search (MiniSearchPicker in ExperimentNode) returns only papers/websites from the project's library | VERIFIED | `libraryId` threaded from ExperimentSection (line 2117) → ExperimentNode (line 1352) → MiniSearchPicker (line 1692); MiniSearchPicker applies `library_id` filter at line 361 |
| 2 | Project cards on the projects list page display the number of experiments in each project | VERIFIED | Frontend displays `project.experimentCount` (Projects.jsx line 154); list_projects count query correct (project_service.py lines 24-31); create_project now excludes `experiment_count` from INSERT (line 50) — no DB column mismatch |

**Score:** 2/2 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/pages/ProjectDetail.jsx` | libraryId threaded through ExperimentSection → ExperimentNode → MiniSearchPicker | VERIFIED | ExperimentSection accepts `libraryId` (line 2117); passes to ExperimentNode (line 2297 and 2835); recursive child ExperimentNode at line 1722 also receives `libraryId`; MiniSearchPicker at line 1692 receives `libraryId` |
| `frontend/src/pages/Projects.jsx` | Experiment count displayed on ProjectCard | VERIFIED | ProjectCard footer at lines 151-159 renders `<Icon name="science" />` + `{project.experimentCount ?? 0}` |
| `backend/services/project_service.py` | list_projects returns experiment_count per project | VERIFIED | Lines 24-31: fetches all experiment rows for project IDs, builds count_map, sets p.experiment_count before returning |
| `backend/services/project_service.py` | create_project does NOT insert experiment_count | VERIFIED | Line 50: `project.model_dump(by_alias=False, exclude={"experiment_count"})` — computed field excluded from INSERT payload (commit b6a42de) |
| `backend/routers/projects.py` | list endpoint returns experiment count in response | VERIFIED | Line 21: `JSONResponse([p.model_dump(by_alias=True) for p in projects])` — CamelModel alias converts experiment_count to experimentCount |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ProjectDetail.jsx (ExperimentSection) | MiniSearchPicker | libraryId prop threaded through ExperimentNode | WIRED | ExperimentSection (line 2117) receives libraryId; ExperimentNode (line 1352) receives libraryId; MiniSearchPicker at line 1692 receives libraryId={libraryId} |
| project_service.list_projects | experiments table | count query joined to projects | WIRED | Lines 25-31: `get_client().table("experiments").select("project_id").in_("project_id", project_ids).execute()` — client-side count correct |
| project_service.create_project | projects table (DB INSERT) | model_dump with exclude | WIRED | Line 50: `exclude={"experiment_count"}` prevents computed field from being sent to Supabase; projects table schema requires no such column |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| LIT-02 | 05-01-PLAN.md | User can link specific papers to individual experiments as supporting literature | SATISFIED | MiniSearchPicker now receives libraryId; search is scoped to project's library (line 361: `libraryId ? { search: q, library_id: libraryId } : { search: q }`) |
| PROJ-02 | 05-01-PLAN.md | User can view a list of all projects with status and experiment counts | SATISFIED | List view displays count from API correctly; create_project no longer fails on INSERT — the computed field is excluded from the payload (commit b6a42de) |

---

## Anti-Patterns Found

None. The previously identified blocker (experiment_count leaking into INSERT) has been resolved.

---

## Human Verification Required

No items require human visual/UX testing — all concerns are programmatically verifiable.

---

## Re-verification Summary

**One gap closed (commit b6a42de):**

The single gap from the initial verification was `create_project` including the computed field `experiment_count` in the Supabase INSERT payload. The projects table has no such column, so any call to `POST /api/projects` would have been rejected by PostgREST.

The fix at `backend/services/project_service.py` line 50 is exactly the prescribed change:

```python
# before
get_client().table(_TABLE).insert(project.model_dump(by_alias=False)).execute()

# after (commit b6a42de)
get_client().table(_TABLE).insert(project.model_dump(by_alias=False, exclude={"experiment_count"})).execute()
```

Commit b6a42de touches only this one line in `backend/services/project_service.py`. No other files were modified, so there is no regression risk to Truth 1 (library-scoped MiniSearchPicker), which remains fully wired and unchanged.

Both phase requirements (LIT-02 and PROJ-02) are now satisfied. The phase goal is achieved.

---

_Verified: 2026-03-16_
_Verifier: Claude (gsd-verifier)_
