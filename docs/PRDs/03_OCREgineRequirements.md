# 📄 OCR Engine Requirements（OER v1.0）

（OCR引擎功能需求规格说明书）

项目：PDFSaaS OCR System（基于 Stirling-PDF 二开）

---

# 1. 引擎定位（Engine Purpose）

## 1.1 OCR引擎定义

本 OCR Engine 是整个系统的**核心计算子系统**，负责将：

> PDF / 图像 → 结构化文本 + 版面信息

并输出可用于：

- 双层PDF生成
- 文档结构分析
- 表格还原
- 编辑系统

---

## 1.2 技术基础

主引擎：

- PaddleOCR（Primary Engine）

备用引擎：

- Tesseract（Fallback Engine）

布局分析：

- PP-Structure

---

# 2. OCR Engine 总体架构

```

```

```
Input Image/Page
    ↓
Preprocessing Layer
    ↓
OCR Inference Layer (PaddleOCR)
    ↓
Fallback Layer (Tesseract)
    ↓
Layout Analysis Layer (PP-Structure)
    ↓
Post-processing Layer
    ↓
Structured Output JSON
```

---

# 3. 功能需求（Functional Requirements）

---

# 3.1 输入处理（Input Handling）

## OER-001 支持输入类型

OCR引擎必须支持：

-  PDF page image（来自 Stirling-PDF render） 
-  PNG / JPG / TIFF 
-  高分辨率扫描图 

---

## OER-002 图像规范化

输入图像必须被统一处理为：

-  RGB格式 
-  ≥300 DPI等效分辨率 
-  统一旋转方向（0/90/180/270） 

---

# 4. 图像预处理模块（Preprocessing Engine）

---

## OER-010 图像增强处理

系统必须执行以下步骤：

### 必须项：

-  去噪（Median / Gaussian） 
-  二值化（Adaptive / Otsu） 
-  倾斜校正（Deskew） 
-  对比度增强 

---

### 可选增强：

-  超分辨率增强（Phase 2） 
-  文档边缘裁剪（auto-crop） 

---

## 依赖：

- OpenCV 
- Pillow 

---

## OER-011 预处理策略模式

必须支持：


| 模式           | 说明        |
| ------------ | --------- |
| fast         | 低增强（速度优先） |
| balanced     | 默认        |
| high-quality | OCR精度优先   |


---

# 5. OCR识别层（Inference Engine）

---

## OER-020 主OCR引擎

必须使用：

- PaddleOCR 

能力要求：

-  中文（简体/繁体） 
-  英文 
-  混合文本 
-  数字/符号识别 

---

## OER-021 OCR输出结构

必须返回：

```

```

```
{
  "text": "...",
  "boxes": [
    {
      "x": 0,
      "y": 0,
      "w": 0,
      "h": 0,
      "text": "...",
      "confidence": 0.98
    }
  ],
  "language": "zh/en",
  "page_index": 1
}
```

---

## OER-022 置信度系统

必须提供：

-  每个文本框 confidence score 
-  页面级 confidence score 
-  任务级 confidence score 

---

## OER-023 OCR失败策略

必须实现：

1.  PaddleOCR失败 
2.  自动降级 Tesseract 
3.  再失败 → 标记页面失败（不阻塞任务） 

---

# 6. 布局分析层（Layout Engine）

---

## OER-030 文档结构分析

必须使用：

- PP-Structure 

能力：

-  表格识别 
-  段落分组 
-  标题检测 
-  阅读顺序恢复 

---

## OER-031 输出结构定义

```

```

```
{
  "blocks": [
    {
      "type": "text",
      "content": "...",
      "order": 1
    },
    {
      "type": "table",
      "structure": []
    }
  ]
}
```

---

## OER-032 阅读顺序算法要求

必须支持：

-  左到右 / 上到下 
-  多栏文档识别 
-  复杂书籍排版恢复 

---

# 7. 后处理层（Post Processing）

---

## OER-040 文本清洗

必须执行：

-  去除重复空格 
-  合并断行 
-  修正OCR断词 
-  Unicode标准化 

---

## OER-041 语言检测

必须支持：

-  中文 / 英文混合检测 
-  段落级语言识别 

---

## OER-042 结构修复

必须修复：

-  OCR碎片文本合并 
-  表格结构重建 
-  标点修正 

---

# 8. 输出系统（Output Layer）

---

## OER-050 输出格式

OCR Engine必须输出：

### 基础输出

-  JSON（结构化OCR结果） 
-  Plain text 
-  Bounding box数据 

---

### 高级输出（供PDF系统使用）

-  Text Layer Data 
-  Layout Tree 
-  Reading Order Graph 

---

## OER-051 双层PDF支持数据

必须提供：

```

```

```
{
  "page_image": "...",
  "text_layer": "...",
  "position_map": []
}
```

---

# 9. 性能要求（Performance Requirements）

---

## OER-060 处理性能


| 场景      | 目标            |
| ------- | ------------- |
| CPU OCR | ≤ 1.5s / page |
| GPU OCR | ≤ 0.5s / page |
| 100页文档  | ≤ 2分钟         |


---

## OER-061 并行能力

必须支持：

-  多页并行OCR 
-  GPU batch inference 
-  worker线程池 

---

# 10. 稳定性与容错

---

## OER-070 错误隔离

必须保证：

-  单页失败不影响全任务 
-  OCR crash 自动恢复 
-  页面级 retry（最多3次） 

---

## OER-071 日志系统

必须记录：

-  OCR错误日志 
-  性能日志 
-  模型加载日志 

---

# 11. 模型管理

---

## OER-080 模型加载策略

必须支持：

-  lazy loading（按需加载） 
-  GPU/CPU自动切换 
-  模型缓存 

---

## OER-081 多模型支持（未来扩展）

预留接口：

-  layout model swap 
-  OCR model swap 

---

# 12. 安全与隐私

---

## OER-090 本地优先原则

必须保证：

-  无强制云调用 
-  OCR完全本地执行 
-  可关闭网络访问 

---

# 13. 与系统其他模块的接口

OCR Engine必须对接：

-  Stirling-PDF（PDF渲染层） 
-  Layout Engine（结构分析） 
-  PDF Builder（双层PDF生成） 
-  Electron UI（进度反馈） 

---

# 14. 成功指标（Engine KPIs）


| 指标       | 目标     |
| -------- | ------ |
| 中文OCR准确率 | ≥ 90%  |
| 英文OCR准确率 | ≥ 95%  |
| 表格识别成功率  | ≥ 85%  |
| 崩溃率      | < 0.1% |
| 单页处理时间   | ≤ 1.5s |


