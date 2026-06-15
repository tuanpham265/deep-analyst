import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


class Settings(BaseModel):
    opencode_zen_api_key: str = ""
    model: str = "openai/qwen3-coder"
    base_url: str = "https://opencode.ai/zen/v1"
    host: str = "127.0.0.1"
    port: int = 8000
    frontend_origin: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        opencode_zen_api_key=os.getenv("OPENCODE_ZEN_API_KEY", ""),
        model=os.getenv("OPENHANDS_MODEL", "openai/qwen3-coder"),
        base_url=os.getenv("OPENHANDS_BASE_URL", "https://opencode.ai/zen/v1"),
        host=os.getenv("BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("BACKEND_PORT", "8000")),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
    )
