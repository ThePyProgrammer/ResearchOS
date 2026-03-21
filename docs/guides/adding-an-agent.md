# Guide: Adding a New Agent Workflow

This guide explains how to create a new pydantic-ai workflow. Use `backend/agents/experiment_designer.py` as the canonical reference.

---

## Step 1: Define Output Schemas

Create `BaseModel` subclasses for each LLM step's structured output. These must extend `pydantic.BaseModel` (not `CamelModel`), as they are only used internally by pydantic-ai:

```python
from pydantic import BaseModel, Field

class MyStepOutput(BaseModel):
    result: str = Field(description="The main result")
    items: list[str] = Field(description="List of items found")
    score: int = Field(ge=0, le=10, description="Quality score 0-10")
```

Use `Field(description=...)` on every field — pydantic-ai includes descriptions in the JSON schema it passes to the model as a structured output constraint.

---

## Step 2: Create Agent Factory Functions

Create one factory function per LLM step. Use factories (not module-level singletons) so that `get_pydantic_ai_model()` is called at invocation time, picking up any runtime model changes from the settings page.

```python
from pydantic_ai import Agent
from agents.llm import get_pydantic_ai_model
from agents.prompts import MY_STEP_SYSTEM_PROMPT

def _make_my_step_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),       # or "agent_light" for simpler steps
        output_type=MyStepOutput,
        system_prompt=MY_STEP_SYSTEM_PROMPT,
        defer_model_check=True,               # always True
    )
```

Add the system prompt as a constant in `backend/agents/prompts.py`.

Use `"agent"` (gpt-4o) for complex reasoning steps and `"agent_light"` (gpt-4o-mini) for filtering, scoring, and query generation.

---

## Step 3: Write the Workflow Runner

Create `backend/agents/my_workflow.py`. The entry point is an `async def` function that takes `run_id` and `prompt` as minimum parameters.

```python
import logging
from agents.base import RunLogger, emit_activity, search_arxiv
from agents.llm import get_model, get_pydantic_ai_model
from services import run_service
from services.cost_service import RunCostTracker, record_openai_usage

logger = logging.getLogger(__name__)

async def run_my_workflow(run_id: str, prompt: str) -> None:
    """Execute the workflow end-to-end as a FastAPI background task."""
    log = RunLogger(run_id)
    log.info("My Workflow started")
    log.set_progress(5, "Initializing (Step 0/N)")

    trace: list[dict] = []
    tracker = RunCostTracker()

    try:
        # ── Step 1 ────────────────────────────────────────────────────────
        log.set_progress(20, "Step 1 description (Step 1/N)")
        log.agent("Running step 1...")

        result = await _make_my_step_agent().run(f"Input: {prompt}")
        tracker.add_llm(result.usage(), get_model("agent"))
        record_openai_usage(result.usage(), get_model("agent"))

        output = result.output  # typed as MyStepOutput
        log.info(f"Step 1 complete: {output.result[:100]}")

        trace.append({
            "step": "Step 1 Name",
            "status": "done",
            "detail": f"Produced {len(output.items)} items",
        })

        # ── Complete ──────────────────────────────────────────────────────
        log.set_progress(100, "Complete")
        run_service.complete_run(run_id, trace, cost=tracker.to_cost_dict())

        emit_activity(
            run_id=run_id,
            title="My Workflow completed",
            detail=f"Produced {len(output.items)} results",
            action_label="Review",
            action_href="/proposals",
        )

    except Exception as exc:
        logger.exception("My Workflow %s failed", run_id)
        log.error(f"Workflow failed: {exc}")
        run_service.fail_run(run_id, str(exc))
```

### RunLogger methods

| Method | Level | Purpose |
|--------|-------|---------|
| `log.info(msg)` | INFO | General progress messages, counts, data summaries |
| `log.tool(msg)` | TOOL | Announce an external API call (arXiv, Crossref) |
| `log.agent(msg)` | AGENT | Announce an LLM step |
| `log.error(msg)` | ERROR | Record failures |
| `log.set_progress(pct, step)` | — | Update the progress bar and step label in the UI |

### Cost tracking

Call `tracker.add_llm(result.usage(), get_model("agent"))` after every `agent.run()` call. Call `record_openai_usage(result.usage(), model_id)` to also update the global usage counter. Call `tracker.add_api_calls("arXiv")` for each external API call.

### trace list

Each step appends a dict to `trace`:
```python
{"step": "Human-readable name", "status": "done" | "pending" | "failed", "detail": "..."}
```

The trace is stored in `run.trace` and displayed in the Proposals page's run detail panel.

---

## Step 4: Wire the Workflow into a Router

Register the workflow in `backend/routers/runs.py` (or create a dedicated router).

1. Add the workflow to the workflow catalog in `backend/data/workflows.json`:

```json
{
  "id": "wf_my_workflow",
  "name": "My Workflow",
  "description": "What it does",
  "icon": "science",
  "badge": "NEW",
  "inputs": [{"name": "prompt", "label": "Research prompt", "type": "textarea"}]
}
```

2. In `backend/routers/runs.py`, dispatch to the new workflow based on the `workflow_id`:

```python
from agents.my_workflow import run_my_workflow

# Inside the start_run handler:
if data.workflow_id == "wf_my_workflow":
    background_tasks.add_task(run_my_workflow, run.id, data.prompt)
```

3. The run is created first by `run_service.create_run(data)`, then the background task is queued. The run starts in `"running"` status and transitions to `"completed"` or `"failed"` when the workflow finishes.

---

## Patterns to Follow

### arXiv search
```python
from agents.base import search_arxiv
papers = await search_arxiv("transformer/attention", max_results=40)
tracker.add_api_calls("arXiv")
```

### Avoiding duplicate papers
```python
existing = [p for p in paper_service.list_papers() if p.arxiv_id == score.arxiv_id]
if existing:
    paper_obj = existing[0]
else:
    paper_obj = paper_service.create_paper(PaperCreate(...))
```

### Creating proposals
```python
proposal_service.create_proposal(paper_obj.id, run_id)
```

### Logging to run record (not just Python logger)
Always use `log.info()` / `log.agent()` / `log.tool()` so entries appear in the live log panel. Using only `logger.info()` (the Python logger) will not surface to the frontend.

---

## Checklist

- [ ] Output schemas extend `pydantic.BaseModel` (not `CamelModel`); all fields have `Field(description=...)`
- [ ] System prompt added to `agents/prompts.py`
- [ ] Agent factory uses `defer_model_check=True`
- [ ] Workflow function is `async def`, takes `run_id` and `prompt`
- [ ] Every LLM call tracked: `tracker.add_llm(result.usage(), get_model("role"))` and `record_openai_usage(...)`
- [ ] `log.set_progress()` called at each major step boundary
- [ ] `trace` list populated and passed to `run_service.complete_run()`
- [ ] All exceptions caught; `run_service.fail_run()` called on failure
- [ ] `emit_activity()` called on completion
- [ ] Workflow registered in `workflows.json` and dispatched in the runs router
