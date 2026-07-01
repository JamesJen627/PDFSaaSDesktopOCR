@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "OCR_ROOT=%SCRIPT_DIR%.."

if not exist "%OCR_ROOT%\pyproject.toml" (
  echo [ocr-service] pyproject.toml not found at %OCR_ROOT%
  exit /b 1
)

if "%OCR_SERVICE_PORT%"=="" set "OCR_SERVICE_PORT=5002"

rem PaddlePaddle 3.3.x on Windows CPU: disable oneDNN/PIR before Python starts.
if "%FLAGS_enable_pir_api%"=="" set "FLAGS_enable_pir_api=0"
if "%PDFSAAS_OCR_ENABLE_MKLDNN%"=="" set "PDFSAAS_OCR_ENABLE_MKLDNN=0"
if "%PDFSAAS_OCR_ENABLE_MKLDNN%"=="0" (
  if "%FLAGS_use_mkldnn%"=="" set "FLAGS_use_mkldnn=0"
  if "%FLAGS_use_onednn%"=="" set "FLAGS_use_onednn=0"
)

where uv >nul 2>&1
if %ERRORLEVEL%==0 (
  pushd "%OCR_ROOT%"
  uv run uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port %OCR_SERVICE_PORT%
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

if exist "%OCR_ROOT%\.venv\Scripts\python.exe" (
  pushd "%OCR_ROOT%"
  "%OCR_ROOT%\.venv\Scripts\python.exe" -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port %OCR_SERVICE_PORT%
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  pushd "%OCR_ROOT%"
  py -3 -m pip install -e . >nul 2>&1
  py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port %OCR_SERVICE_PORT%
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

echo [ocr-service] Install uv or run `py -3 -m pip install -e .` in %OCR_ROOT%
exit /b 1
