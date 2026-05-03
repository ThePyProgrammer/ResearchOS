# Phase 11: AI Experiment Gap Analysis - Research

**Researched:** 2026-03-20
**Domain:** Pydantic-AI structured outputs + FastAPI BackgroundTasks + @dnd-kit/core useDroppable/useDraggable + React useState transient suggestion state
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Suggestion card content & types**
- All four gap types: missing baseline, ablation gap, config sweep, replication
- Compact cards: type badge (colored chip), suggestion name, 1-line rationale, 1-2 key config params, paper reference chips. Click to expand detail.
- Edit in detail panel only — click card opens peek/modal overlay (Phase 9 pattern). Edit name, config, rationale there before promoting.
- Dismiss with soft fade + undo — dismissed cards fade out with brief "Undo" toast. Dismissed suggestions remembered so re-running analysis doesn't resurface them.

**Planning board layout & interaction**
- New tab in Experiments section — "Gap Analysis" tab alongside existing Tree/Table toggle in ProjectDetail
- Cards left (~60%), mini-tree right (~40%) — suggestion cards in scrollable column on left, compact experiment tree on right. Drag from left to right to promote.
- Drag card onto mini experiment tree — drop on a tree node creates a child experiment under that parent. Tree auto-expands on hover during drag. Uses @dnd-kit patterns from Phase 9.
- Promoted experiments get "planned" status — config pre-filled from suggestion, name editable. Clearly distinguishes AI-suggested from user-created experiments.

**AI analysis trigger & flow**
- Two entry points: primary "Analyze Gaps" button on the Gap Analysis tab + context menu option on experiment tree root node
- Streaming cards if on page, background notification if navigated away — cards appear one by one with animation when user is watching. If user navigates to another tab, toast notification when complete.
- AI receives full tree + configs + linked paper abstracts — experiment tree (names, configs, metrics, statuses) plus abstracts/metadata of all project-linked papers. Enables both structural gap detection and literature cross-referencing.
- Re-run replaces undismissed suggestions — "Re-analyze" clears current suggestions, generates fresh ones. Dismissed stay dismissed. Promoted experiments already in tree are unaffected.

**Paper cross-referencing**
- Small citation chips below rationale on compact cards — 1-2 paper references as clickable chips (author, year). Consistent with Phase 10 citation chip pattern.
- Click paper chip shows inline popover preview — title, authors, abstract, venue in a tooltip/popover. User stays on the page without navigating away.
- Brief relevance note in detail panel — each referenced paper includes a 1-line explanation of why it's relevant. Only visible in expanded detail, not on card.

### Claude's Discretion
- Exact AI prompt engineering and structured output schema
- Streaming implementation approach (SSE, polling, or WebSocket)
- Mini-tree rendering (reuse existing tree component or simplified version)
- Empty state design for first-time Gap Analysis tab
- Card animation and transition details
- Token budget management for large experiment trees

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GAP-01 | User can trigger AI analysis of their experiment tree to receive suggestions for missing experiments | BackgroundTasks pattern (runs.py) + new gap_analyzer.py agent; POST /api/projects/{id}/gap-analysis endpoint |
| GAP-02 | AI suggestions include reasoning, suggested config, and reference to relevant literature | GapSuggestion Pydantic model with rationale, suggested_config, paper_refs; pydantic-ai structured output |
| GAP-03 | User can view suggestions as cards on a planning board and drag them to create planned experiments | GapAnalysisTab component; useDraggable on cards, useDroppable on mini-tree nodes; experimentsApi.create on drop |
| GAP-04 | AI detects which config parameters haven't been varied (ablation detection) | Config key union across all experiments; gap_analyzer computes uncovered keys and emits ablation_gap suggestions |
| GAP-05 | AI cross-references linked papers' experiments with user's to find coverage gaps | project_papers_service + paper_service to fetch abstracts; injected into AI context as "literature" section |
</phase_requirements>

---

## Summary

Phase 11 adds an AI-powered gap analysis board to the Experiments section. The AI receives the full experiment tree (names, configs, metrics, statuses) and the abstracts of all project-linked papers, then returns a structured list of gap suggestions (missing baseline, ablation gap, config sweep, replication). The suggestions appear as cards on a planning board — the user can read them, edit them in a detail overlay, then drag them onto a mini experiment tree to promote them to planned experiments. No DB persistence is needed for suggestions: they live in React useState, matching the NotesCopilotPanel suggestion pattern already in the codebase.

