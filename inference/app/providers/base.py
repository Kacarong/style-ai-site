from dataclasses import dataclass
from typing import Protocol


@dataclass
class TryonInput:
    person_bytes: bytes
    garment_bytes: bytes


@dataclass
class TryonOutput:
    result_bytes: bytes
    content_type: str  # e.g. "image/png"
    model_used: str
    cost_usd: float


class Provider(Protocol):
    def run(self, inp: TryonInput) -> TryonOutput: ...
