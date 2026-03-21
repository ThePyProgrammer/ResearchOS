# Gap Analysis

**File:** `backend/agents/gap_analyzer.py`

**API:** `POST /api/projects/:id/gap-analysis`

**Frontend:** `frontend/src/components/GapAnalysisTab.jsx`

The gap analyzer inspects a project's experiment tree and linked paper abstracts to suggest missing experiments.

## Request

```json
{
  "dismissedIds": ["gap_abc12345", "gap_def67890"]
}
```

`dismissedIds` are suggestion IDs that the user previously dismissed. They are passed to the LLM to avoid re-suggesting the same experiments.

## Experiment Tree Serialization

**Function:** `_serialize_tree(experiments, max_experiments=80)`

The tree is serialized as indented plain text. Each line:

```
  [<status>] <name> | config: k=v, k=v (max 6 pairs) | metrics: k=v, k=v (max 4 pairs)
```

Indentation uses 2 spaces per depth level. Depth is computed by walking `parent_id` chains. Experiments are sorted by `(parent_id, position)` to approximate parent-before-child ordering.

If there are more than 80 experiments, a truncation note is appended. The cap prevents context overflow.

Example output:
```
[completed] Baseline | config: lr=0.001, batch_size=32 | metrics: accuracy=0.91
  [planned] Ablation: no dropout | config: lr=0.001, dropout=0.0
  [running] LR sweep 0.01 | config: lr=0.01, batch_size=32
```

## Paper Abstract Serialization

**Function:** `_serialize_papers(papers, max_papers=20)`

Each paper is serialized as a single line:

```
[<paper_id>] Author1, Author2, Author3 et al. (<year>). <title>. <abstract[:300]>
```

Authors are truncated to 3 names + "et al." The abstract is truncated at 300 characters. At most 20 papers are included.

## System Prompt and Gap Types

The agent is instructed to identify 4 types of gaps:

| Gap Type | Label (UI) | Description |
|----------|-----------|-------------|
| `missing_baseline` | Baseline | A standard comparison absent from the tree that peers in the literature use (e.g., vanilla transformer, random baseline) |
| `ablation_gap` | Ablation | A key component or hyperparameter has not been ablated. `ablation_params` must list the unvaried config keys. |
| `config_sweep` | Sweep | An important hyperparameter tested at only one value that should be swept (e.g., learning rate, batch size) |
| `replication` | Replication | An experiment from a cited paper that has not been replicated |

Rules enforced in the system prompt:
- Never suggest an experiment matching an existing COMPLETED or RUNNING experiment (by name or config).
- Each suggestion must include a `suggested_config` dict with concrete values.
- Each suggestion should reference 1-2 papers using `"AuthorLastName et al., Year"` format.
- `ablation_params` must be non-empty for `ablation_gap` type.
- Output 5-8 suggestions; prioritize actionable over speculative.

## Output Schema

**Models:** `backend/models/gap_suggestion.py`

```python
class PaperRef(CamelModel):
    paper_id: str
    display_label: str     # e.g. "Vaswani et al., 2017"
    relevance_note: str    # 1-line explanation

class GapSuggestion(CamelModel):
    id: str                        # auto-generated "gap_<8hex>"
    gap_type: str                  # one of the 4 types above
    name: str                      # short experiment name
    rationale: str                 # explanation of the gap
    suggested_config: dict         # concrete hyperparameter values
    paper_refs: list[PaperRef]     # 1-2 supporting papers
    ablation_params: list[str]     # non-empty for ablation_gap

class GapAnalysisOutput(BaseModel):
    suggestions: list[GapSuggestion]
```

The agent uses `GapAnalysisOutput` as `output_type` in the pydantic-ai `Agent`, ensuring the response is always valid and structured.

## Frontend Planning Board Flow

1. User clicks "Analyze Gaps" in the Gap Analysis tab.
2. Frontend sends `POST /api/projects/:id/gap-analysis` with current `dismissedIds`.
3. Results render as `SuggestionCard` items with a staggered entrance animation (200ms between cards).
4. **Dismiss**: clicking X on a card hides it with a 4-second undo toast. Dismissed IDs are tracked in state.
5. **Inspect**: clicking a card body opens `SuggestionDetailOverlay` showing the full rationale, `suggested_config` key-value table, and `paper_refs` as clickable chips (each opens a `PaperChipPopover`).
6. **Promote to tree**: drag a card from the left column and drop it onto an experiment node in the right-column `MiniExperimentTree`. This calls `experimentsApi.create()` with:
   - `name`: the suggestion's `name`
   - `config`: the suggestion's `suggested_config`
   - `parent_id`: the target experiment's ID (or null for root)
   - `project_id`: current project
7. After promotion, `onRefreshExperiments()` is called to re-fetch the experiment tree in the parent.

## Cost Tracking

The gap analyzer uses `RunCostTracker` and `record_openai_usage` to track LLM usage, but does not create a run record (it is not a workflow run). Cost is tracked globally in `data/usage.json`.
