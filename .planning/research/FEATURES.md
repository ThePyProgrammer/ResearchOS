# Feature Research

**Domain:** Research productivity tooling — task databases, LaTeX export, AI experiment planning
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH — core Kanban/list/calendar and LaTeX-BibTeX patterns are stable and well-documented (MEDIUM-HIGH); AI gap analysis for experiments is an emerging area with limited established UX patterns (MEDIUM).

---

## Context: v1.1 Milestone Scope

This research covers only the NEW features being added in v1.1. Existing v1.0 features (experiment tree, CSV import, spreadsheet view, project notes IDE, wikilinks, graph view, AI copilot) are already built.

Three feature clusters to cover:
1. **Task database** — project-scoped Kanban, list, and calendar views
2. **LaTeX export** — notes-to-.tex with BibTeX \cite{} references
3. **AI experiment gap analysis** — missing baselines/ablations + planning board

---

## Feature Landscape

### Table Stakes (Users Expect These)

#### Task Database / Kanban

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Status columns as the primary grouping dimension | Every Kanban tool groups cards by status; if columns aren't status-driven, users are confused | LOW | Columns = values of a "Status" select property; Notion/Linear proven model |
| Drag cards between columns | The core Kanban interaction — moving a card updates its status | MEDIUM | Use dnd-kit (react-beautiful-dnd is deprecated/unmaintained as of 2022) |
| Create new task inline within a column | Clicking "+ New task" at the bottom of a column is universal | LOW | Inline input row in column footer; press Enter to confirm |
| Task title + due date + status as minimum fields | Users expect at minimum: what, when, what stage | LOW | Tasks table: id, project_id, title, status, due_date, priority, description, created_at |
| Custom status labels | Researchers don't always use To Do / In Progress / Done — they may want "Planned / Running / Writing / Submitted" | LOW | Status options stored as JSONB array on the project; displayed as named columns |
| Reorder tasks within a column | Drag-reorder within a column affects display order | MEDIUM | Position field (integer) per task; recompute on drop |
| Add/rename/reorder/delete status columns | Users customize their workflow; column management is expected | LOW | CRUD on the status options array; delete column must handle orphaned tasks (move to default or prompt) |
| Persist view preference per project | Switching between Kanban/list/calendar should remember the last-used view per project | LOW | localStorage key per project_id; no backend needed |

#### List View

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Flat sortable task table | List view is the fallback when Kanban has too many tasks; users expect a spreadsheet-like view | LOW | Table with columns: title, status, priority, due date, created; reuse existing table patterns from spreadsheet view |
| Sort by any column | Expected: click column header to sort ascending/descending | LOW | Client-side sort; all data already loaded |
| Filter by status and priority | Users want to narrow down a long list | MEDIUM | Dropdown filters above the table; apply client-side |
| Inline status change | Click a status chip in the list to cycle through statuses without opening the task | LOW | Dropdown on the chip in the row |

#### Calendar View

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Month grid with tasks on their due dates | Calendar view is expected to show tasks on the date they're due | MEDIUM | Month grid; tasks with due_date appear as chips on that day |
| Drag task to a new date to reschedule | Dragging a task chip to a new calendar cell updates due_date; this is the dominant UX pattern (Asana, Planner, Quire) | MEDIUM | dnd-kit; drop target = calendar cell; update due_date |
| Unscheduled task sidebar | Tasks without a due_date don't disappear — they show in a sidebar panel and can be dragged onto the calendar to assign a date | MEDIUM | Side panel listing undated tasks; drag onto date cell assigns the date |
| Week view toggle | Month view loses task detail when projects have many tasks in one week | MEDIUM | Week grid showing hour-slots or just day columns; lower priority than month view |
| Click a date to create a new task with that date pre-filled | Clicking an empty day cell = fast task creation | LOW | Open create modal with due_date pre-set to clicked date |

#### LaTeX Export

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Export notes to .tex file | Researchers writing papers need their notes as a LaTeX-ready document | MEDIUM | Convert tiptap JSON → Markdown via tiptap's export capability, then Markdown → LaTeX via Pandoc server-side; Pandoc is well-established for this conversion |
| BibTeX .bib file co-generated with the .tex | A standalone .tex with \cite{} references is useless without a corresponding .bib — researchers expect both files together | MEDIUM | Scan note content for cite-key references; build .bib from linked project papers using existing bibtex_service.py |
| \cite{key} markers that work with the .bib | When a paper is referenced in a note, it must appear as \cite{citekey} in the LaTeX output — not just a title | HIGH | Requires a citation reference node type in tiptap (custom mark) that stores paper_id + rendered citekey; the key challenge of this feature |
| Deterministic cite key generation | Keys must be stable across exports — if they change every time, \cite{} markers in existing .tex files break | MEDIUM | Use author-year-title pattern: smith2024attention; deduplicate with suffix for collisions; same algorithm ResearchOS already uses in bibtex_service.py |
| Download as .zip containing .tex + .bib | Packaging both files is standard academic workflow (mirrors Overleaf project structure) | LOW | Backend endpoint returns a zip; or frontend creates two blob downloads in sequence |

