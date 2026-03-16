# Requirements: ResearchOS — Projects & Experiments

**Defined:** 2025-07-17
**Core Value:** A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Project Management

- [x] **PROJ-01**: User can create a research project with name, description, and status
- [x] **PROJ-02**: User can view a list of all projects with status and experiment counts
- [x] **PROJ-03**: User can view a project detail page showing RQs, experiments, and linked papers
- [x] **PROJ-04**: User can edit project name, description, and status (active/paused/completed/archived)
- [x] **PROJ-05**: User can delete a project
- [x] **PROJ-06**: User can create and edit free-form notes tied to a project (reusing tiptap notes system)

### Research Questions

- [x] **RQ-01**: User can create a primary research question for a project
- [x] **RQ-02**: User can create sub-questions under a primary RQ
- [x] **RQ-03**: User can add a hypothesis field to any RQ
- [x] **RQ-04**: User can set RQ status (open/investigating/answered/discarded)
- [x] **RQ-05**: User can link motivating papers from the library to a specific RQ
- [x] **RQ-06**: User can edit and delete research questions

### Experiment Tracking

- [x] **EXP-01**: User can create experiment nodes in a hierarchical tree per project
- [x] **EXP-02**: User can create parent experiment nodes that group related experiments
- [x] **EXP-03**: User can create leaf experiments with name, status (planned/running/completed/failed), config (key-value pairs), and metrics (key-value pairs)
- [x] **EXP-04**: User can edit experiment name, status, config, and metrics
- [x] **EXP-05**: User can delete experiments (with cascade to children)
- [x] **EXP-06**: Parent nodes display aggregated summaries of child experiments
- [x] **EXP-07**: User can compare metrics across multiple leaf experiments side-by-side
- [x] **EXP-08**: User can view config diff between two experiments in the same group
- [x] **EXP-09**: User can duplicate an experiment as a new planned sibling with copied config
- [x] **EXP-10**: User can add notes to individual experiments (reusing tiptap notes system)

### Literature Integration

- [x] **LIT-01**: User can link papers/websites from the library to a project
- [x] **LIT-02**: User can link specific papers to individual experiments as supporting literature
- [x] **LIT-03**: User can see which RQs have no linked papers (gap indicator)
- [x] **LIT-04**: User can remove paper/website links from projects and experiments

### Navigation

- [x] **NAV-01**: Projects appear as a section in the sidebar navigation
- [x] **NAV-02**: User can navigate from project list → project detail → experiment detail
- [x] **NAV-03**: Experiment tree shows status badges (color-coded by status)

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Project Dashboard

- **DASH-01**: Project dashboard with experiment status counts and progress indicators
- **DASH-02**: Literature coverage indicator per project
- **DASH-03**: Progress bar toward RQ answer (based on sub-question completion)

### Experiment Tree UX

- **TREE-01**: Drag-and-drop experiment reparenting
- **TREE-02**: Best experiment highlight (auto-identify best primary metric in a group)

### Advanced Literature Integration

- **ALIT-01**: Experiment notes auto-populated with cited papers (AI-driven)
- **ALIT-02**: RQ-to-paper gap detection triggers literature search agent

### LaTeX & Writing

- **LATEX-01**: Full LaTeX editor integrated into ResearchOS
- **LATEX-02**: Auto-populate tables/figures from experiment data
- **LATEX-03**: Completed papers enter the library as first-class items

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Live experiment runner / code execution | ResearchOS is a tracking tool, not a compute platform |
| Real-time metric streaming | Requires websocket infrastructure + SDK integration |
| Artifact/file storage for experiment outputs | Storage costs + data model complexity; store references instead |
| Automatic hyperparameter sweep UI | Requires experiment runner integration |
| Gantt chart / timeline planning | Researchers don't think in timelines; status tracking suffices |
| Team collaboration | Single-user system; no auth/presence/conflict resolution |
| Git integration for experiment versioning | Complex dependency on git internals; manual config recording covers core need |
| Notifications and reminders | Not core to research workflow; status visible on dashboard |
| Citation generation from experiments | Depends on LaTeX/writing milestone |
| W&B/MLflow import | Future integration; build native tracking first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROJ-01 | Phase 1 | Complete |
| PROJ-02 | Phase 1 | Complete |
| PROJ-03 | Phase 1 | Complete |
| PROJ-04 | Phase 1 | Complete |
| PROJ-05 | Phase 1 | Complete |
| PROJ-06 | Phase 1 | Complete |
| RQ-01 | Phase 2 | Complete |
| RQ-02 | Phase 2 | Complete |
| RQ-03 | Phase 2 | Complete |
| RQ-04 | Phase 2 | Complete |
| RQ-05 | Phase 2 | Complete |
| RQ-06 | Phase 2 | Complete |
| EXP-01 | Phase 3 | Complete |
| EXP-02 | Phase 3 | Complete |
| EXP-03 | Phase 3 | Complete |
| EXP-04 | Phase 3 | Complete |
| EXP-05 | Phase 3 | Complete |
| EXP-06 | Phase 3 | Complete |
| EXP-07 | Phase 4 | Complete |
| EXP-08 | Phase 4 | Complete |
| EXP-09 | Phase 4 | Complete |
| EXP-10 | Phase 3 | Complete |
| LIT-01 | Phase 2 | Complete |
| LIT-02 | Phase 3 | Complete |
| LIT-03 | Phase 2 | Complete |
| LIT-04 | Phase 2 | Complete |
| NAV-01 | Phase 1 | Complete |
| NAV-02 | Phase 1 | Complete |
| NAV-03 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2025-07-17*
*Last updated: 2026-03-14 — traceability filled in after roadmap creation*
