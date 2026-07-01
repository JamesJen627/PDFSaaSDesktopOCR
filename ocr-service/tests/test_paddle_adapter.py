from __future__ import annotations

import inspect
from unittest.mock import MagicMock, patch

from pdfsaas_ocr.config.settings import AppSettings
from pdfsaas_ocr.services.paddle_adapter import create_paddle_ocr


def test_create_paddle_ocr_disables_mkldnn_by_default() -> None:
    settings = AppSettings(enable_mkldnn=False, ocr_version="PP-OCRv4")
    fake_ocr = MagicMock()
    captured: dict = {}

    def _fake_init(**kwargs):
        captured.update(kwargs)
        return fake_ocr

    with patch("paddleocr.PaddleOCR", side_effect=_fake_init):
        result = create_paddle_ocr(settings, lang="en", use_textline_orientation=False)

    assert result is fake_ocr
    assert captured["enable_mkldnn"] is False
    assert captured["ocr_version"] == "PP-OCRv4"


def test_create_paddle_ocr_can_enable_mkldnn_when_configured() -> None:
    settings = AppSettings(enable_mkldnn=True)
    captured: dict = {}

    with patch("paddleocr.PaddleOCR", side_effect=lambda **kwargs: captured.update(kwargs) or MagicMock()):
        create_paddle_ocr(settings, lang="en", use_textline_orientation=False)

    assert captured["enable_mkldnn"] is True
