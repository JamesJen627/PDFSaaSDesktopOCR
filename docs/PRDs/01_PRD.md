# 📄 PDFSaaS（基于 Stirling-PDF 深度二开）PRD v1.0

## 0. 项目定位（最终版）

本项目基于：

> Stirling-PDF

进行深度 fork 二次开发，构建：

> **本地优先 PDF OCR + 双层PDF + 文档结构化处理桌面应用**

核心目标：

- PDF扫描件 → 可搜索PDF
- OCR精度工业级（中文优先）
- 保留排版结构（表格/段落/阅读顺序）
- 支持批量处理 + GPU加速
- Windows桌面应用优先

---

# 1. 技术选型（已确认）

## 1.1 OCR引擎（核心）

主引擎：

- PaddleOCR（唯一主力）

备用：

- Tesseract（fallback）

---

## 1.2 桌面端

- Electron（已确认）
- React UI（建议）

---

## 1.3 后端语言

- Python OCR Service（核心）
- Java（保留 Stirling-PDF 原服务）

---

## 1.4 架构模式

> **Fork + 强耦合扩展（不是插件模式）**

---

# 2. 系统整体架构（最终版）

```

```

```
Electron Desktop UI
        ↓
Stirling-PDF Core（fork后修改）
        ↓
OCR Extension Layer（新增）
        ↓
Python OCR Service（PaddleOCR）
        ↓
Layout Engine（PP-Structure）
        ↓
PDF Rebuilder（双层PDF生成）
        ↓
Storage / Export
```

---



# 3. 核心功能模块

---



## 3.1 PDF核心处理（Stirling-PDF保留）

保留能力：

- PDF拆分 
- 合并 
- 压缩 
- 转换 
- 页面操作

👉 作为基础能力层

---



## 3.2 OCR增强系统（核心新增）



### OCR流程（完整链路）

```

```

```
PDF Page
  ↓
Render Image（Stirling-PDF）
  ↓
Preprocess（OpenCV）
  ↓
PaddleOCR识别
  ↓
Layout分析（PP-Structure）
  ↓
Text Layer生成
  ↓
双层PDF写入
```

---



## 3.3 图像预处理模块

依赖：

- OpenCV 
- Pillow

功能：

- 去噪（Gaussian / Median） 
- 锐化 
- 二值化（Otsu / Adaptive） 
- 倾斜矫正（Hough Transform） 
- DPI增强

👉 目标：OCR精度提升 30%~60%

---



## 3.4 布局分析系统（关键）

使用：

- PP-Structure

能力：

- 表格识别 
- 段落恢复 
- 阅读顺序重建 
- 文档结构树

---



## 3.5 双层PDF生成（核心输出）

输出结构：

```

```

```
PDF Page
 ├── Image Layer（原始扫描）
 └── Text Layer（OCR文本，可搜索）
```

目标：

- 可搜索 
- 可复制 
- 保持视觉一致 
- 支持 PDF/A

---



## 3.6 OCR备用引擎

- Tesseract

用途：

- Paddle失败fallback 
- 简单页面快速识别

---



## 3.7 批处理系统（队列）

功能：

- 多文件拖拽 
- 队列执行 
- GPU任务调度 
- 失败重试 
- 断点恢复

---



## 3.8 编辑系统（增强功能）

- OCR结果修正 
- 区域删除（水印/页眉） 
- 区域重跑OCR 
- 文本框UI编辑

---



## 3.9 导出系统

支持：

- 双层PDF 
- PDF/A 
- TXT 
- Markdown 
- Word（后期） 
- Excel（表格）

---



# 4. Electron桌面端（UI系统）



## 4.1 页面结构

- 首页（拖拽上传） 
- 任务队列页 
- OCR预览页 
- 双层PDF对比页 
- 导出中心

---



## 4.2 UI核心能力

- 拖拽上传PDF 
- 分页进度条 
- OCR实时状态 
- 双层PDF预览（before/after） 
- 批处理列表

---



## 4.3 多语言

- 简体中文 
- 繁体中文 
- English

---



# 5. API设计（新增 OCR Extension）



## 5.1 OCR API

```

```

```
POST /api/ocr/process
POST /api/ocr/batch
GET  /api/ocr/result/{id}
```

---



## 5.2 PDF增强API

```

```

```
POST /api/pdf/double-layer
POST /api/pdf/export
```

---



## 5.3 Worker系统

- page-level task split 
- queue worker 
- GPU worker

---



# 6. 性能目标


| 项目      | 目标            |
| ------- | ------------- |
| CPU OCR | < 1.5s / page |
| GPU OCR | < 0.5s / page |
| 支持文件    | 1000+ pages   |
| 内存模式    | 流式处理          |


---



# 7. 部署方式



## Phase 1（当前）

- Windows Desktop 
- 本地 Python OCR service 
- Fork Stirling-PDF

---



## Phase 2

- Docker self-host 
- 企业部署

---



## Phase 3

- Cloud SaaS

---



# 8. 商业模式



## Free

- 单文件OCR 
- 基础导出



## Pro

- 批量处理 
- GPU加速 
- 高精度模型



## Enterprise

- 本地部署 
- 审计日志 
- API接入

---



# 9. 安全设计

- 默认完全本地处理 
- 不上传PDF 
- 企业模式可隔离环境 
- 可关闭网络模块

---



# 10. Cursor开发拆解建议（非常重要）

建议拆 4 个模块：

```

```

```
stirling-pdf-fork/
  core/                 # 原Stirling-PDF修改
  ocr-service/         # Python PaddleOCR
  layout-engine/       # PP-Structure
  desktop-ui/          # Electron
  worker/              # queue system
```

---



# 11. 当前项目本质总结（非常关键）

你现在这个项目已经不是：

❌ PDF工具  
 ❌ OCR工具

而是：

> ✅ **本地文档智能处理引擎（Lightweight Document AI System）**

