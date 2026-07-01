from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from pdfsaas_ocr.api.routes import ocr_router
from pdfsaas_ocr.config import load_settings
from pdfsaas_ocr.services import get_runtime
from pdfsaas_ocr.services.paddle_env import configure_paddle_runtime

configure_paddle_runtime(load_settings())


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    settings = load_settings()
    if settings.preload:
        get_runtime().warmup()
    yield


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI(title="PDFSaaS OCR Service", version=settings.version, lifespan=_lifespan)
    app.include_router(ocr_router)
    return app


app = create_app()
