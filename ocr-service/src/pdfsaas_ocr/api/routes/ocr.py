from __future__ import annotations

import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

from pdfsaas_ocr.contracts import HealthResponse, OcrMode, OcrProcessResponse
from pdfsaas_ocr.services import get_runtime

router = APIRouter()


@router.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": "PDFSaaS OCR",
            "endpoints": {
                "health": "/health",
                "docs": "/docs",
                "process": "POST /api/ocr/process",
                "warmup": "POST /api/ocr/warmup",
            },
        }
    )


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    runtime = get_runtime()
    status = runtime.status()
    return HealthResponse(
        status="UP",
        engine=status.engine,
        models_loaded=status.models_loaded,
        version=runtime.settings.version,
        gpu_available=status.gpu_available,
        load_error=status.load_error,
    )


@router.post("/api/ocr/warmup", response_model=HealthResponse)
def warmup_models() -> HealthResponse:
    runtime = get_runtime()
    status = runtime.warmup()
    return HealthResponse(
        status="UP" if status.models_loaded or status.engine == "stub" else "DEGRADED",
        engine=status.engine,
        models_loaded=status.models_loaded,
        version=runtime.settings.version,
        gpu_available=status.gpu_available,
        load_error=status.load_error,
    )


@router.post("/api/ocr/process", response_model=OcrProcessResponse)
async def process_ocr(
    file: UploadFile = File(...),
    page_index: int = Form(default=1),
    mode: OcrMode = Form(default=OcrMode.BALANCED),
    lang: str = Form(default="ch"),
) -> OcrProcessResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        image = Image.open(io.BytesIO(payload))
        image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Unsupported image format") from exc

    runtime = get_runtime()
    try:
        return runtime.recognize(image, page_index=page_index, mode=mode, lang=lang)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
