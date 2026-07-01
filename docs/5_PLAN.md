# 5_PLAN — 中文扫描增强（Phase 5）

## 目标

提升扫描类中文 PDF 的 OCR 质量：减少噪点乱码（`^`、`|`、`..:`）、异体字（`⺠`/`⻢`）和形近错字（患/思）。

## Phase 5A — 扫描预处理（ocr-service）✅

- `image_preprocess.py`：中文 OCR 前 CLAHE + median 去噪（OpenCV；无 OpenCV 时 PIL 回退）
- 配置：`PDFSAAS_OCR_ENABLE_SCAN_PREPROCESS=true`（默认开）

## Phase 5B — 中文默认质量（Electron）✅

- `lang=ch|ch+en` → `mode=high-quality`，`dpi=250`
- `lang=en` → `mode=balanced`，`dpi=150`
- UI 语言切换区显示当前默认参数

## Phase 5C — 中文后处理（ocr-service）✅

- `cjk_cleanup.py`：NFKC 规范化、去除扫描噪点标点、过滤低置信 junk box
- 少量高频短语纠偏（如「马克患主义」→「马克思主义」）
- 配置：`PDFSAAS_OCR_CJK_MIN_BOX_CONFIDENCE=0.45`

## Phase 5D — 黄金样本回归 ✅

- `tests/fixtures/golden/*.json`：真实扫描 OCR 片段 + `must_contain` / `must_not_contain` 断言
- `tests/test_golden_cjk.py`：CI 可跑的 post-process 回归（无需 Paddle）
- `scripts/golden_diff.py`：手工对比 actual vs expected 文本
- `task ocr:test:golden`：只跑黄金测试

## Phase 5E — 扫描预处理加强 ✅

- 三档强度：`light` | `normal` | `aggressive`（默认 **aggressive**，面向扫描件）
- OpenCV：`MORPH_OPEN` 去椒盐 + bilateral 保边去噪 + 可调 CLAHE
- 环境变量：`PDFSAAS_OCR_SCAN_PREPROCESS_STRENGTH=aggressive`

## 验收

1. 重启 OCR（Paddle）+ Backend + Electron
2. UI 选 **中文**，跑导论 PDF 全流程
3. `task ocr:test:golden` 通过
4. 双层 PDF 文字层：乱码标点减少，「民族」「马克思主义」等关键字更完整

## Phase 5F — 端到端 Paddle 黄金对比 ✅

用户自备扫描页 `page.png` + 人工校正 `expected.txt`，与 live Paddle OCR 输出对比。

| 工具 | 用途 |
|------|------|
| `tests/fixtures/golden/e2e/<id>/` | `manifest.json` + `expected.txt` + 本地 `page.png` |
| `scripts/golden_prepare.py` | 从图片 + txt 脚手架生成 case |
| `scripts/golden_run.py` | 跑 Paddle OCR 并对比 expected |
| `scripts/golden_diff.py` | 手工对比两个 txt（`--min-similarity` / `--manifest`） |
| `golden_compare.py` | 相似度 + must_contain 断言（测试/脚本共用） |

```powershell
task ocr:golden:prepare -- my_scan --image D:\scan.png --expected D:\corrected.txt --lang ch
task ocr:golden:run -- --case my_scan
task ocr:golden:diff -- actual.txt expected.txt --min-similarity 0.9
task ocr:test:golden          # CI：后处理 + compare 单元测试
task ocr:test:golden:e2e      # 本地：需 paddle + page.png
```

示例 case：`e2e/marx_intro_scan_snippet/`（expected.txt 已提交；page.png 本地添加）。

## 后续

- 双栏阅读顺序 → 见 `6_PLAN.md`（Phase 6A）✅
