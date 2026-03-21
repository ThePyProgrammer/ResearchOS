# Roadmap: ResearchOS

## Milestones

- ✅ **v1.0 Research Projects & Experiments** — Phases 1-8 (shipped 2026-03-18) — [archive](milestones/v1.0-ROADMAP.md)
- 🔄 **v1.1 Research Productivity** — Phases 9-11 (active)

## Phases

<details>
<summary>✅ v1.0 Research Projects & Experiments (Phases 1-8) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Project Foundation (4/4 plans) — completed 2026-03-15
- [x] Phase 2: Research Questions & Literature (6/6 plans) — completed 2026-03-15
- [x] Phase 3: Experiment Tree (3/3 plans) — completed 2026-03-15
- [x] Phase 4: Experiment Differentiators (3/3 plans) — completed 2026-03-16
- [x] Phase 5: Integration Polish (1/1 plan) — completed 2026-03-16
- [x] Phase 6: CSV Loading Framework (3/3 plans) — completed 2026-03-17
- [x] Phase 7: Experiment Table View (4/4 plans) — completed 2026-03-17
- [x] Phase 8: Project Notes IDE (3/3 plans) — completed 2026-03-18

</details>

### v1.1 Research Productivity

- [ ] **Phase 9: Task Database** — Project-scoped tasks with Kanban, list, and calendar views
- [x] **Phase 10: LaTeX Export** — Notes-to-LaTeX serialization with citation management and BibTeX generation (completed 2026-03-20)
- [ ] **Phase 11: AI Experiment Gap Analysis** — AI-powered gap detection with a drag-based planning board

## Phase Details

### Phase 9: Task Database
**Goal**: Researchers can create and manage project tasks through Kanban, list, and calendar views with custom status columns
**Depends on**: Nothing (no v1.1 dependencies; v1.0 project infrastructure assumed complete)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07
**Success Criteria** (what must be TRUE):
  1. User can create a task with title, description, status, priority, and due date within a project, and it persists across page refresh
  2. User can define custom status columns per project and see tasks organized into those columns on the Kanban board, with drag-and-drop moving cards between columns
  3. User can add custom fields (text, number, date, select) to tasks and see those fields as columns in the list view
  4. User can view tasks on a month/week calendar where tasks appear on their due date; tasks without a due date appear in an unscheduled sidebar
  5. User can edit and delete any task from Kanban, list, or calendar view without navigating away
**Plans:** 4/5 plans executed
Plans:
- [ ] 09-01-PLAN.md — Backend foundation (migration, models, service, router) + frontend shell with API client, routing, and TaskDetailPanel
- [ ] 09-02-PLAN.md — Kanban board view with DnD card movement and column management
- [ ] 09-03-PLAN.md — List view with sort, filter, and custom field management
- [ ] 09-04-PLAN.md — Calendar month view with unscheduled sidebar and drag-to-date + final verification

### Phase 10: LaTeX Export
**Goal**: Researchers can export project notes to compilable LaTeX with citations resolved to BibTeX entries from linked papers
**Depends on**: Nothing (independent of Phase 9; operates on existing notes and project-linked papers)
**Requirements**: TEX-01, TEX-02, TEX-03, TEX-04, TEX-05, TEX-06
**Success Criteria** (what must be TRUE):
  1. User can insert a citation reference in a note (via @ mention) that displays as an author-year label in the editor and exports as `\cite{key}` in the .tex file
  2. User can click "Export LaTeX" and download a .zip containing a .tex file with headings, lists, tables, math, and formatting preserved, plus a .bib file with entries for all cited papers
  3. Citation keys are deterministic and collision-safe: two papers by the same first author and year produce `smith2024a` and `smith2024b` rather than duplicate keys
  4. User can preview the raw .tex output in a read-only panel within the notes IDE before downloading
**Plans:** 3/3 plans complete
Plans:
- [ ] 10-01-PLAN.md — LaTeX serializer (HTML-to-LaTeX DOM walker) and citation key generation utilities with tests
- [ ] 10-02-PLAN.md — CitationExtension tiptap mark with @-trigger popup, context menu, and CSS styles
- [ ] 10-03-PLAN.md — Export modal, preview panel, ZIP packaging, templates, and ProjectNotesIDE integration

