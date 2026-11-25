"""Puts the suggestions together: the model's expressions first, then phrasal verbs and words from spaCy."""

import logging
from collections.abc import Callable
from typing import Any

from .llm import LanguageModel, LanguageModelError
from .nlp import LEVELS, Candidate, candidates

MAX_WORDS_PER_BLOCK = 12
MAX_SUGGESTIONS = 40
POS_OF_KIND = {
    "IDIOM": "idiom",
    "PHRASAL_VERB": "phrasal verb",
    "COLLOCATION": "collocation",
    "PHRASE": "phrase",
    "SENTENCE_PATTERN": "pattern",
}


def locate(text: str, part: str) -> int:
    """Where `part` is in `text` (code points), exactly or ignoring case; -1 when it isn't."""
    at = text.find(part)
    return at if at >= 0 else text.lower().find(part.lower())


def _clean(value: object, limit: int) -> str | None:
    return value.strip()[:limit] or None if isinstance(value, str) else None


def suggest(
    blocks: list[dict[str, str]],
    level: str | None,
    model: LanguageModel | None,
    log: logging.Logger,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    """`keep_alive` is called before each slow model call (it renews the job's lease)."""
    use_model = model is not None
    out: list[Candidate] = []
    for block in blocks:
        block_id, text = block["blockId"], block["text"]
        found = candidates(block_id, text, level)
        words = [c for c in found if c.kind == "WORD"][:MAX_WORDS_PER_BLOCK]
        phrasal = [c for c in found if c.kind != "WORD"]
        expressions: list[Candidate] = []
        if use_model and model is not None:
            keep_alive()
            try:
                answer = model.analyse(text, [w.display_form for w in words], level)
            except LanguageModelError as error:
                log.warning("language model unavailable", extra={"reason": str(error)})
                use_model = False
            else:
                meanings = {
                    str(m.get("word", "")).lower(): _clean(m.get("definition"), 300)
                    for m in answer.get("meanings", [])
                    if isinstance(m, dict)
                }
                for w in words:
                    w.definition = meanings.get(w.display_form) or meanings.get(w.surface.lower())
                for e in answer.get("expressions", []):
                    if not isinstance(e, dict) or e.get("kind") not in POS_OF_KIND:
                        continue
                    surface, base = _clean(e.get("text"), 200), _clean(e.get("base_form"), 120)
                    at = locate(text, surface) if surface and base else -1
                    if at < 0 or not surface or not base:
                        continue  # not really in the text: never invented
                    kind = str(e["kind"])
                    lvl = e.get("level")
                    expressions.append(
                        Candidate(
                            kind,
                            base,
                            POS_OF_KIND[kind],
                            block_id,
                            at,
                            at + len(surface),
                            text[at : at + len(surface)],
                            None,
                            source="ai",
                            definition=_clean(e.get("definition"), 300),
                            level=lvl if lvl in LEVELS else None,
                        )
                    )
        # Expressions first; a phrasal verb or word inside one isn't suggested on its own.
        taken: list[Candidate] = []
        for c in [*expressions, *phrasal, *words]:
            if not any(c.start < t.end and t.start < c.end for t in taken):
                taken.append(c)
        out.extend(taken)
    return {"ai": use_model, "suggestions": [c.as_result() for c in out[:MAX_SUGGESTIONS]]}
