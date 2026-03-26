import os

import redis


def build_redis_client() -> redis.Redis:
    """Build a Redis client from explicit host/port/password settings.

    If REDIS_URL is set and valid, it is used. If REDIS_URL is invalid,
    the client falls back to REDIS_HOST/REDIS_PORT/REDIS_DB/REDIS_PASSWORD.
    """
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            return redis.from_url(redis_url)
        except Exception:
            # Fall back to explicit settings to avoid URL parsing issues.
            pass

    host = os.getenv("REDIS_HOST", "redis-service")
    port = int(os.getenv("REDIS_PORT", "6379"))
    db = int(os.getenv("REDIS_DB", "0"))
    password = (os.getenv("REDIS_PASSWORD") or "").strip()
    if not password:
        raise RuntimeError("REDIS_PASSWORD must be set when REDIS_URL is not used")

    return redis.Redis(host=host, port=port, db=db, password=password)

