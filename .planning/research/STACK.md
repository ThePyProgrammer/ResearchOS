# Stack Research

**Domain:** ResearchOS v1.1 — Task Database Views, LaTeX Export, AI Experiment Gap Analysis
**Researched:** 2026-03-19
**Confidence:** HIGH (all claims verified against npm registry, official docs, or existing package.json)

> This file covers only NEW stack additions for v1.1. The existing baseline (FastAPI, Supabase, React 18, Tailwind 3, tiptap 3, @dnd-kit, recharts, D3, pydantic-ai) is documented in the prior STACK.md and is NOT re-researched here.

---

## Recommended Stack

### Core Technologies (New in v1.1)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `react-big-calendar` | ^1.19.4 | Calendar view (month/week/day) for tasks by due date | The gcal/outlook-like calendar for React. Supports month + week + day views, date-fns localizer (no moment.js), Tailwind-compatible via CSS custom properties override. 754K downloads/week, actively maintained. |
| `date-fns` | ^4.1.0 | Date formatting/parsing for calendar and task fields | Required by react-big-calendar's dateFnsLocalizer. Already a transitive dep pattern in the ecosystem; pure functions, tree-shakeable. v4 is the latest stable. |
| `@tiptap/static-renderer` | ^3.20.1 | Walk tiptap JSON AST and emit custom output (LaTeX) | Part of tiptap's official package family. Accepts `nodeMapping`/`markMapping` objects to map any node type to any string output — the correct hook point for a custom LaTeX serializer. Avoids parsing HTML strings. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `html-to-latex` | 0.8.0 | Fallback HTML-fragment-to-LaTeX for nodes not covered by custom mappings | Only if the tiptap static-renderer custom mapping has gaps (e.g. complex table HTML). Last published 5 years ago — use only as a last resort for edge cases; do not use as primary export path. |

**Note on `html-to-latex`:** Version 0.8.0, last published ~5 years ago. The package is functionally stable for its limited scope but is unmaintained. Do NOT use it as the primary LaTeX export mechanism — use the tiptap static-renderer custom node mapping instead. If needed at all, isolate calls to a single helper function so it can be replaced later.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase SQL editor | Run new migration files | Follow existing numbering: `021_tasks.sql`, `022_task_columns.sql` |
| pydantic-ai structured output | Backend AI gap analysis agent | Use `output_type=list[GapSuggestion]` on the Agent; already in pyproject.toml |

---

## Detailed Decisions by Feature

### Feature 1: Kanban / List / Calendar Views

**Kanban: Custom component built on existing @dnd-kit (already installed)**

Do NOT add a pre-built Kanban library (react-kanban, @lourenci/react-kanban, etc.). These impose their own state models and fight the existing UI system. The project already has `@dnd-kit/core ^6.3.1` and `@dnd-kit/sortable ^10.0.0` — everything needed to build a Kanban board is already present.

The pattern (DndContext > SortableContext per column > useSortable per card) is well-documented with Tailwind. Multiple 2025/2026 reference implementations confirm this is the standard approach. Build it custom: ~200 lines, full control over card rendering, status column configuration, and integration with the task data model.

**List: Custom sortable table (already established pattern)**

The spreadsheet-style experiment table is already built with @dnd-kit/sortable. The task list view is a simpler case — a filterable, sortable table with checkboxes. No new library. Follow the existing Library.jsx table pattern.

**Calendar: react-big-calendar ^1.19.4 + date-fns ^4.1.0**

Calendar is the one view that genuinely requires a new library. Building a month/week calendar with correct date arithmetic, event positioning, and overflow behavior from scratch is 2,000+ lines. react-big-calendar is the standard choice:
- Supports month, week, day, and agenda views out of the box
- dateFnsLocalizer uses date-fns (no moment.js — moment is deprecated)
- Styling via CSS custom properties on `.rbc-calendar` — Tailwind can override these without SCSS
- 754K weekly downloads, v1.19.4 is the current stable release

**Why not FullCalendar:** Free tier is limited; the paid React package is $849/yr. react-big-calendar is MIT-licensed and sufficient for the task calendar use case.

**Why not building calendar from scratch:** Incorrect date arithmetic for week boundaries, DST handling, and event overlap rendering are genuinely hard. react-big-calendar has solved these.

---

### Feature 2: LaTeX Export from tiptap Notes

