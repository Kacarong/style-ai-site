from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    shared_secret: str
    storage_dir: str = "./storage"
    storage_public_base_url: str = "http://localhost:8000"
    read_token_bytes: int = 32
    provider: str = "mock"
    fal_key: str = ""

    # FASHN VTON v1.5 (open-source local model). Only used when
    # PROVIDER=fashn_vton_v15. Defaults match the upstream README's recommended
    # inference settings.
    fashn_weights_dir: str = ""
    fashn_num_timesteps: int = 50
    fashn_guidance_scale: float = 2.5
    fashn_seed: int = 42
    fashn_segmentation_free: bool = False


settings = Settings()  # type: ignore[call-arg]
