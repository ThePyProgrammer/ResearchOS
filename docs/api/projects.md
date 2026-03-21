# Projects API

Projects group experiments, research questions, tasks, and notes within a library. All project endpoints are under `/api/projects`.

---

## Projects CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/{id}` | Get a project |
| PATCH | `/api/projects/{id}` | Update a project |
| DELETE | `/api/projects/{id}` | Delete a project |

### GET /api/projects

Query parameters:

| Parameter | Description |
|---|---|
| `library_id` | Filter by library |

Returns an array of Project objects.

### POST /api/projects

Request body (`ProjectCreate`):

```json
{
  "name": "RAG Optimization Study",
  "description": "Investigating retrieval strategies for dense passage retrieval.",
  "status": "active",
  "libraryId": "lib_default"
}
```

Valid statuses: `active`, `paused`, `completed`, `archived`.

Returns the created Project at `201`.

### PATCH /api/projects/{id}

Partial update. Valid fields: `name`, `description`, `status`.

### Project Object Shape

```json
{
  "id": "proj_abc123",
  "name": "RAG Optimization Study",
  "description": "...",
  "status": "active",
  "libraryId": "lib_default",
  "createdAt": "2024-03-15T10:00:00Z",
  "updatedAt": "2024-03-15T10:00:00Z",
  "experimentCount": 5
}
```

`experimentCount` is computed at query time, not stored.

---

## Project Items (Papers / Websites / Repos)

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/papers` | List item links for a project |
| POST | `/api/projects/{id}/papers` | Link an item to a project |
| DELETE | `/api/projects/{id}/papers/{link_id}` | Remove an item link |

### POST /api/projects/{id}/papers

Request body (`ProjectPaperCreate`): specify one of the three item types.

```json
{ "paperId": "p_abc123" }
```

```json
{ "websiteId": "w_def456" }
```

```json
{ "githubRepoId": "gh_xyz789" }
```

Returns the created `ProjectPaper` link at `201`:

```json
{
  "id": "pp_abc123",
  "projectId": "proj_abc123",
  "paperId": "p_abc123",
  "websiteId": null,
  "githubRepoId": null,
  "createdAt": "2024-03-15T10:00:00Z"
}
```

---

## Keyword Extraction

### POST /api/projects/{id}/papers/extract-keywords

Extract AI keyword tags for all untagged papers in the project using `gpt-4o-mini`. Papers that already have tags or lack an abstract are skipped.

Returns:

```json
{
  "updated": 8,
  "skipped": 3,
  "total": 11
}
```

---

## Experiments

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/experiments` | List all experiments in a project |
| POST | `/api/projects/{id}/experiments` | Create an experiment |
| POST | `/api/projects/{id}/experiments/import-csv` | Bulk import experiments |
| PATCH | `/api/experiments/{id}` | Update an experiment |
| DELETE | `/api/experiments/{id}` | Delete an experiment |
| POST | `/api/experiments/{id}/reorder` | Reorder sibling experiments |
| POST | `/api/experiments/{id}/duplicate` | Duplicate an experiment |

### POST /api/projects/{id}/experiments

Request body (`ExperimentCreate`):

```json
{
  "name": "Baseline: BM25",
  "parentId": null,
  "rqId": "rq_abc123",
  "status": "planned",
  "config": { "retriever": "bm25", "top_k": 10 },
  "metrics": {}
}
```

Valid statuses: `planned`, `running`, `completed`, `failed`.

`parentId` sets the parent experiment for tree grouping.

Returns the created Experiment at `201`.

### POST /api/projects/{id}/experiments/import-csv

Bulk-create an experiment tree from a BFS-ordered list. Parents must appear before their children.

Request body (`ExperimentImportRequest`):

```json
{
  "items": [
    {
      "tmpId": "tmp_1",
      "parentTmpId": null,
      "name": "Retriever Study",
      "config": {},
      "metrics": {},
      "collisionAction": "create"
    },
    {
      "tmpId": "tmp_2",
      "parentTmpId": "tmp_1",
      "name": "BM25",
      "config": { "top_k": 10 },
      "metrics": { "recall@10": 0.72 },
      "collisionAction": "update",
      "existingId": "exp_existing"
    }
  ],
  "parentId": null,
  "mergeMetrics": false
}
```

`collisionAction` values: `create` (always create new), `update` (update `existingId`), `skip`.

Returns an array of `ExperimentImportResult`:

```json
[
  { "tmpId": "tmp_1", "status": "created", "id": "exp_new123" },
  { "tmpId": "tmp_2", "status": "updated", "id": "exp_existing" }
]
```

### PATCH /api/experiments/{id}

Partial update. Fields: `name`, `status`, `parentId`, `rqId`, `config`, `metrics`, `position`.

### POST /api/experiments/{id}/reorder

Reorder sibling experiments by providing the new ordered list of IDs.

Request body:

```json
{ "ids": ["exp_b", "exp_a", "exp_c"] }
```

Returns `204`.

### POST /api/experiments/{id}/duplicate

Duplicate an experiment. Add `?deep=true` to also duplicate all descendants.

Returns the duplicated Experiment at `201`.

### Experiment Object Shape

