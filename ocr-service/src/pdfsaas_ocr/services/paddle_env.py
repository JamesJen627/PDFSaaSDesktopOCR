"""Configure Paddle runtime flags before any `import paddle`."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pdfsaas_ocr.config.settings import AppSettings

logger = logging.getLogger(__name__)

_CONFIGURED = False


def configure_paddle_runtime(settings: AppSettings | None = None) -> None:
    """Apply CPU inference workarounds for PaddlePaddle 3.3.x + oneDNN on Windows."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    if settings is None:
        from pdfsaas_ocr.config import load_settings

        settings = load_settings()

    # PaddleX may force PIR on CPU; disable before paddle is imported.
    os.environ.setdefault("FLAGS_enable_pir_api", "0")

    if not settings.enable_mkldnn:
        os.environ.setdefault("FLAGS_use_mkldnn", "0")
        os.environ.setdefault("FLAGS_use_onednn", "0")
        logger.info(
            "Paddle CPU inference: MKLDNN/oneDNN disabled (PDFSAAS_OCR_ENABLE_MKLDNN=false)"
        )

    _CONFIGURED = True
