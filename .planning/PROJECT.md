# ResearchOS — Research Projects & Experiments

## What This Is

ResearchOS is an AI-powered research operating system that currently functions as a reference manager (papers, websites, notes, AI copilot). This milestone expands it into a full research workflow platform by adding research projects and experiment tracking — so a researcher can go from research question to organized, trackable experimental work, all within the same system that holds their literature.

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

### Active

- [ ] Research projects as first-class entities (name, description, status, linked library)
- [ ] Research questions — primary RQ + sub-questions per project
- [ ] Link existing library papers/websites to a project as relevant literature
- [ ] Experiment trees — hierarchical experiment structure per project
- [ ] Leaf experiments: concrete runs with configuration parameters, key metrics, and status (planned/running/completed/failed)
- [ ] Parent experiment nodes: summarize/aggregate child experiments
- [ ] Experiment planning: define experiments before running them (planned status)
- [ ] Experiment results: record metrics, logs, and artifacts for completed runs
- [ ] Project notes & documents: free-form notes tied to a project (reuse existing notes system)
- [ ] Project dashboard: overview of a project's RQs, experiment tree status, linked papers
- [ ] Navigation: project list view, project detail view integrated into existing app shell

### Out of Scope

- Full LaTeX editor (Overleaf-like) — future milestone, after projects + experiments are solid
- Completed papers entering the library as first-class items — future milestone, depends on LaTeX editor
- Resource/timeline planning for experiments — not core to the experiment tracking model
- AI agent for experiment planning — future milestone, needs experiment infrastructure first
- AI agent for writing assistance — future milestone, depends on LaTeX editor
- AI agent for analysis/interpretation — future milestone, needs experiment data first
- AI literature discovery agents — already on existing roadmap (Phase 2-3)
- Real-time collaboration — single-user system
- External experiment runner integration (W&B, MLflow) — may add later as import source

## Context

ResearchOS already has a mature library system with papers, websites, collections, notes, and an AI copilot. The backend is FastAPI + Supabase, frontend is React + Vite + Tailwind. The existing architecture supports adding new entity types cleanly — the pattern is: Pydantic model → service → router → frontend page.

Two research workflows must be supported:
1. **Top-down**: researcher is assigned or formulates a research question, then plans experiments to answer it
2. **Bottom-up**: researcher reads literature, identifies gaps, formulates questions from those gaps, then plans experiments

Both workflows converge at the same point: a project with research questions and an experiment tree.

Experiments are fundamentally code-based (Python scripts, Jupyter notebooks, ML training runs). An experiment is characterized by its configuration (hyperparameters, settings) and measured by key metrics. Experiments form a tree — leaf nodes are concrete runs, parent nodes group and summarize related experiments. A paper's experimental section mirrors this tree structure.

## Constraints

- **Tech stack**: Must use existing stack (FastAPI, Supabase, React, Tailwind) — no new infrastructure
- **Single-user**: No auth, no multi-tenancy — same as current system
- **Database**: New tables via Supabase migrations — follow existing migration numbering
- **Frontend patterns**: Follow existing page/component patterns (Layout shell, sidebar nav, detail panels)
- **API conventions**: CamelCase JSON responses, `/api/` prefix, thin route handlers + service layer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Projects + Experiments first, LaTeX later | Need the experimental infrastructure before building a writing tool on top of it | — Pending |
| Experiment tree model (not flat list) | Mirrors how papers are structured; parent nodes summarize children naturally | — Pending |
| Reuse existing notes system for project docs | Avoid building a second notes infrastructure; tiptap editor already works well | — Pending |
| Projects link to library papers, not duplicate them | Papers live in the library; projects reference them — single source of truth | — Pending |

---
*Last updated: 2025-07-17 after initialization*
