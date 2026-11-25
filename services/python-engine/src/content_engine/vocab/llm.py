"""The local language model (llama.cpp's OpenAI-compatible server): multi-word expressions and short meanings."""

import json
from typing import Any

import httpx

KINDS = ["IDIOM", "PHRASAL_VERB", "COLLOCATION", "PHRASE", "SENTENCE_PATTERN"]
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "expressions": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "base_form": {"type": "string"},
                    "kind": {"enum": KINDS},
                    "definition": {"type": "string"},
                    "level": {"enum": LEVELS},
                },
                "required": ["text", "base_form", "kind", "definition", "level"],
            },
        },
        "meanings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "word": {"type": "string"},
                    "definition": {"type": "string"},
                    "level": {"enum": LEVELS},
                },
                "required": ["word", "definition", "level"],
            },
        },
    },
    "required": ["expressions", "meanings"],
}

SYSTEM = (
    "You help English teachers prepare reading lessons. You pick vocabulary worth teaching and explain it "
    "simply. Definitions are one short sentence (at most 15 words) a learner at the given level understands, "
    "for the meaning used in the text. Never invent text: 'text' is copied exactly from the paragraph."
)


class LanguageModelError(Exception):
    """The model couldn't be reached or answered something unusable: suggestions go on without it."""


class LanguageModel:
    def __init__(self, base_url: str, model: str, timeout: float, transport: httpx.BaseTransport | None = None) -> None:
        self._model = model
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout, transport=transport)

    def analyse(self, paragraph: str, words: list[str], level: str | None) -> dict[str, Any]:
        """Multi-word expressions in the paragraph, and meanings for the given words."""
        prompt = (
            f"Learners' level: CEFR {level or 'B1'}.\n\nParagraph:\n{paragraph}\n\n"
            "1. List the multi-word expressions in this paragraph worth teaching at this level: idioms, phrasal "
            "verbs, collocations, fixed phrases and sentence patterns (at most 8; none if there are none). For "
            "each: 'text' exactly as written in the paragraph, 'base_form' as in a dictionary (\"give up\", "
            '"a piece of cake", or a pattern like "like + verb-ing"), its kind, a definition and a CEFR level.\n'
            "2. Give a definition and the CEFR level at which learners usually meet it, for each of these words as "
            f"used in the paragraph: {', '.join(words) or '(none)'}."
        )
        try:
            res = self._http.post(
                "/chat/completions",
                json={
                    "model": self._model,
                    "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 1500,
                    "response_format": {"type": "json_schema", "json_schema": {"name": "vocabulary", "schema": SCHEMA}},
                    "chat_template_kwargs": {"enable_thinking": False},
                },
            )
            res.raise_for_status()
            content = res.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
            raise LanguageModelError(type(error).__name__) from None
        if not isinstance(data, dict):
            raise LanguageModelError("not an object")
        return data