The backend pattern is well-established: a new `gap_analyzer.py` agent using pydantic-ai `Agent` with a structured `GapSuggestion` output type, dispatched via FastAPI `BackgroundTasks` from a new `gap_analysis.py` router. The frontend polling-after-POST approach (already used by the Agents workflow catalog) is the simplest streaming substitute; since the AI call is fast enough (one LLM call, not multi-step), a synchronous endpoint that returns suggestions directly is cleaner than background dispatch.

The drag-from-left-to-right-onto-tree DnD pattern requires `useDroppable` on each mini-tree node (not `useSortable`) and `useDraggable` on suggestion cards. ProjectTasks.jsx already uses this exact combination (`useDroppable` on Kanban columns, `useDraggable` on cards). A separate `DndContext` ID is required to avoid collision with the existing tree-view `DndContext`.

**Primary recommendation:** Use a single synchronous POST that returns all suggestions in one call (no background task, no polling), with the AI call to `gpt-4o` (agent role) and a pydantic-ai structured output returning `list[GapSuggestion]`. Render suggestions progressively with `setTimeout` stagger for the "streaming cards" visual effect. This avoids SSE plumbing while preserving the UX feel.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pydantic-ai | >=1.63.0 | Structured LLM output, `Agent` class | Already used for experiment_designer, literature_reviewer, model_researcher agents |
| FastAPI BackgroundTasks | bundled | Async background agent dispatch | Used by runs.py, papers.py for all async work |
| @dnd-kit/core | installed | DnD: `useDroppable`, `useDraggable`, `DndContext`, `DragOverlay` | Already used in ProjectTasks.jsx for Kanban and Calendar |
| @dnd-kit/sortable | installed | `useSortable` for mini-tree sortable nodes | Already used in ProjectDetail.jsx tree |
| React useState | bundled | Transient suggestion state (no DB) | Pattern decision locked: matches NotesCopilotPanel |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| OpenAI gpt-4o | via llm.py get_model("agent") | Gap analysis LLM call | Uses existing "agent" role model config |
| project_papers_service | existing | Fetch project-linked paper IDs | Needed to join paper abstracts into AI context |
| paper_service.get_paper | existing | Fetch paper abstracts by ID | Called per linked paper to build literature context |
| experiment_service.list_experiments | existing | Fetch full flat experiment list for project | AI context serialization |
| RunCostTracker / record_openai_usage | services/cost_service.py | Track LLM cost | Used by all existing agents |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Synchronous POST (recommended) | BackgroundTasks + polling | BackgroundTasks adds run record overhead; gap analysis is a single LLM call (1-2s), not a multi-step workflow; synchronous is simpler and faster |
| `useDroppable` on mini-tree nodes | `useSortable` on mini-tree | `useSortable` implies item reordering; tree nodes are drop targets only, so `useDroppable` is semantically correct |
| React useState for suggestions | DB persistence (gap_suggestions table) | STATE.md decision: "held in transient React useState only — not persisted to DB; re-running is cheap" |

**Installation:** No new packages needed. All required libraries already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── agents/
│   └── gap_analyzer.py          # New: GapSuggestion output model + run_gap_analysis()
├── models/
│   └── gap_suggestion.py        # New: GapSuggestion, GapAnalysisRequest, GapAnalysisResponse
├── routers/
│   └── gap_analysis.py          # New: POST /api/projects/{id}/gap-analysis
frontend/src/pages/
└── ProjectDetail.jsx             # Modified: add 'gap' viewMode, GapAnalysisTab component
```

### Pattern 1: Synchronous Agent Endpoint (Recommended)
**What:** POST endpoint calls the gap analyzer agent synchronously and returns structured suggestions in the response body. No background task, no polling.
**When to use:** Single LLM call with bounded latency (< 10s). User is waiting on the result. No multi-step workflow needed.
**Example:**
```python
# backend/routers/gap_analysis.py
@router.post("/api/projects/{project_id}/gap-analysis")
async def analyze_gaps(project_id: str, req: GapAnalysisRequest):
    project = project_service.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    suggestions = await run_gap_analysis(project_id, dismissed_ids=req.dismissed_ids)
    return JSONResponse([s.model_dump(by_alias=True) for s in suggestions])
