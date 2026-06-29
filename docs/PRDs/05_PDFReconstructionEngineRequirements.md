# 📄 PDF Reconstruction Engine Requirements（PRER v1.0）

（PDF重建引擎功能需求说明书）

项目：PDFSaaS OCR System（基于 Stirling-PDF 二开）

---

# 1. 引擎定位（Engine Purpose）

## 1.1 定义

PDF Reconstruction Engine 是系统的**最终输出层（Output Rendering Layer）**，负责将：

> Layout Engine结构化结果 + OCR文本 + 原始图像  
> → 重建为“可搜索、可复制、结构保留”的PDF

---

## 1.2 核心目标

本引擎必须实现：

- 双层PDF（Image + Text Layer）
- 可搜索PDF（Searchable PDF）
- PDF/A归档格式
- 高保真视觉还原
- 文本与图像对齐一致

---

## 1.3 输入 / 输出

### 输入

来自：

- OCR Engine（OER）
- Layout Engine（LER）

包含：

- bounding boxes
- reading order
- text blocks
- table structures
- page images

---

### 输出

- Searchable PDF
- PDF/A（归档）
- 可编辑结构PDF（未来扩展）

---

# 2. 系统架构

```

```

```
Layout Output (structured data)
        ↓
Text Layer Builder
        ↓
Spatial Alignment Engine
        ↓
PDF Composer (image + text layer)
        ↓
PDF Optimizer
        ↓
Export Layer
```

---

# 3. 功能需求（Functional Requirements）

---

# 3.1 PDF基础重建

## PRER-001 页面重建

系统必须：

-  保留原始页面图像 
-  精确对齐OCR文本 
-  保持原始比例（1:1 mapping） 

---

## PRER-002 图像层处理

必须支持：

-  高分辨率嵌入（≥300 DPI） 
-  页面旋转修正 
-  裁剪边距优化 

---

## 使用依赖

- Stirling-PDF（基础PDF处理能力） 

---

# 3.2 文本层构建（Text Layer Engine）

---

## PRER-010 可搜索文本层生成

必须生成：

> invisible text overlay layer

特性：

-  不影响视觉 
-  支持复制 
-  支持全文搜索 

---

## PRER-011 文本定位对齐

必须使用：

-  OCR bounding box 
-  Layout Engine坐标 

实现：

-  pixel-perfect alignment 
-  line-level positioning 

---

## PRER-012 阅读顺序写入

必须按照：

-  Layout Engine reading order 

写入文本层，避免：

-  乱序文本 
-  段落错位 

---

# 3.3 双层PDF生成（核心能力）

---

## PRER-020 双层结构定义

```

```

```
PDF Page
 ├── Image Layer（扫描原图）
 └── Text Layer（OCR invisible text）
```

---

## PRER-021 层叠策略

必须确保：

-  Image layer = base layer 
-  Text layer = transparent overlay 
-  无视觉污染 

---

## PRER-022 坐标映射系统

必须实现：

```

```

```
OCR bbox → PDF coordinate system
Layout space → PDF space transform
```

支持：

-  scale transformation 
-  rotation correction 
-  page margin normalization 

---

# 3.4 PDF/A 归档支持

---

## PRER-030 PDF/A生成

必须支持：

-  PDF/A-1b 或 PDF/A-2b 

用于：

-  企业归档 
-  法务文件 
-  长期存储 

---

## PRER-031 字体嵌入

必须确保：

-  Unicode字体嵌入 
-  中英文兼容 
-  无外部字体依赖 

---

# 3.5 表格PDF重建（关键难点）

---

## PRER-040 表格还原

来自：

- PP-Structure 

必须支持：

-  行列结构重建 
-  cell merge 
-  边框恢复（可选） 

---

## PRER-041 表格PDF呈现策略

支持两种模式：


| 模式               | 描述      |
| ---------------- | ------- |
| visual-only      | 保持原扫描图  |
| structured-table | 可编辑表格重建 |


---

# 3.6 精度对齐系统（Critical Feature）

---

## PRER-050 Pixel Alignment Engine

必须实现：

-  OCR bbox → PDF coordinate transform 
-  字符级位置校准 
-  行级对齐修正 

---

## PRER-051 对齐误差控制

必须满足：

-  ≤ 1px误差（A4 300 DPI） 
-  无文本漂移 
-  无行错位 

---

# 3.7 PDF优化引擎

---

## PRER-060 文件优化

必须执行：

-  压缩图片 
-  删除冗余对象 
-  优化字体嵌入 
-  stream优化 

---

## PRER-061 文件大小控制

目标：

-  OCR后PDF ≤ 原始PDF × 1.5 

---

# 3.8 可搜索性系统

---

## PRER-070 全文搜索能力

必须支持：

-  PDF全文检索 
-  highlight定位 
-  关键词跳转 

---

## PRER-071 搜索索引结构

内部必须生成：

```

```

```
{
  "page": 1,
  "text": "...",
  "positions": []
}
```

---

# 3.9 多格式输出支持

---

## PRER-080 输出格式

必须支持：

-  Searchable PDF 
-  PDF/A 
-  TXT（结构化） 
-  Markdown（后续） 
-  Word（未来） 

---

# 4. 性能要求（Performance Requirements）

---

## PRER-090 性能指标


| 场景      | 目标       |
| ------- | -------- |
| 单页PDF重建 | ≤ 300ms  |
| 100页文档  | ≤ 30s    |
| 内存占用    | 流式 ≤ 1GB |


---

## PRER-091 流式处理

必须支持：

-  page-by-page rendering 
-  lazy PDF building 
-  non-blocking export 

---

# 5. 稳定性与容错

---

## PRER-100 容错机制

必须保证：

-  OCR缺失 → fallback image-only PDF 
-  layout错误 → text fallback mode 
-  page error → skip + log 

---

## PRER-101 数据完整性

必须保证：

-  页面顺序一致 
-  不丢页 
-  不重复写入 

---

# 6. 安全与本地优先原则

---

## PRER-110 本地执行

必须保证：

-  PDF不上传云端 
-  所有重建本地完成 
-  可离线运行 

---

# 7. 与系统模块关系

---

## 上游依赖

-  OCR Engine（OER） 
-  Layout Engine（LER） 

---

## 下游输出

-  Electron UI（预览） 
-  Export system 
-  File system storage 

---

# 8. 模型与技术依赖

---

核心依赖：

- PaddleOCR 
- PP-Structure 
- Stirling-PDF 

---

# 9. 成功指标（KPIs）


| 指标        | 目标     |
| --------- | ------ |
| PDF可搜索成功率 | ≥ 99%  |
| OCR对齐准确率  | ≥ 95%  |
| 表格还原完整率   | ≥ 85%  |
| PDF视觉一致性  | ≥ 98%  |
| 文件损坏率     | < 0.1% |


