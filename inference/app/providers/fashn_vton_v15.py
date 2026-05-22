from .base import Provider, TryonInput, TryonOutput


class FashnVtonV15Provider(Provider):
    """
    FASHN VTON v1.5 (open-source). ~2GB weights.
    TODO: load model on first call (cache in module-level state), then run.

    Reference: https://github.com/fashn-AI/tryon-inference (replace with the
    actual repo when wiring real inference).
    """

    def __init__(self) -> None:
        # Lazy-load on first run() to keep startup fast and allow PROVIDER=mock
        # to skip torch entirely.
        self._pipe = None

    def run(self, inp: TryonInput) -> TryonOutput:  # pragma: no cover - stub
        raise NotImplementedError(
            "FASHN VTON v1.5 provider is a stub. "
            "Install torch (cu128), download weights, and implement run()."
        )
