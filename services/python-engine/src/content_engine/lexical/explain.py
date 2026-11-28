"""
Explains a lesson's lexical vocabulary with the local language model, for IELTS learners (ADR 0010).

The editor lists the items (keywords, collocations, idioms, structures…); the model explains a few at a time with
the lesson's text as context: what kind of item it is, a simple meaning, synonyms or paraphrases, an example, an
IELTS tip, and the item's words exactly as the text has them. An editor checks and approves every explanation.
"""

import logging
from collections.abc import Callable
from typing import Any

from ..vocab.llm import LanguageModel, LanguageModelError

KINDS = ["KEYWORD", "COLLOCATION", "IDIOM", "PHRASAL_VERB", "STRUCTURE", "PARAPHRASE"]
BATCH = 5
MAX_CONTEXT = 6000

SYSTEM = (
    "You are an experienced IELTS teacher writing lexical notes for one reading text. For each listed item, explain "
    "the meaning it has in this text, simply and accurately, for an intermediate learner (CEFR B1-B2). Choose its "
    "kind: KEYWORD (an important single word), COLLOCATION (words that naturally go together), IDIOM, PHRASAL_VERB, "
    "STRUCTURE (a sentence or grammar pattern) or PARAPHRASE (another way to say an idea, as IELTS questions reword "
    "the passage). 'quote' is the item's words copied exactly from the text, with ' … ' where other words come "
    "between them (\"passed … on\"); use an empty string when the item isn't in the text. 'synonyms' are 2 to 4 "
    "words or phrases with the same meaning in this context (empty for a structure). 'example' is one new natural "
    "sentence useful in IELTS Writing or Speaking. 'ielts_tip' says in one or two sentences when and how to use it in "
    "IELTS (register, common mistakes, which task). The editor's note, when given, says what they want stressed."
)


def _schema(count: int) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "explanations": {
                "type": "array",
                "minItems": count,
                "maxItems": count,
                "items": {
                    "type": "object",
                    "properties": {
                        "n": {"type": "integer", "minimum": 1, "maximum": count},
                        "kind": {"type": "string", "enum": KINDS},
                        "quote": {"type": "string"},
                        "meaning": {"type": "string"},
                        "synonyms": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
                        "example": {"type": "string"},
                        "ielts_tip": {"type": "string"},
                    },
                    "required": ["n", "kind", "quote", "meaning", "synonyms", "example", "ielts_tip"],
                },
            }
        },
        "required": ["explanations"],
    }


def _text(value: Any) -> str | None:
    return " ".join(value.split()) or None if isinstance(value, str) else None


def fake_explain(items: list[dict[str, Any]]) -> dict[str, Any]:
    """For browser tests: a recognizable explanation for each item, no model."""
    return {
        "ai": True,
        "items": [
            {
                "id": i["id"],
                "kind": "KEYWORD",
                "quote": i["text"],
                "meaning": f"Meaning of “{i['text']}”.",
                "synonyms": [f"{i['text']} (synonym)"],
                "example": f"An example with “{i['text']}”.",
                "ieltsTip": "A tip for IELTS.",
            }
            for i in items
        ],
    }


def explain(
    items: list[dict[str, Any]],
    paragraphs: list[dict[str, Any]],
    level: str | None,
    model: LanguageModel | None,
    log: logging.Logger,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    """Explanations for every item it could explain: [{id, kind, quote, meaning, ...}]. Without the model, none."""
    if model is None:
        return {"ai": False, "items": []}
    text = "\n\n".join(p["text"] for p in paragraphs)[:MAX_CONTEXT]
    out: list[dict[str, Any]] = []
    for start in range(0, len(items), BATCH):
        batch = items[start : start + BATCH]
        listed = "\n".join(
            f"{n}. {i['text']}" + (f" (editor's note: {i['note']})" if i.get("note") else "")
            for n, i in enumerate(batch, 1)
        )
        prompt = (
            f"The text{f' (level {level})' if level else ''}:\n{text}\n\n"
            f"The items to explain, numbered:\n{listed}\n\nAnswer with one explanation for each number."
        )
        keep_alive()
        try:
            answer = model.json(SYSTEM, prompt, _schema(len(batch)), max_tokens=300 + 260 * len(batch))
        except LanguageModelError as error:
            log.warning("language model unavailable", extra={"reason": str(error)})
            # Keep what was explained so far; the editor can explain the rest again.
            return {"ai": bool(out), "items": out}
        seen: set[int] = set()
        for e in answer.get("explanations", []):
            n, meaning = e.get("n"), _text(e.get("meaning"))
            if not isinstance(n, int) or n in seen or not 1 <= n <= len(batch) or not meaning:
                continue
            seen.add(n)
            synonyms = [s for s in (_text(x) for x in e.get("synonyms") or []) if s]
            out.append(
                {
                    "id": batch[n - 1]["id"],
                    "kind": e.get("kind") if e.get("kind") in KINDS else "KEYWORD",
                    "quote": _text(e.get("quote")),
                    "meaning": meaning,
                    "synonyms": synonyms,
                    "example": _text(e.get("example")),
                    "ieltsTip": _text(e.get("ielts_tip")),
                }
            )
    return {"ai": True, "items": out}
