# ResearchOS Documentation

## Getting Started

- [Getting Started](getting-started.md) — Prerequisites, environment setup, database, running the app

## Architecture

- [Architecture Overview](architecture.md) — Two-plane design, data model conventions, service layer patterns

## Database

- [Schema Reference](database/schema.md) — All tables with columns, types, relationships, and ER overview
- [Migrations](database/migrations.md) — Migration history and how to apply them
- [Conventions](database/conventions.md) — Naming, JSONB patterns, ID formats, CamelModel mapping

## API Reference

- [Overview](api/overview.md) — Base URL, error format, camelCase convention, CORS
- [Papers](api/papers.md) — Import, CRUD, BibTeX, PDF, metadata extraction, author linking
- [Websites](api/websites.md) — Website and GitHub repo endpoints
- [Projects](api/projects.md) — Projects, experiments, research questions, project notes
- [Tasks](api/tasks.md) — Task columns, tasks, custom field definitions
- [Notes](api/notes.md) — Notes CRUD and AI generation across all scopes
- [Chat](api/chat.md) — AI copilot chat for papers, websites, repos, and notes
- [Search](api/search.md) — Lexical/semantic search and library map
- [Agents](api/agents.md) — Workflows, runs, proposals, activity feed

## Frontend

- [Routing](frontend/routing.md) — All routes with components and layout nesting
- [State Management](frontend/state-management.md) — Context, localStorage, data fetching patterns
- [Components](frontend/components.md) — Key shared components and their props

## AI System

- [Agent Architecture](ai/agents.md) — pydantic-ai setup, shared infrastructure, all workflows
- [AI Copilot](ai/copilot.md) — Chat copilot flows, agentic notes copilot, suggestion mechanism
- [Gap Analysis](ai/gap-analysis.md) — Experiment gap detection, token budget, planning board

## Developer Guides

- [Adding a New Entity](guides/adding-a-new-entity.md) — End-to-end: migration to frontend
- [Adding an Agent](guides/adding-an-agent.md) — Creating a new pydantic-ai workflow
- [Import Pipeline](guides/import-pipeline.md) — How paper/website import works

## Testing

- [Testing](testing.md) — Test strategy, running tests, CI setup
