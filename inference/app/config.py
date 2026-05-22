from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    shared_secret: str
    storage_dir: str = "./storage"
    storage_public_base_url: str = "http://localhost:8000"
    read_token_bytes: int = 32
    provider: str = "mock"
    fal_key: str = ""


settings = Settings()  # type: ignore[call-arg]
