"""From a provider's character timings to word timings per text block (offsets in code points)."""

import re
from typing import NotRequired, TypedDict

from .providers import Alignment

# Words, with straight or curly apostrophes and inner hyphens ("don't", "well-known").
APOSTROPHES = "'\u2019"
WORD = re.compile(rf"[\w{APOSTROPHES}]+(?:-[\w{APOSTROPHES}]+)*")


class Block(TypedDict):
    blockId: str
    start: int
    length: int
    # Code points at the start of the block that weren't read (a "HOST1:" label): added back to word offsets.
    offset: NotRequired[int]
    host: NotRequired[int | None]


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
        skipped = block.get("offset", 0)
        for match in WORD.finditer(block_text):
            first = block["start"] + match.start()
            last = block["start"] + match.end() - 1
            out.append(
                {
                    "blockId": block["blockId"],
                    "start": skipped + match.start(),
                    "end": skipped + match.end(),
                    "startMs": round(alignment.starts[first] * 1000),
                    "endMs": round(alignment.ends[last] * 1000),
                }
            )
    return out


def turn_timings(
    text: str, block_id: str, offset: int, alignment: Alignment | None, shift_ms: int = 0
) -> list[WordTiming]:
    """
    Word timings for one conversation turn: `alignment` covers exactly this turn's text, `offset` is where the
    text starts in its block (after the "HOST1:" label) and `shift_ms` where its part starts in the joined audio.
    """
    if alignment is None or "".join(alignment.characters) != text:
        return []
    return [
        {
            "blockId": block_id,
            "start": offset + match.start(),
            "end": offset + match.end(),
            "startMs": shift_ms + round(alignment.starts[match.start()] * 1000),
            "endMs": shift_ms + round(alignment.ends[match.end() - 1] * 1000),
        }
        for match in WORD.finditer(text)
    ]
