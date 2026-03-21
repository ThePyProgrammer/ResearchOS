# Database Schema

## ER Overview

```
libraries ──< papers
          ──< websites
          ──< github_repos
          ──< collections
          ──< projects ──< experiments ──< experiment_papers
          |              ──< research_questions ──< rq_papers
          |              ──< project_papers
          |              ──< task_columns ──< tasks
          |              ──< task_field_defs
          |              ──< notes (project_id)
          |              ──< chat_messages (project_id via notes-copilot)
          ──< notes (library_id)
          ──< chat_messages (library_id via notes-copilot)
          ──< runs ──< proposals

papers ──< paper_authors >── authors
       ──< notes
       ──< chat_messages
       ──< paper_texts

websites ──< notes
         ──< chat_messages

github_repos ──< notes
             ──< chat_messages

proposals >── papers
          >── runs
```

---

## Domain: Library

### `libraries`

Top-level namespace for all research items. All papers, websites, collections, and projects belong to a library.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key (e.g., `lib_default`) |
| `name` | TEXT | NO | — | Display name |
| `description` | TEXT | YES | — | |
| `auto_note_enabled` | BOOLEAN | NO | `false` | Enable AI auto-notes on import/upload |
| `auto_note_prompt` | TEXT | YES | — | Custom prompt for AI note generation |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

RLS: disabled.

---

## Domain: Papers

### `papers`

Academic papers and preprints. The primary library item type.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `title` | TEXT | NO | — | |
| `authors` | JSONB | NO | `[]` | Array of author name strings |
| `year` | INTEGER | NO | — | Publication year (kept for backwards compat) |
| `published_date` | TEXT | YES | — | Full ISO date (e.g., `2023-06-15`) |
| `venue` | TEXT | NO | `''` | Conference or journal name |
| `doi` | TEXT | YES | — | Digital Object Identifier |
| `arxiv_id` | TEXT | YES | — | arXiv identifier (e.g., `2301.12345`) |
| `status` | TEXT | NO | `'inbox'` | `inbox`, `to-read`, `read` |
| `tags` | JSONB | NO | `[]` | Array of tag strings |
| `abstract` | TEXT | YES | — | |
| `source` | TEXT | NO | `'human'` | `human` or `agent` |
| `agent_run` | JSONB | YES | — | `{id, name, run_number}` — agent run that proposed this paper |
| `relevance_score` | INTEGER | YES | — | 0–100 score from agent screening |
| `agent_reasoning` | TEXT | YES | — | Agent's explanation of relevance |
| `rejected` | BOOLEAN | NO | `false` | Whether rejected during agent review |
| `collections` | JSONB | NO | `[]` | Array of collection IDs this paper belongs to |
| `pdf_url` | TEXT | YES | — | Public URL to PDF (Supabase storage or external) |
| `github_url` | TEXT | YES | — | Related GitHub repository URL |
| `website_url` | TEXT | YES | — | Related project website URL |
| `links` | JSONB | NO | `[]` | Array of `{name, url}` named links |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `item_type` | TEXT | NO | `'paper'` | Discriminator field; always `'paper'` |

RLS: disabled.

### `paper_texts`

Cached extracted text from PDFs, used for AI note generation and copilot context.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `paper_id` | TEXT | NO | — | Primary key; FK → `papers.id` |
| `markdown` | TEXT | NO | `''` | Extracted content as Markdown |
| `page_count` | INTEGER | NO | `0` | Number of pages |
| `extracted_at` | TEXT | NO | — | ISO 8601 timestamp |

RLS: disabled.

---

## Domain: Websites

### `websites`

