# PDFSaaS Desktop OCR

基于 [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) 深度 fork 的二次开发项目，目标是构建**本地优先**的 PDF OCR 与双层可搜索 PDF 处理桌面应用。

## 项目来源

本仓库以 Stirling-PDF 为基底，保留其 PDF 解析、页面渲染、合并/拆分/压缩等基础能力，在此基础上扩展：

- 中文优先 OCR（PaddleOCR 主力，Tesseract 降级）
- 图像预处理与布局分析（PP-Structure）
- 双层 PDF 生成（扫描图层 + 可搜索文本层）
- 批处理任务队列与 GPU 加速
- **Electron** 桌面客户端（Windows 优先）

架构模式为 **Fork + 强耦合扩展**，非插件式集成。产品需求见 `docs/PRDs/`，实施计划见 `docs/1_PLAN.md`。

上游项目：

- 仓库：https://github.com/Stirling-Tools/Stirling-PDF
- 文档：https://docs.stirlingpdf.com

## 概况

| 项目 | 说明 |
|------|------|
| 定位 | 本地 Document AI：扫描 PDF → 可搜索、可复制、结构保留的输出 |
| 桌面端 | Electron（`frontend/electron/`） |
| 后端 | Stirling-PDF Java 服务 + Python OCR Service（规划中） |
| 数据 | 默认完全本地处理，不上传 PDF |
| 界面语言 | 简体中文、繁体中文、English（规划） |
| 当前阶段 | Phase 0 已完成（Electron 脚手架与共享类型）；Phase 1 进行中 |

## 目录（二开相关）

```
frontend/electron/     # Electron 桌面应用（OCR 产品线）
docs/PRDs/             # 产品需求文档
docs/1_PLAN.md         # Electron 壳实施计划
app/                   # Stirling-PDF Java 后端（fork 修改）
engine/                # 上游 AI Engine（与本 OCR 产品线独立）
```

## 开发

依赖 [Task](https://taskfile.dev/) 作为统一命令入口：

```bash
task install              # 安装依赖（含 electron）
task electron:typecheck   # 校验 Electron 脚手架
task electron:test        # Phase 0 单元测试
task backend:dev          # 启动 Java 后端（:8080）
```

Stirling-PDF 原有开发流程仍可用（`task dev`、`DeveloperGuide.md` 等），与本 OCR 桌面产品线并行存在。

## 许可证

本仓库继承 Stirling-PDF 的 open-core 结构：核心模块为 MIT，部分目录为专有许可。详见根目录 [LICENSE](LICENSE) 及各子目录 LICENSE 文件。
