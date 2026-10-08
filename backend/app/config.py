import os


def _csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    # postgresql+psycopg://user:pass@127.0.0.1:5432/paisapilot
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///dev.db")
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # 32 random bytes, base64. Generate: python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
    MASTER_KEY = os.getenv("MASTER_KEY", "")        # wraps per-user data keys
    BLIND_INDEX_KEY = os.getenv("BLIND_INDEX_KEY", "")  # HMAC for email lookup + OTP hashing
    JWT_SECRET = os.getenv("JWT_SECRET", "")

    ACCESS_TOKEN_MINUTES = 15
    REFRESH_TOKEN_DAYS = 30
    OTP_MINUTES = 10
    OTP_MAX_ATTEMPTS = 5

    GOOGLE_CLIENT_IDS = _csv(os.getenv("GOOGLE_CLIENT_IDS", ""))
    ALLOWED_ORIGINS = _csv(os.getenv("ALLOWED_ORIGINS", "https://paisa.auraa-ai.org"))

    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    AI_MODEL = os.getenv("AI_MODEL", "claude-haiku-5-5")
    AI_DAILY_QUOTA = int(os.getenv("AI_DAILY_QUOTA", "40"))

    MAIL_BACKEND = os.getenv("MAIL_BACKEND", "console")  # smtp | console | memory
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "PaisaPilot <no-reply@auraa-ai.org>")

    MAX_CONTENT_LENGTH = 6 * 1024 * 1024
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