### Phase 11: AI Experiment Gap Analysis
**Goal**: Researchers can get AI-generated suggestions for missing experiments and promote them directly into the experiment tree via a planning board
**Depends on**: Phase 9 (task workflow validates @dnd-kit patterns in this codebase; gap analysis is most useful when experiment tree is populated)
**Requirements**: GAP-01, GAP-02, GAP-03, GAP-04, GAP-05
**Success Criteria** (what must be TRUE):
  1. User can trigger gap analysis from the Experiments tab and receive a set of suggestion cards, each showing a type (missing baseline / ablation / config sweep / replication), rationale, and proposed config
  2. Each suggestion card references specific linked papers whose experiments informed the gap detection, and identifies config parameters that have not been varied (ablation coverage)
  3. User can edit a suggestion card's name and config before promoting it, then drag it onto the experiment tree to create a planned experiment with those pre-filled values
  4. User can dismiss suggestions they don't want and re-run gap analysis to get a fresh set
**Plans:** 1/3 plans executed
Plans:
- [ ] 11-01-PLAN.md — Backend: GapSuggestion models, gap_analyzer agent (pydantic-ai structured output), POST endpoint, and route tests
- [ ] 11-02-PLAN.md — Frontend: GapAnalysisTab shell with cards, detail overlay, dismiss/undo, viewMode wiring
- [ ] 11-03-PLAN.md — Frontend: MiniExperimentTree with DnD drag-to-promote, paper chip popovers, human verification

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Project Foundation | v1.0 | 4/4 | Complete | 2026-03-15 |
| 2. Research Questions & Literature | v1.0 | 6/6 | Complete | 2026-03-15 |
| 3. Experiment Tree | v1.0 | 3/3 | Complete | 2026-03-15 |
| 4. Experiment Differentiators | v1.0 | 3/3 | Complete | 2026-03-16 |
| 5. Integration Polish | v1.0 | 1/1 | Complete | 2026-03-16 |
| 6. CSV Loading Framework | v1.0 | 3/3 | Complete | 2026-03-17 |
| 7. Experiment Table View | v1.0 | 4/4 | Complete | 2026-03-17 |
| 8. Project Notes IDE | v1.0 | 3/3 | Complete | 2026-03-18 |
| 9. Task Database | 4/5 | In Progress|  | - |
| 10. LaTeX Export | 3/3 | Complete    | 2026-03-20 | - |
| 11. AI Experiment Gap Analysis | 1/3 | In Progress|  | - |

### Phase 12: Literature Review Dashboard
**Goal**: Visual overview of a project's literature — citation network graph between linked papers, publication timeline, coverage heatmap by topic/method with AI keyword extraction. Helps spot literature gaps without AI analysis.
**Requirements**: REV-01, REV-02, REV-03, REV-04, REV-05, REV-06, REV-07, REV-08
**Depends on**: Nothing (operates on existing project-linked papers)
**Success Criteria** (what must be TRUE):
  1. User can view a citation network graph showing shared-author and same-venue edges between project papers, with configurable node color/size and toggleable edge types
  2. User can view a publication timeline scatter plot showing papers by year with vertical stacking for same-year papers
  3. User can view a coverage heatmap with configurable row/column axes (Tags/Venue/Year/Author) showing paper counts per cell with gap highlighting
  4. User can trigger AI keyword extraction to auto-tag untagged papers from their abstracts
  5. All visualizations support hover tooltips and click-to-navigate to paper detail
**Plans:** 2/4 plans executed

Plans:
- [ ] 12-01-PLAN.md — Review tab route, shell with collapsible sections, and pure data utility functions with tests
- [ ] 12-02-PLAN.md — Backend AI keyword extraction endpoint and frontend API client
- [ ] 12-03-PLAN.md — Citation network d3 force graph visualization
- [ ] 12-04-PLAN.md — Timeline scatter plot, coverage heatmap, Extract Keywords integration, and final verification
