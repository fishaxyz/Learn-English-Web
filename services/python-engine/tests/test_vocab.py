import json
import logging
from typing import Any

import httpx

from content_engine.jobs import JobRunner
from content_engine.tts.providers import SilentFake
from content_engine.vocab.llm import LanguageModel
from content_engine.vocab.nlp import candidates
from content_engine.vocab.suggest import suggest

TEXT = "Zoë gave up her old job. Her commute was a piece of cake, but the bureaucracy was tiring."
LOG = logging.getLogger("t")


def model_answering(answer: dict[str, Any] | None, calls: list[dict[str, Any]] | None = None) -> LanguageModel:
    """A stand-in for llama.cpp's server: answers with `answer`, or fails to connect when it's None."""

    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(json.loads(request.content))
        if answer is None:
            raise httpx.ConnectError("refused")
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    return LanguageModel("http://llm.test/v1", "qwen3-14b", 5, transport=httpx.MockTransport(handle))


def test_finds_phrasal_verbs_and_words_rarer_than_the_level_in_code_points() -> None:
    found = {c.display_form: c for c in candidates("para-1", TEXT, "B1")}
    give_up = found["give up"]
    assert (give_up.kind, give_up.surface, give_up.start) == ("PHRASAL_VERB", "gave up", 4)  # "Zoë" is 3 code points
    assert found["bureaucracy"].kind == "WORD" and found["bureaucracy"].part_of_speech == "noun"
    assert "job" not in found  # common: known at B1
    assert all(TEXT[c.start : c.end] == c.surface for c in found.values())


def test_the_model_adds_expressions_and_meanings_and_words_inside_them_are_dropped() -> None:
    calls: list[dict[str, Any]] = []
    answer = {
        "expressions": [
            {
                "text": "a piece of cake",
                "base_form": "a piece of cake",
                "kind": "IDIOM",
                "definition": "very easy",
                "level": "B1",
            },
            {"text": "not in the text", "base_form": "x", "kind": "IDIOM", "definition": "?", "level": "B1"},
        ],
        "meanings": [{"word": "bureaucracy", "definition": "rules and paperwork in offices", "level": "C1"}],
    }
    renewed: list[int] = []
    result = suggest(
        [{"blockId": "para-1", "text": TEXT}], "B1", model_answering(answer, calls), LOG, lambda: renewed.append(1)
    )
    assert result["ai"] is True and renewed == [1]
    assert calls[0]["chat_template_kwargs"] == {"enable_thinking": False}
    items = {s["displayForm"]: s for s in result["suggestions"]}
    assert items["a piece of cake"]["source"] == "ai" and items["a piece of cake"]["surfaceText"] == "a piece of cake"
    assert "x" not in items  # not in the text: never invented
    assert "cake" not in items  # inside the idiom
    assert items["bureaucracy"]["definition"] == "rules and paperwork in offices"
    assert items["bureaucracy"]["cefrLevel"] == "C1"  # the model's level, not the frequency guess


def test_without_the_model_suggestions_still_come_from_word_frequency() -> None:
    result = suggest([{"blockId": "para-1", "text": TEXT}], "B1", model_answering(None), LOG)
    assert result["ai"] is False
    assert {"give up", "bureaucracy"} <= {s["displayForm"] for s in result["suggestions"]}
    assert all(s["definition"] is None for s in result["suggestions"])


def test_the_worker_runs_a_vocab_job_and_renews_its_lease() -> None:
    calls: list[tuple[str, dict[str, object] | None]] = []
    job: dict[str, Any] | None = {
        "id": "job-3",
        "type": "vocab.suggest",
        "claimToken": "token-3",
        "attempt": 1,
        "payload": {"revisionId": "r", "textHash": "h", "level": "B1", "blocks": [{"blockId": "para-1", "text": TEXT}]},
    }

    class Api:
        def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, Any]:
            nonlocal job
            name = query.split()[1]
            calls.append((name, variables))
            if name.startswith("Claim"):
                claimed, job = job, None
                return {"claimJob": claimed}
            return {}

    runner = JobRunner(Api(), SilentFake(), LOG, language_model=model_answering({"expressions": [], "meanings": []}))
    assert runner.run_next() is True
    names = [n.split("(")[0] for n, _ in calls]
    assert names == ["Claim", "Renew", "Complete"]
    result = calls[-1][1]["result"]  # type: ignore[index]
    assert result["ai"] is True and result["suggestions"]  # type: ignore[index]
