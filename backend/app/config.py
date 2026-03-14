from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "skillsclaw"
    S3_SECRET_KEY: str = "skillsclaw"
    S3_BUCKET_NAME: str = "skillsclaw-videos"
    S3_PUBLIC_URL: str = "http://localhost:9000"

    # Text generation provider for synthesis + SKILL.md generation
    # Values: "anthropic" | "openai" | "gemini" | "openrouter" | "ollama"
    LLM_PROVIDER: str = "ollama"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_TEXT_MODEL: str = "claude-sonnet-4-6"

    OPENAI_API_KEY: str = ""
    OPENAI_TEXT_MODEL: str = "gpt-4o-mini"

    GOOGLE_API_KEY: str = ""
    GEMINI_TEXT_MODEL: str = "gemini-1.5-flash"

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_TEXT_MODEL: str = "openai/gpt-4o-mini"

    # Ollama local/remote server for text generation fallback
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_TEXT_MODEL: str = "qwen2.5:7b-instruct"
    OLLAMA_TIMEOUT_SECONDS: int = 600
    OLLAMA_MAX_RETRIES: int = 2

    # Shared timeout/retry controls for remote providers
    LLM_REQUEST_TIMEOUT_SECONDS: int = 90
    LLM_MAX_RETRIES: int = 2

    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    RESEND_API_KEY: str
    FRONTEND_URL: str = "http://localhost:5173"

    # Set to true in local dev to skip all auth checks
    DEV_MODE: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
