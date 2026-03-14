# Project Research Summary

**Project:** ResearchOS — Research Projects & Experiment Tracking
**Domain:** Research project management + experiment tracking integrated into an existing reference manager
**Researched:** 2026-03-14
**Confidence:** HIGH (stack/architecture derived from direct codebase analysis; features/pitfalls from established domain expertise)

## Executive Summary

ResearchOS is adding a Projects & Experiment Tracking layer on top of an existing library/reference manager. The pattern is well-understood: a project container holds research questions, links to existing library items, and an experiment tree of planned/running/completed/failed runs. The key architectural insight is that this feature is a layer above the existing library, not a replacement or parallel system — papers and websites stay in the library; projects reference them via join tables. The existing notes system, notes editor component, and tiptap infrastructure all extend naturally to serve project and experiment notes without forking anything.

The recommended approach is a three-phase build: backend infrastructure first (schema + services + routes), then project list/detail UI (without experiments), then experiment tree + integration. This order is forced by data dependencies — the schema must exist before services, services before routes, routes before frontend. The experiment tree is the most complex UI component and should be deferred until the project shell (CRUD + RQs + literature linking) is stable. No new packages are needed; all requirements are covered by the existing FastAPI, Supabase, React, recharts, and D3 stack.

The highest-risk area is schema design: all critical pitfalls are founded in schema mistakes made at the start that become expensive to fix later. Free-text config fields, JSONB research question arrays, and paper metadata duplication in join tables are all day-one decisions that cause rewrites if done wrong. Getting the schema right — structured JSONB config/metrics, a proper `research_questions` table, a pure foreign-key join table, and a self-referential `experiments.parent_id` with a max depth of 3 — is the single most important investment in Phase 1.

## Key Findings

### Recommended Stack

No new packages are required. The entire feature is buildable with the existing stack: supabase-py for DB access, FastAPI + Pydantic CamelModel for new routes, React + Tailwind for UI, recharts for metric charts, and D3 for any tree diagram rendering. The experiment tree UI should be a custom React component following the existing `Sidebar.jsx` drag-reorder pattern rather than a third-party tree library — the design system fit and bundle size arguments favor custom code for a ~100-line component.

The database schema extends the existing Supabase PostgreSQL with four new tables (`projects`, `research_questions`, `experiments`, `project_papers`) plus `project_id` and `experiment_id` nullable FK columns on the existing `notes` table. Tree traversal uses a flat SELECT of all experiments for a project followed by Python-side tree assembly — simpler than recursive SQL CTEs and equally fast at single-user scale.

**Core technologies:**
- PostgreSQL adjacency list (`experiments.parent_id`) — experiment hierarchy, max depth 3 enforced in service layer
- JSONB columns (`config`, `metrics`) — structured key-value experiment parameters; enables comparison/diff/filtering
- `project_papers` join table (FK only, no metadata copy) — literature linkage without data duplication
- `research_questions` table (first-class entity with `id`) — enables per-question status tracking and future agent reasoning
- `notes` table extension (`project_id`, `experiment_id` FKs) — zero-fork reuse of existing notes infrastructure

### Expected Features

**Must have (table stakes):**
- Project CRUD — name, description, status (active/archived); project list + detail views
- Research questions — primary RQ + sub-questions as text fields; separate table with own IDs
- Link papers/websites to project — many-to-many join table; no metadata duplication
- Experiment tree — parent group nodes + leaf run nodes; `parent_id` self-reference; max depth 3
- Leaf experiment fields — name, status (planned/running/completed/failed), config JSONB key-value, metrics JSONB key-value
- Project sidebar entry — single nav item, not a full sidebar tree
- Status badges with distinct iconography — clock/spinner/checkmark/X per status; never text-only

**Should have (competitive, post-MVP):**
- Metric comparison table — side-by-side comparison of sibling leaf experiments
- Config diff between experiments — highlights what changed across runs in an ablation group
- Best experiment highlight — auto-identifies highest/lowest metric leaf in a parent group
- Hypothesis field on research questions — track predicted vs. actual outcomes
- Experiment duplication ("branch from here") — clone leaf config as new planned sibling
- `run_url` field on leaf experiments — link to external tracking dashboard (W&B, TensorBoard)

**Defer (v2+):**
- Drag-and-drop experiment reparenting — high complexity, low urgency; reorganize via edit
- Motivating paper links on individual RQs — secondary link, papers already linked at project level
- Experiment auto-notes population from cited papers — needs semantic matching; agent milestone
- Metrics timestamp history (training curves) — single final snapshot is sufficient for manual tracking
- Progress bar toward RQ answer — subjective; experiment status counts cover it

