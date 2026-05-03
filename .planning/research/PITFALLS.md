# Pitfalls Research

**Domain:** Adding task database (Kanban/list/calendar), LaTeX export with citations, and AI experiment gap analysis to an existing React + FastAPI + Supabase research platform
**Researched:** 2026-03-19
**Confidence:** HIGH (direct codebase analysis + domain patterns from v1.0 retrospective)

---

## Critical Pitfalls

### Pitfall 1: Task Custom Columns Stored as a JSONB Blob, Not as a Defined Column Schema

**What goes wrong:** The task database needs custom columns (e.g., "Priority", "Assignee", "Story Points"). A developer stores the column definitions inside the `tasks` row itself — e.g., `task.metadata = {"Priority": "high", "Story Points": 5}` — rather than having a separate `task_columns` table that defines which columns exist for a project. Each task ends up with slightly different keys; some have `"priority"`, some have `"Priority"`, some are missing the key entirely. Querying "all tasks where Priority=High" becomes a JSON path expression riddled with null-safety code.

**Why it happens:** It mirrors how experiments store `config` as a JSONB blob, which worked there. But experiment config is researcher-defined and intentionally heterogeneous. Task columns are UI-defined and must be consistent across all tasks in a project.

**How to avoid:**
- Create a `task_columns` table: `(id, project_id, name, type, options, position, created_at)` where `type` is `text | select | date | number | checkbox`
- Store task values as `task_field_values(task_id, column_id, value TEXT)` OR as a JSONB dict keyed by `column_id` (not column name) on the task row
- Use `column_id` as the key, never the human-readable name — column renames don't break data
- Enforce column definitions at the project level; tasks are forbidden from having keys that don't correspond to a `task_columns` row

**Warning signs:** If the schema review shows `tasks.metadata JSONB` with keys being column display names, this pitfall is in progress.

**Phase to address:** Task database schema phase (first task-related phase). Schema correction after data accumulates requires a full data migration.

---

### Pitfall 2: Kanban Drag-and-Drop State Diverges From the Database on Network Failure

**What goes wrong:** The Kanban board implements optimistic updates — when a card is dragged to a new column, the UI immediately moves it, then fires a PATCH to update `task.status`. If the PATCH fails (network error, server 500), the UI stays in the "dragged" position but the database still has the old status. The next page load shows the card in the old column. The researcher thinks they moved the task but it never saved.

**Why it happens:** Optimistic UI for drag-and-drop is the standard pattern (it makes the UX feel instant). The rollback path — reverting to pre-drag state on failure — requires explicit implementation of a "previous state" snapshot and is easy to skip.

**How to avoid:**
- Store `previousTasks` before applying the drag update: `const prev = [...tasks]`
- In the `onDragEnd` handler, call the API and on failure call `setTasks(prev)` to revert
- Show a brief error toast: "Failed to move task — changes reverted"
- Never use `useEffect` to sync from a separate "local state" variable — keep one authoritative state variable and snapshot it pre-drag (this is the pattern flagged in dnd-kit GitHub discussions as error-prone)
- Avoid setting mutation cache on `onDragOver` events — only commit on `onDragEnd` after the API responds

**Warning signs:** The drag handler calls `setTasks(newOrder)` before awaiting the API call, with no catch block that reverts state.

**Phase to address:** Kanban implementation phase. Can be added as a post-implementation fix, but causes data loss bugs if shipped without it.

---

### Pitfall 3: LaTeX Export Generates Duplicate or Colliding BibTeX Citation Keys

**What goes wrong:** The LaTeX export converts each linked paper into a BibTeX entry with a citation key (e.g., `\cite{smith2023attention}`). Two papers by different authors both generate the key `smith2023` — the export file has two `@article{smith2023, ...}` entries. When the researcher runs `pdflatex + bibtex`, one entry silently overwrites the other, citations point to the wrong paper, and there is no error in the LaTeX output.

