# Project Research Summary

**Project:** ResearchOS v1.1 — Task Database Views, LaTeX Export, AI Experiment Gap Analysis
**Domain:** Research productivity tooling — task management, academic writing workflow, AI-assisted experiment planning
**Researched:** 2026-03-19
**Confidence:** HIGH (stack and architecture derived from direct codebase analysis; features from stable domain patterns; pitfalls from retrospective + official docs)

## Executive Summary

ResearchOS v1.1 adds three distinct capability clusters to an already mature codebase: a project-scoped task database with Kanban/List/Calendar views, LaTeX export of tiptap notes with BibTeX citation integration, and an AI-powered experiment gap analysis engine with a drag-based planning board. All three clusters are additive — they extend existing data models, reuse installed libraries, and integrate into existing UI components rather than introducing new infrastructure. The critical architectural recommendation is to build cleanly on what is already there: `@dnd-kit` already installed, `bibtex_service.py` already handles BibTeX generation, `pydantic-ai` already supports structured output, and the `ProjectDetail.jsx` tab structure already accepts new panels.

The recommended approach is a strict phase sequence: data model and backend before UI, tasks before gap analysis (which needs populated experiment data to be useful), with LaTeX export as an independent parallel track. The LaTeX export path has a decisive implementation choice: use `@tiptap/static-renderer` with a custom `nodeMapping` (the structured AST approach) rather than regex-on-HTML serialization. Choosing the wrong serializer is the single most expensive mistake in this milestone — it requires a full rewrite if corrected after shipping. Similarly, the task database must use a `task_columns` table with stable ID-keyed field values from day one; retrofitting a columnar schema after data accumulates requires a destructive migration.

The main risk concentration is in the LaTeX export feature, which has three interlocking correctness requirements (HTML serialization, BibTeX key collision deduplication, and math node handling via `data-latex` attributes) that all must be right simultaneously for the output to compile. The AI gap analysis feature's risk is subtler: suggestion quality collapses if the LLM is not grounded with the full experiment tree, not just research questions. Both risks have clear mitigations documented in the research and should be addressed in phase design before implementation begins.

---

## Key Findings

### Recommended Stack

The v1.1 stack requires only two net-new frontend npm packages. `react-big-calendar@^1.19.4` with `date-fns@^4.1.0` as its localizer handles the calendar view — no other calendar library is appropriate (FullCalendar is commercially licensed; building from scratch means ~2,000 lines of date arithmetic). `@tiptap/static-renderer@^3.20.1` is the correct hook point for the LaTeX serializer; it is part of the tiptap 3 package family already installed and provides a structured AST-to-output mapping API. No new backend Python packages are needed at all — `pydantic-ai` (already installed at `>=1.63.0`) handles the gap analysis agent with `output_type=list[GapSuggestion]`.

**Core technologies:**
- `react-big-calendar@^1.19.4` + `date-fns@^4.1.0`: Calendar view (month/week/day) with correct date arithmetic — the only new library genuinely justified by complexity; MIT-licensed
- `@tiptap/static-renderer@^3.20.1`: LaTeX serialization via structured `nodeMapping`/`markMapping` — same tiptap 3 package family, version-guaranteed compatible with existing `@tiptap/react@^3.20.1`
- `@dnd-kit/core + @dnd-kit/sortable` (already installed): Kanban drag-between-columns, calendar drag-to-reschedule, planning board drag-to-create — reuse everywhere, install nothing new
- `pydantic-ai` (already installed at `>=1.63.0`): Gap analysis structured output via `Agent(output_type=list[GapSuggestion])` — V1 API stable since September 2025
- `bibtex_service.py` (already exists): BibTeX entry generation reused by the new `latex_service.py` via direct import — no duplication

