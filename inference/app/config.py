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
    # PROVIDER=fashn_vton_v15. Defaults match upstream examples/basic_inference.py.
    fashn_weights_dir: str = ""
    fashn_num_timesteps: int = 30        # 20=fast, 30=balanced, 50=quality
    fashn_guidance_scale: float = 1.5
    fashn_seed: int = 42
    fashn_segmentation_free: bool = True  # upstream default
    # "model" = garment is worn by a person in the photo
    # "flat-lay" = product shot (no model). Most uploads in this app are
    # product shots, so default to flat-lay.
    fashn_garment_photo_type: str = "flat-lay"


settings = Settings()  # type: ignore[call-arg]