**Anti-features (do not build):**
- Live experiment runner / code execution — ResearchOS is a tracking tool, not a compute platform
- Real-time metric streaming — requires websocket + SDK infrastructure not yet present
- Artifact/file storage for experiment outputs — model weights belong on researcher's disk, not in Supabase
- Gantt chart / timeline planning — wrong product category for academic research workflows

### Architecture Approach

The new capability adds two layers (projects, experiments) that sit above and reference the existing library layer without touching it. The build follows the established service pattern: Pydantic models define the domain, services own all DB access, thin FastAPI routers handle serialization. For the frontend, a `ProjectContext` follows the `LibraryContext` shape. The project detail page renders RQs, linked literature, and the experiment tree as panels — mirroring how `Library.jsx` renders `PaperInfoPanel` as a right panel.

**Major components:**
1. `projects` + `research_questions` tables — project containers and structured RQ entities
2. `experiments` table with `parent_id` — self-referential tree; Python-side assembly after flat SELECT
3. `project_papers` join table — pure FK references back to library items; ON DELETE CASCADE
4. `project_service.py` + `experiment_service.py` — CRUD, tree fetch, metric aggregation on read
5. `routers/projects.py` + `routers/experiments.py` — thin REST handlers
6. `pages/Projects.jsx` + `pages/ProjectDetail.jsx` — list/detail pages
7. `components/ExperimentTree.jsx` + `components/ExperimentDetail.jsx` — recursive tree UI + detail panel
8. Extended `note_service.py` — adds `project_id`/`experiment_id` params; no structural change

### Critical Pitfalls

1. **Free-text config/metrics** — store `config` and `metrics` as JSONB key-value dicts from day one; a textarea for config makes experiment comparison impossible and cannot be retrofitted without data loss
2. **N+1 tree queries** — fetch all experiments for a project in one flat query, assemble the tree in Python; never lazy-load children on expand; enforce max depth 3 in the service layer
3. **JSONB research questions** — create a proper `research_questions` table with its own IDs; a `research_questions: text[]` column on `projects` kills per-question linking, status tracking, and agent reasoning hooks
4. **Paper metadata duplication in join table** — `project_papers` stores only foreign keys; fetch paper details from `paper_service` at read time; data copy creates stale divergence and violates the single-source-of-truth principle
5. **Parallel notes infrastructure** — add `project_id`/`experiment_id` to the existing `notes` table; creating separate `project_notes` tables doubles the maintenance burden and forks the tiptap editor component

## Implications for Roadmap

Based on combined research, a three-phase structure is appropriate. All schema decisions are Phase 1 because every subsequent phase depends on them being correct.

### Phase 1: Backend Infrastructure
**Rationale:** Data dependencies force this order — schema must exist before services, services before routes, routes before any frontend page can work. All critical schema pitfalls (config as JSONB, RQs as first-class entities, pure join table, proper FKs with CASCADE) are Phase 1 decisions with zero tolerance for deferral.
**Delivers:** Complete backend API for projects, research questions, experiments, and literature linkage. Notes table extended for projects/experiments. Migration files tested.
**Addresses:** Project CRUD, RQ management, experiment tree CRUD, paper linkage endpoints
**Avoids:** Pitfall 1 (JSONB config), Pitfall 5 (data copy linkage), Pitfall 6 (JSONB RQs), Pitfall 13 (migration numbering), Pitfall 14 (orphaned notes with CASCADE)

### Phase 2: Project List & Detail UI
**Rationale:** Build the project shell before the experiment tree — the tree UI is the most complex component and should not block basic project navigation. Getting project CRUD, RQ management, and literature linking working first validates the API surface before adding tree complexity.
**Delivers:** `/projects` list page, `/projects/:id` detail page with RQ panel + linked literature panel + project notes, sidebar nav entry
**Addresses:** Project list view, research question definition, link papers to project, project-level notes
**Avoids:** Pitfall 9 (sidebar grows unmanageable — Projects = single link, not second tree), Pitfall 12 (stale state — `key={projectId}` on detail component), Pitfall 11 (ID prefix conventions: `proj_`, `rq_`)

### Phase 3: Experiment Tree & Integration
**Rationale:** Experiment tree UI is the highest complexity frontend work; building it last means the project shell (routing, context, API) is stable and the tree component has a clean integration surface. Sidebar wiring and route completeness are the final step.
**Delivers:** `ExperimentTree.jsx` (recursive, full tree loaded upfront), `ExperimentDetail.jsx` (config key-value editor, metrics table, status badge), experiment notes, sidebar fully wired
**Addresses:** Experiment tree, leaf experiment fields, status badges, experiment notes
**Avoids:** Pitfall 2 (N+1 queries + unbounded depth), Pitfall 3 (plan vs. run status confusion — validate required fields by status in Pydantic), Pitfall 10 (config schema not rigidly enforced — union of keys for comparison UI)