Web pages and online resources.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `title` | TEXT | NO | — | |
| `url` | TEXT | NO | — | Canonical URL (unique) |
| `authors` | JSONB | NO | `[]` | Array of author name strings |
| `published_date` | TEXT | YES | — | ISO date |
| `description` | TEXT | YES | — | Page description or og:description |
| `tags` | JSONB | NO | `[]` | Array of tag strings |
| `status` | TEXT | NO | `'inbox'` | `inbox`, `to-read`, `read` |
| `source` | TEXT | NO | `'human'` | `human` or `agent` |
| `github_url` | TEXT | YES | — | Related GitHub URL |
| `links` | JSONB | NO | `[]` | Array of `{name, url}` named links |
| `collections` | JSONB | NO | `[]` | Array of collection IDs |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `item_type` | TEXT | NO | `'website'` | Discriminator field; always `'website'` |

RLS: disabled.

---

## Domain: GitHub Repos

### `github_repos`

GitHub repositories tracked in the library.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `title` | TEXT | NO | — | Human-readable title (repo name or CITATION.cff title) |
| `url` | TEXT | NO | — | Canonical GitHub URL (unique index) |
| `owner` | TEXT | NO | — | GitHub owner/org |
| `repo_name` | TEXT | NO | — | Repository name |
| `description` | TEXT | YES | — | GitHub short description |
| `abstract` | TEXT | YES | — | Longer description (from CITATION.cff or README) |
| `stars` | INTEGER | YES | — | Star count at time of import |
| `language` | TEXT | YES | — | Primary language |
| `topics` | JSONB | NO | `[]` | Array of GitHub topic strings |
| `authors` | JSONB | NO | `[]` | Array of author name strings |
| `published_date` | TEXT | YES | — | ISO date (created or first release) |
| `version` | TEXT | YES | — | Latest release tag |
| `doi` | TEXT | YES | — | DOI from CITATION.cff |
| `license` | TEXT | YES | — | SPDX license identifier |
| `website_url` | TEXT | YES | — | Project homepage URL |
| `links` | JSONB | NO | `[]` | Array of `{name, url}` named links |
| `tags` | JSONB | NO | `[]` | Array of tag strings |
| `status` | TEXT | NO | `'inbox'` | `inbox`, `to-read`, `read` |
| `source` | TEXT | NO | `'human'` | `human` or `agent` |
| `collections` | JSONB | NO | `[]` | Array of collection IDs |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `item_type` | TEXT | NO | `'github_repo'` | Discriminator field; always `'github_repo'` |

Indexes: `idx_github_repos_url` (unique), `idx_github_repos_library`, `idx_github_repos_status`, `idx_github_repos_published`.

RLS: disabled.

---

## Domain: Collections

### `collections`

Hierarchical folders that group papers, websites, and repos. Items declare membership via their `collections` JSONB column — there is no join table.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `name` | TEXT | NO | — | Display name |
| `parent_id` | TEXT | YES | — | FK → `collections.id` (self-referential) |
| `type` | TEXT | NO | `'folder'` | `folder` or `agent-output` |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |

Note: `paper_count` is a computed field added by the service layer at query time — it is not stored in the database.

RLS: disabled.

---

## Domain: Authors

### `authors`

Normalized author records with profile information. Authors can be linked to papers via `paper_authors`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `name` | TEXT | NO | — | Display name |
| `name_normalized` | TEXT | NO | — | Lowercase, normalized for dedup/search |
| `orcid` | TEXT | YES | — | ORCID identifier (unique, nullable) |
| `google_scholar_url` | TEXT | YES | — | |
| `github_username` | TEXT | YES | — | |
| `openreview_url` | TEXT | YES | — | |
| `website_url` | TEXT | YES | — | Personal/lab website |
| `emails` | JSONB | NO | `[]` | Array of email strings |
| `affiliations` | JSONB | NO | `[]` | Array of `{institution, role, start_date, end_date}` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

Indexes: `idx_authors_name_normalized`, `idx_authors_orcid` (unique, partial — only non-null ORCID values).

RLS: disabled.

### `paper_authors`