**Primary approach: @tiptap/static-renderer with custom nodeMapping**

tiptap's official `@tiptap/static-renderer` (v3.20.1, part of the tiptap 3 package family) accepts `nodeMapping` and `markMapping` objects that map any ProseMirror node type to any output. This is the architecturally correct hook point:

```js
import { renderToString } from '@tiptap/static-renderer'

const latexOutput = renderToString(tiptapJSON, {
  nodeMapping: {
    paragraph: (node, children) => `${children}\n\n`,
    heading:   (node, children) => `\\section{${children}}\n`,
    bold:      (node, children) => `\\textbf{${children}}`,
    // ... one mapping per node type
  },
  markMapping: {
    bold:   (mark, children) => `\\textbf{${children}}`,
    italic: (mark, children) => `\\textit{${children}}`,
    code:   (mark, children) => `\\texttt{${children}}`,
    // math marks: content is already LaTeX — pass through as-is
  }
})
```

This approach:
- Handles all tiptap node types explicitly (paragraphs, headings, lists, code blocks, tables, math)
- Preserves tiptap's KaTeX math node content (already LaTeX syntax) by passing it through directly
- Does not involve parsing HTML strings — works on the structured JSON AST
- Is part of the same tiptap 3 package family — guaranteed version compatibility with the installed `^3.20.1` packages

**BibTeX cite key generation: pure JavaScript, no library**

For `\cite{key}` references, generate cite keys from existing paper metadata (already in the database) using the standard Zotero/JabRef pattern: `{firstAuthorLastname}{year}` with a disambiguation suffix if needed. This is ~20 lines of JS — no library. The existing `bibtex_service.py` on the backend already generates BibTeX entries; extend it to accept a cite-key parameter and emit the `.bib` file alongside the `.tex` file.

**LaTeX document structure: string template**

Wrap the serialized body in a hardcoded `\documentclass{article}` + `\usepackage{...}` + `\bibliography{refs}` template. No library needed. The researcher controls structure via the note content, not a document template engine.

**What NOT to do:**
- Do not use tiptap's official Conversion Service (DOCX/PDF export) — it is a cloud API with a paid tier; LaTeX is not a supported format
- Do not use `html-to-latex` as the primary path — it is unmaintained and does not understand tiptap's custom node types (wikilinks, math, code blocks with language)
- Do not invoke pandoc server-side — would require adding a system dependency, violating "no new infrastructure"

---

### Feature 3: AI Experiment Gap Analysis

**Backend: pydantic-ai with structured output_type (already installed)**

pydantic-ai reached v1 in September 2025 (API stability guaranteed). The gap analysis agent pattern is:

```python
from pydantic import BaseModel
from pydantic_ai import Agent

class GapSuggestion(BaseModel):
    type: str           # 'missing_baseline' | 'ablation' | 'hyperparameter' | 'dataset'
    title: str
    rationale: str
    suggested_config: dict | None

agent = Agent(
    'openai:gpt-4o',
    output_type=list[GapSuggestion],
    system_prompt="Analyze the experiment tree and identify gaps..."
)
```

The agent receives serialized experiment tree (names, configs, metrics, statuses) as context and returns structured suggestions. No new Python packages required — pydantic-ai `>=1.63.0` is already in `pyproject.toml`.

**Frontend planning board: custom @dnd-kit component**

The experiment planning board (drag AI suggestions into planned experiments) follows the same Kanban pattern as the task board: DndContext with two droppable zones (suggestion list, planned experiments). @dnd-kit is already installed. No new library.

**No vector search or embeddings for gap analysis in v1.1**

Gap analysis in v1.1 is prompt-based: serialize the experiment tree as structured text and pass to the LLM. Semantic similarity search over embeddings (to find related prior experiments) is a v2 concern. `umap-learn` and `numpy` are already in `pyproject.toml` for future use.

---

## Installation

```bash
# Frontend — add to package.json
npm install react-big-calendar date-fns

# Backend — no changes to pyproject.toml
# pydantic-ai already installed; gap analysis uses existing agent pattern
```