#### LaTeX Preview

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Read-only LaTeX source preview panel | Researchers want to see the raw .tex output before downloading — "what will this look like?" | LOW | Show the generated .tex as syntax-highlighted text in a side panel or modal; no live rendering needed |

---

### Differentiators (Competitive Advantage)

#### Task Database

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Custom task columns beyond title/status/due date | ResearchOS is a research tool — tasks may need "Linked experiment", "Related RQ", or "Paper reference" columns | HIGH | Custom column schema stored as JSONB; renders as text/select/link per column type; defer from v1.1 launch but design schema to support it |
| Link tasks to experiments | A task like "run ablation with lr=0.001" directly linked to a planned experiment — closes the planning-to-execution loop uniquely for this tool | MEDIUM | Optional experiment_id FK on task; shows experiment chip in the task card |
| Link tasks to research questions | Tasks can be tied to specific RQs — "finish literature review for RQ2"; shows how work maps to research goals | LOW | Optional rq_id FK on task; shown in task detail |
| Color-coded priority (P1/P2/P3) with visual weight in Kanban | Priority is expected in sophisticated task tools; in a research context it helps distinguish blocking vs nice-to-have experiments | LOW | priority field: p1/p2/p3/none; card border or left-side indicator in Kanban |

#### LaTeX Export

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| @ mention papers inside notes that become \cite{} on export | Writing "@Smith 2024" in the notes editor autocompletes to a paper from the library and inserts a citation mark that exports as \cite{smith2024} — seamless writing experience, no copy-paste | HIGH | Custom tiptap extension (already have @ mention for experiments/notes; extend to library papers); the cite-node stores paper_id; export resolves to citekey |
| Cite key editor before download | Show all generated citekeys; let researcher tweak them before export in case of conflicts or style preferences | MEDIUM | Simple table in the export modal: paper title | auto-generated key | editable key field |
| Export a specific note or all project notes | Researchers may want to export just one chapter-draft note, or everything at once | LOW | Export modal: dropdown to select "All notes" or a specific note file |

#### AI Experiment Gap Analysis

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-generated gap suggestions from existing experiment tree | The core differentiator: given the current experiment tree (configs, metrics, statuses), the AI identifies missing ablations, missing baselines, underexplored config dimensions, and statistically unsupported claims | HIGH | LLM prompt with full experiment tree JSON + RQ context; structured JSON response listing gaps with rationale; uses existing OpenAI integration pattern from chat_service.py |
| Gap suggestions categorized by type | "Missing baseline", "Missing ablation", "Untested config range", "Confirmation of counter-hypothesis" — researchers think in these categories | MEDIUM | Structured output: type enum + description + suggested config/hypothesis + confidence; prompt engineering required |
| Planning board: drag gap suggestion → planned experiment | The link from insight to action — drag a suggestion card and it materializes as a planned experiment in the tree with the suggested config pre-filled | HIGH | Two-panel layout: gap suggestions list (left) + mini experiment tree (right); drag suggestion → creates new planned leaf; requires DnD between suggestion cards and tree nodes |
| Re-analyze button | Experiment trees evolve; re-running gap analysis on demand keeps suggestions current | LOW | Single button; replaces the current suggestion set; show timestamp of last analysis |
| Dismiss / save suggestions | Researcher can dismiss irrelevant suggestions ("already know this") or pin important ones | LOW | Dismissed suggestions hidden from view; pinned shown at top; store state in project JSON or separate table |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full Gantt / timeline view for tasks | Researchers see Gantt in Jira/Asana and want it | Gantt requires start + end + dependency edges; current schema only has due_date; adds a week of modeling work for marginal research utility; explicitly out of scope per PROJECT.md | Calendar month view covers scheduling needs; list view with sort by due_date covers timeline ordering |
| Live LaTeX compilation + rendered PDF preview | Researchers want to see the formatted output instantly | Requires a LaTeX engine (TeX Live, latexmk) running server-side — a major infrastructure addition; TeX Live is 4GB+; not feasible on this stack without a dedicated compilation service | Show raw .tex source in a syntax-highlighted panel; researchers paste into Overleaf for final rendering |
| Recurring tasks | Feels useful for "weekly experiment review" tasks | Adds a recurrence rule engine, timezone handling, and creates phantom tasks in the DB; complex for low ROI in a research context | Researcher can manually duplicate tasks; add a "Copy task" button instead |
| Multi-assignee / team collaboration on tasks | Requested if teams ever share ResearchOS | Single-user system; auth and task assignment require a full user model rewrite | Out of scope; assignment logic is just noise on a solo system |
| AI task generation from research questions | "Given my RQ, generate a task list" sounds appealing | Generic task lists from RQs produce obvious noise ("Read related papers", "Run experiments") — the experiment tree already captures the structured plan; AI task generation would duplicate it without the config/metrics structure | Use AI gap analysis on the experiment tree (specific, structured) instead of AI task generation (generic, unfocused) |
| Citation suggestion while writing ("papers you might want to cite here") | Seen in AI writing tools | Requires semantic search over the paper library during typing — needs embedding pipeline (not yet built in ResearchOS); adds high latency and infrastructure ahead of its time | The @ mention autocomplete from existing papers is sufficient; semantic suggestions are a Phase 2 feature after embeddings exist |
| Bidirectional sync with Overleaf | Researchers want their ResearchOS notes to stay in sync with Overleaf projects | Requires Overleaf API (limited, not public), OAuth, conflict resolution — massive scope; Overleaf's API is not designed for third-party sync | One-way export (ResearchOS → .zip → Overleaf upload) is the correct boundary for this milestone |

