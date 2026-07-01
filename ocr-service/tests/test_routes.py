from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from pdfsaas_ocr.api.app import create_app
from pdfsaas_ocr.config.settings import OcrEngineMode, load_settings
from pdfsaas_ocr.services.runtime import reset_runtime


@pytest.fixture(autouse=True)
def _stub_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    load_settings.cache_clear()
    reset_runtime()
    monkeypatch.setenv("PDFSAAS_OCR_ENGINE", OcrEngineMode.STUB.value)


@pytest.fixture
def client() -> TestClient:
    reset_runtime()
    return TestClient(create_app())


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UP"
    assert body["engine"] == "stub"
    assert body["modelsLoaded"] is True


def test_root(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["endpoints"]["health"] == "/health"


def test_process_ocr(client: TestClient) -> None:
    image = Image.new("RGB", (120, 40), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    response = client.post(
        "/api/ocr/process",
        data={"page_index": "2", "mode": "balanced", "lang": "ch"},
        files={"file": ("page.png", buffer.getvalue(), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["pageIndex"] == 2
    assert "stub:120x40" in body["text"]
    assert body["boxes"]
