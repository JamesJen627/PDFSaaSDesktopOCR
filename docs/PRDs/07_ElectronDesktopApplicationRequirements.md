# Electron Desktop Application Requirements（EDA v1.0）

（桌面应用功能需求说明书）

项目：PDFSaaS OCR Desktop（基于 Stirling-PDF 二开）

---

# 1. 应用定位（Product Positioning）

## 1.1 定义

Electron Desktop Application 是整个系统的：

> 🖥️ **用户控制中心 + 任务编排界面 + 文档可视化工作台**

用于操作整个：

PDF → OCR → Layout → PDF重建 系统

---

## 1.2 产品目标

必须实现：

- 低门槛操作（拖拽即用）
- 专业级批处理能力
- 实时OCR可视化
- 双层PDF对比预览
- 任务全生命周期管理

---

## 1.3 用户场景

- 扫描书籍转可搜索PDF
- 批量处理合同 / 发票
- 企业文档归档
- OCR校对编辑

---

# 2. 系统架构

```

```

```
Electron UI Layer
        ↓
Renderer Process (React/Vue UI)
        ↓
IPC Bridge
        ↓
Task Execution Engine (TEE)
        ↓
OCR / Layout / PDF Engines
        ↓
Local File System
```

---

# 3. 应用模块结构

---

## 3.1 主界面（Dashboard）

### EDA-001 首页必须包含

-  拖拽上传区域 
-  最近任务列表 
-  GPU/CPU状态 
-  当前队列状态 

---

## 3.2 任务中心（Task Center）

### EDA-010 任务列表

必须支持：

-  所有任务展示 
-  状态筛选（running / done / failed） 
-  任务搜索 

---

### EDA-011 任务详情页

必须显示：

-  文件信息 
-  处理进度（page-level） 
-  OCR状态 
-  layout状态 
-  PDF生成状态 

---

## 3.3 OCR可视化页面（核心）

---

### EDA-020 OCR结果预览

必须支持：

-  原图 vs OCR overlay 
-  bbox高亮显示 
-  文本编辑模式 

---

### EDA-021 双层PDF预览

必须支持：

-  左：扫描图 
-  右：OCR文本层 
-  hover定位同步 

---

## 3.4 编辑器模块（Document Editor）

---

### EDA-030 OCR修正编辑

必须支持：

-  文本直接修改 
-  bbox区域重识别 
-  删除区域（水印/页眉） 

---

### EDA-031 区域工具

-  选择区域 OCR 
-  排除区域 
-  合并文本块 

---

## 3.5 批处理界面（Batch System）

---

### EDA-040 批量上传

支持：

-  文件夹拖入 
-  多文件上传 
-  自动排队 

---

### EDA-041 批处理进度

必须显示：

-  文件级进度 
-  page级进度 
-  ETA估算 

---

## 3.6 导出中心（Export Center）

---

### EDA-050 导出格式

必须支持：

-  searchable PDF 
-  PDF/A 
-  TXT 
-  Markdown（未来） 
-  Word（未来） 

---

### EDA-051 导出队列

支持：

-  批量导出 
-  格式预设模板 

---

## 3.7 设置中心（Settings）

---

### EDA-060 OCR设置

-  PaddleOCR / Tesseract fallback 
-  语言选择（中/繁/英） 
-  精度模式（fast / balanced / high） 

---

### EDA-061 性能设置

-  GPU开关 
-  并发线程数 
-  内存限制 

---

### EDA-062 语言设置

-  简体中文 
-  繁体中文 
-  English 

---

# 4. 核心交互流程

---

## 4.1 主流程（用户路径）

```

```

```
拖入PDF
  ↓
自动进入任务队列
  ↓
OCR执行（实时进度）
  ↓
Layout分析
  ↓
双层PDF生成
  ↓
预览 + 编辑
  ↓
导出
```

---

## 4.2 实时反馈机制

必须支持：

-  page级进度更新 
-  OCR状态流式刷新 
-  worker状态实时同步 

---

# 5. IPC通信设计（关键）

---

## 5.1 Electron ↔ Backend通信

```

```

```
{
  "event": "task:update",
  "data": {
    "task_id": "...",
    "page": 12,
    "status": "ocr_done"
  }
}
```

---

## 5.2 必须支持事件


| Event          | 说明   |
| -------------- | ---- |
| task:start     | 任务开始 |
| task:progress  | 进度更新 |
| task:page_done | 页面完成 |
| task:failed    | 失败   |
| task:complete  | 完成   |


---

# 6. UI/UX设计要求

---

## 6.1 核心原则

-  零学习成本（拖拽即用） 
-  实时反馈 
-  专业软件级密度 
-  不做“轻应用” 

---

## 6.2 视觉结构

左侧：

-  任务列表 

中间：

-  PDF预览 

右侧：

-  OCR / Layout信息 

---

## 6.3 双层PDF体验

必须做到：

-  hover同步定位 
-  bbox高亮同步 
-  text ↔ image 双向定位 

---

# 7. 性能要求

---

## 7.1 UI性能


| 项目      | 目标      |
| ------- | ------- |
| 页面响应    | < 100ms |
| PDF加载   | < 1s    |
| OCR状态刷新 | 10Hz    |


---

## 7.2 大文件支持

必须支持：

-  1000页PDF 
-  无卡死滚动 
-  分页加载（lazy render） 

---

# 8. 文件系统设计

---

## 8.1 本地存储结构

```

```

```
app_data/
  tasks/
  cache/
  exports/
  logs/
```

---

## 8.2 缓存机制

必须支持：

-  page image cache 
-  OCR result cache 
-  layout cache 

---

# 9. 错误处理系统

---

## 9.1 UI错误提示

必须支持：

-  OCR失败提示 
-  页面失败标记 
-  自动重试按钮 

---

## 9.2 恢复机制

-  断点续跑任务 
-  自动恢复未完成页面 

---

# 10. 安全设计

---

## 10.1 本地优先

必须保证：

-  PDF不上传云端 
-  OCR本地执行 
-  可完全离线 

---

## 10.2 企业模式（预留）

-  日志审计 
-  操作记录 
-  权限控制（未来） 

---

# 11. 成功指标（KPIs）


| 指标       | 目标       |
| -------- | -------- |
| UI响应时间   | < 100ms  |
| OCR可视化延迟 | < 200ms  |
| 大文件稳定性   | 1000页无崩溃 |
| 用户操作完成率  | ≥ 95%    |