```

### Pattern 2: Pydantic-AI Structured Output for Gap Suggestions
**What:** Agent with `output_type=GapAnalysisOutput` containing a list of `GapSuggestion` objects. The AI returns one structured JSON blob.
**When to use:** When the output is a typed list of objects (not free text). pydantic-ai validates against the schema automatically.
**Example:**
```python
# backend/agents/gap_analyzer.py
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from agents.llm import get_pydantic_ai_model

class PaperRef(BaseModel):
    paper_id: str
    display_label: str      # "Author et al., Year"
    relevance_note: str     # 1-line explanation for detail panel

class GapSuggestion(BaseModel):
    id: str = Field(default_factory=lambda: f"gap_{uuid.uuid4().hex[:8]}")
    gap_type: str           # "missing_baseline" | "ablation_gap" | "config_sweep" | "replication"
    name: str               # suggested experiment name
    rationale: str          # 1-sentence rationale
    suggested_config: dict  # pre-filled config for the new experiment
    paper_refs: list[PaperRef] = []   # 1-2 relevant papers
    ablation_params: list[str] = []   # config params not yet varied (for ablation_gap)

class GapAnalysisOutput(BaseModel):
    suggestions: list[GapSuggestion]

def _make_gap_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=GapAnalysisOutput,
        system_prompt=GAP_ANALYSIS_SYSTEM_PROMPT,
        defer_model_check=True,
    )
```

### Pattern 3: useDroppable + useDraggable for Card-to-Tree DnD
**What:** Suggestion cards use `useDraggable`, mini-tree nodes use `useDroppable`. A single `DndContext` wraps the entire planning board. On `onDragEnd`, if `over` is a tree node, call `experimentsApi.create()` with the suggestion config.
**When to use:** Cross-container drag (card column → tree), not within-container sort. Must NOT share DndContext with existing tree-view DndContext.
**Example:**
```jsx
// Source: ProjectTasks.jsx useDroppable pattern (existing codebase)
// Mini-tree node:
function MiniTreeNode({ experiment, depth, onRefresh }) {
  const { setNodeRef, isOver } = useDroppable({ id: experiment.id })
  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: depth * 16 }}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors
        ${isOver ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}`}
    >
      <Icon name="science" className="text-[14px] text-slate-400" />
      <span className="text-slate-700 truncate">{experiment.name}</span>
    </div>
  )
}

// Suggestion card:
function SuggestionCard({ suggestion, dismissed, onDismiss }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: suggestion.id,
    data: { suggestion },
  })
  // ...
}

// Planning board DndContext:
<DndContext
  id="gap-analysis-dnd"   // unique ID — avoids collision with 'tree-dnd' context
  sensors={sensors}
  onDragEnd={({ active, over }) => {
    if (!over) return
    const { suggestion } = active.data.current
    const parentId = over.id  // tree node experiment ID
    experimentsApi.create(projectId, {
      name: suggestion.name,
      status: 'planned',
      config: suggestion.suggestedConfig,
      parentId,
    }).then(() => {
      onPromote(suggestion.id)
      onRefreshExperiments()
    })
  }}
>
```

### Pattern 4: Token Budget Management for Large Trees
**What:** Serialize experiment tree compactly. Cap paper abstracts at 300 chars each. Limit to 20 linked papers. Total context target: < 4,000 tokens for tree + literature.
**When to use:** Always. experiment trees can grow to 100+ nodes; uncapped serialization exceeds GPT-4o's effective instruction context for structured output.
**Example:**
```python
# backend/agents/gap_analyzer.py
def _serialize_tree(experiments: list[dict], max_experiments: int = 80) -> str:
    """Compact experiment tree serialization for LLM context."""
    lines = []
    # Sort by position, include parent-child structure
    for exp in experiments[:max_experiments]:
        indent = "  " * _depth(exp, experiments)
        config_str = ", ".join(f"{k}={v}" for k, v in list(exp.get("config", {}).items())[:6])
        metrics_str = ", ".join(f"{k}={v}" for k, v in list(exp.get("metrics", {}).items())[:4])
        parts = [f"{indent}- [{exp['status']}] {exp['name']}"]
        if config_str: parts.append(f"config({config_str})")
        if metrics_str: parts.append(f"metrics({metrics_str})")
        lines.append(" ".join(parts))
    return "\n".join(lines)

def _serialize_papers(papers: list[Paper], max_papers: int = 20) -> str:
    lines = []
    for p in papers[:max_papers]:
        abstract_snippet = (p.abstract or "")[:300]
        lines.append(f"[{p.id}] {', '.join(p.authors[:2])} ({p.year}). {p.title}. {abstract_snippet}")
    return "\n".join(lines)
```

