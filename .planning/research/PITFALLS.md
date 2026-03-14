# Domain Pitfalls: Research Project Management + Experiment Tracking

**Domain:** Research project management and experiment tracking added to an existing reference manager
**Researched:** 2026-03-14
**Confidence:** HIGH (domain expertise in experiment tracking systems + direct codebase analysis)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or features that never get used.

---

### Pitfall 1: Flat Config Storage Makes Experiment Comparison Impossible

**What goes wrong:** Experiment configuration (hyperparameters, settings) is stored as a free-form text blob or a single `notes` field rather than structured key-value pairs. Researchers can record a run but cannot later ask "show me all runs where learning_rate=0.001" or render a comparison table of runs side-by-side.

**Why it happens:** It feels simpler to let researchers "write what they ran." The problem is invisible until someone tries to compare 20 experiments and realizes the data is unqueryable.

**Consequences:** The experiment tracker becomes a glorified text log. No diff between runs. No filtering by config. No aggregation by metric. Users abandon it and go back to spreadsheets. Core value proposition is lost.

**Prevention:**
- Store `config` as a JSONB column: `{"learning_rate": 0.001, "batch_size": 32, "model": "gpt-4o"}` — key-value pairs, not prose
- Store `metrics` as a JSONB column: `{"accuracy": 0.94, "f1": 0.91, "loss": 0.23}` — numeric values keyed by metric name
- UI: render config as an editable key-value table, not a textarea
- Never allow free-text-only config — structured config is the whole point of experiment tracking

**Detection:** If the UI mockup shows a "configuration" textarea rather than a key-value table, this pitfall is already in motion.

**Phase:** Must be addressed in the initial schema design (Phase 1 of this milestone). Retrofitting structure into text blobs later requires a migration and data loss.

---

### Pitfall 2: Experiment Tree Stored as `parent_id` Without Depth Guard Creates UI Catastrophes

**What goes wrong:** The experiment hierarchy (parent experiment groups → leaf runs) is implemented as a recursive `parent_id` self-reference on the experiments table — which is the correct model — but no depth limit is enforced. Researchers create 6-level-deep nesting. The frontend tries to render an unbounded recursive tree and either crashes, performs N+1 queries, or renders a useless UI.

**Why it happens:** Self-referential `parent_id` is the obvious schema choice. The depth problem only appears when real data arrives.

**Consequences:**
- N+1 query explosion: fetching a tree of 50 experiments triggers 50 individual queries (one per node to get children)
- Frontend crashes or hangs rendering deeply nested structures
- The tree UI becomes unusable at depth > 3

**Prevention:**
- Enforce a max depth of 3 (project → group → leaf run) in the service layer — reject `create_experiment` when the resolved depth would exceed 3
- Fetch the entire experiment tree for a project in one query using a recursive CTE or by fetching all experiments for a project and building the tree in Python:
  ```sql
  SELECT * FROM experiments WHERE project_id = $1 ORDER BY parent_id NULLS FIRST, created_at;
  ```
  Then assemble the tree in Python in a single pass (O(n) with a dict keyed by id)
- Never load children lazily on expand — load the full tree upfront (experiment trees are small, max ~100 nodes per project)

**Detection:** If the service has a `get_children(experiment_id)` function that gets called recursively from a route handler, this pitfall is in motion.

**Phase:** Schema design and tree-fetch implementation must enforce this from the start.

---

### Pitfall 3: Conflating "Experiment Run" With "Experiment Plan" Poisons the Status Model

**What goes wrong:** The `status` field on an experiment is designed only for completed/running/failed states (copied from the existing `runs` table). The concept of a "planned" experiment — defining what you intend to run before you run it — gets bolted on as `status="planned"`, but the same model tries to represent both a future plan (no config, no metrics yet) and a completed run (full config, full metrics). Validation collapses: a planned experiment with no metrics looks identical to a failed run with missing data.

**Why it happens:** The existing `runs` table has a `status` field that looks almost right. It's tempting to just add "planned" to the enum. But a plan and a run are meaningfully different objects.

**Consequences:**
- A researcher opens an experiment list and can't tell which items are future plans vs. completed runs
- Queries like "show me all completed experiments" return planned experiments that were never run
- The dashboard experiment tree mixes intention with reality — misleading at a glance