---

## Feature Dependencies

```
Task database (schema + CRUD)
  └── Kanban view (requires tasks + status columns as grouping)
        └── Drag between columns (requires tasks + Kanban + dnd-kit)
  └── List view (requires tasks; parallel to Kanban; shares filter state)
  └── Calendar view (requires tasks + due_date field)
        └── Unscheduled sidebar + drag-to-date (requires calendar view + dnd-kit)

LaTeX export
  └── Cite-key generation for linked papers (requires bibtex_service.py — already exists)
  └── @ mention citation node in tiptap (requires existing @ mention pattern + new paper target)
        └── \cite{} export from cite nodes (requires citation node + Pandoc conversion)
  └── Pandoc server-side (new Python dependency; uv add pandoc or subprocess call to system pandoc)
  └── .zip packaging of .tex + .bib (requires both files generated; simple zipfile in Python)

AI gap analysis
  └── Experiment tree read (already exists via experiment service)
  └── Structured LLM call (uses existing OpenAI pattern from chat_service.py)
  └── Gap suggestions store (new: project_gap_suggestions table or JSONB on project)
  └── Planning board
        └── Experiment tree mini-view (requires experiment tree component — already exists)
        └── Drag suggestion → create experiment (requires gap suggestions + dnd-kit + experiment create API)
```

### Dependency Notes

- **Calendar view depends on dnd-kit** already brought in for Kanban; the same library handles both. Install once, use everywhere.
- **LaTeX export depends on Pandoc** being available server-side. On Windows dev (current env), Pandoc must be installed as a system binary or bundled. On Supabase-deployed backend this is not applicable — backend runs locally. Verify Pandoc availability in the env before committing to this approach.
- **@ mention citation node requires extending the existing tiptap @ mention** already used for wikilinks/experiment references in ProjectNotesIDE. The existing infrastructure handles the autocomplete trigger; the new node type is a data-model addition.
- **AI gap analysis and planning board should be built together** — gap analysis output without the planning board is just a list; the planning board without gap analysis has nothing to show. They are a single coherent feature.
- **Task-to-experiment link enhances but does not block** the base task database. Build tasks first as an independent entity; add FK links in a follow-up sub-phase.

---

## MVP Definition

### Launch With (v1.1 core)

- [ ] Task database: title, status, priority, due_date, description fields
- [ ] Kanban view with drag-and-drop between status columns
- [ ] List view with sort + status/priority filter
- [ ] Calendar view (month grid) with drag-to-reschedule and unscheduled sidebar
- [ ] Custom status columns (add/rename/delete/reorder)
- [ ] LaTeX export: notes → .tex + .bib .zip download
- [ ] Cite-key generation from linked project papers
- [ ] @ mention citation node in tiptap → \cite{key} in exported .tex
- [ ] LaTeX preview panel (raw .tex source, syntax-highlighted)
- [ ] AI gap analysis: structured suggestions (missing baselines, ablations, config gaps)
- [ ] Planning board: two-panel gap suggestions + mini experiment tree with drag-to-create

### Add After Validation (v1.1.x)