```json
{
  "id": "exp_abc123",
  "projectId": "proj_abc123",
  "parentId": null,
  "rqId": null,
  "name": "Baseline: BM25",
  "status": "planned",
  "config": { "retriever": "bm25", "top_k": 10 },
  "metrics": { "recall@10": 0.72, "precision@10": 0.41 },
  "position": 0,
  "createdAt": "2024-03-15T10:00:00Z",
  "updatedAt": "2024-03-15T10:00:00Z"
}
```

---

## Experiment Items (Papers / Websites / Repos)

| Method | Path | Description |
|---|---|---|
| GET | `/api/experiments/{id}/papers` | List item links for an experiment |
| POST | `/api/experiments/{id}/papers` | Link an item to an experiment |
| DELETE | `/api/experiments/{id}/papers/{link_id}` | Remove an item link |

### POST /api/experiments/{id}/papers

Request body (`ExperimentPaperCreate`): same as `ProjectPaperCreate`, specify one of `paperId`, `websiteId`, `githubRepoId`.

---

## Experiment Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/experiments/{id}/notes` | List notes for an experiment |
| POST | `/api/experiments/{id}/notes` | Create a note for an experiment |

See [notes.md](notes.md) for the `NoteCreate` request body.

---

## Research Questions

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/research-questions` | List all RQs in a project |
| POST | `/api/projects/{id}/research-questions` | Create a research question |
| PATCH | `/api/research-questions/{id}` | Update a research question |
| DELETE | `/api/research-questions/{id}` | Delete a research question |
| POST | `/api/research-questions/{id}/reorder` | Reorder sibling RQs |

### POST /api/projects/{id}/research-questions

Request body (`ResearchQuestionCreate`):

```json
{
  "question": "Does dense retrieval outperform BM25 on domain-specific corpora?",
  "parentId": null,
  "position": 0
}
```

Returns the created `ResearchQuestion` at `201`.

### PATCH /api/research-questions/{id}

Fields: `question`, `hypothesis`, `status`, `parentId`, `position`.

Valid statuses: `open`, `investigating`, `answered`, `discarded`.

### POST /api/research-questions/{id}/reorder

Request body: `{ "ids": ["rq_b", "rq_a"] }`. Returns `204`.

### Research Question Object Shape

```json
{
  "id": "rq_abc123",
  "projectId": "proj_abc123",
  "parentId": null,
  "question": "Does dense retrieval outperform BM25 on domain-specific corpora?",
  "hypothesis": "DPR will outperform BM25 by >5% recall@10.",
  "status": "open",
  "position": 0,
  "createdAt": "2024-03-15T10:00:00Z",
  "updatedAt": "2024-03-15T10:00:00Z"
}
```

---

## RQ Items (Papers / Websites / Repos)

| Method | Path | Description |
|---|---|---|
| GET | `/api/research-questions/{id}/papers` | List item links for an RQ |
| POST | `/api/research-questions/{id}/papers` | Link an item to an RQ |
| DELETE | `/api/research-questions/{id}/papers/{link_id}` | Remove an item link |

### POST /api/research-questions/{id}/papers

Request body (`RqPaperCreate`): same as `ProjectPaperCreate`, specify one of `paperId`, `websiteId`, `githubRepoId`.

---

## Project Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/notes` | List notes for a project |
| POST | `/api/projects/{id}/notes` | Create a note for a project |

See [notes.md](notes.md) for the `NoteCreate` request body.

---

## Project Notes Copilot

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/notes-copilot` | List copilot chat history for a project |
| POST | `/api/projects/{id}/notes-copilot` | Send a message to the project notes copilot |
| DELETE | `/api/projects/{id}/notes-copilot` | Clear copilot chat history |

### POST /api/projects/{id}/notes-copilot

Agentic endpoint. The model can call tools (`read_note`, `list_item_notes`) before producing a response. Supports experiment context items with `config`, `metrics`, and `children` in the metadata field.

Request body (`ProjectNotesCopilotMessageCreate`):

```json
{
  "content": "Summarize the performance gap between experiments.",
  "contextItems": [
    {
      "type": "experiment",
      "id": "exp_abc123",
      "name": "Baseline: BM25",
      "metadata": {
        "config": { "retriever": "bm25" },
        "metrics": { "recall@10": 0.72 },
        "children": []
      },
      "notes": []
    }
  ],
  "history": [
    { "role": "user", "content": "What experiments are in this project?" },
    { "role": "assistant", "content": "..." }
  ]
}
```

Returns a `ChatMessage` object.

---

## Gap Analysis

### POST /api/projects/{id}/gap-analysis

Run AI gap analysis on a project's experiment tree. Identifies missing baselines, ablations, config sweeps, and replications.

Request body (`GapAnalysisRequest`):

```json
{
  "dismissedIds": ["gap_abc123", "gap_def456"]
}
```

`dismissedIds` are previously dismissed suggestion IDs to exclude from results.

Returns an array of `GapSuggestion` objects:

```json
[
  {
    "id": "gap_abc1def2",
    "gapType": "missing_baseline",
    "name": "Add BM25 retrieval baseline",
    "rationale": "No sparse retrieval baseline present. Current experiments only test dense retrievers.",
    "suggestedConfig": { "retriever": "bm25", "top_k": 10 },
    "paperRefs": [
      {
        "paperId": "p_xyz",
        "displayLabel": "Robertson et al., 2009",
        "relevanceNote": "Original BM25 paper, standard baseline for IR tasks."
      }
    ],
    "ablationParams": []
  }
]
```

`gapType` values: `missing_baseline`, `ablation_gap`, `config_sweep`, `replication`.
