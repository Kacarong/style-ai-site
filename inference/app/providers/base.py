from dataclasses import dataclass
from typing import Protocol


@dataclass
class TryonInput:
    person_bytes: bytes
    garment_bytes: bytes
    # Free-text garment category (user-entered). Providers may normalize to
    # their own enum. Mock ignores it; FASHN expects "tops"|"bottoms"|"one-pieces"
    # and maps Korean/English free text in _normalize_category().
    category: str | None = None


@dataclass
class TryonOutput:
    result_bytes: bytes
    content_type: str  # e.g. "image/png"
    model_used: str
    cost_usd: float


class Provider(Protocol):
    def run(self, inp: TryonInput) -> TryonOutput: ...
