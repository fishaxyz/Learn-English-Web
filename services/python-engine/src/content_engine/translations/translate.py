"""
Translates a lesson's sentences with the local language model, for bilingual reading (ADR 0009).

One paragraph per request, its sentences numbered: the model sees the whole paragraph (so names, pronouns and
repeated terms stay consistent) and answers one translation per number, so each lines up with its English
sentence. Text only, no voice-over. An editor checks and approves every translation before learners see it.
"""

import logging
from collections.abc import Callable
from typing import Any

from ..vocab.llm import LanguageModel, LanguageModelError

LANGUAGE = {"vi": "Vietnamese", "fr": "French", "de": "German"}

SYSTEM = (
    "You are a professional translator preparing bilingual reading material for English learners. Translate "
    "accurately and naturally, the way a careful human translator would for readers of the target language. Keep "
    "the meaning, tone and register of the original; keep names of people, ships, places and publications as they "
    "are; keep numbers, dates and labels such as 'D -'. Translate each numbered sentence on its own (never merge, "
    "split, skip or reorder sentences), using the whole paragraph to understand it."
)


def _schema(count: int) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "translations": {
                "type": "array",
                "minItems": count,
                "maxItems": count,
                "items": {
                    "type": "object",
                    "properties": {
                        "n": {"type": "integer", "minimum": 1, "maximum": count},
                        "text": {"type": "string"},
                    },
                    "required": ["n", "text"],
                },
            }
        },
        "required": ["translations"],
    }


def fake_translate(paragraphs: list[dict[str, Any]], locale: str) -> dict[str, Any]:
    """For browser tests: each sentence marked with the language ("[VI] Her commute is long."), no model."""
    items = [
        {"blockId": p["blockId"], "start": s["start"], "text": f"[{locale.upper()}] {s['text']}"}
        for p in paragraphs
        for s in p["sentences"]
    ]
    return {"ai": True, "items": items}


def translate(
    paragraphs: list[dict[str, Any]],
    locale: str,
    model: LanguageModel | None,
    log: logging.Logger,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    """Translations for every sentence it could translate: [{blockId, start, text}]. Without the model, none."""
    language = LANGUAGE.get(locale)
    if model is None or language is None:
        return {"ai": False, "items": []}
    items: list[dict[str, Any]] = []
    for paragraph in paragraphs:
        sentences = paragraph["sentences"]
        if not sentences:
            continue
        numbered = "\n".join(f"{i + 1}. {s['text']}" for i, s in enumerate(sentences))
        prompt = (
            f"Translate into {language}.\n\nThe paragraph:\n{' '.join(s['text'] for s in sentences)}\n\n"
            f"Its sentences, numbered:\n{numbered}\n\n"
            f"Answer with one {language} translation for each number."
        )
        keep_alive()
        try:
            answer = model.json(SYSTEM, prompt, _schema(len(sentences)), max_tokens=200 + 120 * len(sentences))
        except LanguageModelError as error:
            log.warning("language model unavailable", extra={"reason": str(error)})
            # Keep what was translated so far; the editor can translate the rest again.
            return {"ai": bool(items), "items": items}
        seen: set[int] = set()
        for t in answer.get("translations", []):
            n, text = t.get("n"), t.get("text")
            if not isinstance(n, int) or not isinstance(text, str) or n in seen or not 1 <= n <= len(sentences):
                continue
            text = " ".join(text.split())
            if not text:
                continue
            seen.add(n)
            items.append({"blockId": paragraph["blockId"], "start": sentences[n - 1]["start"], "text": text})
    return {"ai": True, "items": items}