**Prevention:**
- Keep `status` as: `planned | running | completed | failed` — but validate field presence by status:
  - `planned`: config may be partial or absent, metrics must be absent
  - `running`: config required, metrics may be partial
  - `completed`: config required, metrics required
  - `failed`: config required, error_message required
- In the frontend tree, render status with visually distinct iconography: a clock for planned, a spinner for running, a checkmark for completed, an X for failed — never just text
- Consider a `is_template` boolean for experiments that are purely plans with no intention of being run directly (groups that define default config for children)

**Detection:** If `planned` experiments show up in metric aggregations or average calculations, this pitfall has already caused data quality issues.

**Phase:** Status model must be defined clearly before building any UI that displays experiment status.

---

### Pitfall 4: Notes System Not Extended — Parallel Note Infrastructure Created Instead

**What goes wrong:** The existing `notes` table uses `paper_id`, `website_id`, `github_repo_id` as nullable foreign keys to express ownership. When adding projects and experiments, a developer creates a parallel `project_notes` table and an `experiment_notes` table rather than adding `project_id` and `experiment_id` columns to the existing `notes` table.

**Why it happens:** It feels cleaner to create a new table than to add nullable columns to an existing one. But this fragments the notes infrastructure.

**Consequences:**
- The tiptap notes editor (NotesPanel.jsx) has to be forked or made generic with a complex prop API
- Two separate code paths for note CRUD, note generation, note display
- AI note generation (`note_service.py`) must be duplicated for the new tables
- Migration complexity grows: every future feature that wants notes must touch multiple tables

**Prevention:**
- Add `project_id` and `experiment_id` nullable FK columns to the existing `notes` table via a new migration (e.g., `008_project_notes.sql`)
- The `note_service.py` already handles multiple owners via optional kwargs pattern — extend it with `project_id` and `experiment_id` parameters following the exact same pattern as `github_repo_id` was added
- Pass `createFn` and `listFn` props to `NotesPanel.jsx` to keep it owner-agnostic (this prop pattern is already in place per CLAUDE.md)
- One notes table, one notes service, one notes component — just more owner types

**Detection:** If a PR creates a new `*_notes` table, this pitfall is happening.

**Phase:** Notes integration should be explicitly addressed in the phase that builds project detail views. Adding columns to `notes` is a one-line migration.

---

### Pitfall 5: Literature Linkage Implemented as Data Copy Rather Than Reference

**What goes wrong:** When linking papers from the library to a project, the developer stores a copy of paper metadata in a `project_papers` JSONB array or a separate `project_papers` table with `title`, `authors`, `doi` columns. The paper now exists in two places: the library and the project linkage.

**Why it happens:** It's easier to display a paper's title in a project view if you have the data locally. Joins feel more complex.

**Consequences:**
- A paper gets updated in the library (corrected title, new PDF) — the project still shows stale data
- Deleting a paper from the library leaves ghost entries in project linkages
- The library and project become separate silos, defeating the "single source of truth" design principle stated in PROJECT.md

**Prevention:**
- Use a pure join table: `project_papers(project_id, paper_id, added_at, note)` — nothing else
- Fetch paper metadata via join when displaying project literature: `SELECT p.* FROM papers p JOIN project_papers pp ON p.id = pp.paper_id WHERE pp.project_id = $1`
- Add `ON DELETE CASCADE` on the `paper_id` FK so removing a paper from the library automatically removes the linkage
- Same pattern for websites: `project_websites(project_id, website_id, added_at)`

**Detection:** If the schema design shows paper title/authors stored in the project linkage table, this pitfall is happening.

**Phase:** Schema design. This cannot be corrected after data accumulates without a destructive migration.

---

### Pitfall 6: Research Questions as Free-Text Fields Instead of First-Class Entities

**What goes wrong:** Research questions are implemented as a `research_questions: text` or `research_questions: JSONB array of strings` on the projects table, rather than as a separate `research_questions` table with their own IDs, status, and linkage to experiments.

**Why it happens:** "It's just text" — a research question looks like a string. A JSONB array of strings seems sufficient.

**Consequences:**
- You cannot link an experiment to a specific sub-question ("this experiment addresses RQ2")
- You cannot track which research questions have been answered by completed experiments
- You cannot add status per question (open, partially answered, answered)
- Future features (AI agent for experiment planning) have no entity to reason about
- Rewriting to a proper table later loses the existing data structure

