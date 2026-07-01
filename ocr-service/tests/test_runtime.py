from pdfsaas_ocr.config.settings import OcrEngineMode, load_settings
from pdfsaas_ocr.services.runtime import OcrRuntime, reset_runtime


def test_auto_mode_uses_paddle_when_installed(monkeypatch) -> None:
    load_settings.cache_clear()
    reset_runtime()
    monkeypatch.setenv("PDFSAAS_OCR_ENGINE", OcrEngineMode.AUTO.value)

    def _fail_paddle_init(_settings, *, use_textline_orientation: bool):
        raise ImportError("paddle disabled in unit test")

    monkeypatch.setattr(
        "pdfsaas_ocr.services.runtime.create_paddle_ocr",
        _fail_paddle_init,
    )

    runtime = OcrRuntime()
    status = runtime.status()
    assert status.engine == "paddleocr"
    assert status.models_loaded is False
    assert status.load_error is not None


def test_auto_mode_falls_back_to_stub_when_import_missing(monkeypatch) -> None:
    load_settings.cache_clear()
    reset_runtime()
    monkeypatch.setenv("PDFSAAS_OCR_ENGINE", OcrEngineMode.AUTO.value)

    import builtins

    real_import = builtins.__import__

    def _fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "paddleocr":
            raise ImportError("no paddle in test")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _fake_import)

    runtime = OcrRuntime()
    status = runtime.status()
    assert status.engine == "stub"
    assert status.models_loaded is True
