from .base import Provider, TryonInput, TryonOutput


class FalKlingProvider(Provider):
    """
    Paid fallback: Kling Kolors Virtual Try-On v1.5 via fal.ai (~$0.07/image).
    Use when you don't want to run the GPU locally.

    TODO: implement using `fal_client`.
    """

    def run(self, inp: TryonInput) -> TryonOutput:  # pragma: no cover - stub
        raise NotImplementedError(
            "fal Kling provider is a stub. Add `fal-client` to requirements, "
            "set FAL_KEY in .env, and implement run()."
        )
