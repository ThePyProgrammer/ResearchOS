# Database Migrations

## How to Run

### Fresh Install

For a new database, run `backend/migrations/schema.sql` once in the Supabase SQL Editor. This single file contains the complete merged schema (all tables, indexes, storage bucket, and policies) and is safe to re-run — every statement uses `IF NOT EXISTS`.

### Incremental Migrations

If you have an existing database and need to apply only recent changes, run the numbered migration files in order in the Supabase SQL Editor. Each file is idempotent where possible.

**Note: RLS is disabled on all tables.** The application runs in a single-user context and uses the Supabase anon/publishable key directly. Do not enable RLS unless you add proper auth policies.

---

## Migration History

| File | What it adds |
|---|---|
| `001_init.sql` | Base tables: `papers`, `collections`, `libraries`, `workflows`, `runs`, `proposals`, `activity`. Creates `pdfs` storage bucket with read/write policies. |
| `002_add_paper_urls.sql` | Adds `github_url`, `website_url` columns to `papers`. |
| `002_library_id.sql` | Adds `library_id` column to `papers`, `collections`, `websites`. |
| `003_notes.sql` | Creates `notes` table with `paper_id`, `name`, `parent_id`, `type`, `content`, `created_at`, `updated_at`. |
| `003_add_links.sql` | Adds `links` JSONB column to `papers` and `websites`. |
| `003_auto_notes.sql` | Adds `auto_note_enabled` (boolean) and `auto_note_prompt` (text) to `libraries`. |
| `004_chat_messages.sql` | Creates `chat_messages` table for AI copilot history (paper-scoped initially). |
| `004_website_notes.sql` | Adds `website_id` to `notes` (makes `paper_id` nullable to support website notes). |
| `005_paper_texts.sql` | Creates `paper_texts` table for cached PDF text extraction. |
| `006_chat_suggestions.sql` | Adds `suggestions` JSONB column to `chat_messages` for note edit/create suggestions. |
| `007_website_chat.sql` | Adds `website_id` to `chat_messages`, makes `paper_id` nullable. |
| `008_paper_published_date.sql` | Adds `published_date` TEXT column to `papers` (full ISO date; `year` kept for backwards compat). |
| `009_authors.sql` | Creates `authors` and `paper_authors` tables with indexes. |
| `010_github_repos.sql` | Creates `github_repos` table with unique URL index. |
| `011_github_repo_notes_chat.sql` | Adds `github_repo_id` to `notes` and `chat_messages`. |
| `012_library_notes.sql` | Adds `library_id` to `notes` to support library-level notes (Notes page). |
| `013_notes_copilot_history.sql` | Adds `library_id` FK to `chat_messages` for Notes Copilot history persistence. |
| `014_pin_notes.sql` | Adds `is_pinned` BOOLEAN column to `notes`. |
| `015_projects.sql` | Creates `projects` table with FK to `libraries`. |
| `016_project_notes.sql` | Adds `project_id` to `notes` for project-scoped notes. |
| `017_research_questions.sql` | Creates `research_questions` and `rq_papers` tables. |
| `018_project_github_repos.sql` | Creates `project_papers` table (paper/website/repo links to projects). |
| `019_experiments.sql` | Creates `experiments` and `experiment_papers` tables. |
| `020_project_notes_copilot.sql` | Adds `project_id` to `chat_messages` for the project Notes Copilot. |
| `021_task_database.sql` | Creates `task_columns`, `tasks`, and `task_field_defs` tables. |
| `schema.sql` | Canonical merged schema for fresh installs (replaces running 001–021 individually). |

---

## Startup Migration Check

On every server startup, `backend/app.py` runs `_check_migrations()`, which probes for known optional columns and logs a warning with actionable SQL if any are missing. No DDL is auto-applied — the developer must run missing migrations manually in the Supabase SQL Editor.

Currently checked: `chat_messages.library_id` (required for Notes Copilot history).
