"""
Gap Analyzer agent.

Given a project's experiment tree and linked paper abstracts, detects missing
experiments (missing baselines, ablation gaps, config sweeps, replications)
and returns structured GapSuggestion objects.
"""
import logging

from pydantic_ai import Agent

from agents.llm import get_model, get_pydantic_ai_model
from models.gap_suggestion import GapAnalysisOutput, GapSuggestion
from services import experiment_service, paper_service, project_papers_service
from services.cost_service import RunCostTracker, record_openai_usage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

GAP_ANALYSIS_SYSTEM_PROMPT = """\
You are an expert research assistant analyzing a scientist's experiment tree to \
identify missing experiments.

Your task: analyze the provided experiment tree (names, configs, statuses, metrics) \
and the linked literature (paper abstracts) to detect gaps. Output 5-8 structured \
gap suggestions.

Gap types you must consider:
1. **missing_baseline** — A standard baseline or comparison model is absent that \
   peers in the literature use (e.g., vanilla transformer, linear probe, random baseline).
2. **ablation_gap** — A key component or hyperparameter has not been ablated. \
   For ablation_gap, list the unvaried config keys in ablation_params.
3. **config_sweep** — An important hyperparameter has been tested at only one value \
   and should be swept (e.g., learning rate, batch size, number of layers).
4. **replication** — An experiment from a cited paper has not been replicated, which \
   would strengthen the comparison.

Rules:
- NEVER suggest an experiment that matches an existing COMPLETED or RUNNING experiment \
  in the tree (check both name and config).
- Each suggestion MUST include a concrete suggested_config dict with specific values.
- Each suggestion SHOULD reference 1-2 papers from the provided literature using \
  display_label format "AuthorLastName et al., Year" (e.g., "Vaswani et al., 2017").
- Include a brief relevance_note per paper explaining why it supports this suggestion.
- ablation_params must be non-empty for gap_type="ablation_gap".
- Limit output to 5-8 high-value suggestions. Prioritize actionable, concrete gaps \
  over speculative ones.
- Base suggestions on the actual experiment tree content — do not invent generic \
  suggestions unrelated to the provided data.
"""

# ---------------------------------------------------------------------------
# Tree and paper serialization
# ---------------------------------------------------------------------------


def _serialize_tree(experiments: list, max_experiments: int = 80) -> str:
    """Serialize the experiment tree to a compact text representation.

    Each line: indent (2 spaces per depth) + [status] name | config k=v (max 6) | metrics k=v (max 4)

    Depth is computed by walking parent_id chains.
    """
    if not experiments:
        return "(no experiments)"

    # Build parent-child lookup
    exp_map = {e.id: e for e in experiments}

    def get_depth(exp) -> int:
        depth = 0
        current = exp
        visited = set()
        while current.parent_id and current.parent_id in exp_map:
            if current.parent_id in visited:
                break  # guard against cycles
            visited.add(current.parent_id)
            current = exp_map[current.parent_id]
            depth += 1
        return depth

    # Sort: root nodes first (by position), then by depth for children
    sorted_exps = sorted(experiments, key=lambda e: (e.parent_id or "", e.position))

    lines: list[str] = []
    for exp in sorted_exps[:max_experiments]:
        depth = get_depth(exp)
        indent = "  " * depth
        status = exp.status or "planned"

        config = exp.config or {}
        config_str = ""
        if config:
            items = list(config.items())[:6]
            config_str = " | config: " + ", ".join(f"{k}={v}" for k, v in items)

        metrics = exp.metrics or {}
        metrics_str = ""
        if metrics:
            items = list(metrics.items())[:4]
            metrics_str = " | metrics: " + ", ".join(f"{k}={v}" for k, v in items)

        lines.append(f"{indent}[{status}] {exp.name}{config_str}{metrics_str}")

    if len(experiments) > max_experiments:
        lines.append(f"... ({len(experiments) - max_experiments} more experiments not shown)")

    return "\n".join(lines)


def _serialize_papers(papers: list, max_papers: int = 20) -> str:
    """Serialize project-linked papers to text for LLM context.

    Format: "[paper_id] Author1, Author2 (year). Title. abstract[:300]"
    """
    if not papers:
        return "(no linked papers)"

    lines: list[str] = []
    for paper in papers[:max_papers]:
        authors = paper.authors or []
        author_str = ", ".join(authors[:3])
        if len(authors) > 3:
            author_str += " et al."

        year = paper.year or "?"
        title = paper.title or "(untitled)"
        abstract = (paper.abstract or "")[:300]

        lines.append(f"[{paper.id}] {author_str} ({year}). {title}. {abstract}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def _make_gap_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=GapAnalysisOutput,
        system_prompt=GAP_ANALYSIS_SYSTEM_PROMPT,
        defer_model_check=True,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_gap_analysis(
    project_id: str,
    dismissed_ids: list[str] | None = None,
) -> list[GapSuggestion]:
    """Run gap analysis for a project's experiment tree.

    Args:
        project_id: The project to analyze.
        dismissed_ids: List of suggestion IDs previously dismissed by the user.
            The LLM is instructed not to re-suggest similar experiments.

    Returns:
        List of GapSuggestion objects.
    """
    if dismissed_ids is None:
        dismissed_ids = []

    # ── Fetch experiment tree ─────────────────────────────────────────────────
    experiments = experiment_service.list_experiments(project_id)
    tree_text = _serialize_tree(experiments)

    # ── Fetch linked papers ───────────────────────────────────────────────────
    project_papers = project_papers_service.list_project_papers(project_id)
    full_papers: list = []
    for pp in project_papers:
        if pp.paper_id:
            paper = paper_service.get_paper(pp.paper_id)
            if paper:
                full_papers.append(paper)

    papers_text = _serialize_papers(full_papers)

    # ── Build user prompt ─────────────────────────────────────────────────────
    dismissed_note = ""
    if dismissed_ids:
        dismissed_note = (
            f"\nDismissed suggestion IDs (do not re-suggest similar experiments): "
            f"{', '.join(dismissed_ids)}\n"
        )

    user_prompt = (
        f"## Experiment Tree\n\n{tree_text}\n\n"
        f"## Linked Literature\n\n{papers_text}\n"
        f"{dismissed_note}\n"
        f"Analyze the experiment tree and literature above. "
        f"Identify 5-8 high-value missing experiments as gap suggestions."
    )

    # Log token estimate
    token_estimate = len(user_prompt) // 4
    logger.info(
        "Gap analysis for project %s: ~%d tokens, %d experiments, %d papers",
        project_id,
        token_estimate,
        len(experiments),
        len(full_papers),
    )

    # ── Run agent ─────────────────────────────────────────────────────────────
    agent = _make_gap_agent()
    result = await agent.run(user_prompt)

    # ── Track cost ────────────────────────────────────────────────────────────
    tracker = RunCostTracker()
    tracker.add_llm(result.usage(), get_model("agent"))
    record_openai_usage(result.usage(), get_model("agent"))

    return result.output.suggestions
