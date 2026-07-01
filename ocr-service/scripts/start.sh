#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OCR_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PORT="${OCR_SERVICE_PORT:-5002}"

if [[ ! -f "${OCR_ROOT}/pyproject.toml" ]]; then
  echo "[ocr-service] pyproject.toml not found at ${OCR_ROOT}" >&2
  exit 1
fi

cd "${OCR_ROOT}"

if command -v uv >/dev/null 2>&1; then
  exec uv run uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port "${PORT}"
fi

if [[ -x "${OCR_ROOT}/.venv/bin/python" ]]; then
  exec "${OCR_ROOT}/.venv/bin/python" -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port "${PORT}"
fi

echo "[ocr-service] Install uv or create .venv in ${OCR_ROOT}" >&2
exit 1