### Pattern 5: Progressive Card Animation (No SSE needed)
**What:** After receiving all suggestions from the synchronous POST, stagger card rendering with `setTimeout` to create a "streaming" visual effect.
**When to use:** When the UX requires cards to appear one-by-one but actual SSE/WebSocket is overkill.
**Example:**
```jsx
// GapAnalysisTab.jsx
const [visibleCount, setVisibleCount] = useState(0)
const [allSuggestions, setAllSuggestions] = useState([])

async function handleAnalyze() {
  setAnalyzing(true)
  setVisibleCount(0)
  const result = await projectsApi.analyzeGaps(projectId, { dismissedIds })
  setAllSuggestions(result)
  setAnalyzing(false)
  // Stagger card appearance
  result.forEach((_, i) => {
    setTimeout(() => setVisibleCount(i + 1), i * 150)
  })
}

const visibleSuggestions = allSuggestions.slice(0, visibleCount)
```

### Anti-Patterns to Avoid
- **Shared DndContext with tree view:** Gap Analysis tab must use `id="gap-analysis-dnd"` — a separate DndContext entirely. Mixing sortable-tree DnD with card-to-tree DnD in one context causes sensor collision (STATE.md pitfall 3 precedent: "Two separate DndContext IDs").
- **Persisting suggestions to DB:** Suggestions are transient. Adding a `gap_suggestions` table introduces migration, service, and router overhead for data that re-runs cheaply. STATE.md explicitly locks this: "held in transient React useState only."
- **Including all paper full text in AI context:** Paper abstracts at 300 chars each. Full PDF text for 20 papers would be 200k+ tokens. Always cap at abstract/metadata.
- **Sending full JSON configs to AI:** Experiment configs can have arbitrary keys. Always truncate to the first 6 key-value pairs per experiment in the serialized context string.
- **Supplying already-completed experiments as gap targets:** The system prompt must instruct the LLM to check the `status` field and never suggest an experiment that already has `status="completed"` or `status="running"` with the same config (STATE.md pitfall 4).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM structured output validation | Custom JSON parsing + type coercion | pydantic-ai `output_type=GapAnalysisOutput` | pydantic-ai validates against Pydantic schema, retries on invalid output |
| DnD between card column and tree | Custom mouse event listeners | `@dnd-kit/core` useDroppable + useDraggable | Keyboard accessibility, pointer sensor, touch support handled |
| Experiment creation on drop | Direct Supabase insert from frontend | `experimentsApi.create()` via existing router | Validates project ownership, sets position, triggers re-fetch |
| Paper data for AI context | Separate fetch endpoint | `project_papers_service.list_project_papers()` + `paper_service.get_paper()` | Already exists; batch fetch with list of IDs |
| Token counting | tiktoken library | Character-based truncation heuristic (~4 chars/token) | No new dependency; 300 chars/paper abstract = ~75 tokens, well within budget |

**Key insight:** The gap analysis agent follows the exact same infrastructure as `experiment_designer.py` — `Agent` + `output_type` + RunLogger-style logging. Copy-paste the skeleton, swap the prompt and output schema.

---

## Common Pitfalls

### Pitfall 1: DndContext ID Collision
**What goes wrong:** The Gap Analysis tab shares the same React tree as the Experiment Tree view (both inside `ExperimentSection`). If `viewMode === 'gap'` renders a DndContext without an explicit `id`, it may share sensor state with the tree-view DndContext that was previously rendered.
**Why it happens:** @dnd-kit uses a default context ID. Multiple DndContext instances in the same React subtree (even if conditionally rendered) can conflict if the `id` prop is omitted.
**How to avoid:** Always set `id="gap-analysis-dnd"` on the Gap Analysis DndContext. Never share with existing `DndContext` instances in ProjectDetail.jsx.
**Warning signs:** Drag events firing on the wrong context, `onDragEnd` never triggering, or sortable tree items becoming draggable when gap tab is active.

