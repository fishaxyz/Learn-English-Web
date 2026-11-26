import logging
from typing import Any

from content_engine.translations.translate import translate
from content_engine.vocab.llm import LanguageModelError

LOG = logging.getLogger("t")
PARAGRAPHS = [
    {
        "blockId": "p1",
        "sentences": [
            {"start": 0, "end": 20, "text": "Her commute is long."},
            {"start": 21, "end": 44, "text": "She reads on the train."},
        ],
    },
    {"blockId": "p2", "sentences": [{"start": 0, "end": 17, "text": "It takes an hour."}]},
]


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


def test_one_translation_per_sentence_with_the_paragraph_as_context() -> None:
    model = Model(
        [
            {
                "translations": [
                    {"n": 2, "text": "Cô ấy đọc sách  trên tàu."},
                    {"n": 1, "text": "Quãng đường đi làm của cô ấy dài."},
                    {"n": 1, "text": "duplicate: ignored"},
                    {"n": 7, "text": "no such sentence: ignored"},
                ]
            },
            {"translations": [{"n": 1, "text": "Mất một tiếng."}]},
        ]
    )
    kept: list[int] = []
    result = translate(PARAGRAPHS, "vi", model, LOG, keep_alive=lambda: kept.append(1))  # type: ignore[arg-type]
    assert result == {
        "ai": True,
        "items": [
            {"blockId": "p1", "start": 21, "text": "Cô ấy đọc sách trên tàu."},
            {"blockId": "p1", "start": 0, "text": "Quãng đường đi làm của cô ấy dài."},
            {"blockId": "p2", "start": 0, "text": "Mất một tiếng."},
        ],
    }
    assert "Translate into Vietnamese." in model.prompts[0]
    assert "1. Her commute is long.\n2. She reads on the train." in model.prompts[0]
    assert len(kept) == 2  # the job stays claimed between paragraphs


def test_without_the_model_nothing_or_what_was_done() -> None:
    assert translate(PARAGRAPHS, "fr", None, LOG) == {"ai": False, "items": []}
    model = Model([{"translations": [{"n": 1, "text": "Son trajet est long."}]}, LanguageModelError("down")])
    result = translate(PARAGRAPHS, "fr", model, LOG)  # type: ignore[arg-type]
    assert result == {"ai": True, "items": [{"blockId": "p1", "start": 0, "text": "Son trajet est long."}]}
    assert translate(PARAGRAPHS, "es", Model([]), LOG) == {"ai": False, "items": []}  # type: ignore[arg-type]


def test_fake_translations_for_browser_tests() -> None:
    from content_engine.translations.translate import fake_translate

    assert fake_translate(PARAGRAPHS, "vi")["items"][0] == {
        "blockId": "p1",
        "start": 0,
        "text": "[VI] Her commute is long.",
    }
