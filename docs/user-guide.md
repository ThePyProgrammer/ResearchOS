# User Guide — Workflow Walkthrough

A practical guide for researchers who have set up ResearchOS and want to start using it. Each section covers one part of the workflow; skim the headings and jump to what you need.

---

## Getting Oriented

After opening http://localhost:5173, you land on the **Dashboard**. The left sidebar has the primary navigation:

| Sidebar item | What it is |
|---|---|
| Dashboard | Activity feed, run stats, papers-over-time chart, library health cards (Inbox / To Read / Read) |
| Library | Your full collection of papers, websites, and GitHub repos — the main table view |
| Library Map | 2D semantic scatter plot of all items (requires embeddings) |
| Library Notes | Library-wide notes IDE with AI copilot |
| Projects | Research projects, each with Literature, Experiments, Tasks, Notes, and Review tabs |
| Authors | Author directory, individual author profiles |
| Agents | Workflow catalog; start and monitor multi-step AI runs |
| Proposals | Review agent-proposed additions; approve or reject with a diff view |

At the top of every page, the **header search bar** (`Ctrl+K` / `Cmd+K`) searches across all item types using hybrid lexical + semantic search. Press `?` on any page to see active keyboard shortcuts.

---

## Building Your Library

### Importing papers

Click the **+ QuickAdd** button in the header to open the add modal. Four modes are available:

**Import mode** (DOI, arXiv ID, URL):
1. Paste any of the following and press Enter or click Import:
   - A DOI: `10.1145/3442188.3445922`
   - A bare arXiv ID: `2301.07041`
   - An arXiv URL: `https://arxiv.org/abs/2301.07041`
   - An OpenReview URL: `https://openreview.net/forum?id=...`
   - A Zenodo record URL: `https://zenodo.org/records/...`
   - Any other URL (ResearchOS will extract `og:*` / meta tags)
2. ResearchOS fetches metadata from Crossref, arXiv, or OpenReview and creates the paper. The PDF is auto-downloaded to Supabase Storage in the background.
3. If a duplicate is detected (by DOI, arXiv ID, or normalized title), you'll see a warning with match details and an "Import anyway" option.

**Upload mode** (PDF file):
1. Drag and drop a PDF onto the drop zone, or click to browse.
2. ResearchOS extracts text from the first three pages and uses an LLM to fill in the title, authors, abstract, venue, date, and DOI fields. Review and correct any errors.
3. Click **Create** to save the paper, then the PDF is uploaded to Supabase Storage.

**BibTeX mode** (.bib file import):
1. Drop a `.bib` file onto the upload area.
2. ResearchOS parses the file and shows a preview table. Entries flagged as duplicates are unchecked by default. Non-duplicate entries are checked.
3. Review the list, check or uncheck entries, and click **Confirm Import**. For arXiv entries, metadata is re-resolved to get the PDF URL. PDFs are auto-downloaded in the background.

**Website mode**:
1. Paste a URL (blog post, article, documentation page, etc.).
2. ResearchOS extracts the title, author, and description from `og:*` / `DC.*` meta tags.
3. Websites live alongside papers in the library with their own detail page, notes, and AI copilot.

### Adding GitHub repos

From QuickAdd, switch to **Website** mode and paste a GitHub repo URL (e.g., `https://github.com/owner/repo`). ResearchOS detects GitHub URLs and creates a GitHub repo item instead of a generic website. GitHub repos have their own full detail page, notes, and AI copilot.

### Collections

Collections are nested folders that appear in the sidebar under your library name. To create a collection, right-click in the sidebar or use the collection management panel on the Library page.

- Drag papers, websites, or GitHub repos from the library table onto a collection in the sidebar to add them.
- Right-click a collection in the sidebar to rename, delete, or export its contents as BibTeX.
- Collections can be nested: drag one collection onto another to reparent it.

A paper or website can belong to multiple collections. The `paperCount` shown on each collection includes all item types.

### Search and discovery

- **Header search bar** (`Ctrl+K`) performs hybrid search across titles, abstracts, and notes. When an OpenAI key is set, results include semantic neighbors (embedding-based). Without a key, it falls back to full-text lexical search.
- **Library Map** (`/library/map`) renders a 2D scatter plot of all items positioned by semantic similarity. Items cluster by topic. Brush-select a region to create a collection from a cluster.
- **Related papers** — on any paper's detail panel, a "Related" section surfaces papers from OpenAlex citation links and semantic neighbors.

---

## Taking Notes

### Opening the Notes IDE

Two ways to access notes:

1. **Item-level notes** — open any paper (`/library/paper/:id`), website (`/library/website/:id`), or GitHub repo (`/library/github-repo/:id`). The Notes IDE appears in the right panel alongside the PDF viewer or iframe.
2. **Library-level notes** — go to **Library Notes** in the sidebar. This is a shared note space for library-wide documents (literature reviews, summaries, etc.).
3. **Project-level notes** — navigate to a project and click the **Notes** tab. Project notes have access to experiment data via `@`-mention.

### Creating notes

In the file tree on the left of the IDE:
- Click **+** to create a new note file.
- Click the folder icon to create a folder.
- Right-click any file or folder to rename, pin, duplicate, or delete.
- Drag files to reorder or move them into folders.

