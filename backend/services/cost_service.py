"""
Runtime cost tracking for agent workflow runs, and global lifetime LLM usage.

Per-run tracking: RunCostTracker accumulates token usage within a single
agent workflow and serialises to run.cost via run_service.complete_run().

Global tracking: record_openai_usage() is called at every LLM call site
(services + agent runners) and appends to a persistent JSON file so the
dashboard can show all-time spend across chat, notes, metadata, embeddings,
and agent workflows.

Usage (per-run, in agent runners)::

    tracker = RunCostTracker()
    result = await agent.run(prompt)
    tracker.add_llm(result.usage(), llm.get_model("agent_light"))
    record_openai_usage(result.usage(), llm.get_model("agent_light"))  # global
    cost_dict = tracker.to_cost_dict()

Usage (in services)::

    response = client.chat.completions.create(...)
    record_openai_usage(response.usage, model_id)
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Pricing table (USD per 1M tokens, approximate as of mid-2025) ─────────────
# Entries are matched by checking whether the active model ID *starts with*
# the given prefix, so "gpt-4o-mini" matches before "gpt-4o".
# Format: (prefix, input_per_1m_usd, output_per_1m_usd)
_PRICING: list[tuple[str, float, float]] = [
    ("o4-mini",         1.10,   4.40),
    ("o3-mini",         1.10,   4.40),
    ("o3",             10.00,  40.00),
    ("o1-mini",         1.10,   4.40),
    ("o1",             15.00,  60.00),
    ("gpt-4o-mini",     0.15,   0.60),
    ("gpt-4o",          2.50,  10.00),
    ("gpt-4-turbo",    10.00,  30.00),
    ("gpt-4",          30.00,  60.00),
    ("gpt-3.5",         0.50,   1.50),
    ("text-embedding",  0.02,   0.00),
]

# Fallback rate used when the model ID doesn't match any known prefix.
_FALLBACK_RATE: tuple[float, float] = (1.00, 3.00)


def _price_for_model(model_id: str) -> tuple[float, float]:
    for prefix, inp, out in _PRICING:
        if model_id.startswith(prefix):
            return inp, out
    logger.warning("No pricing entry for model '%s' — using fallback rates", model_id)
    return _FALLBACK_RATE


def _fmt_usd(amount: float) -> str:
    if amount == 0.0:
        return "Free"
    if amount < 0.001:
        return f"${amount:.5f}"
    if amount < 0.01:
        return f"${amount:.4f}"
    return f"${amount:.4f}"


def _fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"~{n / 1_000_000:.2f}M tokens"
    if n >= 1_000:
        return f"~{n / 1_000:.1f}K tokens"
    return f"{n} tokens"


# ── Internal accumulator ──────────────────────────────────────────────────────

@dataclass
class _ModelBucket:
    model_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0


# ── Public API ────────────────────────────────────────────────────────────────

@dataclass
class RunCostTracker:
    """Accumulates token usage and external API calls during a workflow run."""

    _models: dict[str, _ModelBucket] = field(default_factory=dict)
    _api_calls: dict[str, int] = field(default_factory=dict)

    def add_llm(self, usage: Any, model_id: str) -> None:
        """Record token usage from a pydantic-ai RunUsage object.

        ``usage`` must expose ``.input_tokens`` and ``.output_tokens``.
        ``model_id`` is the plain OpenAI model string, e.g. ``"gpt-4o-mini"``.
        """
        if model_id not in self._models:
            self._models[model_id] = _ModelBucket(model_id=model_id)
        b = self._models[model_id]
        b.input_tokens += getattr(usage, "input_tokens", 0)
        b.output_tokens += getattr(usage, "output_tokens", 0)
        b.requests += getattr(usage, "requests", 1)

    def add_api_calls(self, service: str, count: int = 1) -> None:
        """Record calls to a free external API (arXiv, OpenAlex, etc.)."""
        self._api_calls[service] = self._api_calls.get(service, 0) + count

    def to_cost_dict(self) -> Optional[dict]:
        """Serialize to the ``run.cost`` format consumed by the Dashboard.

        Returns ``None`` when no usage was recorded, so ``run.cost`` stays
        ``null`` in the DB for runs that never touched an LLM.
        """
        if not self._models and not self._api_calls:
            return None

        items: dict[str, Any] = {}
        grand_total = 0.0

        for model_id, bucket in self._models.items():
            inp_rate, out_rate = _price_for_model(model_id)
            cost = (
                bucket.input_tokens * inp_rate
                + bucket.output_tokens * out_rate
            ) / 1_000_000
            grand_total += cost

            total_toks = bucket.input_tokens + bucket.output_tokens
            key = "llm_" + model_id.replace("-", "_").replace(".", "_")
            items[key] = {
                "label": f"LLM ({model_id})",
                "amount": _fmt_usd(cost),
                "tokens": (
                    f"{_fmt_tokens(total_toks)} "
                    f"({_fmt_tokens(bucket.input_tokens)} in, "
                    f"{_fmt_tokens(bucket.output_tokens)} out)"
                ),
                "requests": bucket.requests,
                "pct": 0,
            }

        for service, count in self._api_calls.items():
            key = f"api_{service.lower().replace(' ', '_')}"
            items[key] = {
                "label": f"{service} API",
                "amount": "Free",
                "calls": f"{count} call{'s' if count != 1 else ''}",
                "pct": 0,
            }

        # Fill percentage bars proportional to dollar cost
        if grand_total > 0:
            for item in items.values():
                amt = item.get("amount", "Free")
                if amt != "Free" and amt.startswith("$"):
                    try:
                        item["pct"] = round(float(amt[1:]) / grand_total * 100)
                    except ValueError:
                        pass

        items["total"] = _fmt_usd(grand_total)
        return items


# ── Global persistent usage store ────────────────────────────────────────────

_USAGE_PATH = Path(__file__).parent.parent / "data" / "llm_usage.json"
_usage_lock = threading.Lock()


def _read_usage() -> dict:
    """Read current usage totals from disk, returning an empty structure if absent."""
    if _USAGE_PATH.exists():
        try:
            with open(_USAGE_PATH, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"models": {}, "updated_at": None}


def _write_usage(data: dict) -> None:
    _USAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    with open(_USAGE_PATH, "w") as f:
        json.dump(data, f, indent=2)


def _normalize_tokens(usage: Any) -> tuple[int, int]:
    """Extract (input_tokens, output_tokens) from either an OpenAI usage object
    (prompt_tokens / completion_tokens) or a pydantic-ai RunUsage object
    (input_tokens / output_tokens).  Returns (0, 0) for None or unknown shapes.
    """
    if usage is None:
        return 0, 0
    # pydantic-ai RunUsage
    inp = getattr(usage, "input_tokens", None)
    out = getattr(usage, "output_tokens", None)
    if inp is not None:
        return int(inp), int(out or 0)
    # OpenAI CompletionUsage / EmbeddingUsage
    inp = getattr(usage, "prompt_tokens", 0) or 0
    out = getattr(usage, "completion_tokens", 0) or 0
    return int(inp), int(out)


def record_openai_usage(usage: Any, model_id: str) -> None:
    """Record a single LLM call in the global persistent usage store.

    Accepts both pydantic-ai ``RunUsage`` and OpenAI ``CompletionUsage`` /
    ``EmbeddingUsage`` objects.  Silently skips ``None`` usage (some search-
    preview models omit usage metadata).
    """
    if usage is None:
        return
    inp, out = _normalize_tokens(usage)
    if inp == 0 and out == 0:
        return
    with _usage_lock:
        data = _read_usage()
        m = data["models"].setdefault(model_id, {"input_tokens": 0, "output_tokens": 0, "calls": 0})
        m["input_tokens"] += inp
        m["output_tokens"] += out
        m["calls"] += 1
        _write_usage(data)


def get_global_usage() -> dict:
    """Return all-time LLM usage formatted for the dashboard API.

    Schema::

        {
            "breakdown": [
                {
                    "model": "gpt-4o-mini",
                    "inputTokens": 12500,
                    "outputTokens": 4200,
                    "calls": 47,
                    "costUsd": 0.0041,
                    "costFormatted": "$0.0041"
                },
                ...
            ],
            "totalCostUsd": 0.0041,
            "totalCostFormatted": "$0.0041",
            "updatedAt": "2025-03-14T..."
        }
    """
    data = _read_usage()
    breakdown = []
    grand_total = 0.0

    for model_id, m in data.get("models", {}).items():
        inp_rate, out_rate = _price_for_model(model_id)
        cost = (m["input_tokens"] * inp_rate + m["output_tokens"] * out_rate) / 1_000_000
        grand_total += cost
        breakdown.append({
            "model": model_id,
            "inputTokens": m["input_tokens"],
            "outputTokens": m["output_tokens"],
            "calls": m["calls"],
            "costUsd": round(cost, 6),
            "costFormatted": _fmt_usd(cost),
        })

    # Sort by cost descending
    breakdown.sort(key=lambda x: x["costUsd"], reverse=True)

    return {
        "breakdown": breakdown,
        "totalCostUsd": round(grand_total, 6),
        "totalCostFormatted": _fmt_usd(grand_total),
        "updatedAt": data.get("updated_at"),
    }


def reset_global_usage() -> None:
    """Wipe the global usage store (for testing / manual resets)."""
    with _usage_lock:
        _write_usage({"models": {}})