Join table linking papers to their structured author records.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `paper_id` | TEXT | NO | — | FK → `papers.id` ON DELETE CASCADE |
| `author_id` | TEXT | NO | — | FK → `authors.id` ON DELETE CASCADE |
| `position` | INTEGER | NO | `0` | Author order (0-indexed) |
| `raw_name` | TEXT | NO | `''` | Original name string from the paper |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

Unique constraint: `(paper_id, author_id)`.

Indexes: `idx_paper_authors_paper`, `idx_paper_authors_author`.

RLS: disabled.

---

## Domain: Notes

### `notes`

A file-tree note system. Each note belongs to exactly one parent scope: a paper, website, GitHub repo, project, experiment, or library. Notes form a tree via `parent_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `paper_id` | TEXT | YES | — | Scope: FK → `papers.id`; null for other scopes |
| `website_id` | TEXT | YES | — | Scope: FK → `websites.id`; null for other scopes |
| `github_repo_id` | TEXT | YES | — | Scope: FK → `github_repos.id`; null for other scopes |
| `library_id` | TEXT | YES | — | Scope: FK → `libraries.id`; null for item-scoped notes |
| `project_id` | TEXT | YES | — | Scope: FK → `projects.id`; null for other scopes |
| `experiment_id` | TEXT | YES | — | Scope: FK → `experiments.id`; null for other scopes |
| `name` | TEXT | NO | — | File or folder name |
| `parent_id` | TEXT | YES | — | FK → `notes.id` (self-referential) |
| `type` | TEXT | NO | `'file'` | `file` or `folder` |
| `content` | TEXT | NO | `''` | HTML content (for files) |
| `is_pinned` | BOOLEAN | NO | `false` | Pin to top of file tree |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `updated_at` | TEXT | NO | — | ISO 8601 timestamp |

Index: `idx_notes_library` on `library_id`.

RLS: disabled.

---

## Domain: Chat

### `chat_messages`

AI copilot conversation history. Each message belongs to exactly one context scope.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `paper_id` | TEXT | YES | — | Scope: paper copilot |
| `website_id` | TEXT | YES | — | Scope: website copilot |
| `github_repo_id` | TEXT | YES | — | Scope: GitHub repo copilot |
| `library_id` | TEXT | YES | — | Scope: Notes Copilot (library-level); FK → `libraries.id` ON DELETE CASCADE |
| `role` | TEXT | NO | `'user'` | `user` or `assistant` |
| `content` | TEXT | NO | `''` | Message text |
| `suggestions` | JSONB | YES | — | Array of note suggestion objects (assistant only) |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

Index: `idx_chat_messages_library_id`.

RLS: disabled.

---

## Domain: Projects & Experiments

### `projects`

Research projects that group experiments, research questions, tasks, and notes.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `name` | TEXT | NO | — | |
| `description` | TEXT | YES | — | |
| `status` | TEXT | NO | `'active'` | `active`, `paused`, `completed`, `archived` |
| `library_id` | TEXT | NO | — | FK → `libraries.id` ON DELETE CASCADE |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `updated_at` | TEXT | NO | — | ISO 8601 timestamp |

Index: `idx_projects_library_id`.

Note: `experiment_count` is computed by the service layer, not stored.

### `experiments`

Individual experiment runs or groups within a project. Experiments form a tree via `parent_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `parent_id` | TEXT | YES | — | FK → `experiments.id` (self-referential) |
| `rq_id` | TEXT | YES | — | FK → `research_questions.id` (optional linkage) |
| `name` | TEXT | NO | — | |
| `status` | TEXT | NO | `'planned'` | `planned`, `running`, `completed`, `failed` |
| `config` | JSONB | NO | `{}` | Experiment hyperparameters/configuration |
| `metrics` | JSONB | NO | `{}` | Results and metrics |
| `position` | INTEGER | NO | `0` | Sibling ordering |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `updated_at` | TEXT | NO | — | ISO 8601 timestamp |

