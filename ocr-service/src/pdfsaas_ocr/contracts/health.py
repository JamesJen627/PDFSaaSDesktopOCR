from pdfsaas_ocr.models import ApiModel


class HealthResponse(ApiModel):
    status: str
    engine: str
    models_loaded: bool
    version: str
    gpu_available: bool
    load_error: str | None = None
