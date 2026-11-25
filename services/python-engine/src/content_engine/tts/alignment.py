"""From a provider's character timings to word timings per text block (offsets in code points)."""

import re
from typing import TypedDict

from .providers import Alignment

# Words, with straight or curly apostrophes and inner hyphens ("don't", "well-known").
APOSTROPHES = "'\u2019"
WORD = re.compile(rf"[\w{APOSTROPHES}]+(?:-[\w{APOSTROPHES}]+)*")


class Block(TypedDict):
    blockId: str
    start: int
    length: int


class WordTiming(TypedDict):
    blockId: str
    start: int
    end: int
    startMs: int
    endMs: int


def word_timings(text: str, blocks: list[Block], alignment: Alignment | None) -> list[WordTiming]:
    """
    One entry per word: its block, its code-point offsets in that block's text, and when it's spoken.
    Python strings index by code point, like the API. When the provider's characters don't line up with the text
    we sent, there are no timings rather than wrong ones (AGENTS.md §5.2: timings are never invented).
    """
    if alignment is None or "".join(alignment.characters) != text:
        return []
    out: list[WordTiming] = []
    for block in blocks:
        block_text = text[block["start"] : block["start"] + block["length"]]
        for match in WORD.finditer(block_text):
            first = block["start"] + match.start()
            last = block["start"] + match.end() - 1
            out.append(
                {
                    "blockId": block["blockId"],
                    "start": match.start(),
                    "end": match.end(),
                    "startMs": round(alignment.starts[first] * 1000),
                    "endMs": round(alignment.ends[last] * 1000),
                }
            )
    return out