### `experiment_papers`

Items (papers, websites, repos) linked to a specific experiment.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `experiment_id` | TEXT | NO | — | FK → `experiments.id` ON DELETE CASCADE |
| `paper_id` | TEXT | YES | — | FK → `papers.id` |
| `website_id` | TEXT | YES | — | FK → `websites.id` |
| `github_repo_id` | TEXT | YES | — | FK → `github_repos.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

### `research_questions`

Research questions organized within a project. Support a tree structure via `parent_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `parent_id` | TEXT | YES | — | FK → `research_questions.id` (self-referential) |
| `question` | TEXT | NO | — | The research question text |
| `hypothesis` | TEXT | YES | — | Optional hypothesis |
| `status` | TEXT | NO | `'open'` | `open`, `investigating`, `answered`, `discarded` |
| `position` | INTEGER | NO | `0` | Sibling ordering |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `updated_at` | TEXT | NO | — | ISO 8601 timestamp |

### `rq_papers`

Items linked to a specific research question.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `rq_id` | TEXT | NO | — | FK → `research_questions.id` ON DELETE CASCADE |
| `paper_id` | TEXT | YES | — | FK → `papers.id` |
| `website_id` | TEXT | YES | — | FK → `websites.id` |
| `github_repo_id` | TEXT | YES | — | FK → `github_repos.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

### `project_papers`

Items linked to a project (project-level reading list, separate from experiment-level).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `paper_id` | TEXT | YES | — | FK → `papers.id` |
| `website_id` | TEXT | YES | — | FK → `websites.id` |
| `github_repo_id` | TEXT | YES | — | FK → `github_repos.id` |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

---

## Domain: Tasks

### `task_columns`

Kanban-style status columns for a project's task board.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `name` | TEXT | NO | — | Column label (e.g., "To Do", "In Progress") |
| `color` | TEXT | NO | `'#94a3b8'` | Hex color for the column header |
| `position` | INTEGER | NO | `0` | Column order |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

Index: `idx_task_columns_project_id`.

RLS: disabled.

### `tasks`

Individual tasks on the project board.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `column_id` | TEXT | NO | — | FK → `task_columns.id` ON DELETE RESTRICT |
| `title` | TEXT | NO | — | Task title |
| `description` | TEXT | YES | — | Longer description |
| `priority` | TEXT | NO | `'none'` | `high`, `medium`, `low`, `none` |
| `due_date` | TEXT | YES | — | ISO date string |
| `tags` | JSONB | NO | `[]` | Array of tag strings |
| `custom_fields` | JSONB | NO | `{}` | Map of field def ID → value |
| `position` | INTEGER | NO | `0` | Order within column |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |
| `updated_at` | TEXT | NO | — | ISO 8601 timestamp |

Indexes: `idx_tasks_project_id`, `idx_tasks_column_id`.

RLS: disabled.

### `task_field_defs`

Custom field definitions for a project's tasks.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `project_id` | TEXT | NO | — | FK → `projects.id` ON DELETE CASCADE |
| `name` | TEXT | NO | — | Field label |
| `field_type` | TEXT | NO | — | `text`, `number`, `date`, `select`, `multi_select` |
| `options` | JSONB | NO | `[]` | Array of option strings (for `select`/`multi_select`) |
| `position` | INTEGER | NO | `0` | Display order |
| `created_at` | TEXT | NO | — | ISO 8601 timestamp |

Index: `idx_task_field_defs_project_id`.

RLS: disabled.

---

## Domain: Runs, Proposals, Activity

### `workflows`

Read-only catalog of available agent workflows. Populated by seed data.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key (e.g., `wf1`) |
| `name` | TEXT | NO | — | Display name |
| `description` | TEXT | NO | `''` | |
| `icon` | TEXT | NO | `''` | Material Symbol icon name |
| `icon_color` | TEXT | NO | `''` | Tailwind text color class |
| `icon_bg` | TEXT | NO | `''` | Tailwind background color class |
| `status` | TEXT | NO | `'stable'` | `stable`, `beta`, `experimental` |
| `steps` | JSONB | NO | `[]` | Array of step name strings |
| `tools` | JSONB | NO | `[]` | Array of tool name strings |
| `tool_colors` | JSONB | NO | `[]` | Array of Tailwind color class strings for tools |
| `estimated_time` | TEXT | NO | `''` | Human-readable estimate (e.g., `"5–15 min"`) |
| `can_run_directly` | BOOLEAN | NO | `false` | Whether the UI shows a "Run" button |

RLS: disabled.

### `runs`

Agent workflow execution records.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `workflow_id` | TEXT | YES | — | FK → `workflows.id` |
| `workflow_name` | TEXT | NO | `''` | Display name (denormalized) |
| `prompt` | TEXT | YES | — | User prompt that triggered the run |
| `target_collection` | TEXT | YES | — | Target collection name (denormalized) |
| `target_collection_id` | TEXT | YES | — | Target collection ID |
| `constraints` | JSONB | YES | — | Array of constraint strings |
| `started_at` | TEXT | NO | — | ISO 8601 timestamp |
| `started_by` | TEXT | NO | `''` | User or agent name |
| `duration` | TEXT | YES | — | Human-readable duration (e.g., `"4m 22s"`) |
| `status` | TEXT | NO | `'running'` | `running`, `completed`, `failed` |
| `progress` | INTEGER | YES | — | 0–100 |
| `current_step` | TEXT | YES | — | Current step label |
| `logs` | JSONB | YES | — | Array of `{time, level, message}` log entries |
| `cost` | JSONB | YES | — | Cost breakdown object |
| `trace` | JSONB | YES | — | Array of `{step, status, detail}` trace steps |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |

RLS: disabled.

### `proposals`

Agent-proposed papers awaiting human review.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `paper_id` | TEXT | NO | — | FK → `papers.id` ON DELETE CASCADE |
| `run_id` | TEXT | NO | — | FK → `runs.id` ON DELETE CASCADE |
| `status` | TEXT | NO | `'pending'` | `pending`, `approved`, `rejected` |
| `checked` | BOOLEAN | NO | `true` | UI checkbox state in the proposals review page |

RLS: disabled.

### `activity`

Activity feed for the dashboard.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | — | Primary key |
| `type` | TEXT | NO | — | `agent` or `human` |
| `icon` | TEXT | NO | `''` | Material Symbol icon name |
| `icon_color` | TEXT | NO | `''` | Tailwind text color class |
| `icon_bg` | TEXT | NO | `''` | Tailwind background color class |
| `title` | TEXT | NO | — | Short description |
| `detail` | TEXT | YES | — | Secondary detail text |
| `badges` | JSONB | YES | — | Array of badge label strings |
| `time` | TEXT | NO | — | Relative time string (e.g., `"10 min ago"`) |
| `running` | BOOLEAN | YES | — | Whether the activity is still in progress |
| `progress` | INTEGER | YES | — | 0–100 |
| `current_step` | TEXT | YES | — | Step label for running activities |
| `action` | JSONB | YES | — | `{label, href}` CTA link |
| `library_id` | TEXT | YES | — | FK → `libraries.id` |

RLS: disabled.

---

## Storage

### `pdfs` bucket (Supabase Storage)

- **Public**: yes (unauthenticated reads allowed)
- **Max file size**: 50 MB
- **Allowed MIME types**: `application/pdf`
- **Path convention**: `{paper_id}.pdf`
- **Policies**: `pdfs public read`, `pdfs backend write`, `pdfs backend delete`, `pdfs backend update` (all granted to `public` role)

PDF public URL pattern: `{SUPABASE_URL}/storage/v1/object/public/pdfs/{paper_id}.pdf`
