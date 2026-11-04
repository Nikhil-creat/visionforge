from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "VisionForge Enterprise"

    # --- LLM providers (both free tiers; either one is enough) ---
    groq_api_key: str = ""
    gemini_api_key: str = ""
    llm_timeout: float = 25.0

    # --- Access control ---
    # Comma separated list. Empty = open dev mode (rate limited by IP only).
    api_keys: str = ""
    cors_origins: str = "http://localhost:3000"

    # --- Infra ---
    redis_url: str = "redis://redis:6379/0"      # use rediss://... for Upstash / TLS providers
    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str = ""                     # needed for Qdrant Cloud
    data_dir: str = "/data"

    # --- Multi-assistant council ---
    council_max_members: int = 4
    council_member_timeout: float = 20.0

    # --- Prompt guardrails / audit ---
    guard_block_threshold: float = 0.8
    audit_enabled: bool = True
    audit_salt: str = "visionforge"
    vision_llm: bool = True                      # allow Gemini-vision "describe" (still needs per-request consent)

    # --- Guardrails ---
    max_upload_mb: int = 50
    # Number of reverse proxies in front of the API that APPEND to X-Forwarded-For (Render = 1). 0 = ignore the header
    # (safe default: a client can forge it to dodge rate limits).
    trusted_proxy_hops: int = 0
    max_side: int = 2048            # inputs larger than this are downscaled before tensor work
    max_input_pixels: int = 80_000_000
    max_output_pixels: int = 48_000_000
    ttl_seconds: int = 3600         # processed assets auto-delete after 1h unless pinned
    rate_capacity: int = 30         # token bucket size
    rate_refill_per_sec: float = 0.5

    # --- Optional heavy models (off by default so CPU boxes boot fast) ---
    enable_clip: bool = False
    enable_cnn: bool = False
    enable_ocr: bool = False
    enable_nsfw_model: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def api_key_set(self) -> set[str]:
        return {k.strip() for k in self.api_keys.split(",") if k.strip()}

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