**Prevention:**
- Create a `research_questions` table: `(id, project_id, text, parent_id, status, created_at)`
- `parent_id` allows the primary RQ + sub-questions hierarchy described in PROJECT.md
- Add `research_question_id` as a nullable FK on experiments so a run can be explicitly linked to the question it addresses
- Keep it simple: 4-5 columns. The goal is entity addressability, not complexity.

**Detection:** If the schema review shows `research_questions` as a JSONB column on `projects`, this pitfall is active.

**Phase:** Initial schema design. Extracting from JSONB to a proper table later is painful.

---

## Moderate Pitfalls

---

### Pitfall 7: Project-Library Relationship Modeled as Many-to-Many When One-to-One Suffices

**What goes wrong:** A developer models projects as belonging to many libraries (many-to-many via a `project_libraries` join table) because "a project might span multiple libraries." This is premature generalization. ResearchOS is single-user, single-library-context. The added complexity serves no current use case.

**Prevention:**
- Model it as `projects.library_id TEXT NOT NULL REFERENCES libraries(id)` — a project belongs to exactly one library
- The existing library switcher pattern (LibraryContext) already establishes that the user works within one active library at a time
- If multi-library project spanning becomes a real need, it can be added later with a migration

---

### Pitfall 8: Experiment Metrics Stored Without Timestamps Makes Progress Tracking Impossible

**What goes wrong:** Metrics are stored as a single JSONB snapshot: `{"accuracy": 0.94, "loss": 0.23}`. There is no history of how metrics evolved during a run. A researcher cannot see a training curve or identify when a metric peaked.

**Prevention:**
- For the initial milestone (manual experiment tracking), a single final-metrics JSONB snapshot is acceptable — researchers record the end result, not a training curve
- However, design the schema to allow future extension: name the column `final_metrics` (not just `metrics`) so a future `metric_history` table is clearly additive, not a replacement
- Document this as a known limitation in the experiment detail UI: "ResearchOS records final metrics. For training curves, use W&B or TensorBoard and link the run URL here."
- Add a `run_url` field on leaf experiments specifically for linking to external tracking dashboards

---

### Pitfall 9: Sidebar Navigation Becomes a Maintenance Burden

**What goes wrong:** Projects are added to the sidebar as a new top-level section alongside the existing collections tree. The sidebar code (Sidebar.jsx) is extended with a second tree, second drag-drop handler, second rename logic. The component grows to 600+ lines and becomes impossible to maintain.

**Prevention:**
- Add "Projects" as a single sidebar nav item that navigates to `/projects` — do not render the full project/experiment tree in the sidebar
- The project tree (list of projects with their RQ and experiment subtrees) belongs in the project list page and project detail page, not in the persistent sidebar
- The sidebar should remain: Library switcher → Collections tree → Projects link → Agents link → Proposals link
- Keep Sidebar.jsx focused on collection navigation; project navigation lives in its own page

---

### Pitfall 10: Experiment Configuration Schema Enforced Too Rigidly Too Early

**What goes wrong:** The experiment config schema requires all runs within a parent group to use exactly the same config keys (to enable comparison). This sounds correct in theory but breaks in practice: researchers add a new hyperparameter mid-experiment series, or compare two different model architectures with incompatible config keys.

**Prevention:**
- Store config as a free-form JSONB dict — no enforced schema per experiment group
- In the UI, compute the "union of all config keys" across sibling experiments and render a comparison table with blanks for missing keys (the W&B/MLflow approach)
- Let the researcher define a "config template" on parent nodes as optional guidance, not enforcement
- Never reject an experiment because its config keys don't match siblings

---

### Pitfall 11: IDs Not Prefixed Consistently, Causing Confusion Across Entity Types

**What goes wrong:** The existing codebase uses prefixed IDs (`note_abc12345`, `paper_abc12345`, `run_abc12345`). New entities for projects and experiments are created with generic UUID strings or a different prefix scheme. Debugging becomes harder; log messages lose context.

**Prevention:**
- Follow the existing pattern exactly:
  - Projects: `proj_` prefix
  - Research questions: `rq_` prefix
  - Experiments: `exp_` prefix
- Use `f"proj_{uuid.uuid4().hex[:8]}"` in the service layer, consistent with how `note_`, `paper_` IDs are generated
- This is a trivial convention to get right at the start and painful to fix after data exists

