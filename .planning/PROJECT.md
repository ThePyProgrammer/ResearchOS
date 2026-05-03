# ResearchOS — Research Projects & Experiments

## What This Is

ResearchOS is an AI-powered research operating system that combines a reference manager (papers, websites, notes, AI copilot) with a full research workflow platform — research projects, research questions, hierarchical experiment tracking with configurations and metrics, multi-format data import, spreadsheet and tree views, and a project notes IDE with wikilinks, graph view, and an AI copilot that understands experiment context.

## Core Value

A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.

## Requirements

### Validated

- ✓ Paper management (import, metadata, PDF storage, notes) — existing
- ✓ Website management (import, metadata, notes) — existing
- ✓ Collection-based organization — existing
- ✓ AI copilot for papers and websites — existing
- ✓ BibTeX import/export — existing
- ✓ Duplicate detection — existing
- ✓ Multi-library support — existing
- ✓ Research projects as first-class entities — v1.0
- ✓ Research questions — primary RQ + sub-questions per project — v1.0
- ✓ Link existing library papers/websites to a project — v1.0
- ✓ Experiment trees — hierarchical experiment structure per project — v1.0
- ✓ Leaf experiments with config, metrics, and status — v1.0
- ✓ Parent experiment nodes with aggregated summaries — v1.0
- ✓ Experiment comparison (side-by-side metrics, config diff) — v1.0
- ✓ Experiment duplication (leaf + deep clone) — v1.0
- ✓ Multi-format experiment import (CSV/JSON/JSONL/XLSX) — v1.0
- ✓ Spreadsheet-style experiment table view — v1.0
- ✓ Project notes IDE with wikilinks, graph view, AI copilot — v1.0
- ✓ Project notes & documents (tiptap editor) — v1.0
- ✓ Navigation: sidebar with collapsible project nodes — v1.0

### Active

- [ ] Project-scoped task database with custom columns and statuses
- [ ] Kanban board view for tasks (drag cards between status columns)
- [ ] List view for tasks (sortable, filterable table)
- [ ] Calendar view for tasks (month/week by due date)
- [ ] LaTeX export from notes IDE (.tex + .bib with \cite{key} references)
- [ ] LaTeX preview panel (read-only formatted output from tiptap notes)
- [ ] AI-driven experiment gap analysis (missing baselines, ablations, untested configs)
- [ ] Experiment planning board (drag AI suggestions into planned experiments)

## Current Milestone: v1.1 Research Productivity

**Goal:** Give researchers a complete project management + writing + experiment planning workflow — Notion-like task tracking with Kanban/list/calendar views, LaTeX export with citation management, and AI-powered experiment gap analysis with a planning board.

**Target features:**
- Project-scoped task database rendered as Kanban, list, or calendar
- Notes-to-LaTeX export with BibTeX citation generation from linked papers
- AI experiment planner: gap analysis, ablation suggestions, planning board

### Out of Scope

- Full LaTeX editor (Overleaf-like) — export + preview sufficient for v1.1
- Completed papers entering the library as first-class items — future
- Timeline / Gantt view for tasks — deferred to v1.2
- External experiment runner integration (W&B, MLflow) — may add as import source
- Real-time collaboration — single-user system
- Offline mode — not needed for desktop research workflow

## Context

ResearchOS has a mature library system (papers, websites, collections, notes, AI copilot) plus a complete research workflow platform. The backend is FastAPI + Supabase (20 migrations), frontend is React + Vite + Tailwind. ~26,000 LOC across 151 code files.

Two research workflows are supported:
1. **Top-down**: researcher formulates a research question, then plans experiments to answer it
2. **Bottom-up**: researcher reads literature, identifies gaps, formulates questions, then plans experiments

Both workflows converge at a project with research questions, linked literature, and an experiment tree. The experiment tree supports hierarchical grouping, config/metrics tracking, multi-format import, comparison, and duplication. A full notes IDE with wikilinks and graph view connects everything.

## Constraints

- **Tech stack**: FastAPI, Supabase, React, Tailwind — no new infrastructure
- **Single-user**: No auth, no multi-tenancy
- **Database**: Supabase migrations (001-020)
- **Frontend patterns**: Layout shell, sidebar nav, detail panels
- **API conventions**: CamelCase JSON responses, `/api/` prefix, thin route handlers + service layer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Projects + Experiments first, LaTeX later | Need experimental infrastructure before writing tools | ✓ Good — shipped full experiment tracking |
| Experiment tree model (not flat list) | Mirrors paper structure; parent nodes summarize children | ✓ Good — natural grouping + aggregation |
| Reuse existing notes system for project docs | Avoid second notes infrastructure; tiptap works well | ✓ Good — extended to full IDE with wikilinks + graph |
| Projects link to library papers, not duplicate them | Single source of truth via join table | ✓ Good — clean separation, literature tab works well |
| Client-side CSV/format parsing (no backend roundtrip) | Simpler architecture, instant preview | ✓ Good — supports CSV/JSON/JSONL/XLSX |
| Config inheritance uses child-wins semantics | Parent config cascades to children without DB changes | ✓ Good — enables comparison across tree levels |
| Separate ProjectNotesIDE from LibraryNotes | Different data sources, avoid coupling | ✓ Good — shared components (NoteGraphView, NotesCopilotPanel) with prop injection |

---
*Last updated: 2026-03-19 after v1.1 milestone started*
