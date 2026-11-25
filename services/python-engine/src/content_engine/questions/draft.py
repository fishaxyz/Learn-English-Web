"""
Drafts IELTS Reading questions with the local language model, in the API's question format (ADR 0008).

The model answers in a simple shape (one list per task type); this module turns each answer into a question,
dropping anything that doesn't hold up: typed answers must be words from the text, within the word limit, and
choice questions must have exactly one (or the stated number of) correct options. The API checks again, and an
editor approves every question before learners see it.
"""

import logging
import re
from collections.abc import Callable
from typing import Any

from ..vocab.llm import LanguageModel, LanguageModelError

TFNG = ["TRUE", "FALSE", "NOT_GIVEN"]
YNNG = ["YES", "NO", "NOT_GIVEN"]


def _list(item: dict[str, Any], max_items: int) -> dict[str, Any]:
    return {"type": "array", "maxItems": max_items, "items": item}


def _obj(**props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props)}


S = {"type": "string"}
SCHEMA: dict[str, Any] = _obj(
    true_false_not_given=_list(_obj(statement=S, answer={"enum": TFNG}, evidence=S), 5),
    yes_no_not_given=_list(_obj(statement=S, answer={"enum": YNNG}, evidence=S), 3),
    multiple_choice=_list(
        _obj(
            stem=S,
            options={"type": "array", "minItems": 4, "maxItems": 4, "items": S},
            correct={"type": "integer", "minimum": 0, "maximum": 3},
            evidence=S,
        ),
        3,
    ),
    choose_two=_list(
        _obj(
            stem=S,
            options={"type": "array", "minItems": 5, "maxItems": 5, "items": S},
            correct={
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "items": {"type": "integer", "minimum": 0, "maximum": 4},
            },
        ),
        1,
    ),
    matching_information=_list(_obj(statement=S, paragraph=S), 4),
    headings=_list(_obj(paragraph=S, heading=S), 8),
    extra_headings=_list(S, 3),
    sentence_completion=_list(_obj(sentence=S, answer=S), 3),
    short_answer=_list(_obj(question=S, answer=S), 3),
)

SYSTEM = (
    "You write IELTS Academic Reading questions for English learners. Every question must be answerable from the "
    "text alone, with exactly one correct answer. Answers to completion and short-answer questions are copied "
    "word for word from the text. Distractors are plausible but clearly wrong. Write clear, simple English."
)

GAP = re.compile(r"_{2,}")


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u2019", "'")).strip().lower()


def _words(text: str) -> int:
    return len(text.split())


def _str(value: object, limit: int = 500) -> str | None:
    return value.strip()[:limit] or None if isinstance(value, str) else None


