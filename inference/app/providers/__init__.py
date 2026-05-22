from ..config import settings
from .base import Provider, TryonInput, TryonOutput
from .mock import MockProvider


def get_provider() -> Provider:
    name = settings.provider
    if name == "mock":
        return MockProvider()
    if name == "fashn_vton_v15":
        from .fashn_vton_v15 import FashnVtonV15Provider

        return FashnVtonV15Provider()
    if name == "fal_kling":
        from .fal_kling import FalKlingProvider

        return FalKlingProvider()
    raise ValueError(f"unknown PROVIDER={name}")


__all__ = ["Provider", "TryonInput", "TryonOutput", "get_provider"]
