"""Candidates from the text itself: content words rarer than the lesson's level, and phrasal verbs (spaCy)."""

from dataclasses import dataclass
from functools import cache
from typing import Any

from wordfreq import zipf_frequency

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
# Words more common than this (wordfreq's Zipf scale: 7 = "the", 3 = rare) are assumed known at that level.
KNOWN_ABOVE = {"A1": 5.6, "A2": 5.2, "B1": 4.8, "B2": 4.4, "C1": 4.0, "C2": 3.6}
CONTENT_WORDS = {"NOUN": "noun", "VERB": "verb", "ADJ": "adjective", "ADV": "adverb"}


def level_of(zipf: float) -> str:
    """A rough CEFR guess from how common a word is; editors check it."""
    for level, floor in (("A1", 5.5), ("A2", 5.0), ("B1", 4.5), ("B2", 4.0), ("C1", 3.5)):
        if zipf >= floor:
            return level
    return "C2"


@dataclass
class Candidate:
    kind: str
    display_form: str
    part_of_speech: str
    block_id: str
    start: int
    end: int
    surface: str
    zipf: float | None
    source: str = "nlp"
    definition: str | None = None
    level: str | None = None

    def as_result(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "displayForm": self.display_form,
            "partOfSpeech": self.part_of_speech,
            "blockId": self.block_id,
            "start": self.start,
            "end": self.end,
            "surfaceText": self.surface,
            "definition": self.definition,
            "cefrLevel": self.level,
            "zipf": None if self.zipf is None else round(self.zipf, 2),
            "source": self.source,
        }


@cache
def _nlp() -> Any:
    import spacy  # loaded once, only by workers that make suggestions

    return spacy.load("en_core_web_sm", disable=["ner"])


def candidates(block_id: str, text: str, level: str | None) -> list[Candidate]:
    """Phrasal verbs, then content words rarer than the level (rarest first), each once per block."""
    doc = _nlp()(text)
    known_above = KNOWN_ABOVE.get(level or "B1", 4.8)
    phrasal: list[Candidate] = []
    words: list[Candidate] = []
    seen: set[str] = set()
    for tok in doc:
        particles = [c for c in tok.children if c.dep_ == "prt"]
        if tok.pos_ == "VERB" and particles:
            prt = particles[0]
            start, end = min(tok.idx, prt.idx), max(tok.idx + len(tok.text), prt.idx + len(prt.text))
            form = f"{tok.lemma_.lower()} {prt.lower_}"
            if form not in seen and end - start <= 40:
                seen.add(form)
                z = zipf_frequency(form, "en")
                phrasal.append(
                    Candidate(
                        "PHRASAL_VERB",
                        form,
                        "phrasal verb",
                        block_id,
                        start,
                        end,
                        text[start:end],
                        z or None,
                        level=level_of(z) if z else None,
                    )
                )
            continue
        if tok.pos_ not in CONTENT_WORDS or not tok.is_alpha or tok.is_stop or len(tok.text) < 3:
            continue
        lemma = tok.lemma_.lower()
        z = zipf_frequency(lemma, "en")
        # Very rare "words" are mostly names and typos; very common ones are already known.
        if lemma in seen or z >= known_above or z < 1.5:
            continue
        seen.add(lemma)
        words.append(
            Candidate(
                "WORD",
                lemma,
                CONTENT_WORDS[tok.pos_],
                block_id,
                tok.idx,
                tok.idx + len(tok.text),
                tok.text,
                z,
                level=level_of(z),
            )
        )
    words.sort(key=lambda c: c.zipf or 0)
    return phrasal + words
