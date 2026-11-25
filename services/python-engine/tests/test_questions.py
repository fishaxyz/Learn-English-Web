import logging
from typing import Any

from content_engine.questions.draft import build_questions, draft_questions

LOG = logging.getLogger("t")
TEXT_A = "Mia lives in a small town. Every morning she cycles along the river to the station."
TEXT_B = "Her commute takes about forty minutes. On rainy days she takes the bus."
TEXT_C = "She thinks cycling is the best way to start the day."
BLOCKS = [
    {"blockId": "p1", "letter": "A", "text": TEXT_A},
    {"blockId": "p2", "letter": "B", "text": TEXT_B},
    {"blockId": "p3", "letter": "C", "text": TEXT_C},
]
ANSWER: dict[str, Any] = {
    "true_false_not_given": [
        {"statement": "Mia drives to the station.", "answer": "FALSE", "evidence": "she cycles along the river"},
        {"statement": "Bad", "answer": "MAYBE", "evidence": ""},  # not a judgement: dropped
    ],
    "yes_no_not_given": [{"statement": "Cycling is a good start to the day.", "answer": "YES", "evidence": ""}],
    "multiple_choice": [
        {
            "stem": "How long is the commute?",
            "options": ["20 min", "about forty minutes", "1 hour", "2 hours"],
            "correct": 1,
            "evidence": "about forty minutes",
        },
        {"stem": "Same options twice", "options": ["a", "a", "b", "c"], "correct": 0, "evidence": ""},  # dropped
    ],
    "choose_two": [{"stem": "Which TWO are true?", "options": ["v", "w", "x", "y", "z"], "correct": [3, 1]}],
    "matching_information": [
        {"statement": "how long a journey takes", "paragraph": "B"},
        {"statement": "where Mia lives", "paragraph": "a"},
        {"statement": "nowhere", "paragraph": "Z"},  # no paragraph Z: left out
    ],
    "headings": [
        {"paragraph": "A", "heading": "A morning ride"},
        {"paragraph": "B", "heading": "Time and weather"},
        {"paragraph": "C", "heading": "An opinion"},
    ],
    "extra_headings": ["Life in the city"],
    "sentence_completion": [
        {"sentence": "On rainy days Mia takes the ___.", "answer": "bus"},
        {"sentence": "Mia rides a ___.", "answer": "scooter"},  # not in the text: dropped
    ],
    "short_answer": [
        {"question": "Where does Mia cycle?", "answer": "along the river"},
        {"question": "What is her job?", "answer": "a very long answer from nowhere"},  # dropped
    ],
}


def test_the_models_answer_becomes_questions_and_weak_ones_are_dropped() -> None:
    questions = build_questions(ANSWER, ["A", "B", "C"], " ".join(b["text"] for b in BLOCKS))
    types = [q["type"] for q in questions]
    assert types == [
        "TRUE_FALSE_NOT_GIVEN",
        "YES_NO_NOT_GIVEN",
        "SINGLE_CHOICE",
        "MULTIPLE_CHOICE",
        "MATCHING",
        "MATCHING",
        "COMPLETION",
        "SHORT_ANSWER",
    ]
    tfng = questions[0]
    assert tfng["explanation"] == "From the text: she cycles along the river"
    assert questions[3]["grading"]["correctOptions"] == [1, 3]
    info = questions[4]
    assert info["prompt"]["variant"] == "INFORMATION" and info["options"] == ["A", "B", "C"]
    assert info["grading"]["matches"] == [{"itemId": "i1", "option": 1}, {"itemId": "i2", "option": 0}]
    headings = questions[5]
    assert headings["prompt"]["variant"] == "HEADINGS" and len(headings["options"]) == 4
    assert headings["options"][headings["grading"]["matches"][0]["option"]] == "A morning ride"
    completion = questions[6]
    assert completion["prompt"]["segments"] == [
        {"text": "On rainy days Mia takes the "},
        {"gapId": "g1"},
        {"text": "."},
    ]
    assert completion["grading"]["gaps"][0]["accepted"] == ["bus"]


def test_without_the_model_no_questions_are_drafted() -> None:
    assert draft_questions(BLOCKS, "B1", None, LOG) == {"ai": False, "questions": []}