**Why it happens:** The standard citation key formula (`LastnameYear`) is obvious and widely used. The collision case only arises with multiple papers from the same author in the same year, which is common in machine learning research.

**How to avoid:**
- Use the existing `bibtex_service.py` as the foundation — it already generates BibTeX entries for papers and websites
- Generate keys as `{first_author_lastname}{year}` then de-duplicate within the export: if `smith2023` already exists, append a letter suffix (`smith2023a`, `smith2023b`, etc.)
- Use a deterministic dedup pass: sort papers by `created_at` or `title` before assigning suffixes so the same set always produces the same keys
- Store the generated citation key on the `Paper` object during the export pass (not persisted to DB) so the `\cite{key}` references in the notes body match the `.bib` file

**Warning signs:** The export function generates keys with a simple `f"{author}{year}"` formula with no collision detection.

**Phase to address:** LaTeX export phase. This is a one-shot correctness bug — must be in scope from the start, not a follow-up fix.

---

### Pitfall 4: Notes HTML to LaTeX Conversion Drops or Corrupts Content

**What goes wrong:** The tiptap notes editor stores content as HTML (`<h1>`, `<strong>`, `<em>`, `<ul>`, `<code>`, `<math>` via KaTeX, etc.). Converting this to valid LaTeX requires a custom serializer. A naive approach that does regex substitutions on HTML strings misses nested structures, produces malformed LaTeX for tables and code blocks, and silently drops content it doesn't recognize.

Specific failure modes found via codebase analysis:
- `<math>` blocks from tiptap's Mathematics extension use KaTeX HTML rendering — the raw `data-latex` attribute holds the LaTeX source, but a naive serializer reads the rendered HTML spans instead of the attribute, producing garbage
- HTML entities like `&nbsp;`, `&amp;`, `&lt;` in note content are not decoded before LaTeX emission, producing literal `&amp;` in the `.tex` file
- Nested lists (`<ul><li><ul>...`) require `\begin{itemize}` nesting — a flat regex cannot handle this
- `<strong><em>text</em></strong>` (bold + italic combined) requires `\textbf{\textit{text}}` — HTML tag order does not map to LaTeX command order

**Why it happens:** HTML-to-LaTeX is underestimated as a parsing problem. It looks doable with regex until you encounter the edge cases above.