No new backend Python packages. No new infrastructure.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| react-big-calendar | FullCalendar React | Only if you need resource/room scheduling views or are on a paid plan — overkill for a task due-date calendar |
| react-big-calendar | Build calendar from scratch | Never — correct date arithmetic + event layout is genuinely complex; not worth it |
| @tiptap/static-renderer custom mapping | html-to-latex | Only for throwaway scripts or HTML from non-tiptap sources; not for tiptap content |
| @tiptap/static-renderer custom mapping | pandoc (server-side) | Only if you need the full range of LaTeX features and can accept a system dependency |
| Custom @dnd-kit Kanban | react-kanban / @lourenci/react-kanban | Only for a standalone Kanban app where you don't have an existing DnD system and don't need tight style integration |
| pydantic-ai structured output | OpenAI JSON mode directly | Only if dropping pydantic-ai entirely — not worth it when it's already installed |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `html-to-latex` as primary export path | Unmaintained (5 years), doesn't understand tiptap's custom node types (wikilinks, math, code blocks) | @tiptap/static-renderer with custom nodeMapping |
| FullCalendar React | Paid commercial license for React component; free version is JS-only | react-big-calendar (MIT) |
| moment.js localizer for react-big-calendar | moment.js is in legacy/maintenance mode; the project has recommended migration away from it | date-fns localizer (dateFnsLocalizer) |
| Pre-built Kanban libraries (react-kanban, etc.) | Impose their own data models and styling APIs; fight Tailwind + existing @dnd-kit setup | Custom component using existing @dnd-kit/sortable |
| Tiptap Cloud Conversion API | Paid cloud service; LaTeX not supported anyway | @tiptap/static-renderer custom mapping |
| LangChain / LlamaIndex for gap analysis | Heavy frameworks with many abstractions; pydantic-ai is already installed and sufficient for a single structured-output agent call | pydantic-ai with output_type |

---

## Stack Patterns by Variant

**If the task calendar needs only month view (minimum viable):**
- Use react-big-calendar with just the `month` view prop — the other views are opt-in
- Skip importing day/agenda CSS overrides until needed

**If LaTeX export needs to handle complex tiptap tables:**
- The tiptap table node has a complex nested structure (tableRow > tableCell > content)
- Walk the table node recursively in the nodeMapping function using standard LaTeX tabular environment
- If the table is too complex, fall back to a comment `% [table omitted — paste from tiptap]` rather than importing html-to-latex

**If gap analysis needs more context than fits in a single prompt:**
- Use pydantic-ai's multi-turn agent with tools: one tool to `get_experiment_subtree(id)`, one to `get_project_notes(id)`
- The agent calls tools as needed to gather context before producing the GapSuggestion list
- This is pydantic-ai's native pattern — no new library needed

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `react-big-calendar@^1.19.4` | `react@^18.3.1` | Fully compatible with React 18 |
| `react-big-calendar@^1.19.4` | `date-fns@^4.1.0` | dateFnsLocalizer requires date-fns; v4 is current stable |
| `@tiptap/static-renderer@^3.20.1` | `@tiptap/react@^3.20.1` | Same version family — guaranteed compatible |
| `date-fns@^4.1.0` | `react-big-calendar@^1.19.4` | react-big-calendar includes its own peer dep declaration for date-fns |

---

## Sources

- npm registry (verified via Node.js HTTPS request) — `react-big-calendar@1.19.4`, `html-to-latex@0.8.0`, `date-fns@4.1.0`
- [react-big-calendar GitHub releases](https://github.com/jquense/react-big-calendar/releases) — v1.19.4 confirmed latest; date-fns localizer confirmed supported
- [@tiptap/static-renderer official docs](https://tiptap.dev/docs/editor/api/utilities/static-renderer) — nodeMapping/markMapping API confirmed; custom output formats supported
- [tiptap 3.0 stable release notes](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable) — static-renderer is part of official package family at ^3.20.x
- [pydantic-ai output docs](https://ai.pydantic.dev/output/) — output_type structured results confirmed; V1 API stability since September 2025
- [html-to-latex GitHub](https://github.com/jdalrymple/html-to-latex) — LOW confidence for primary use; last published 5 years ago
- [dnd-kit Kanban implementations](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) — MEDIUM confidence; confirms custom @dnd-kit Kanban is standard practice in 2026
- Existing `frontend/package.json` — confirmed @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^10.0.0, @tiptap/react ^3.20.1 already installed
- Existing `backend/pyproject.toml` — confirmed pydantic-ai >=1.63.0 already installed

---
*Stack research for: ResearchOS v1.1 — Task Views, LaTeX Export, AI Gap Analysis*
*Researched: 2026-03-19*