def build_questions(answer: dict[str, Any], letters: list[str], text: str) -> list[dict[str, Any]]:
    """The model's answer as questions in the API's format; anything that doesn't hold up is left out."""
    script = _plain(text)
    out: list[dict[str, Any]] = []

    def explained(q: dict[str, Any], evidence: object) -> dict[str, Any]:
        quote = _str(re.sub(r"^\s*Paragraph [A-Z]:\s*", "", evidence) if isinstance(evidence, str) else None, 300)
        return {**q, "explanation": f"From the text: {quote}"} if quote else q

    for kind, answers, items in (
        ("TRUE_FALSE_NOT_GIVEN", TFNG, answer.get("true_false_not_given", [])),
        ("YES_NO_NOT_GIVEN", YNNG, answer.get("yes_no_not_given", [])),
    ):
        for it in items if isinstance(items, list) else []:
            statement = _str(it.get("statement")) if isinstance(it, dict) else None
            if statement and it.get("answer") in answers:
                q = {
                    "type": kind,
                    "prompt": {"statement": statement},
                    "grading": {"type": kind, "answer": it["answer"]},
                }
                out.append(explained(q, it.get("evidence")))

    for it in answer.get("multiple_choice", []):
        options = [o for o in (_str(x, 200) for x in it.get("options", [])) if o] if isinstance(it, dict) else []
        stem, correct = _str(it.get("stem")) if isinstance(it, dict) else None, it.get("correct")
        if stem and len(set(options)) == 4 and isinstance(correct, int) and 0 <= correct < 4:
            q = {
                "type": "SINGLE_CHOICE",
                "prompt": {"stem": stem},
                "options": options,
                "grading": {"type": "SINGLE_CHOICE", "correctOption": correct},
            }
            out.append(explained(q, it.get("evidence")))

    for it in answer.get("choose_two", []):
        options = [o for o in (_str(x, 200) for x in it.get("options", [])) if o] if isinstance(it, dict) else []
        correct = it.get("correct") if isinstance(it, dict) else None
        stem = _str(it.get("stem")) if isinstance(it, dict) else None
        if (
            stem
            and len(set(options)) == 5
            and isinstance(correct, list)
            and len(set(correct)) == 2
            and all(isinstance(c, int) and 0 <= c < 5 for c in correct)
        ):
            out.append(
                {
                    "type": "MULTIPLE_CHOICE",
                    "prompt": {"stem": stem, "choose": 2},
                    "options": options,
                    "grading": {"type": "MULTIPLE_CHOICE", "correctOptions": sorted(correct)},
                }
            )

    # Matching information: one question, the statements as items, the paragraph letters as options.
    if len(letters) >= 2:
        items, matches = [], []
        for i, it in enumerate(answer.get("matching_information", [])):
            statement = _str(it.get("statement")) if isinstance(it, dict) else None
            letter = str(it.get("paragraph", "")).strip().upper()[:1] if isinstance(it, dict) else ""
            if statement and letter in letters:
                items.append({"itemId": f"i{i + 1}", "text": statement})
                matches.append({"itemId": f"i{i + 1}", "option": letters.index(letter)})
        if len(items) >= 2:
            out.append(
                {
                    "type": "MATCHING",
                    "prompt": {"variant": "INFORMATION", "items": items, "reuse": True},
                    "options": letters,
                    "grading": {"type": "MATCHING", "matches": matches},
                }
            )

    # Matching headings: a heading for each paragraph, plus a few that fit none.
    if len(letters) >= 3:
        given = {}
        for it in answer.get("headings", []):
            letter = str(it.get("paragraph", "")).strip().upper()[:1] if isinstance(it, dict) else ""
            heading = _str(it.get("heading"), 200) if isinstance(it, dict) else None
            if letter in letters and heading and letter not in given:
                given[letter] = heading
        extra = [h for h in (_str(x, 200) for x in answer.get("extra_headings", [])) if h]
        headings = sorted(set(given.values()) | set(extra))
        if len(given) == len(letters) and len(set(given.values())) == len(given):
            items = [{"itemId": f"p{i + 1}", "text": f"Paragraph {letter}"} for i, letter in enumerate(letters)]
            matches = [
                {"itemId": f"p{i + 1}", "option": headings.index(given[letter])} for i, letter in enumerate(letters)
            ]
            out.append(
                {
                    "type": "MATCHING",
                    "prompt": {"variant": "HEADINGS", "items": items, "reuse": False},
                    "options": headings,
                    "grading": {"type": "MATCHING", "matches": matches},
                }
            )

    for it in answer.get("sentence_completion", []):
        sentence = _str(it.get("sentence")) if isinstance(it, dict) else None
        word = _str(it.get("answer"), 100) if isinstance(it, dict) else None
        if not sentence or not word or _plain(word) not in script or _words(word) > 3:
            continue
        parts = GAP.split(sentence)
        if len(parts) != 2:
            continue
        segments = [
            s
            for s in (
                {"text": parts[0]} if parts[0] else None,
                {"gapId": "g1"},
                {"text": parts[1]} if parts[1] else None,
            )
            if s
        ]
        out.append(
            {
                "type": "COMPLETION",
                "prompt": {"variant": "SENTENCE", "segments": segments, "wordLimit": max(2, _words(word))},
                "grading": {"type": "COMPLETION", "gaps": [{"gapId": "g1", "accepted": [word]}]},
            }
        )

    for it in answer.get("short_answer", []):
        question = _str(it.get("question")) if isinstance(it, dict) else None
        word = _str(it.get("answer"), 100) if isinstance(it, dict) else None
        if question and word and _plain(word) in script and _words(word) <= 3:
            out.append(
                {
                    "type": "SHORT_ANSWER",
                    "prompt": {"question": question, "wordLimit": 3},
                    "grading": {"type": "SHORT_ANSWER", "accepted": [word]},
                }
            )
    return out


def draft_questions(
    blocks: list[dict[str, str]],
    level: str | None,
    model: LanguageModel | None,
    log: logging.Logger,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    """Questions for the whole text; without the model there are none (they can't be made by rules alone)."""
    if model is None:
        return {"ai": False, "questions": []}
    letters = [b.get("letter", "") for b in blocks]
    text = "\n\n".join(f"Paragraph {b.get('letter', '')}: {b['text']}" for b in blocks)
    prompt = (
        f"Learners' level: CEFR {level or 'B1'}.\n\nText:\n{text}\n\n"
        "Write questions about this text: 3 to 5 True/False/Not Given; 0 to 3 Yes/No/Not Given (only about the "
        "writer's own views or claims; none if the writer gives no views); 2 or 3 multiple choice with 4 options; "
        "0 or 1 'choose TWO' with 5 options; "
        + (
            "2 to 4 'which paragraph contains this information' with the paragraph letter; "
            if len(letters) >= 2
            else ""
        )
        + (
            f"a heading for each paragraph ({', '.join(letters)}) plus 2 extra headings that fit none; "
            if len(letters) >= 3
            else ""
        )
        + "2 or 3 sentence completions where the sentence has ___ for the missing words and the answer is 1 to 3 "
        "words copied from the text; 2 short-answer questions whose answers are 1 to 3 words copied from the text. "
        "'evidence' quotes the sentence the answer comes from. Leave a list empty rather than write a poor question."
    )
    keep_alive()
    try:
        answer = model.json(SYSTEM, prompt, SCHEMA, max_tokens=2500)
    except LanguageModelError as error:
        log.warning("language model unavailable", extra={"reason": str(error)})
        return {"ai": False, "questions": []}
    questions = build_questions(answer, letters, " ".join(b["text"] for b in blocks))
    return {"ai": True, "questions": questions}