### Pitfall 2: Suggesting Already-Existing or Completed Experiments
**What goes wrong:** The AI is given the experiment tree but hallucinated or misread the statuses, suggesting experiments that are already completed/running.
**Why it happens:** LLMs can ignore specific fields unless the system prompt explicitly instructs them to filter.
**How to avoid:** Include in system prompt: "NEVER suggest an experiment that matches an existing experiment in both status=completed and a similar config. Always compare your suggestion against the full list provided." Also post-process: filter suggestions client-side whose `name` matches an existing completed experiment with cosine similarity (or simple string match).
**Warning signs:** User sees suggestions for experiments already in the tree.

### Pitfall 3: Token Budget Exceeded on Large Trees
**What goes wrong:** A project with 100+ experiments and 20 linked papers sends ~8,000 tokens of context to GPT-4o, pushing total prompt to 10k+ tokens. Structured output reliability degrades above ~8k tokens.
**Why it happens:** Each experiment serialized naively with full config and metrics can be 200+ chars. 100 experiments × 200 chars = 20k chars = ~5k tokens for tree alone.
**How to avoid:** Hard cap: `max_experiments=80` in `_serialize_tree()`. Truncate configs to first 6 KV pairs. Truncate abstracts to 300 chars. Log token estimate before calling LLM.
**Warning signs:** Pydantic-ai output validation failures, truncated JSON in response, or unexpectedly empty `suggestions` list.

### Pitfall 4: viewMode Toggle Breaking Existing DnD State
**What goes wrong:** Adding `'gap'` as a third `viewMode` value breaks the existing two-state toggle (`'tree'` | `'table'`). The toggle button group only renders two icons; gap analysis is a third mode not shown there.
**Why it happens:** `viewMode` is stored in localStorage via `useLocalStorage` keyed per project. If 'gap' is stored and the user refreshes while toggle only shows tree/table, the active view appears blank.
**How to avoid:** Gap Analysis tab should be a separate UI affordance (a text tab link, not an icon in the icon toggle group). Treat it as a `viewMode === 'gap'` branch but render its trigger as a separate button in the header, not inside the icon toggle group. Alternatively, reset viewMode to 'tree' when navigating away from the gap tab.
**Warning signs:** Blank experiments section after page refresh, localStorage value 'gap' persisting across sessions.

