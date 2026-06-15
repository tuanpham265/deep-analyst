from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.tools  # noqa: F401 — import-side effect registers web_search + ask_user tools
from app.api import runs, ws
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Deep Analyst Backend", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(runs.router)
    app.include_router(ws.router)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
