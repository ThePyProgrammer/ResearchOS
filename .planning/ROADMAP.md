# Roadmap: ResearchOS — Research Projects & Experiments

## Overview

ResearchOS expands from a reference manager into a full research workflow platform. This milestone adds research projects, research questions, and experiment tracking — giving a researcher one place to go from formulating a question to planning, running, and reviewing nested experiments, all connected to the same literature library. Four phases deliver this in dependency order: project shell first, then research questions and literature integration, then the experiment tree, then the differentiator features (comparison, diff, duplication) that require completed experiment data to demonstrate value.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Foundation** - Complete project CRUD, navigation shell, and project notes (UAT gap closure) (completed 2026-03-15)
- [x] **Phase 2: Research Questions & Literature** - RQ hierarchy, hypothesis tracking, and paper-to-project linking (gap closure in progress) (completed 2026-03-15)
- [x] **Phase 3: Experiment Tree** - Hierarchical experiment nodes, leaf fields, status badges, experiment notes (completed 2026-03-15)
- [x] **Phase 4: Experiment Differentiators** - Metric comparison, config diff, and experiment duplication (completed 2026-03-16)
- [ ] **Phase 5: Integration Polish** - Fix experiment library scoping and add experiment counts to project cards (gap closure)

## Phase Details

### Phase 1: Project Foundation
**Goal**: Researchers can create, organize, and navigate research projects within ResearchOS
**Depends on**: Nothing (first phase)
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, NAV-01, NAV-02
**Success Criteria** (what must be TRUE):
  1. User can create a project with name, description, and status, and it appears in a projects list view
  2. User can open a project detail page showing the project's metadata, linked RQs, experiments, and papers
  3. User can edit a project's name, description, and status (active/paused/completed/archived) and see changes immediately
  4. User can delete a project and it is removed from the list
  5. User can write and edit free-form notes on a project using the same tiptap editor used for papers
  6. Projects section appears in the sidebar and navigating from project list to project detail works without a full page reload
**Plans:** 4/4 plans complete
Plans:
- [x] 01-01-PLAN.md — Backend: project models, service, router, migrations, notes extension, and route tests
- [x] 01-02-PLAN.md — Frontend: project card grid page, detail page with notes, sidebar integration, route wiring
- [x] 01-03-PLAN.md — Gap closure: fix empty state duplicate button and sidebar status dot visibility
- [ ] 01-04-PLAN.md — Gap closure: fix sidebar not updating on project create/delete

### Phase 2: Research Questions & Literature
**Goal**: Researchers can define the questions a project is trying to answer, track their status, and link supporting literature
**Depends on**: Phase 1
**Requirements**: RQ-01, RQ-02, RQ-03, RQ-04, RQ-05, RQ-06, LIT-01, LIT-03, LIT-04
**Success Criteria** (what must be TRUE):
  1. User can create a primary research question on a project and add sub-questions under it
  2. User can add a hypothesis to any research question and set its status (open/investigating/answered/discarded)
  3. User can edit and delete research questions, including reorganizing the primary/sub-question hierarchy
  4. User can link papers and websites from the library to a project and see them listed on the project detail page
  5. User can see a gap indicator on any RQ that has no linked papers, prompting them to add supporting literature
  6. User can remove paper and website links from a project
**Plans:** 6/6 plans complete
Plans:
- [x] 02-01-PLAN.md — Backend: migration, models, services, routers for RQs and project-paper linking + frontend API client
- [x] 02-02-PLAN.md — Frontend: recursive RQ tree on Overview tab with inline CRUD, status, hypothesis, delete
- [x] 02-03-PLAN.md — Frontend: Literature tab, search picker, gap indicators, per-RQ paper linking, bidirectional linking from Paper/Website pages
- [x] 02-04-PLAN.md — Frontend: drag-and-drop RQ reparenting with @dnd-kit + end-to-end verification checkpoint
- [ ] 02-05-PLAN.md — Gap closure: root-onto-root DnD demoting via pointer-position heuristic (superseded)
- [ ] 02-06-PLAN.md — Gap closure (refined): root-onto-root demote via pointer-Y heuristic with exact line-pinned edits

### Phase 3: Experiment Tree
**Goal**: Researchers can plan and track a hierarchical tree of experiments within a project, including config, metrics, and notes
**Depends on**: Phase 2
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-10, LIT-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. User can create experiment nodes in a tree structure — both parent group nodes and leaf run nodes
  2. Leaf experiments have a name, status (planned/running/completed/failed), config key-value pairs, and metrics key-value pairs that can be edited
  3. User can delete an experiment node, and all its children are removed with it
  4. Parent experiment nodes display aggregated summaries of their children (status counts, metric ranges)
  5. Experiment tree nodes show color-coded status badges distinguishing planned, running, completed, and failed states
  6. User can attach notes to an individual experiment using the same tiptap editor used for papers
  7. User can link a specific paper or website to an individual experiment as supporting literature
**Plans:** 3/3 plans complete
Plans:
- [x] 03-01-PLAN.md — Backend: migration, models, service, router, app.py wiring, frontend API client
- [ ] 03-02-PLAN.md — Frontend: experiment tree UI with ExperimentSection, ExperimentNode, KVEditor, create modal, status dropdown, DnD
- [ ] 03-03-PLAN.md — Frontend: parent aggregation summaries, experiment notes, experiment-literature linking + verification checkpoint

### Phase 4: Experiment Differentiators
**Goal**: Researchers can compare experiments quantitatively — side-by-side metrics, config diffs, and fast iteration via duplication
**Depends on**: Phase 3
**Requirements**: EXP-07, EXP-08, EXP-09
**Success Criteria** (what must be TRUE):
  1. User can select multiple leaf experiments and view their metrics side-by-side in a comparison table
  2. User can view a config diff between two experiments in the same group, seeing which parameters changed
  3. User can duplicate an experiment, producing a new planned sibling with the same config that can be modified before running
**Plans:** 3/3 plans complete
Plans:
- [ ] 04-00-PLAN.md — Wave 0: test scaffolds for experiment routes (EXP-09) and compare-modal helpers (EXP-07, EXP-08)
- [ ] 04-01-PLAN.md — Backend duplicate endpoint + frontend duplicate UX in ExperimentNode context menu
- [ ] 04-02-PLAN.md — Checkbox selection, floating action bar, CompareModal with Metrics and Config tabs + human verification

### Phase 5: Integration Polish
**Goal**: Fix integration gaps found during milestone audit — library-scoped experiment search and experiment counts on project cards
**Depends on**: Phase 4
**Requirements**: LIT-02, PROJ-02
**Gap Closure**: Closes INT-01 and INT-02 from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. Experiment literature search (MiniSearchPicker in ExperimentNode) returns only papers/websites from the project's library
  2. Project cards on the projects list page display the number of experiments in each project
**Plans:** 1 plan
Plans:
- [ ] 05-01-PLAN.md — Thread libraryId to experiment search picker + add experiment counts to project cards

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation | 4/4 | Complete   | 2026-03-15 |
| 2. Research Questions & Literature | 6/6 | Complete   | 2026-03-15 |
| 3. Experiment Tree | 3/3 | Complete   | 2026-03-15 |
| 4. Experiment Differentiators | 3/3 | Complete   | 2026-03-16 |
| 5. Integration Polish | 0/1 | Not started | - |
