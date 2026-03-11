"""
Centralized LLM configuration and client helpers.

All OpenAI model references and client construction live here so that
the active model can be switched from the settings page at runtime.

Settings are persisted in backend/data/llm_settings.json.
Available models are fetched from the OpenAI API and cached.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI, OpenAI

logger = logging.getLogger(__name__)

_SETTINGS_PATH = Path(__file__).parent.parent / "data" / "llm_settings.json"
_MODELS_CACHE_PATH = Path(__file__).parent.parent / "data" / "openai_models_cache.json"
_CACHE_TTL_SECONDS = 60 * 60 * 24  # 24 hours

# ── Role keys ─────────────────────────────────────────────────────────────────
# Each "role" maps to a purpose that may use a different model tier.

_DEFAULTS: dict[str, str] = {
    "chat": "gpt-4o-mini",
    "notes": "gpt-4o-mini",
    "metadata": "gpt-4o-mini",
    "enrichment": "gpt-4o-mini",
    "web_search": "gpt-4o-mini-search-preview",
    "agent": "gpt-4o",
    "agent_light": "gpt-4o-mini",
    "embedding": "text-embedding-3-small",
}

ROLE_DESCRIPTIONS: dict[str, str] = {
    "chat": "AI Copilot (paper & website chat)",
    "notes": "AI Note Generation",
    "metadata": "PDF Metadata Extraction",
    "enrichment": "Author Profile Enrichment",
    "web_search": "Web Search (author lookup)",
    "agent": "Agent Workflows (high-tier)",
    "agent_light": "Agent Workflows (light-tier)",
    "embedding": "Semantic Search Embeddings",
}

# Prefixes we care about — skip internal/ft/whisper/tts/dall-e models
_CHAT_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")
_EMBEDDING_PREFIXES = ("text-embedding-",)

# Models to always exclude (snapshots, deprecated, or not useful)
_EXCLUDE_PATTERNS = (
    "realtime", "audio", "transcribe", "search-preview",
    "instruct", "0125", "1106",
)


# ── Fetch models from OpenAI API ─────────────────────────────────────────────

def _fetch_models_from_api() -> tuple[list[dict], list[dict]]:
    """Call OpenAI GET /v1/models and partition into chat vs embedding models."""
    try:
        client = get_openai_client()
        response = client.models.list()
        models = [m for m in response]
    except Exception as exc:
        logger.warning("Failed to fetch models from OpenAI API: %s", exc)
        return [], []

    chat_models: list[dict] = []
    embedding_models: list[dict] = []

    for m in models:
        model_id: str = m.id

        # Skip excluded patterns
        if any(p in model_id for p in _EXCLUDE_PATTERNS):
            continue

        if any(model_id.startswith(p) for p in _EMBEDDING_PREFIXES):
            embedding_models.append({"id": model_id, "name": model_id})
        elif any(model_id.startswith(p) for p in _CHAT_PREFIXES):
            chat_models.append({"id": model_id, "name": model_id})

    chat_models.sort(key=lambda m: m["id"])
    embedding_models.sort(key=lambda m: m["id"])
    return chat_models, embedding_models


def _load_models_cache() -> Optional[dict]:
    """Load cached models list if it exists and is fresh."""
    if not _MODELS_CACHE_PATH.exists():
        return None
    try:
        with open(_MODELS_CACHE_PATH, "r") as f:
            cache = json.load(f)
        if time.time() - cache.get("fetched_at", 0) < _CACHE_TTL_SECONDS:
            return cache
    except Exception:
        pass
    return None


def _save_models_cache(chat_models: list[dict], embedding_models: list[dict]) -> None:
    _MODELS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_MODELS_CACHE_PATH, "w") as f:
        json.dump({
            "fetched_at": time.time(),
            "chat_models": chat_models,
            "embedding_models": embedding_models,
        }, f, indent=2)


def get_available_models(force_refresh: bool = False) -> tuple[list[dict], list[dict]]:
    """Return (chat_models, embedding_models), using cache when possible."""
    if not force_refresh:
        cache = _load_models_cache()
        if cache:
            return cache["chat_models"], cache["embedding_models"]

    chat_models, embedding_models = _fetch_models_from_api()

    if chat_models or embedding_models:
        _save_models_cache(chat_models, embedding_models)
        return chat_models, embedding_models

    # If API call failed, try stale cache
    if _MODELS_CACHE_PATH.exists():
        try:
            with open(_MODELS_CACHE_PATH, "r") as f:
                cache = json.load(f)
            return cache.get("chat_models", []), cache.get("embedding_models", [])
        except Exception:
            pass

    # Last resort: minimal hardcoded fallback
    return (
        [{"id": "gpt-4o", "name": "gpt-4o"}, {"id": "gpt-4o-mini", "name": "gpt-4o-mini"}],
        [{"id": "text-embedding-3-small", "name": "text-embedding-3-small"}],
    )


# ── Settings persistence ──────────────────────────────────────────────────────

def _load_settings() -> dict[str, str]:
    if _SETTINGS_PATH.exists():
        try:
            with open(_SETTINGS_PATH, "r") as f:
                return json.load(f)
        except Exception:
            logger.warning("Failed to load LLM settings, using defaults")
    return {}


def _save_settings(settings: dict[str, str]) -> None:
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_SETTINGS_PATH, "w") as f:
        json.dump(settings, f, indent=2)


def get_model(role: str) -> str:
    """Get the active model ID for a given role."""
    settings = _load_settings()
    return settings.get(role, _DEFAULTS.get(role, "gpt-4o-mini"))


def get_all_models(force_refresh: bool = False) -> dict:
    """Return current model assignments + available models for the settings UI."""
    settings = _load_settings()
    current = {role: settings.get(role, default) for role, default in _DEFAULTS.items()}
    chat_models, embedding_models = get_available_models(force_refresh=force_refresh)
    return {
        "current": current,
        "defaults": dict(_DEFAULTS),
        "descriptions": dict(ROLE_DESCRIPTIONS),
        "available_chat_models": chat_models,
        "available_embedding_models": embedding_models,
    }


def update_models(updates: dict[str, str]) -> dict[str, str]:
    """Update model assignments for one or more roles. Returns the full config."""
    settings = _load_settings()
    for role, model_id in updates.items():
        if role in _DEFAULTS:
            settings[role] = model_id
    _save_settings(settings)
    return {role: settings.get(role, default) for role, default in _DEFAULTS.items()}


# ── Client helpers ────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return api_key


def get_openai_client() -> OpenAI:
    """Return a synchronous OpenAI client."""
    return OpenAI(api_key=_get_api_key())


def get_async_openai_client() -> AsyncOpenAI:
    """Return an async OpenAI client."""
    return AsyncOpenAI(api_key=_get_api_key())


def get_pydantic_ai_model(role: str) -> str:
    """Return a model string formatted for pydantic-ai (e.g. 'openai:gpt-4o')."""
    return f"openai:{get_model(role)}"


# Models that require max_completion_tokens instead of max_tokens,
# and don't support the temperature parameter.
_NEW_API_PREFIXES = ("o1", "o3", "o4", "gpt-5", "gpt-6", "gpt-7", "gpt-8", "gpt-9")


def is_new_api_model(model_id: str) -> bool:
    """Check if a model uses the newer API conventions."""
    return any(model_id.startswith(p) for p in _NEW_API_PREFIXES)


def max_tokens_param(model_id: str, limit: int) -> dict:
    """Return the correct max-tokens kwarg dict for the given model.

    Usage::

        client.chat.completions.create(
            model=model_id,
            messages=messages,
            **max_tokens_param(model_id, 4096),
        )
    """
    if is_new_api_model(model_id):
        return {"max_completion_tokens": limit}
    return {"max_tokens": limit}


def completion_params(model_id: str, *, max_tokens: int, temperature: float = 0.7) -> dict:
    """Build model-compatible kwargs for chat completions.

    Handles differences between legacy and new API models:
    - max_tokens vs max_completion_tokens
    - temperature (unsupported on o-series, some gpt-5+ models — omitted)
    """
    params: dict = {}

    if is_new_api_model(model_id):
        params["max_completion_tokens"] = max_tokens
        # o-series and newer models don't support temperature
    else:
        params["max_tokens"] = max_tokens
        params["temperature"] = temperature

    return params