**What not to use:** `html-to-latex` (unmaintained 5 years, doesn't understand tiptap custom node types), FullCalendar React (commercial license for React component), pre-built Kanban libraries such as `react-kanban` (fight existing @dnd-kit setup and Tailwind styles), LangChain/LlamaIndex (pydantic-ai is already sufficient and installed), tiptap Cloud Conversion API (paid cloud service, LaTeX not supported).

### Expected Features

The feature landscape is well-researched. Task database UX patterns are mature and stable (Notion/Linear are canonical references). LaTeX-BibTeX export for academic writing is a solved workflow with clear expectations. AI experiment gap analysis is an emerging area with sparser UX precedents — the planning board interaction model requires the most design judgment and is not directly precedented in existing tools.

**Must have (table stakes):**
- Kanban with drag-between-status-columns — core Kanban interaction; status column structure must be project-scoped with custom column names and colors
- List view with sort and status/priority filter — flat table fallback for large task counts; reuse existing Library.jsx table pattern
- Calendar month view with drag-to-reschedule and unscheduled task sidebar — the unscheduled sidebar is expected (Asana, Quire pattern); tasks without due dates must not disappear from the UI
- LaTeX `.tex` + BibTeX `.bib` exported as a `.zip` — both files together is the universal academic expectation; a standalone `.tex` without `.bib` produces `undefined citations` errors in Overleaf
- Deterministic `author{year}` citation keys with collision-safe suffix (`smith2023a`, `smith2023b`) — must be stable across exports; collisions are common in ML research (multiple papers from same first author + year)
- AI gap suggestions grounded in the full experiment tree — without tree context, suggestions are hallucinated noise that destroys researcher trust after the third false positive

**Should have (competitive differentiators — unique to ResearchOS):**
- `@` mention in tiptap that inserts a citation mark (stores `paper_id`) and exports as `\cite{key}` — seamless writing-to-citing workflow; no competitor (Notion, Linear, Asana) has this
- Planning board: drag AI suggestion card onto experiment tree to create a planned experiment with pre-filled config — closes the AI-insight-to-action loop uniquely
- Gap suggestions categorized by type (`missing_baseline` / `ablation` / `config_sweep` / `replication`) with rationale visible on each card
- Editable suggestion cards before acceptance — researcher modifies config before promoting to a real experiment; binary accept/reject (proposals.py pattern) is explicitly wrong here
- LaTeX preview panel (client-side, no API call) — read-only syntax-highlighted raw `.tex` output so researchers can inspect before downloading

**Defer (v2+):**
- Custom task columns beyond `title/status/priority/due_date` — column schema design is complex; validate core task UX first
- Calendar week view — month view covers MVP; add when users report need for day-level detail
- Semantic citation suggestions while writing — requires embedding pipeline not yet built (Phase 4 in CLAUDE.md roadmap)
- Gantt/timeline view — out of scope per PROJECT.md; calendar view covers scheduling needs
- Live LaTeX compilation to PDF preview — requires TeX Live server dependency (~4GB); Overleaf upload is the correct boundary
- Recurring tasks — adds recurrence rule engine, timezone handling, phantom task complexity; low ROI for research context
- Bidirectional Overleaf sync — Overleaf API is not designed for third-party sync; one-way export is the correct boundary

### Architecture Approach

All three features integrate into `ProjectDetail.jsx` as new panels or tab extensions, backed by new service/router pairs that follow the existing patterns exactly. The task database introduces two new tables (`task_columns`, `tasks`) via migration `021_tasks.sql`. LaTeX export adds `latex_service.py` which composes existing `note_service`, `paper_service`, and `bibtex_service` without duplicating their logic. Gap analysis adds `gap_analysis_service.py` which reads experiments and RQs, calls OpenAI with structured output, and returns a `list[GapAnalysisSuggestion]` — suggestions live in transient React state only, not the database, until a researcher promotes one by dragging it onto the experiment tree.

**Major components:**
1. `TaskBoard.jsx` — single component with `viewMode` state switching between Kanban/List/Calendar; fetches its own data from `tasksApi`/`taskColumnsApi`; mounted as a new "Tasks" tab in `ProjectDetail.jsx`
2. `latex_service.py` + export endpoint in `routers/projects.py` — server-side AST-to-LaTeX conversion composing `bibtex_service.paper_to_bibtex()` for the `.bib`; frontend sends `{citeKey: paperId}` map so backend trusts the citation resolution done client-side where project papers are already loaded
3. `gap_analysis_service.py` + planning board panel in `ProjectDetail.jsx` — agentic one-shot call (not conversational), suggestions held in React `useState`, drag-to-create calls `experimentsApi.create()`; extended into `project_notes_copilot_service.py` as a new `suggest_experiment` tool

**Key architectural patterns from research:**
- Transient AI suggestions — gap analysis results live in React state only; suggestions are lost on page refresh (acceptable because re-running is cheap and suggestions are context-dependent); matches existing `NotesCopilotPanel` suggestion pattern
- Service composition over duplication — `latex_service.py` calls `note_service`, `paper_service`, and `bibtex_service` directly without re-implementing their logic
- Extend existing tool lists, don't fork services — add `suggest_experiment` to `project_notes_copilot_service.py`'s `TOOLS` list rather than creating a parallel copilot service
- View mode switcher within a single component — Kanban/List/Calendar are rendering modes of the same dataset in one `TaskBoard.jsx` component; mirrors the `Library.jsx` pattern

### Critical Pitfalls

1. **LaTeX serializer built on regex-on-HTML** — nested tags, KaTeX `data-latex` attributes, HTML entities, and combined marks (`<strong><em>`) all break under regex substitution. Use `@tiptap/static-renderer`'s structured `nodeMapping` instead. This is a full-rewrite-level mistake if shipped wrong; the architectural choice must be made correctly at the start of the LaTeX phase.

2. **Task column keys stored by display name, not stable ID** — if `tasks.metadata` uses column display names as keys, every rename operation corrupts existing task data. Create a `task_columns` table with an `id` PK; use `column_id` (not column name) as the key in field values everywhere. Retrofitting requires a destructive data migration.

3. **BibTeX citation key collisions in LaTeX export** — two papers by the same first author in the same year (common in ML research) produce duplicate `@article{smith2023, ...}` entries. The downstream failure (one citation silently overwriting another in BibTeX) is invisible to the researcher until they receive a reviewer comment about wrong citations. Implement a deterministic suffix pass (`smith2023a`, `smith2023b`) from the start.

4. **Gap analysis not grounded in actual experiment data** — sending only research questions to the LLM produces plausible-sounding suggestions for experiments that are already completed. Always include the full experiment tree (name, status, config, metrics) in the prompt, and explicitly instruct the LLM to exclude already-covered experiments. Trust in the AI feature collapses immediately once it suggests a completed experiment.

5. **Kanban optimistic update with no rollback on network failure** — drag moves the card in the UI, PATCH fails silently, page refresh shows the card back in the original column. Snapshot `previousTasks` before `onDragEnd`, revert to it in the catch block with an error toast. The existing proposals pattern has no precedent for this — it must be implemented intentionally.

6. **Migration numbering collision** — v1.0 ended at `020_project_notes_copilot.sql`. The range `021–025` must be reserved for v1.1 explicitly. Any developer creating a migration must claim the next number from this range, not pick arbitrarily. Two migration files with the same numeric prefix corrupt the schema state silently.

---

## Implications for Roadmap

Based on the combined research, three primary phases with LaTeX export as a parallelizable independent track:

### Phase 1: Task Database (Schema, CRUD, Kanban + List + Calendar)

**Rationale:** Foundation phase — tasks are a new first-class entity that requires a DB migration and new backend before any UI can function. Calendar and Kanban share the same data model, so all three views belong in one phase. This phase is fully independent of LaTeX export and gap analysis.

**Delivers:** Working task database with three view modes (Kanban drag-drop, List sort/filter, Calendar month + drag-to-reschedule), custom status columns per project, view preference persisted to localStorage.

**Addresses:** All table-stakes task features from FEATURES.md — custom status columns, drag-between-columns, inline task creation, calendar month view, unscheduled task sidebar, persist view preference per project.

**Avoids:**
- Pitfall 1: Create `task_columns` table with stable `id` PK; use `column_id` (not display name) as key everywhere — enforce in migration design review before any code
- Pitfall 2: Implement `previousTasks` snapshot and rollback in `onDragEnd` before shipping Kanban; not optional
- Pitfall 7: Claim migration number `021` for this phase; document the `021–025` range reservation in PROJECT.md
- Performance trap from PITFALLS.md: Use `React.memo` on `KanbanCard` with custom comparator at ~50+ cards; add `WHERE project_id = $1` index (included in migration)
- UX pitfall: Show count of undated tasks in calendar header; do not silently hide tasks without `due_date`

**Stack:** `react-big-calendar@^1.19.4` + `date-fns@^4.1.0` (new installs); `@dnd-kit` (existing); new `backend/models/task.py`, `backend/services/task_service.py`, `backend/routers/tasks.py`

**Research flag:** Standard patterns — no research-phase needed. The dnd-kit Kanban pattern (`DndContext > SortableContext per column > useSortable per card`) is confirmed as the 2026 standard practice. Calendar via react-big-calendar is fully documented. Timezone edge case (UTC ISO string without time component showing wrong day in timezones west of UTC) must be addressed in implementation but does not require research.

---

### Phase 2: LaTeX Export with Citation Integration

**Rationale:** Independent of Phase 1 — can be built in parallel or sequentially. Pure data transformation with no new DB tables. The correct serialization approach must be locked in at the start of this phase; the research is unambiguous that `@tiptap/static-renderer` custom `nodeMapping` is the only safe path. If this decision is deferred or implemented wrong, it requires a full rewrite of the serializer.

**Delivers:** "Export LaTeX" toolbar button in ProjectNotesIDE, LaTeX export modal with note selection and citation preview, client-side LaTeX preview panel (no API call), `.zip` download containing `main.tex` + `references.bib`, `@` mention citation node in tiptap that exports as `\cite{key}`.

**Addresses:** All LaTeX export features from FEATURES.md including the `@` mention → `\cite{}` citation node (high-complexity differentiator that no competitor offers).

**Avoids:**
- Pitfall 3: Implement collision-safe cite key deduplication (`smith2023a`/`b`) in `latex_service.py` from day one; test with two papers by the same first author in the same year
- Pitfall 4: Use `@tiptap/static-renderer` `nodeMapping` for structured AST traversal (never regex-on-HTML); read `data-latex` attribute for KaTeX math nodes; decode HTML entities before LaTeX-escaping special characters (`&`, `%`, `#`, `_`, `^`, `~`)
- Anti-pattern from ARCHITECTURE.md: Frontend sends `{citeKey: paperId}` map to backend (citation resolution happens client-side where project papers are already loaded); backend trusts this map and resolves paper data by ID — do not have backend parse HTML for citation detection
- UX pitfall: Always export as a `.zip` with both files; name the `.bib` file to match the `\bibliography{}` reference in the `.tex`

**Stack:** `@tiptap/static-renderer@^3.20.1` (new install); existing `bibtex_service.paper_to_bibtex()`; Python DOM parser (`html.parser` or `lxml`) for walking HTML in `latex_service.py`; Python `zipfile` for packaging; new `backend/services/latex_service.py`, add endpoint to `backend/routers/projects.py`

**Research flag:** The AST serialization approach is well-documented and the static-renderer API is confirmed stable. One sub-task warrants early prototyping: tiptap table nodes have a nested structure (`tableRow > tableCell > content`) whose exact ProseMirror schema may complicate the `\begin{tabular}` mapping. Validate this in the first implementation day by dumping a table node's JSON from `editor.getJSON()` — if the structure is as expected, no research needed; if it differs significantly, scope a brief research-phase to that sub-task only.

---

### Phase 3: AI Experiment Gap Analysis + Planning Board

**Rationale:** Builds last because: (a) gap analysis suggestions are only useful when a populated experiment tree exists — researchers need Phase 1 workflows running before experiments accumulate; (b) the planning board drag-drop patterns benefit from Phase 1 having validated `@dnd-kit` interaction patterns in this codebase; (c) the `suggest_experiment` copilot tool depends on `experimentsApi.create` being stable. Technically this phase can be built without Phase 1 being complete, but it will deliver no value to a researcher with an empty experiment tree.

**Delivers:** "Run Gap Analysis" button on the Experiments tab, AI-generated gap suggestions with type/rationale/proposed config displayed as planning board cards, two-panel layout (suggestions + experiment tree), drag-suggestion-to-tree to create a planned experiment with editable pre-filled config, `suggest_experiment` tool in the notes copilot.

**Addresses:** All AI gap analysis differentiator features from FEATURES.md — categorized suggestions with rationale, planning board drag-to-create, dismiss controls, re-analyze button, copilot experiment suggestion via new `suggest_experiment` tool.

**Avoids:**
- Pitfall 5: System prompt must include the full experiment tree (name, status, config, metrics), not just RQs; explicitly instruct the LLM to exclude already-covered experiments; limit to 5 suggestions ordered by priority (missing baselines first, then ablations, then scale)
- Pitfall 6: Suggestion cards must be editable before acceptance — name, config key-value pairs, proposed status; do not implement binary accept/reject (proposals.py pattern is wrong here); treat suggestions as editable "drafts" until promoted
- Anti-pattern from ARCHITECTURE.md: Do not persist suggestions to the DB; transient React `useState` is correct; do not reuse `chat_service.py` pattern (gap analysis is one-shot structured, not conversational)
- Performance trap: Gate gap analysis behind an explicit "Run Gap Analysis" button — never trigger on free-text input heuristics; gap analysis is a heavy LLM call

**Stack:** `pydantic-ai` (existing); OpenAI structured output via `response_format=json_object`; `@dnd-kit` (existing) for planning board drag zones; new `backend/models/gap_analysis.py`, `backend/services/gap_analysis_service.py`; add endpoint to `backend/routers/experiments.py`; modify `backend/services/project_notes_copilot_service.py` to add `suggest_experiment` tool

**Research flag:** Research-phase recommended before Phase 3 implementation. The prompt engineering and context serialization strategy are the highest-uncertainty sub-tasks: how to serialize 50+ experiments compactly within a ~4,000 token target; how to structure the `GapAnalysisSuggestion` schema for maximum planning board utility; how to surface "which experiments were considered" to the researcher for auditability (researchers need to audit the context, not just the output). Prototype the context builder against real project data before committing to the full planning board UI.

---

### Phase Ordering Rationale

- **Phase 1 before Phase 3:** Gap analysis suggestions are only useful when there is a populated experiment tree; Phase 1 establishes the project task workflow rhythm that leads researchers to run experiments; Phase 3 provides value proportional to experiment data depth
- **Phase 2 parallel to Phase 1:** LaTeX export has zero dependency on tasks; both phases share no data model; can be assigned to a separate work stream or built sequentially (Phase 2 immediately after Phase 1 or during Phase 1)
- **Phase 3 last:** Technically independent but contextually depends on experiment data accumulation; also highest implementation complexity with the most open design questions; benefits from Phase 1 having validated drag-drop interaction patterns
- **No research-phase for Phase 1:** Kanban + calendar patterns are canonical and well-documented; all architectural decisions are already resolved by the stack and architecture research
- **Scoped validation for Phase 2:** tiptap table node serialization is the one uncertain sub-task; verify on day one of implementation — it does not require a full research-phase
- **Research-phase recommended for Phase 3:** Gap analysis prompt engineering needs prototyping before committing to the full planning board UI; this is the only area in v1.1 where established patterns do not exist

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (AI Gap Analysis):** Prompt engineering and context serialization strategy for large experiment trees; structure of `GapAnalysisSuggestion` schema for planning board utility; how to surface "which experiments were considered" to the researcher for auditability — these are implementation-level decisions with no canonical answer in existing tooling

Phases with standard patterns (skip research-phase):
- **Phase 1 (Task Database):** dnd-kit Kanban pattern is confirmed 2026 standard; react-big-calendar integration is fully documented; schema design is resolved by pitfall research; no ambiguity
- **Phase 2 (LaTeX Export):** @tiptap/static-renderer nodeMapping API is confirmed; BibTeX key generation algorithm is established; the overall data flow is architecturally resolved in ARCHITECTURE.md; single sub-task (tiptap table node structure) needs a one-day implementation validation, not a research-phase

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry verified; tiptap 3 official docs confirmed; pydantic-ai V1 API stable since September 2025; existing `package.json` and `pyproject.toml` verified directly from codebase |
| Features | MEDIUM-HIGH | Task database and LaTeX patterns are stable domain knowledge (HIGH); AI experiment gap analysis UX is an emerging area — competitor analysis found no direct analogues for the planning board interaction model (MEDIUM) |
| Architecture | HIGH | Derived from direct codebase analysis of migrations 001–020, all services and routers, and frontend components; integration points are concrete facts, not assumptions |
| Pitfalls | HIGH | Combination of direct codebase analysis, v1.0 retrospective patterns, official tiptap docs (math extension `data-latex` behavior), FullCalendar timezone docs, OpenAI structured output docs, and dnd-kit GitHub discussions |

**Overall confidence:** HIGH

### Gaps to Address

- **tiptap table node → LaTeX `tabular` mapping:** The exact ProseMirror node structure for tiptap tables (nested `tableRow`, `tableCell`, and content) is not explicitly mapped in the static-renderer docs. The fallback strategy (emit `% [table omitted]` comment) is documented in pitfall research but the full recursive mapping may need implementation testing. Validate on day one of Phase 2 by dumping a table node's JSON from `editor.getJSON()`.

- **Gap analysis token budget with large experiment trees:** Research targets `< 4,000 tokens` for context, but a project with 100+ experiments and detailed configs could exceed this. No tested serialization strategy exists yet. Address in the Phase 3 research-phase by prototyping the context builder against real project data before committing to the planning board UI.

- **FEATURES.md / ARCHITECTURE.md Pandoc inconsistency:** FEATURES.md initially referenced Pandoc as a server-side dependency in its feature dependency tree. STACK.md and ARCHITECTURE.md both resolve this in favor of `@tiptap/static-renderer` (no system dependency, no binary). This is a documentation inconsistency, not an architectural ambiguity — the decision is `@tiptap/static-renderer`, not Pandoc. Roadmapper should treat the STACK.md and ARCHITECTURE.md recommendation as authoritative.

- **Calendar timezone edge case:** `due_date` stored as a UTC ISO string with no time component may show one day early in timezones west of UTC (FullCalendar UTC-coercion issue documented in official timezone docs). Addressed in PITFALLS.md "Looks Done But Isn't" checklist. Add the timezone verification test (create a task with due date while system clock is set to UTC-5, verify it appears on the correct calendar day) to Phase 1 acceptance criteria.

---

## Sources

### Primary (HIGH confidence)
- npm registry (live verification) — `react-big-calendar@1.19.4`, `date-fns@4.1.0` confirmed current stable
- [@tiptap/static-renderer official docs](https://tiptap.dev/docs/editor/api/utilities/static-renderer) — `nodeMapping`/`markMapping` API confirmed; custom output formats supported
- [tiptap 3.0 stable release notes](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable) — static-renderer is part of official package family at `^3.20.x`
- [pydantic-ai output docs](https://ai.pydantic.dev/output/) — `output_type` structured results confirmed; V1 API stable since September 2025
- Direct codebase analysis — `backend/migrations/001–020`, all services and routers, `frontend/src/pages/ProjectDetail.jsx`, `frontend/src/pages/ProjectNotesIDE.jsx`, `frontend/src/components/NotesCopilotPanel.jsx`, `frontend/src/services/api.js`, `frontend/package.json`, `backend/pyproject.toml`
- v1.0 PITFALLS.md / RETROSPECTIVE.md — migration numbering collision (Pitfall 13), ID convention (Pitfall 11), state reset patterns (Pitfall 12)
- [tiptap Mathematics extension docs](https://tiptap.dev/docs/) — `data-latex` attribute behavior on KaTeX nodes confirmed
- [FullCalendar timezone docs](https://fullcalendar.io/docs/timeZone) — UTC-coercion behavior confirmed when no timezone plugin present

### Secondary (MEDIUM confidence)
- [dnd-kit Kanban implementations (marmelab blog, 2026)](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) — confirms custom @dnd-kit Kanban is standard 2026 practice
- [Better BibTeX for Zotero: citation keys](https://retorque.re/zotero-better-bibtex/citing/) — citation key collision and deterministic suffix assignment patterns
- [OpenAI structured outputs guide](https://platform.openai.com/docs/guides/structured-outputs) — schema-adherence, hallucination risk when input is unrelated to schema
- [AblationBench: Evaluating automated planning of ablations](https://arxiv.org/pdf/2507.08038) — gap analysis suggestion categories validated against academic research on ablation planning
- dnd-kit GitHub discussion #1522 — optimistic update flicker + React state mutation error-prone patterns
- [Asana forum: Calendar view drag-and-drop unscheduled tasks](https://forum.asana.com/t/calendar-view-drag-and-drop-unscheduled-tasks/13852) — unscheduled task sidebar is standard expected UX
- [Quire: Drag tasks to calendar](https://quire.io/blog/p/calendar.html) — drag-to-reschedule and unscheduled sidebar confirmation

### Tertiary (LOW confidence)
- `html-to-latex@0.8.0` — last published 5 years ago; confirmed usable only as last-resort fallback for non-tiptap HTML; not for primary export path; avoid
- [html-to-latex GitHub](https://github.com/jdalrymple/html-to-latex) — LOW confidence for primary use; referenced only to document why it should not be used

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
