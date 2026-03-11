"""Extract structured metadata from PDF bytes using pymupdf4llm + OpenAI."""

import json
import logging
import os
import tempfile

import pymupdf4llm

from agents.llm import get_model, get_openai_client
from agents.prompts import PDF_METADATA_EXTRACTION

logger = logging.getLogger(__name__)

# Only extract the first N chars from the PDF to keep the prompt small
_MAX_EXTRACT_CHARS = 8_000


def extract_metadata_from_bytes(pdf_bytes: bytes) -> dict:
    """Extract metadata from raw PDF bytes."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        md_text = pymupdf4llm.to_markdown(tmp_path, pages=[0, 1, 2])
    except Exception:
        # If page range fails (e.g. PDF has fewer than 3 pages), try without page filter
        try:
            md_text = pymupdf4llm.to_markdown(tmp_path)
        except Exception:
            logger.exception("pymupdf4llm extraction failed")
            raise
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    # Truncate to keep prompt small
    if len(md_text) > _MAX_EXTRACT_CHARS:
        md_text = md_text[:_MAX_EXTRACT_CHARS]

    client = get_openai_client()
    response = client.chat.completions.create(
        model=get_model("metadata"),
        messages=[
            {"role": "system", "content": PDF_METADATA_EXTRACTION},
            {"role": "user", "content": md_text},
        ],
        temperature=0,
        max_tokens=1024,
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown fences if the model wraps them anyway
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        meta = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("OpenAI returned invalid JSON for metadata extraction: %s", raw[:500])
        raise ValueError("Failed to parse metadata from PDF")

    # Normalize
    title = meta.get("title") or None
    if title:
        title = _to_title_case(title)

    return {
        "title": title,
        "authors": meta.get("authors") or [],
        "date": meta.get("date") or None,
        "venue": meta.get("venue") or None,
        "abstract": meta.get("abstract") or None,
        "doi": meta.get("doi") or None,
    }


# Words that should stay lowercase in title case (unless first/last)
_SMALL_WORDS = {
    "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
    "in", "on", "at", "to", "by", "of", "up", "as", "is", "if",
    "it", "vs", "via", "from", "into", "with", "over", "than",
}


def _to_title_case(text: str) -> str:
    """Convert text to title case, handling ALL CAPS / all lower gracefully.

    When the title is mostly uppercase, it lowercases everything first then
    applies title case rules. Mixed-case identifiers (ResNet, GPT-4) and
    short acronyms (AI, LLM) are preserved only when the title is NOT
    already all-caps (since we can't distinguish acronyms from regular words
    in an all-caps title).
    """
    alpha = [c for c in text if c.isalpha()]
    is_mostly_upper = alpha and (sum(1 for c in alpha if c.isupper()) / len(alpha)) > 0.5

    if is_mostly_upper:
        words = text.lower().split()
    else:
        words = text.split()

    result = []
    for i, word in enumerate(words):
        if not is_mostly_upper:
            alpha_part = "".join(c for c in word if c.isalpha())
            # Preserve short all-uppercase words as acronyms (BERT, AI, LLM)
            if alpha_part.isupper() and len(alpha_part) >= 2:
                result.append(word)
                continue
            # Preserve mixed-case identifiers (ResNet, GPT-4, iPhone)
            if any(c.isupper() for c in word[1:]):
                result.append(word)
                continue

        if i == 0 or i == len(words) - 1:
            result.append(word.capitalize())
        elif word.lower() in _SMALL_WORDS:
            result.append(word.lower())
        else:
            result.append(word.capitalize())
    return " ".join(result)