Choose a template when creating a new file: Blank, Literature Note, Meeting Note, Experiment Log, Literature Review, or Paper Summary. Templates pre-fill structure but are fully editable.

### Editing features

- **Math rendering** — type `$` for inline LaTeX (`$E = mc^2$`) or `$$` for a display block. KaTeX renders math in place.
- **Wiki-links** — type `[[` to start an autocomplete search over all notes in scope. Clicking a rendered `[[wiki-link]]` chip navigates to that note (or opens it in a new tab for cross-item links).
- **Tables** — insert via the toolbar. Resize columns by dragging the border, right-click for row/column operations.
- **Pinned notes** — right-click a file and select Pin. Pinned notes float to the top of the file tree and appear in the "Recent" quick-access list.
- **Backlinks panel** — at the bottom of the editor, a panel shows all notes that link to the current note.

### Note graph

Click the graph icon in the IDE toolbar (or navigate to the graph view button) to open the D3 force-directed graph of all wiki-link connections. Each node is a note; edges are `[[wiki-link]]` references. Click a node to navigate to that note.

### Exporting notes

Right-click a note file or folder to export as Markdown, PDF, or LaTeX. The LaTeX export opens a modal — see [LaTeX export](#latex-export) below.

---

## Using the AI Copilot

### Item copilot (paper / website / GitHub repo)

On any paper, website, or GitHub repo detail page, click the **Copilot** tab in the right panel. The copilot has full context: the item's title, abstract, PDF text (if available), and your existing notes.

Ask any question about the paper or request note edits:

- "What are the main contributions of this paper?"
- "Summarize the experimental setup in two paragraphs"
- "Update my Literature Note to add the key equation from Section 3"

When the copilot suggests a note change, a suggestion card appears below the response with:
- A type badge: **Edit** (replaces a note's content) or **New Note** (creates a new file)
- The note name and a one-sentence description of the change
- A diff view (for edits) or a full preview (for new notes)

Click **Accept** to apply the change immediately, or **Reject** to dismiss it.

### Library notes copilot (@ mentions)

On the **Library Notes** page, the copilot panel is in the right sidebar. Type `@` to open an autocomplete picker and select items from your library as context — papers, websites, GitHub repos, or entire collections. Multiple items can be selected.

The copilot builds a context block from the selected items and their notes, then responds to your query with awareness of that material.

### Project notes copilot (agentic loop)

On the **Notes** tab of a project, the copilot runs an agentic loop (up to 6 LLM turns per request). It has two additional internal tools beyond the standard edit/create tools:

- `read_note` — reads the full content of any note before suggesting an edit
- `list_item_notes` — lists the notes tree for any item in scope (papers, experiments, etc.)

Type `@` to add papers, websites, GitHub repos, or experiments as context. For papers, you can also include the full PDF text as context.

This copilot can handle multi-step requests like: "Read my existing experiment notes, then create a new note that summarizes the common failure modes across all experiments."

Because it runs multiple turns, responses may take 10–30 seconds for complex requests.

---

## Starting a Research Project

1. Go to **Projects** in the sidebar and click **New Project**.
2. Enter a project name and optionally a description. Click **Create**.
3. The project opens on the **Overview** tab, which shows a summary, a citation network, timeline, and activity heatmap.

### Research questions

On the Overview tab, use the **Research Questions** panel to define what you're investigating:
- Click **+** to add a question.
- Set a status: Open, Investigating, Answered, or Discarded.
- Add notes using wiki-link references (`[[paper-name]]`) to anchor questions to specific sources.
- Drag questions to nest them hierarchically.

### Linking papers to a project

On the **Literature** tab, click **Link Papers** to open a search dialog that queries your library. Select papers, websites, or GitHub repos to associate with the project. Linked items:
- Appear on the Literature tab with keyword extraction
- Are available as `@`-mention context in the project notes copilot
- Provide paper abstracts for gap analysis

---

## Running Experiments

### Creating the experiment tree

Navigate to **Projects > [your project] > Experiments**. The left panel is the experiment tree.

- Click **+ Add Experiment** to create a root-level experiment.
- Hover over any experiment and click the **+** child button to add a nested sub-experiment.
- Drag experiments to reorder or reparent them.
- Each experiment has: name, status (Planned / Running / Completed / Failed), config (key-value pairs), and metrics (key-value pairs).
- Click an experiment to open its detail panel on the right: edit config and metrics inline, link papers, and view notes.

### Table view

Click **Table** in the experiments toolbar to switch to a spreadsheet-style view. All experiments appear as rows with sortable/filterable columns. Use the column visibility picker to show/hide fields. Multi-select rows for bulk actions: compare, set status, duplicate, or delete.

### CSV import

Click **Import CSV** in the experiments toolbar. Map CSV columns to experiment fields (name, status, config keys, metric keys) in the column-mapping step. Preview the rows and click **Confirm** to merge results into existing experiments or create new ones.

### Comparing experiments

Select two or more experiments in the table view (or tree view with checkboxes) and click **Compare**. A side-by-side diff panel shows config differences and metric differences highlighted.

---

## Task Management

Navigate to **Projects > [your project] > Tasks**.

### Views

Three views are available via the toolbar:

- **Kanban** — columns by status, drag cards between columns. Create tasks inline in any column.
- **List** — sortable, filterable table. Filter chips for status, priority, overdue, and custom fields. Use the **+** button to add custom field columns.
- **Calendar** — month grid. Tasks with due dates appear as colored chips. Drag unscheduled tasks from the sidebar onto a date to schedule them, or drag scheduled tasks to reschedule.

### Creating tasks

Click **+ New Task** or use the inline creation row in List view. A task has: title, description, status, priority, due date (with optional time), and tags. Click a task to open its detail panel for full editing.

### Custom fields

In List view, click **+** next to the column headers to add custom fields: text, number, date, select (single), or multi-select. Custom fields appear as columns in List view and as card metadata in Kanban.

### Custom status columns

In Kanban view, click the column header overflow menu to rename a column, change its color, or delete it (you'll be asked where to migrate tasks in the deleted column). Add new status columns via **+ Add Column**.

---

## LaTeX Export

### Inserting citations in notes

In any note, type `@` to open the citation autocomplete picker (separate from the `@`-mention context picker in the copilot). Select a paper or website to insert an author-year citation chip, e.g., `(Vaswani et al., 2017)`. Right-click a citation chip for options: open the paper, remove the citation, copy the citation key, or copy the full BibTeX entry.

### Exporting as LaTeX

Right-click a note file or folder in the IDE file tree and select **Export as LaTeX**. The export modal lets you:

1. **Select a template** — Article, IEEE, or NeurIPS
2. **Edit metadata** — title, author, abstract
3. **Reorder sections** — for folder exports, drag sections to set their order in the `.tex` file
4. **Review cited papers** — the modal lists all papers cited via `@` in the notes, with auto-generated citation keys (`smith2024`, `smith2024a`/`smith2024b` for collisions)
5. **Preview the `.tex` file** — a side-by-side panel shows syntax-highlighted raw `.tex` with a live ~500ms debounce update as you make changes

Click **Download .zip** to get a `.zip` containing the `.tex` source and a `.bib` file with all cited papers.

---

## AI Gap Analysis

Gap analysis inspects your project's experiment tree and linked papers to suggest experiments you haven't tried yet.

### Triggering analysis

Navigate to **Projects > [your project] > Experiments** and click the **Gap Analysis** tab (alongside the tree and table views). Click **Analyze Gaps**. The request is synchronous and typically takes 5–15 seconds.

The AI receives:
- Your full experiment tree (up to 80 experiments) with names, statuses, configs, and metrics
- Abstracts from your linked papers (up to 20 papers)

### Reviewing suggestions

Results appear as suggestion cards on the left. Four suggestion types:

| Badge | Meaning |
|---|---|
| Baseline | A standard comparison missing from your tree that peers commonly use |
| Ablation | A key component or hyperparameter that has not been ablated |
| Sweep | A hyperparameter tested at only one value that should be swept |
| Replication | An experiment from a cited paper that has not been replicated |

Each card shows: a type badge, experiment name, one-line rationale, config preview, and clickable paper reference chips. Click a chip to see a popover with the paper's abstract.

Click a card body to open the **detail overlay**, where you can edit the experiment name, rationale, and config values before promoting it.

### Promoting to the tree

Drag a suggestion card from the left panel and drop it onto a node in the **mini experiment tree** on the right. This creates a new planned experiment with the suggestion's name, config, and the dropped node as its parent (or at root level if dropped on the background). The full tree on the Experiments tab refreshes automatically.

Click **X** on a card to dismiss it. A 4-second undo toast appears. Dismissed suggestions are excluded from the next analysis run.

---

## Agent Workflows

### Running a workflow

1. Navigate to **Agents** in the sidebar. The workflow catalog lists available agents.
2. Click a workflow to expand it, enter a prompt describing your research goal, and optionally select a target collection.
3. Click **Run**. The backend starts the workflow as a background task and returns immediately.
4. The run appears in the active runs list with a live log stream. Progress percentage and current step are shown in real time.

Three workflows are available:

| Workflow | What it does |
|---|---|
| Literature Reviewer | Generates arXiv search queries from your prompt, fetches papers, screens them for relevance (0-10 score), and proposes the best matches for your library |
| Model Researcher | Analyzes a task description, finds relevant ML models on arXiv, scores them, and produces a model recommendation report |
| Experiment Designer | Extracts research goals, retrieves related literature, generates experiment ideas, designs the best one with a critique/refine loop, and generates a Python starter stub |

### Reviewing proposals

After a run completes, proposed papers appear on the **Proposals** page. Each proposal shows:
- Paper title, authors, abstract, and relevance tags
- The run that proposed it
- The agent's reasoning (from the screening step)

Click **Approve** to add the paper to your library (it's created in your inbox collection). Click **Reject** to discard it. Use **Batch Actions** to approve or reject all proposals at once.

The run trace — every tool call, result, and LLM step — is visible by clicking the run in the Agents page. Cost and token usage are tracked per run.