**How to avoid:**
- Parse the tiptap HTML into a DOM tree (use Python's `html.parser` or `lxml`, or a JS DOM library like `linkedom` in the frontend) before converting — never regex-match on raw HTML strings
- For `<math>` nodes (KaTeX): read the `data-latex` attribute, emit `$...$` or `\[...\]` — do not attempt to parse the rendered KaTeX HTML
- Convert HTML entities before LaTeX serialization: `&amp;` → `&`, `&lt;` → `<`, then LaTeX-escape special chars: `&` → `\&`, `%` → `\%`, `#` → `\#`, `_` → `\_`, `^` → `\^{}`, `~` → `\textasciitilde{}`
- Handle lists recursively, tracking nesting depth
- Document unsupported constructs (tables, raw HTML blocks) — emit a `% [unsupported: table]` comment in the output rather than silently dropping
- Consider a tree-walk approach: tiptap editor has a `getJSON()` method returning the ProseMirror document model; serializing from the JSON document model is more reliable than serializing from HTML

**Warning signs:** The LaTeX serializer uses `re.sub(r'<strong>(.*?)</strong>', r'\\textbf{\1}', html)` — this will fail for nested tags and multiline content.

**Phase to address:** LaTeX export phase. The serialization approach must be chosen correctly from the start — retrofitting a recursive tree-walker after a regex-based approach is already built requires a full rewrite of the serializer.

---

### Pitfall 5: AI Gap Analysis Suggestions Are Not Grounded in Actual Experiment Data

**What goes wrong:** The AI experiment gap analysis is prompted with the project's research questions and asks the LLM "what experiments are missing?" without providing the actual experiment tree (existing configs, metrics, statuses). The LLM invents plausible-sounding gaps that may already be covered by existing completed experiments. A researcher sees "Baseline without data augmentation" as a suggested gap but they ran exactly that experiment two weeks ago. Trust in the AI feature collapses after the third time it suggests something already done.

**Why it happens:** Fetching and serializing the full experiment tree into a prompt is extra work. It's tempting to just send the research questions and ask the LLM to reason about gaps abstractly.

**How to avoid:**
- Always include the full experiment tree context in the gap analysis prompt: experiment names, statuses, configs, and metrics
- Format the context as a structured summary, not a JSON dump: `Experiment: "Baseline" | Status: completed | Accuracy: 0.84 | Config: lr=0.001, dropout=0.2`
- Include the research questions the experiments are linked to via `rq_id`
- In the prompt, explicitly instruct: "The following experiments have already been run. Suggest only gaps that are NOT covered by the completed or running experiments listed."
- Use structured outputs (JSON mode via `response_format`) to return suggestions with: `suggestion_type` (missing_baseline | missing_ablation | missing_scale | missing_comparison), `rationale`, `proposed_config`, `addresses_rq_id`
- Never present gap suggestions without displaying which existing experiments were considered — the researcher needs to audit the context, not just the output

**Warning signs:** The gap analysis prompt contains research questions but not the experiment list. Or the prompt sends the raw experiment JSON (>8k tokens) without structuring it for readability.

**Phase to address:** AI gap analysis phase. The prompt engineering and grounding strategy must be established before building the planning board UI — the board's usefulness depends entirely on suggestion quality.

---

### Pitfall 6: Planning Board Treats AI Suggestions as Immutable, Blocking Researcher Override

**What goes wrong:** The experiment planning board displays AI-suggested experiments as cards. A researcher wants to modify a suggestion before converting it to a real experiment — changing the proposed config values, renaming the experiment, or adjusting which research question it addresses. If the UI treats suggestion cards as read-only until "accepted," the researcher cannot refine the suggestion. They either accept as-is (creating an experiment with wrong config) or reject entirely and manually create the experiment from scratch, bypassing the AI feature entirely.

**Why it happens:** It's simpler to implement a binary accept/reject model (matches the existing proposal system pattern from `proposals.py`). Editable suggestion cards require a more complex UI state.

**How to avoid:**
- Suggestion cards in the planning board must be editable before conversion: name, config key-value pairs, proposed status, and linked research question
- Treat AI suggestions as "drafts" — a `SuggestedExperiment` UI state that is separate from a `PlannedExperiment` DB entity
- Only write to the database when the researcher explicitly "promotes" a suggestion to a real experiment — at that point, write with the (potentially modified) values
- Do not implement the planning board as a clone of the `proposals.py` approve/reject binary pattern — planning board suggestions require richer editing before acceptance

**Warning signs:** The planning board card component has no editable fields — only "Accept" and "Reject" buttons.

**Phase to address:** Planning board UI phase. The edit-before-accept interaction model must be designed into the initial phase, not added later as an enhancement.

---

### Pitfall 7: Migration Numbering Collision — v1.1 Starts at Wrong Number

**What goes wrong:** v1.0 ended at migration `020_project_notes_copilot.sql`. A v1.1 developer creates `021_tasks.sql`. A separate quick-task or hotfix also creates `021_*.sql` for something else. Supabase runs both migrations or skips one silently, corrupting the schema state.

**Why it happens:** Migrations are created independently without checking the current high-water mark. The retrospective from v1.0 explicitly called this out (Pitfall 13 in the previous PITFALLS.md) but it will recur in v1.1 if not actively prevented.

**How to avoid:**
- The current highest migration is `020_project_notes_copilot.sql`
- v1.1 task database will need at minimum: `021_tasks.sql` (tasks table + task_columns table)
- Reserve the range 021-025 for v1.1 in this file and in PROJECT.md
- Any quick-task that needs a migration must claim the next number from this reserved range, not pick an arbitrary number

**Warning signs:** Two migration files with the same prefix number appear in `backend/migrations/`.

**Phase to address:** First phase of v1.1 that requires a migration. Document the number reservation before any development starts.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store task status as a free-text string column on `tasks` | Simple — just `WHERE status = 'todo'` | Cannot add custom statuses per project; every project is locked to the same status set | Never — status must be project-scoped from day one |
| Implement list view as a stripped-down Kanban (same data model, different render) | Reuses Kanban state, faster to build | List view needs sortable/filterable table behaviors that Kanban doesn't need — different state model, shared data source | Acceptable for v1.1 MVP; refactor to shared data layer in v1.2 |
| Hard-code `\documentclass{article}` in LaTeX export | Works for most papers | Researchers need `\documentclass{IEEEtran}` or `\documentclass{neurips_2024}` for submission — the export becomes useless for actual submission | Acceptable if export is labeled "draft only" — document the limitation |
| Use the same `chat_service.py` pattern for gap analysis | Code reuse, familiar pattern | Gap analysis needs a structured multi-turn context (experiment tree as context) that the linear chat history model does not provide | Never — gap analysis needs its own prompt construction, not a chat thread |
| AI suggestions stored as chat messages rather than a dedicated `experiment_suggestions` table | No new migration needed | Cannot manage suggestion lifecycle (pending/accepted/rejected/modified), cannot display suggestions in the planning board without parsing chat history | Never — suggestions are entities, not messages |

---

## Integration Gotchas

Common mistakes when connecting to external services or internal modules.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| tiptap Mathematics extension | Reading rendered KaTeX HTML spans during LaTeX export | Read the `data-latex` attribute on the `<math-inline>` or `<math-display>` node — it holds the original LaTeX source |
| Existing `bibtex_service.py` | Duplicating the BibTeX generation logic in a new `latex_service.py` | Import and call `bibtex_service.paper_to_bibtex()` from `latex_service.py` — BibTeX generation is already correct and tested |
| dnd-kit `SortableContext` | Using a single `SortableContext` wrapping all columns and cards | Use one `SortableContext` per column and a separate one for column reordering — mixing contexts causes incorrect drop target detection across column boundaries |
| Supabase JSONB for task field values | Using `->` path queries in Python-side filtering | Fetch tasks by `project_id` and filter field values in Python — avoids complex PostgREST JSONB filter syntax that is hard to reason about |
| Project `chat_service.py` / copilot pattern | Assuming the AI copilot pattern works for gap analysis | Gap analysis is a one-shot structured call, not a conversational context — use `openai.chat.completions.create()` with `response_format=json_object` directly, not the copilot history table |
| Calendar view date storage | Storing `due_date` as a TEXT column with ISO 8601 format without specifying timezone | Store as UTC ISO string `2026-04-01T00:00:00Z` and always render in local time on the frontend — a "due_date" with no time component stored as TEXT will cause off-by-one day bugs in timezones west of UTC (FullCalendar UTC-coercion issue) |

---

## Performance Traps

Patterns that work at small scale but degrade as data grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching all tasks for a project then filtering by status in JS for Kanban columns | Works fine for 20 tasks | Add a `WHERE project_id = $1` index on `tasks`; for Kanban, fetch all statuses in one query and group client-side | ~500+ tasks in a project (unlikely for v1.1 but index is free) |
| Re-rendering the full Kanban board on every task update | Imperceptible with 20 cards | Use `React.memo` on `KanbanCard` with a custom comparator; only re-render the card that changed | ~50+ cards visible simultaneously |
| Computing gap analysis on every copilot message containing the word "gap" | Gap analysis is a heavy LLM call | Gate gap analysis behind an explicit button or slash command — never trigger it on free-text input heuristics | Immediately on first misfire |
| Serializing the full experiment tree as JSON into the LaTeX export endpoint | Works fine for 30 experiments | The LaTeX export only needs experiment names and their linked papers for `\cite{}` references — fetch only what's needed | ~200+ experiments (unlikely but the habit is bad) |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Injecting unsanitized note content directly into LaTeX output | A note containing `\end{document}` or `\input{/etc/passwd}` would break or attack the researcher's local LaTeX installation | Escape all content through the LaTeX sanitizer before emission; `\` must become `\textbackslash{}` in text nodes — this is single-user but still poor practice |
| Storing AI gap suggestions in the notes table under a special "AI Suggestions" folder | Suggestions are ephemeral UI state, not notes — storing them makes delete/refresh workflows confusing | Use a separate `experiment_suggestions` table with `status: pending | accepted | rejected` — distinct from the notes system |
| Generating BibTeX citation keys from paper titles without sanitization | A paper with title containing `{`, `}`, `\`, or `@` would produce syntactically invalid BibTeX | Strip non-alphanumeric chars from all citation key components before generating the key |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Calendar view that only shows tasks with a `due_date` set — tasks without due dates are invisible | A researcher can't tell if tasks are missing from the calendar or just have no due date | Show a count of "X tasks without due dates" in the calendar header with a link to the list view filtered to undated tasks |
| Kanban columns that are fixed (`Todo / In Progress / Done`) rather than project-scoped | A researcher managing a paper submission project has no "Under Review" or "Revising" status — they abandon the Kanban and use their own tool | Status columns must be editable per project; provide a default set (`Todo / In Progress / Done`) but allow add/rename/reorder |
| LaTeX export button in the notes toolbar produces a `.tex` file without a `.bib` file | Researcher downloads the `.tex`, opens it in Overleaf, and gets `undefined citations` errors | Always export as a `.zip` containing both `notes.tex` and `references.bib`; name the `.bib` file the same as the `.tex` file so `\bibliography{notes}` works |
| AI gap analysis returns 10+ suggestions at once | Overwhelming — the researcher cannot reason about which to address first | Return at most 5 suggestions, ordered by `priority` (missing baselines first, then ablations, then scale), with a "Generate more" option |
| Planning board suggestion cards lack the rationale for why the experiment was suggested | Researcher has to trust the AI blindly or re-run the analysis to understand | Every suggestion card must show the rationale field: "This baseline is missing to establish a lower bound for RQ2" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in demos but are missing critical pieces.

- [ ] **Task database:** Verify that column definitions are project-scoped and that renaming a column updates all task values (by column ID, not name)
- [ ] **Kanban drag-and-drop:** Drag a card to a new column, immediately refresh the page — the card must still be in the new column (confirms PATCH was sent and succeeded before UI committed)
- [ ] **Kanban drag-and-drop:** Simulate a network failure during drag (disable network in DevTools, drag, re-enable) — verify the card reverts to its original column with an error toast
- [ ] **LaTeX export:** Export notes that contain math (KaTeX), code blocks, bold+italic nesting, and nested lists — verify the `.tex` file compiles without errors via `pdflatex`
- [ ] **LaTeX export:** Export notes with two papers by the same first author in the same year — verify citation keys are `smith2023a` and `smith2023b` (not two `smith2023` entries)
- [ ] **LaTeX export:** The `.zip` contains both `.tex` and `.bib` files, and `\bibliography{}` in the `.tex` matches the `.bib` filename
- [ ] **AI gap analysis:** Run gap analysis on a project that already has experiments covering all obvious gaps — verify the AI does not suggest experiments that are already marked `completed`
- [ ] **AI gap analysis:** Check that the system prompt includes the full experiment tree, not just the research questions
- [ ] **Planning board:** Edit a suggestion card's proposed config before accepting — verify the created experiment has the edited config, not the original AI-generated config
- [ ] **Calendar view:** Create a task with a due date in a timezone west of UTC (e.g., New York, UTC-5) — verify it appears on the correct calendar day, not the day before

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Task column keys stored by name (not ID), names changed, data broken | HIGH | Write a migration that reads current column definitions, assigns stable IDs, rewrites task field value keys from names to IDs; requires downtime |
| Kanban state diverged from DB without rollback | LOW | Add the `previousTasks` snapshot and rollback in the `onDragEnd` catch block; no data migration needed — only UI state was wrong |
| Duplicate BibTeX citation keys in existing exports | LOW | Regenerate export; fix the key dedup algorithm; no DB data affected |
| LaTeX serializer used regex approach, now breaks on nested tags | HIGH | Full rewrite of serializer module; existing exports produced incorrect LaTeX — users must re-export all notes |
| AI suggestions stored in notes table instead of separate table | MEDIUM | Create `experiment_suggestions` table; write migration to move "AI Suggestions" note folders to new table; delete the note folders |
| Migration number collision (two 021_*.sql files) | MEDIUM | Rename one migration to `022_*.sql`; re-run migrations in the correct order; verify schema is correct after re-run |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Task column storage by name vs. ID (Pitfall 1) | Task database schema phase (first phase) | Schema review: confirm `task_columns` table exists with `id` PK; `task_field_values` keys are column IDs |
| Kanban drag state rollback missing (Pitfall 2) | Kanban implementation phase | Manual test: drag card, simulate network failure, verify revert |
| BibTeX citation key collisions (Pitfall 3) | LaTeX export phase | Export two papers with same author + year; confirm `a`/`b` suffix dedup |
| HTML-to-LaTeX drops content (Pitfall 4) | LaTeX export phase | Export note with math, nested list, combined bold+italic; compile with `pdflatex` |
| Gap analysis not grounded in experiment data (Pitfall 5) | AI gap analysis phase | Inspect the prompt sent to OpenAI; confirm it contains the experiment tree |
| Planning board read-only suggestions (Pitfall 6) | Planning board UI phase | Edit a suggestion config field before accepting; confirm created experiment has edited values |
| Migration number collision (Pitfall 7) | First migration in v1.1 | No two migration files share the same numeric prefix |

---

## Sources

- Direct codebase analysis: `backend/migrations/020_project_notes_copilot.sql` (current migration high-water mark), `backend/services/bibtex_service.py`, `backend/services/note_service.py`, `frontend/src/components/NotesPanel.jsx`
- v1.0 retrospective: `.planning/RETROSPECTIVE.md` (pattern: sticky header debugging, detectType duplication, VERIFICATION.md gaps)
- v1.0 PITFALLS.md lessons carried forward: migration numbering (Pitfall 13), ID convention (Pitfall 11), state reset on navigation (Pitfall 12)
- dnd-kit GitHub discussion #1522: item flicker with optimistic updates + React Query (MEDIUM confidence — community discussion, matches known React state mutation patterns)
- tiptap documentation: ProseMirror schema strictness, Mathematics extension `data-latex` attribute behavior (HIGH confidence — official docs)
- FullCalendar timezone docs: UTC-coercion behavior when no timezone plugin present (HIGH confidence — official docs)
- OpenAI structured outputs guide: schema-adherence can cause hallucination when input is unrelated to schema (HIGH confidence — official docs)
- Better BibTeX for Zotero: citation key collision and non-deterministic suffix assignment in standard exporters (MEDIUM confidence — domain tooling documentation)
- Pandoc issue tracker: unicode characters (≤, β, Greek letters) failing in LaTeX output without explicit package inclusion (MEDIUM confidence — official issue tracker)

---
*Pitfalls research for: task database views, LaTeX export with citations, AI experiment gap analysis — added to ResearchOS v1.1*
*Researched: 2026-03-19*