---

### Pitfall 12: Frontend State Not Scoped to Active Project — Stale Data Across Navigation

**What goes wrong:** When a researcher navigates from Project A's detail page to Project B's detail page, the experiment tree from Project A is still rendered for a moment (or permanently) because the component reuses state without resetting on route param change. The `useEffect` dependency array omits `projectId`.

**Prevention:**
- Use `key={projectId}` on the project detail component to force a full remount on project change — the React pattern used elsewhere in the codebase
- Alternatively, in `useEffect`, include `projectId` in the dependency array and reset all state (`setExperiments([])`, `setProject(null)`) before fetching
- Add a loading skeleton that is shown while `project === null` — prevents rendering stale data

---

## Minor Pitfalls

---

### Pitfall 13: Migration Numbering Collision

**What goes wrong:** The existing migrations go up to `007_website_chat.sql`. A developer adds a new project migration as `008_projects.sql` but someone else (or a future change) also creates an `008_*.sql` for something else. Two migrations with the same number run out of order or not at all.

**Prevention:**
- Check the highest existing migration number before creating a new one (currently `007`)
- The project/experiment schema will need at minimum: `008_projects.sql` (projects + research_questions + experiments + join tables)
- Reserve a range: document in PROJECT.md or the migration file header which range this milestone owns

---

### Pitfall 14: Deleting a Project Leaves Orphaned Notes

**What goes wrong:** When a project is deleted, the notes associated with it (via `project_id` FK on the notes table) are not deleted. The notes table accumulates orphaned rows with `project_id` pointing to non-existent projects.

**Prevention:**
- Add `ON DELETE CASCADE` on the `project_id` FK in the notes table migration
- Same for `experiment_id` FK
- Test this explicitly: create a project with notes, delete the project, verify notes count drops

---

### Pitfall 15: "Linked Papers" Count Shown in Library Table Is Expensive Without an Index

**What goes wrong:** The library table shows papers with a badge indicating how many projects they are linked to. This requires a COUNT query on the `project_papers` join table for every paper rendered in the list. With 500 papers, this is 500 queries or one expensive subquery per page render.

**Prevention:**
- Do not show "linked to N projects" counts in the main library table — this is a premature feature
- If the count is needed, compute it via a single GROUP BY query and join it to the papers list query: `SELECT paper_id, COUNT(*) FROM project_papers GROUP BY paper_id`
- Or: show project linkage only in the paper detail panel (PaperInfoPanel), where a single paper's linkage is fetched on demand

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Database schema design | Free-text config/metrics (Pitfall 1) | Mandate JSONB key-value from the start |
| Database schema design | JSONB research questions (Pitfall 6) | Create `research_questions` as a separate table |
| Database schema design | Data-copy paper linkage (Pitfall 5) | Pure join table with CASCADE FK |
| Experiment tree implementation | N+1 tree queries (Pitfall 2) | Fetch full tree in one query, assemble in Python |
| Experiment tree implementation | Unbounded depth (Pitfall 2) | Enforce max depth=3 in service layer |
| Status model | Plan vs. run confusion (Pitfall 3) | Validate required fields by status in Pydantic |
| Notes integration | Parallel notes infrastructure (Pitfall 4) | Add `project_id`/`experiment_id` to existing notes table |
| Sidebar/navigation | Sidebar grows unmanageable (Pitfall 9) | Projects = single sidebar link, not a second tree |
| Frontend project detail | Stale state on navigation (Pitfall 12) | `key={projectId}` or reset in `useEffect` |
| Migrations | Numbering collision (Pitfall 13) | Check and document migration number ownership |
| Delete operations | Orphaned notes (Pitfall 14) | `ON DELETE CASCADE` on all project/experiment FKs |

---

## Sources

- Direct analysis of ResearchOS codebase (`CLAUDE.md`, `001_init.sql`, `note_service.py`, `run.py`, `note.py`)
- Domain expertise: MLflow, Weights & Biases, Neptune.ai, Comet.ml design patterns (training data, HIGH confidence for structural patterns)
- PROJECT.md requirements and constraints
- Confidence: HIGH for architecture-specific pitfalls (directly derived from codebase analysis); MEDIUM for UX pitfalls (based on experiment tracking system patterns)