### Pitfall 5: Paper Chip Popover Z-index Conflict
**What goes wrong:** The inline paper popover (shown on chip click) is positioned within the suggestion card, but the suggestion detail overlay (the peek modal) has a higher z-index. The popover renders beneath the modal backdrop.
**Why it happens:** CSS stacking contexts. The detail overlay uses `fixed z-50`. Popovers using `absolute` positioning inside a `relative` parent clip to the card's stacking context.
**How to avoid:** Render paper chip popovers as `fixed` positioned elements (not `absolute`). Calculate position from `getBoundingClientRect()` of the chip. Use `z-[60]` (above the modal's z-50).
**Warning signs:** Popover appears clipped or invisible when opened from inside the detail panel.

### Pitfall 6: Dismissed IDs Not Filtering Re-run Results
**What goes wrong:** User dismisses 3 cards, clicks "Re-analyze", and the dismissed suggestions reappear.
**Why it happens:** The POST request doesn't send dismissed IDs to the backend. The backend has no way to exclude them. The frontend clears suggestions on re-run without preserving dismissed state.
**How to avoid:** Keep a `dismissedIds` Set in component state. On re-run, merge new suggestions with `dismissedIds` filter: `setSuggestions(fresh.filter(s => !dismissedIds.has(s.id)))`. Alternatively, send `dismissed_ids` in the POST body so the LLM can be instructed to avoid similar suggestions.
**Warning signs:** Dismissed cards returning after re-run.

---

## Code Examples

Verified patterns from existing codebase:

### Existing useDroppable Pattern (ProjectTasks.jsx)
```jsx
// Source: frontend/src/pages/ProjectTasks.jsx line 1023
const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id })
// isOver drives visual feedback; setDropRef attaches to the DOM node
```

### Existing useDraggable Pattern (ProjectTasks.jsx)
```jsx
// Source: frontend/src/pages/ProjectTasks.jsx line 2030
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
// attributes/listeners spread onto drag handle; isDragging drives opacity
```

### Existing Experiment Create Call (api.js)
```js
// Source: frontend/src/services/api.js line 364
experimentsApi.create(projectId, {
  name: suggestion.name,
  status: 'planned',
  config: suggestion.suggestedConfig,
  parentId: dropTargetExperimentId,
})
```

### buildExperimentTree (reuse for mini-tree)
```js
// Source: frontend/src/pages/ProjectDetail.jsx line 70
function buildExperimentTree(flatExperiments) {
  const byId = Object.fromEntries(flatExperiments.map(e => [e.id, { ...e, children: [] }]))
  const roots = []
  for (const exp of Object.values(byId)) {
    if (exp.parentId) byId[exp.parentId]?.children.push(exp)
    else roots.push(exp)
  }
  // ... sort levels by position
  return roots
}
// Mini-tree reuses this exact function — pass flatExperiments, render recursively
```

### Existing Pydantic-AI Agent Pattern (experiment_designer.py)
```python
# Source: backend/agents/experiment_designer.py line 108
def _make_goal_extraction_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),  # "openai:gpt-4o"
        output_type=GoalExtractionOutput,
        system_prompt=EXPERIMENT_GOAL_EXTRACTION,
        defer_model_check=True,
    )

result = await agent.run(user_prompt)
tracker.add_llm(result.usage(), get_model("agent"))
record_openai_usage(result.usage(), get_model("agent"))
output = result.output  # typed as GoalExtractionOutput
```

### ViewMode Pattern for Adding Gap Tab (ProjectDetail.jsx)
```jsx
// Source: frontend/src/pages/ProjectDetail.jsx line 3611
const [viewMode, setViewMode] = useLocalStorage(`researchos.exp.view.${projectId}`, 'tree')

// Extend the header to add a Gap Analysis tab button (separate from icon toggle)
<button
  onClick={() => setViewMode('gap')}
  className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors
    ${viewMode === 'gap' ? 'bg-purple-50 text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}
>
  <Icon name="psychology" className="text-[15px] mr-1" />
  Gap Analysis
</button>

// In the render conditional:
} : viewMode === 'gap' ? (
  <GapAnalysisTab
    projectId={projectId}
    flatExperiments={flatExperiments}
    onRefreshExperiments={fetchExperiments}
  />
) : viewMode === 'table' ? (
```

### System Prompt Structure for Gap Analyzer
```python
GAP_ANALYSIS_SYSTEM_PROMPT = """
You are an expert ML experiment designer. You analyze an experiment tree and literature
to identify experiments that are missing.

You detect four gap types:
1. missing_baseline: A standard baseline method is not present in the tree
2. ablation_gap: A config parameter has never been varied across experiments
3. config_sweep: A parameter has been varied but not over a meaningful range
4. replication: A key experiment from linked papers has not been reproduced

Rules:
- NEVER suggest an experiment that already exists (check name + config similarity)
- NEVER suggest an experiment with status "completed" or "running"
- Limit to 5-8 high-value suggestions
- Each suggestion must have a concrete suggested_config dict
- For ablation_gap, list the specific parameter(s) in ablation_params
- For paper_refs, cite at most 2 papers with display_label "AuthorLastName et al., Year"

Output: a GapAnalysisOutput with a suggestions list.
"""
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSE streaming for agent results | Synchronous POST (for fast agents) | Phase 9+ | For single-LLM-call agents, sync is simpler and more reliable than SSE |
| `useSortable` for all DnD | `useDroppable`/`useDraggable` for cross-container | Phase 9 Kanban | Cross-container drag (card → tree) uses different API than within-container sort |
| Suggestions stored in DB | Transient React state | Locked in STATE.md | Cheaper, simpler, no migration needed |

**Deprecated/outdated:**
- Background task for gap analysis: overkill for a single LLM call returning in < 5s. Use synchronous endpoint instead (unlike multi-step wf1/wf2/wf3 which need background dispatch).

---

## Open Questions

1. **Streaming cards implementation**
   - What we know: The user decision is "cards appear one by one." No SSE infrastructure exists in the codebase.
   - What's unclear: The CONTEXT.md says "streaming cards if on page, background notification if navigated away" — this implies the analysis might run in the background.
   - Recommendation: Implement as synchronous POST for Phase 11. The `setTimeout` stagger achieves the visual streaming effect. If the user navigates away mid-request, the response arrives after navigation and can be stored in a ref; show a toast on return. Full SSE/WebSocket deferred to Phase 6 (Agent Runtime Hardening) per roadmap.

2. **Mini-tree "auto-expand on hover during drag"**
   - What we know: @dnd-kit's `useDroppable` exposes `isOver`. Expansion state is managed per-node.
   - What's unclear: Auto-expand requires a timer (expand after 800ms hover). This needs a ref that starts/stops based on `isOver`.
   - Recommendation: Use `useEffect` on `isOver` to start a `setTimeout` of 600ms that calls `setExpanded(true)` for that node. Clear on `isOver === false`. This is a standard DnD "hover-to-expand" pattern.

3. **"Background notification if navigated away"**
   - What we know: The gap analysis POST is synchronous. If the user navigates away mid-fetch, the fetch completes but the component that called it may be unmounted.
   - What's unclear: How to surface the toast if the component unmounted.
   - Recommendation: Store the in-flight request in a module-level `AbortController` ref. If the component unmounts before response, cancel the fetch. On the next mount of GapAnalysisTab, show "Analysis available — click Analyze to load" if a cached result is available (store in a module-level variable or sessionStorage).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.4.0 + pytest-mock 3.14.0 |
| Config file | `backend/pyproject.toml` (testpaths = ["tests"]) |
| Quick run command | `cd backend && uv run pytest tests/test_gap_analysis_routes.py -x` |
| Full suite command | `cd backend && uv run pytest tests/ -x` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAP-01 | POST /api/projects/{id}/gap-analysis returns 200 with suggestions list | unit (route) | `uv run pytest tests/test_gap_analysis_routes.py::test_analyze_gaps_returns_suggestions -x` | ❌ Wave 0 |
| GAP-01 | POST returns 404 when project_id not found | unit (route) | `uv run pytest tests/test_gap_analysis_routes.py::test_analyze_gaps_project_not_found -x` | ❌ Wave 0 |
| GAP-02 | GapSuggestion model has rationale, suggestedConfig, paperRefs fields | unit (model) | `uv run pytest tests/test_gap_suggestion_model.py -x` | ❌ Wave 0 |
| GAP-03 | Promoted experiment created with parentId and status=planned | unit (route) | Covered by existing `test_experiment_routes.py::test_create_experiment` | ✅ existing |
| GAP-04 | Ablation gap suggestion includes ablation_params list | unit (model) | `uv run pytest tests/test_gap_suggestion_model.py::test_ablation_gap_has_params -x` | ❌ Wave 0 |
| GAP-05 | Gap analysis serializer includes paper abstracts in context string | unit (service) | `uv run pytest tests/test_gap_analysis_routes.py::test_paper_context_included -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_gap_analysis_routes.py -x`
- **Per wave merge:** `cd backend && uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_gap_analysis_routes.py` — covers GAP-01, GAP-05 route-level tests
- [ ] `backend/tests/test_gap_suggestion_model.py` — covers GAP-02, GAP-04 model validation tests
- [ ] `backend/models/gap_suggestion.py` — new GapSuggestion model (created in implementation wave)
- [ ] `backend/agents/gap_analyzer.py` — new gap analyzer agent
- [ ] `backend/routers/gap_analysis.py` — new router registered in app.py

---

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/agents/experiment_designer.py` — pydantic-ai Agent + structured output + RunLogger pattern
- Codebase: `backend/agents/base.py` — RunLogger, emit_activity infrastructure
- Codebase: `frontend/src/pages/ProjectTasks.jsx` lines 1023, 2030 — `useDroppable` + `useDraggable` cross-container pattern
- Codebase: `frontend/src/pages/ProjectDetail.jsx` line 70 — `buildExperimentTree()` reusable function
- Codebase: `frontend/src/services/api.js` line 362 — `experimentsApi.create()` signature
- Codebase: `backend/services/project_papers_service.py` — `list_project_papers(project_id)` for literature context
- Codebase: `.planning/STATE.md` lines 184-186 — locked decisions: transient state, full tree context, editable before promotion

### Secondary (MEDIUM confidence)
- STATE.md decision: "Gap analysis context budget: experiment trees with 100+ experiments may exceed 4,000 token target; address in Phase 11 research-phase" — directly flags token budget as known concern

### Tertiary (LOW confidence)
- None — all findings verified against codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used in codebase
- Architecture: HIGH — patterns directly sourced from existing agents and DnD code
- Pitfalls: HIGH — most pitfalls documented from STATE.md decisions and existing code patterns
- Token budget management: MEDIUM — 300 chars/abstract heuristic is conservative estimate; actual behavior depends on GPT-4o context window and structured output reliability

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — stable stack, no fast-moving dependencies)
