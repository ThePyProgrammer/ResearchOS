# Requirements: ResearchOS — Research Productivity

**Defined:** 2026-03-19
**Core Value:** A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.

## v1.1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Task Database

- [ ] **TASK-01**: User can create tasks with title, description, status, priority, and due date within a project
- [x] **TASK-02**: User can define custom status columns per project (e.g., Todo, In Progress, Review, Done)
- [x] **TASK-03**: User can add custom fields to tasks (text, number, date, select types)
- [x] **TASK-04**: User can view tasks as a Kanban board and drag cards between status columns
- [x] **TASK-05**: User can view tasks as a sortable, filterable list with all fields as columns
- [ ] **TASK-06**: User can view tasks on a calendar (month/week) by due date with an unscheduled sidebar
- [x] **TASK-07**: User can edit and delete tasks from any view

### LaTeX Export

- [x] **TEX-01**: User can export a note to .tex format preserving headings, lists, tables, math, and formatting
- [x] **TEX-02**: User can download a .zip containing .tex + .bib files with citations resolved
- [x] **TEX-03**: User can insert citation references in notes that serialize to \cite{key} on export
- [x] **TEX-04**: System auto-generates .bib entries from linked papers using existing BibTeX service
- [x] **TEX-05**: User can preview rendered LaTeX output in a read-only panel within the notes IDE
- [x] **TEX-06**: Citation keys are deduplicated (smith2024a/b) when multiple papers share first author + year

### AI Experiment Planning

- [x] **GAP-01**: User can trigger AI analysis of their experiment tree to receive suggestions for missing experiments
- [x] **GAP-02**: AI suggestions include reasoning, suggested config, and reference to relevant literature
- [ ] **GAP-03**: User can view suggestions as cards on a planning board and drag them to create planned experiments
- [x] **GAP-04**: AI detects which config parameters haven't been varied (ablation detection)
- [x] **GAP-05**: AI cross-references linked papers' experiments with user's to find coverage gaps

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Task Database Extensions

- **TASK-08**: User can link tasks to specific experiments
- **TASK-09**: User can create task templates for common workflows
- **TASK-10**: Timeline / Gantt view for tasks with dependencies

### LaTeX Extensions

- **TEX-07**: Full integrated LaTeX editor with live editing (Overleaf-like)
- **TEX-08**: User can customize citation keys per paper

### AI Extensions

- **GAP-06**: AI suggests experiment parameter sweeps based on optimization objectives
- **GAP-07**: Automated literature search for papers covering suggested experiments

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full Overleaf-like LaTeX editor | Export + preview sufficient for v1.1; massive scope |
| Real-time collaboration | Single-user system |
| External experiment runner integration (W&B, MLflow) | May add as import source in future |
| Gantt chart / timeline view | Deferred to v1.2; Kanban + list + calendar sufficient |
| Live LaTeX compilation (pdflatex) | Preview panel uses client-side rendering; no server-side compiler |
| Mobile app | Web-first approach |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TASK-01 | Phase 9 | Pending |
| TASK-02 | Phase 9 | Complete |
| TASK-03 | Phase 9 | Complete |
| TASK-04 | Phase 9 | Complete |
| TASK-05 | Phase 9 | Complete |
| TASK-06 | Phase 9 | Pending |
| TASK-07 | Phase 9 | Complete |
| TEX-01 | Phase 10 | Complete |
| TEX-02 | Phase 10 | Complete |
| TEX-03 | Phase 10 | Complete |
| TEX-04 | Phase 10 | Complete |
| TEX-05 | Phase 10 | Complete |
| TEX-06 | Phase 10 | Complete |
| GAP-01 | Phase 11 | Complete |
| GAP-02 | Phase 11 | Complete |
| GAP-03 | Phase 11 | Pending |
| GAP-04 | Phase 11 | Complete |
| GAP-05 | Phase 11 | Complete |

**Coverage:**
- v1.1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability filled after roadmap creation*