- [ ] Calendar week view — add once month view is stable and users request day-level detail
- [ ] Cite key editor in export modal — add once users report key conflicts
- [ ] Task → experiment link — add once task database is in use and researchers want to connect the two planes
- [ ] Dismiss/pin gap suggestions — add once gap analysis is used regularly enough to accumulate noise

### Future Consideration (v2+)

- [ ] Custom task columns (beyond title/status/priority/due_date) — requires column schema design and conditional UI rendering; worthwhile but heavyweight
- [ ] Task → RQ link — adds research-question context to tasks; useful but adds complexity before the core task UX is validated
- [ ] Semantic citation suggestions while writing — requires embedding pipeline (Phase 4 in CLAUDE.md roadmap)
- [ ] Gantt / timeline view — out of scope per PROJECT.md; consider after v1.1 validates timeline-thinking in research workflows

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Kanban view (drag + status columns) | HIGH | MEDIUM | P1 |
| List view (sort + filter) | HIGH | LOW | P1 |
| Calendar view (month + drag reschedule) | MEDIUM | MEDIUM | P1 |
| LaTeX export (.tex + .bib zip) | HIGH | MEDIUM | P1 |
| @ mention → \cite{} citation node | HIGH | HIGH | P1 |
| AI gap analysis (structured suggestions) | HIGH | HIGH | P1 |
| Planning board (drag suggestion → experiment) | HIGH | HIGH | P1 |
| Custom status columns | MEDIUM | LOW | P1 |
| LaTeX preview panel | MEDIUM | LOW | P2 |
| Cite key editor in export modal | MEDIUM | LOW | P2 |
| Calendar week view | LOW | MEDIUM | P2 |
| Task → experiment link | MEDIUM | LOW | P2 |
| Dismiss/pin gap suggestions | LOW | LOW | P2 |
| Custom task columns | MEDIUM | HIGH | P3 |
| Task → RQ link | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Should have; add when P1 is stable
- P3: Nice to have; future consideration

---

## Competitor Feature Analysis

| Feature | Notion | Linear | Asana | ResearchOS v1.1 Approach |
|---------|--------|--------|-------|--------------------------|
| Kanban board | Database board view; group by any select property | Board view; status-based columns | Board view; section-based | Status-based columns; scoped per research project |
| Drag between columns | Yes | Yes | Yes | dnd-kit; same library as experiment tree reparenting |
| Calendar view | Yes (requires date property) | Yes (schedule view) | Yes | Month + week; unscheduled sidebar |
| Custom columns | Full (any property type) | Status + priority + custom fields | Custom fields (paid) | Title/status/priority/due_date at launch; extensible |
| LaTeX export | No | No | No | Unique — tiptap → Pandoc → .tex + .bib; first-class research writing workflow |
| Citation management | No | No | No | @ mention → \cite{} cite-node; generates BibTeX keys from linked papers |
| AI experiment gap analysis | No | No | No | Unique — deep integration with experiment tree; not possible without the underlying data model |
| Planning board (AI → action) | No (templates only) | No | No | Unique — drag AI gap suggestion onto experiment tree to create planned experiments |

---

## Sources

- [Zapier: Best Kanban apps 2026](https://zapier.com/blog/best-kanban-apps/)
- [LogRocket: Build Kanban board with dnd-kit](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/)
- [Puck Editor: Top 5 Drag-and-Drop Libraries for React 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)
- [dnd-kit official docs](https://dndkit.com/)
- [Notion Kanban help center: board view](https://www.notion.com/help/boards)
- [Asana forum: Calendar view drag-and-drop unscheduled tasks](https://forum.asana.com/t/calendar-view-drag-and-drop-unscheduled-tasks/13852)
- [Quire: Drag tasks to calendar](https://quire.io/blog/p/calendar.html)
- [Tiptap: Export documentation](https://tiptap.dev/docs/editor/extensions/functionality/export)
- [Tiptap: Conversion overview](https://tiptap.dev/docs/conversion/getting-started/overview)
- [Pandoc user guide](https://pandoc.org/MANUAL.html)
- [Better BibTeX for Zotero: citation keys](https://retorque.re/zotero-better-bibtex/citing/)
- [Yale: Zotero and LaTeX workflow](https://guides.library.yale.edu/bibtex/zotero-and-latex)
- [AblationBench: Evaluating automated planning of ablations in empirical AI](https://arxiv.org/pdf/2507.08038)
- [Deepgram: Ablation study explainer](https://deepgram.com/ai-glossary/ablation)
- Project requirements: `.planning/PROJECT.md`

---
*Feature research for: ResearchOS v1.1 — task databases, LaTeX export, AI experiment gap analysis*
*Researched: 2026-03-19*
