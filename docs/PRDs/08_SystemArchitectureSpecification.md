# System Architecture Specification（SAS v1.0）

（系统总体架构说明书）

项目：PDFSaaS OCR Desktop System（基于 Stirling-PDF 二开）

---

# 1. 系统总览（System Overview）

## 1.1 系统定义

本系统是一个**本地优先（Local-first）的 Document AI 平台**，基于：

> Stirling-PDF

进行深度二开，融合 OCR + Layout + PDF重建能力。

---

## 1.2 核心能力

系统实现完整文档处理链路：

```

```

```
PDF / Image
   ↓
OCR识别（PaddleOCR）
   ↓
布局理解（PP-Structure）
   ↓
结构化文档生成
   ↓
双层PDF重建
   ↓
导出 / 编辑 / 批处理
```

---

## 1.3 系统目标

-  本地运行（100% offline-first） 
-  企业级批处理能力 
-  高精度中文OCR 
-  保留文档结构（表格 / 段落） 
-  支持1000页级大文档 

---

# 2. 总体架构（High-Level Architecture）

```

```

```
┌──────────────────────────────┐
│      Electron Desktop UI      │
│   (React / Vue Renderer)      │
└──────────────┬───────────────┘
               IPC
┌──────────────▼───────────────┐
│     Task Execution Engine     │  ← 调度中枢
└──────────────┬───────────────┘
               Queue
┌──────────────▼───────────────┐
│     Processing Worker Pool    │
│ (CPU / GPU / Parallel Tasks)  │
└───────┬─────────┬────────────┘
        │         │
┌───────▼───┐ ┌──▼──────────┐ ┌──────────────┐
│ OCR Engine │ │ Layout Eng. │ │ PDF Engine   │
│ PaddleOCR  │ │ PP-Struct   │ │ Stirling-PDF │
└────────────┘ └─────────────┘ └──────────────┘
```

---

# 3. 分层架构设计（Layered Architecture）

---

## 3.1 UI层（Presentation Layer）

### 技术

-  Electron 
-  React / Vue 

### 职责

-  文件上传 
-  OCR可视化 
-  PDF预览 
-  编辑器 
-  批处理管理 

---

## 3.2 调度层（Control Layer）

### 核心模块

-  Task Execution Engine（TEE） 

职责：

-  任务拆分 
-  队列调度 
-  Worker分配 
-  状态管理 

---

## 3.3 计算层（Processing Layer）

### OCR Engine

- PaddleOCR 

### Layout Engine

- PP-Structure 

### Fallback OCR

- Tesseract 

---

## 3.4 PDF重建层（Output Layer）

- Stirling-PDF 

职责：

-  双层PDF生成 
-  PDF/A导出 
-  文本层嵌入 

---

# 4. 核心数据流（Data Flow Architecture）

---

## 4.1 主数据流

```

```

```
PDF Input
   ↓
Page Renderer
   ↓
OCR Engine
   ↓
Layout Engine
   ↓
Structure Builder
   ↓
PDF Reconstruction Engine
   ↓
Export / UI
```

---

## 4.2 Page级数据流

```

```

```
Page Image
   ↓
Preprocessing
   ↓
OCR Result (bbox + text)
   ↓
Layout Blocks
   ↓
Reading Order Graph
   ↓
PDF Layer Injection
```

---

# 5. 核心模块交互关系

---

## 5.1 模块依赖图


| 模块         | 依赖                 |
| ---------- | ------------------ |
| UI         | TEE                |
| TEE        | OCR / Layout / PDF |
| OCR        | GPU / CPU workers  |
| Layout     | OCR output         |
| PDF Engine | Layout output      |


---

# 6. 任务系统架构（Critical System）

---

## 6.1 Task DAG结构

```

```

```
PDF Task
 ├── OCR Tasks (page-level)
 ├── Layout Tasks
 └── PDF Build Tasks
```

---

## 6.2 Task状态机

```

```

```
PENDING → RUNNING → PROCESSING → COMPLETED
                     ↓
                  FAILED → RETRY
```

---

## 6.3 Worker体系

-  CPU Worker Pool 
-  GPU Worker Pool 
-  Isolated Process Workers 

---

# 7. 部署架构（Deployment Architecture）

---

## 7.1 本地部署（MVP）

```

```

```
Electron App
   ↓
Local Python OCR Service
   ↓
Local File System
```

---

## 7.2 企业部署（Phase 2）

```

```

```
Electron Client
   ↓
Dockerized Backend
   ↓
Distributed Workers
```

---

## 7.3 云部署（Phase 3）

```

```

```
SaaS API Layer
   ↓
Cloud OCR Cluster
   ↓
Storage System
```

---

# 8. 性能架构设计

---

## 8.1 并行策略

-  Page-level parallelism 
-  Batch OCR inference 
-  GPU batching 

---

## 8.2 性能目标


| 指标     | 目标               |
| ------ | ---------------- |
| OCR速度  | < 0.5s/page（GPU） |
| Layout | < 200ms/page     |
| PDF重建  | < 300ms/page     |


---

# 9. 存储架构

---

## 9.1 本地文件结构

```

```

```
app_data/
  tasks/
  cache/
  pages/
  exports/
  logs/
```

---

## 9.2 缓存策略

-  Page image cache 
-  OCR cache 
-  Layout cache 
-  Incremental PDF build cache 

---

# 10. 安全架构（Security Model）

---

## 10.1 本地优先原则

-  无强制云端上传 
-  OCR完全本地执行 
-  可完全离线运行 

---

## 10.2 数据隔离

-  task-level isolation 
-  worker sandbox 
-  file-level isolation 

---

# 11. 关键技术栈

---

## 核心组件

- Stirling-PDF 
- PaddleOCR 
- PP-Structure 
- Tesseract 

---

## UI层

-  Electron 
-  React / Vue 

---

## 后端

-  Python OCR Service 
-  Node.js IPC Bridge 

---

# 12. 系统关键成功指标（System KPIs）


| 指标         | 目标        |
| ---------- | --------- |
| OCR准确率     | ≥ 90%（中文） |
| Layout结构恢复 | ≥ 90%     |
| PDF可搜索成功率  | ≥ 99%     |
| 系统崩溃率      | < 0.1%    |
| 大文件稳定性     | 1000页     |


---

# 13. 系统核心设计总结

---

## 🧠 本系统本质

你构建的不是：

❌ PDF工具  
 ❌ OCR工具

而是：

> ✅ **本地运行的 Document AI Engine（类 Adobe + ABBYY + Notion结构系统）**