### Phase 4: Differentiators (Post-Core)
**Rationale:** Once the core loop (project → RQs → experiments → results) is stable, layer on the features that differentiate ResearchOS from generic experiment trackers.
**Delivers:** Metric comparison table, config diff between experiments, best experiment highlight, hypothesis field on RQs, experiment duplication
**Addresses:** Competitive differentiators from FEATURES.md — the literature-to-experiment linkage that no MLflow/W&B/Neptune provides

### Phase Ordering Rationale

- Schema decisions in Phase 1 are non-negotiable — the pitfall analysis shows all critical mistakes are schema mistakes; deferring schema work into Phase 2 or 3 is the most common cause of rewrites
- Phase 2 before Phase 3 because the project context and API calls must be stable for the experiment tree component to integrate cleanly
- Differentiators deferred to Phase 4 because they require multiple completed experiments to demonstrate value (comparison tables need data to compare)
- No phase requires new infrastructure — all builds on existing stack, which reduces Phase 1 setup cost significantly

### Research Flags

Phases with standard patterns (skip research-phase during planning):
- **Phase 1 (Backend Infrastructure):** All patterns directly established from codebase analysis — adjacency list tree, JSONB columns, junction tables, migration numbering, notes extension. No research needed.
- **Phase 2 (Project List & Detail UI):** Follows established Library.jsx + PaperInfoPanel side-panel pattern exactly. No research needed.

Phases that may benefit from a research-phase during planning:
- **Phase 3 (Experiment Tree):** The recursive tree render with drag-and-drop sibling reorder may need a brief review of the existing `Sidebar.jsx` drag implementation to confirm the pattern is directly reusable. LOW research need — 30-minute codebase review, not external research.
- **Phase 4 (Differentiators):** Config diff UI and metric comparison table have open design questions (how to handle non-overlapping config keys across experiments). MEDIUM research need — review W&B and MLflow comparison UI patterns before designing.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against `pyproject.toml` and `package.json` — all existing dependencies confirmed; no new packages needed |
| Features | MEDIUM-HIGH | Table stakes are HIGH confidence (stable domain knowledge); differentiator prioritization is MEDIUM (based on training data from MLflow/W&B/Neptune docs, not live research) |
| Architecture | HIGH | Derived from direct codebase analysis of `note_service.py`, `001_init.sql`, `Sidebar.jsx`, `LibraryContext.jsx` — integration patterns confirmed against real code |
| Pitfalls | HIGH | Critical pitfalls are schema-structural (HIGH confidence from domain expertise + codebase analysis); UX pitfalls are MEDIUM (established experiment tracking system patterns) |

**Overall confidence:** HIGH

### Gaps to Address

- **Experiment config template on parent nodes:** ARCHITECTURE.md and FEATURES.md describe an optional "config template" on parent experiment groups as guidance for child experiments. The exact UX (form vs. inheritance vs. UI hint) was not fully specified — resolve during Phase 3 planning.
- **RQ-to-experiment linkage:** PITFALLS.md recommends a `research_question_id` FK on experiments. ARCHITECTURE.md shows the RQ schema without this FK. Decide whether to include this in Phase 1 schema or defer to Phase 4 — including it in Phase 1 is low cost and avoids a painful migration later.
- **`experiment_artifacts` table:** ARCHITECTURE.md includes this table; FEATURES.md marks artifact storage as a deliberate anti-feature. Resolve the contradiction: artifacts table can be included as a lightweight URL-reference store (no binary storage) which is consistent with both the anti-feature (no file storage) and ARCHITECTURE.md (just text/URL references).

## Sources

### Primary (HIGH confidence)
- `backend/models/note.py`, `backend/services/note_service.py` — notes extension pattern confirmed
- `backend/migrations/001_init.sql` — existing schema and migration numbering confirmed
- `backend/app.py`, `backend/models/base.py` — CamelModel pattern, seeding pattern
- `frontend/src/components/layout/Sidebar.jsx` — drag-reorder tree pattern confirmed
- `frontend/src/context/LibraryContext.jsx` — context pattern for ProjectContext design
- `backend/pyproject.toml`, `frontend/package.json` — dependency inventory confirmed

### Secondary (MEDIUM confidence)
- MLflow, W&B, Neptune.ai design patterns (training data, cutoff August 2025) — feature table stakes and differentiators
- PostgreSQL adjacency list + WITH RECURSIVE CTE documentation — standard SQL feature

### Tertiary (LOW confidence)
- Competitive positioning claims (ResearchOS as unique literature-to-experiment integration) — web search unavailable; based on training data analysis of existing tools; validate if differentiation narrative is used in marketing

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
