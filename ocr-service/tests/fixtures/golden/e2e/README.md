# Golden E2E OCR fixtures (Phase 5F)

End-to-end Paddle OCR regression: compare live OCR output against a user-maintained `expected.txt`.

## Layout

Each case is a subdirectory:

```
e2e/<case_id>/
  manifest.json   # lang, mode, thresholds, must_contain
  expected.txt    # golden reference text (UTF-8)
  page.png        # scan page image (you add this — not committed if large)
```

## Add a case

```powershell
cd ocr-service
uv run python scripts/golden_prepare.py my_book_p16 `
  --image "D:\scans\book-p16.png" `
  --expected "D:\scans\book-p16-corrected.txt" `
  --lang ch `
  --min-similarity 0.9 `
  --must-contain "给青年建筑师的信"
```

## Run comparison

```powershell
# List cases (shows missing page.png)
uv run python scripts/golden_run.py --list

# Run one case (requires Paddle + page.png)
uv run python scripts/golden_run.py --case marx_intro_scan_snippet

# Diff two text files manually
uv run python scripts/golden_diff.py actual.txt expected.txt --min-similarity 0.9
```

From repo root: `task ocr:golden:run -- --case marx_intro_scan_snippet`

## CI

`tests/test_golden_e2e.py` runs only when Paddle is installed **and** `page.png` exists. CI without local scan images skips e2e; post-process golden (`test_golden_cjk.py`) still runs.
