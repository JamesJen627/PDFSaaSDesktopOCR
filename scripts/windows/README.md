# Windows helpers for PDFSaaS Desktop OCR (no Task required).
#
# Typical flow:
#   1. Install JDK 25 and add java to PATH (or set JAVA_HOME).
#      If you only have Android Studio: a prior Gradle build may have cached JDK 25 under
#      %USERPROFILE%\.gradle\jdks — dev-backend.ps1 uses that automatically.
#   2. .\scripts\windows\ensure-gradle.ps1          # download Gradle wrapper dist if slow network
#   3. .\scripts\windows\dev-backend.ps1            # start Java backend on :8080
#      (bootRun stays at ~97% EXECUTING — normal; keep that window open)
#   4. Open a NEW terminal: .\scripts\windows\test-ocr-proxy.ps1 -Target java
#
# OCR Python service (separate terminal):
#   cd ocr-service
#   py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port 5002
