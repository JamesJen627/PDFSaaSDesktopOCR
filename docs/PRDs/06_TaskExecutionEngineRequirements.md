# Task Execution Engine Requirements（TEE v1.0）

（任务执行与调度引擎功能需求说明书）

项目：PDFSaaS OCR System（基于 Stirling-PDF 二开）

---

# 1. 引擎定位（Engine Purpose）

## 1.1 定义

Task Execution Engine 是系统的**统一任务调度与执行核心**，负责管理：

> PDF → OCR → Layout → PDF重建  
> 全过程的任务拆解、执行、监控与恢复

---

## 1.2 核心目标

系统必须实现：

- 多文件批处理
- Page级任务拆分
- GPU/CPU资源调度
- 失败自动恢复
- 可视化任务状态管理

---

## 1.3 系统角色

TEE 是连接：

- OCR Engine（OER）
- Layout Engine（LER）
- PDF Reconstruction Engine（PRER）
- Electron UI

的**唯一调度入口**

---

# 2. 系统架构

```

```

```
User Input (PDF batch)
        ↓
Task Manager
        ↓
Task Decomposer (page-level split)
        ↓
Queue Scheduler
        ↓
Worker Pool (CPU / GPU)
        ↓
Execution Engines (OCR / Layout / PDF)
        ↓
Result Aggregator
        ↓
Storage + UI Feedback
```

---

# 3. 核心功能需求（Functional Requirements）

---

# 3.1 任务创建（Task Creation）

## TEE-001 任务定义

系统必须支持：

-  单PDF任务 
-  多PDF批量任务 
-  文件夹批量导入 

---

## TEE-002 任务结构

每个任务必须包含：

```

```

```
{
  "task_id": "uuid",
  "type": "ocr_pipeline",
  "status": "pending",
  "files": [],
  "settings": {
    "language": "zh/en",
    "quality": "high"
  }
}
```

---

# 3.2 任务拆分系统（Task Decomposition）

---

## TEE-010 Page级拆分

系统必须将：

> 1个PDF → N个page tasks

例如：

```

```

```
PDF (100 pages)
→ 100 OCR page tasks
→ 100 layout tasks
→ 100 reconstruction tasks
```

---

## TEE-011 任务依赖图（DAG）

必须支持：

```

```

```
PDF Task
 ├── OCR Tasks
 ├── Layout Tasks
 └── PDF Build Tasks
```

---

# 3.3 队列调度系统（Queue Scheduler）

---

## TEE-020 队列模型

必须支持：

-  FIFO（默认） 
-  Priority Queue（Pro用户） 
-  Retry Queue（失败任务） 

---

## TEE-021 并发控制

必须支持：

-  CPU worker pool 
-  GPU worker pool 
-  最大并发数限制 

---

## TEE-022 资源调度策略

必须实现：


| 任务类型      | 调度方式  |
| --------- | ----- |
| OCR       | GPU优先 |
| Layout    | CPU   |
| PDF build | CPU   |


---

---

# 3.4 Worker系统（Execution Layer）

---

## TEE-030 Worker定义

系统必须支持：

-  OCR Worker 
-  Layout Worker 
-  PDF Worker 

---

## TEE-031 Worker生命周期

```

```

```
Idle → Assigned → Running → Completed / Failed
```

---

## TEE-032 Worker隔离

必须保证：

-  单worker crash 不影响系统 
-  自动重启 worker 
-  任务可迁移 

---

---

# 3.5 OCR任务执行调度

---

## TEE-040 OCR任务分发

必须调用：

- PaddleOCR 

并支持：

-  batch inference 
-  GPU加速 
-  fallback to CPU 

---

## TEE-041 fallback机制

失败时：

1.  PaddleOCR失败 
2.  自动切换 Tesseract 
3.  仍失败 → 标记 error page 

---

# 3.6 Layout任务调度

---

## TEE-050 Layout执行

必须调用：

- PP-Structure 

---

## TEE-051 并行规则

-  page-level parallel execution 
-  OCR完成后立即触发 layout 

---

# 3.7 PDF重建任务调度

---

## TEE-060 PDF Builder执行

必须调用：

- Stirling-PDF 

---

## TEE-061 流式构建

必须支持：

-  page-by-page PDF generation 
-  incremental writing 
-  non-blocking export 

---

# 3.8 任务状态系统（State Management）

---

## TEE-070 状态模型

```

```

```
PENDING
RUNNING
PROCESSING_OCR
PROCESSING_LAYOUT
REBUILDING_PDF
COMPLETED
FAILED
```

---

## TEE-071 状态更新机制

必须支持：

-  real-time UI push 
-  event-based updates 
-  per-page progress tracking 

---

# 3.9 错误处理与恢复机制

---

## TEE-080 失败恢复

必须支持：

-  page-level retry（最多3次） 
-  task-level retry 
-  automatic resume 

---

## TEE-081 部分失败容忍

必须允许：

-  1~n pages failed 
-  task仍可完成（partial success） 

---

# 3.10 任务监控系统

---

## TEE-090 监控指标

必须实时记录：

-  CPU usage 
-  GPU usage 
-  queue length 
-  task duration 
-  per-page latency 

---

## TEE-091 可视化输出

提供给 Electron UI：

-  progress bar 
-  per-page status 
-  real-time logs 

---

# 4. 性能要求（Performance Requirements）

---

## TEE-100 并发能力


| 项目    | 目标             |
| ----- | -------------- |
| 并发任务  | ≥ 20 tasks     |
| 并发页面  | ≥ 200 pages    |
| GPU吞吐 | ≥ 50 pages/min |


---

## TEE-101 延迟目标


| 操作            | 目标      |
| ------------- | ------- |
| 任务创建          | < 100ms |
| page dispatch | < 50ms  |
| 状态更新          | < 200ms |


---

# 5. 稳定性要求

---

## TEE-110 崩溃恢复

必须支持：

-  worker crash auto restart 
-  queue state persistence 
-  task resume after restart 

---

## TEE-111 数据持久化

必须保存：

-  task state 
-  progress state 
-  error logs 

---

# 6. 系统接口（Integration Layer）

---

TEE必须对接：

### 上游：

-  Electron UI（任务创建） 

### 下游：

-  OCR Engine（OER） 
-  Layout Engine（LER） 
-  PDF Engine（PRER） 

---

# 7. 数据模型（Core Schema）

---

## TEE-120 Task Schema

```

```

```
{
  "task_id": "uuid",
  "pages": [
    {
      "page": 1,
      "status": "done",
      "ocr_result": {},
      "layout_result": {}
    }
  ]
}
```

---

# 8. 安全与隔离

---

## TEE-130 任务隔离

必须保证：

-  task之间不共享内存污染 
-  worker sandbox execution 
-  file isolation 

---

# 9. 成功指标（KPIs）


| 指标        | 目标    |
| --------- | ----- |
| 任务成功率     | ≥ 98% |
| 崩溃恢复率     | 100%  |
| page处理连续性 | 无丢页   |
| GPU利用率    | ≥ 70% |


