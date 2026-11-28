import logging
from typing import Any

from content_engine.lexical.explain import explain, fake_explain
from content_engine.vocab.llm import LanguageModelError

LOG = logging.getLogger("t")
PARAGRAPHS = [{"blockId": "p1", "text": "Farmers had little to rely on. They passed their observations on."}]


class Model:
    def __init__(self, answers: list[Any]) -> None:
        self.answers = answers
        self.prompts: list[str] = []

    def json(self, system: str, prompt: str, schema: dict[str, Any], max_tokens: int) -> dict[str, Any]:
        self.prompts.append(prompt)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def entry(n: int, **over: Any) -> dict[str, Any]:
    return {
        "n": n,
        "kind": "KEYWORD",
        "quote": "",
        "meaning": "a meaning",
        "synonyms": [],
        "example": "",
        "ielts_tip": "",
        **over,
    }


def test_explains_each_item_with_the_text_and_the_editors_note() -> None:
    items = [{"id": "a", "text": "rely on", "note": None}, {"id": "b", "text": "pass on", "note": "phrasal verb"}]
    model = Model(
        [
            {
                "explanations": [
                    entry(2, kind="PHRASAL_VERB", quote="passed … on", meaning=" to give  to others "),
                    entry(1, quote="rely on", synonyms=["depend on", " ", "count on"], example="We rely on data."),
                    entry(1, meaning="duplicate: ignored"),
                    entry(3, meaning="no such item: ignored"),
                ]
            }
        ]
    )
    result = explain(items, PARAGRAPHS, "B2", model, LOG)
    assert result["ai"] is True
    assert result["items"] == [
        {
            "id": "b",
            "kind": "PHRASAL_VERB",
            "quote": "passed … on",
            "meaning": "to give to others",
            "synonyms": [],
            "example": None,
            "ieltsTip": None,
        },
        {
            "id": "a",
            "kind": "KEYWORD",
            "quote": "rely on",
            "meaning": "a meaning",
            "synonyms": ["depend on", "count on"],
            "example": "We rely on data.",
            "ieltsTip": None,
        },
    ]
    assert "Farmers had little to rely on." in model.prompts[0]
    assert "(level B2)" in model.prompts[0]
    assert "2. pass on (editor's note: phrasal verb)" in model.prompts[0]


def test_asks_a_few_items_at_a_time_and_keeps_what_it_has_when_the_model_stops() -> None:
    items = [{"id": str(i), "text": f"item {i}", "note": None} for i in range(7)]
    model = Model([{"explanations": [entry(n) for n in range(1, 6)]}, LanguageModelError("down")])
    result = explain(items, PARAGRAPHS, None, model, LOG)
    assert [i["id"] for i in result["items"]] == ["0", "1", "2", "3", "4"]
    assert result["ai"] is True
    assert len(model.prompts) == 2


def test_without_the_model_nothing_is_explained() -> None:
    assert explain([{"id": "a", "text": "x", "note": None}], PARAGRAPHS, None, None, LOG) == {"ai": False, "items": []}


def test_the_fake_explains_every_item_recognizably() -> None:
    result = fake_explain([{"id": "a", "text": "rely on", "note": None}])
    assert result["items"][0]["meaning"] == "Meaning of “rely on”."
