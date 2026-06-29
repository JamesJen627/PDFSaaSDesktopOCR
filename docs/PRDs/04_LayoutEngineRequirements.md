# 📄 Layout Engine Requirements（LER v1.0）

（文档布局分析引擎功能需求说明书）

项目：PDFSaaS OCR System（基于 Stirling-PDF 二开）

---

# 1. 引擎定位（Engine Purpose）

## 1.1 定义

Layout Engine 是 OCR 系统中的**结构理解层（Document Understanding Layer）**，负责将：

> OCR输出的“文字碎片” → 结构化文档（段落 / 表格 / 阅读顺序）

---

## 1.2 核心目标

Layout Engine 的目标不是识别文字，而是解决：

- 文本顺序错乱
- 多栏排版混乱
- 表格结构丢失
- 标题层级缺失
- 扫描书籍阅读体验崩坏

---

## 1.3 上游/下游依赖

### 上游输入

来自 OCR Engine（OER）：

- bounding boxes
- text fragments
- confidence scores

### 下游输出

- PDF Builder（双层PDF）
- 编辑系统
- 导出系统（Word / Markdown）

---

# 2. 系统架构

```

```

```
OCR Output (boxes + text)
        ↓
Document Segmentation Layer
        ↓
Reading Order Engine
        ↓
Structure Detection Engine
        ↓
Table Reconstruction Engine
        ↓
Layout Graph Builder
        ↓
Structured Document Output
```

---

# 3. 功能需求（Functional Requirements）

---

# 3.1 文档分割（Document Segmentation）

## LER-001 页面结构分割

系统必须识别：

-  标题区域 
-  正文区域 
-  页眉 / 页脚 
-  图片区域 
-  表格区域 

---

## LER-002 区块分类

每个文本块必须分类：


| 类型        | 描述   |
| --------- | ---- |
| title     | 标题   |
| paragraph | 段落   |
| header    | 页眉   |
| footer    | 页脚   |
| table     | 表格   |
| figure    | 图片说明 |


---

## LER-003 垂直/水平结构识别

必须支持：

-  单栏文档 
-  双栏论文 
-  多栏书籍排版 

---

# 3.2 阅读顺序重建（Reading Order Engine）

---

## LER-010 阅读顺序生成

必须将 OCR blocks 转换为：

> 人类可读顺序（Human Reading Flow）

---

## LER-011 排序规则

优先级规则：

1.  Top-to-bottom 
2.  Left-to-right 
3.  Column detection priority 
4.  Title-first bias 

---

## LER-012 多栏处理

必须支持：

-  自动识别 column boundary 
-  避免跨栏错误连接文本 
-  支持论文格式（2-3栏） 

---

## LER-013 输出阅读图

必须生成：

```

```

```
[
  { "id": 1, "text": "...", "order": 1 },
  { "id": 2, "text": "...", "order": 2 }
]
```

---

# 3.3 表格识别与重建（Table Engine）

---

## LER-020 表格检测

系统必须识别：

-  表格边界 
-  行列结构 
-  合并单元格 

---

## LER-021 表格结构化输出

必须输出：

```

```

```
{
  "rows": 3,
  "cols": 4,
  "cells": [
    {
      "row": 0,
      "col": 0,
      "text": "A",
      "rowspan": 1,
      "colspan": 1
    }
  ]
}
```

---

## LER-022 表格OCR修复

必须支持：

-  单元格文本对齐修正 
-  跨行文本合并 
-  表格断裂修复 

---

## 推荐模型

- PP-Structure（核心） 

---

# 3.4 文档结构树（Document Tree Engine）

---

## LER-030 结构树生成

必须生成：

> Document → Page → Block → Line → Word

---

## LER-031 标题层级识别

必须识别：

-  H1 / H2 / H3结构 
-  自动章节划分 
-  书籍目录重建 

---

## LER-032 语义结构增强（轻量规则）

支持：

-  字体大小推断标题 
-  加粗/居中识别标题 
-  页首章节识别 

---

# 3.5 布局图构建（Layout Graph Engine）

---

## LER-040 布局图生成

系统必须构建：

> 文档空间结构图（Spatial Graph）

节点包括：

-  text block 
-  table 
-  image 
-  title 

---

## LER-041 空间关系定义

必须支持：

-  above / below 
-  left / right 
-  inside / overlap 

---

## LER-042 图结构输出

```

```

```
{
  "nodes": [],
  "edges": [
    { "from": 1, "to": 2, "relation": "below" }
  ]
}
```

---

# 3.6 页面级一致性处理

---

## LER-050 跨页结构保持

必须支持：

-  跨页段落连接 
-  表格分页恢复 
-  标题延续识别 

---

## LER-051 页眉页脚过滤

必须识别并过滤：

-  重复页眉 
-  页码 
-  水印文本 

---

# 3.7 输出结构（Layout Output Schema）

---

## LER-060 标准输出结构

```

```

```
{
  "page": 1,
  "blocks": [
    {
      "type": "paragraph",
      "text": "...",
      "order": 1,
      "bbox": [0,0,100,100]
    }
  ],
  "reading_order": [],
  "tables": [],
  "structure_tree": {}
}
```

---

## LER-061 下游兼容性

输出必须兼容：

-  PDF Builder 
-  编辑系统 
-  Markdown exporter 

---

# 4. 性能要求（Performance Requirements）

---

## LER-070 性能指标


| 项目        | 目标           |
| --------- | ------------ |
| 单页处理      | ≤ 200ms      |
| 大文档（100页） | ≤ 20s        |
| 表格识别      | ≤ 500ms/page |


---

## LER-071 并行能力

必须支持：

-  page-level parallel layout processing 
-  GPU辅助推理（可选） 

---

# 5. 稳定性与容错

---

## LER-080 容错机制

必须保证：

-  OCR错误不影响布局生成 
-  表格失败 fallback to text block 
-  单页失败不影响全局 

---

## LER-081 降级策略

顺序：

1.  AI layout model 
2.  rule-based layout 
3.  raw OCR order fallback 

---

# 6. 与其他系统接口

Layout Engine 必须对接：

-  OCR Engine（输入） 
-  PDF Builder（输出） 
-  Editor UI（结构可视化） 
-  Export Engine（结构转换） 

---

# 7. 模型依赖

核心依赖：

- PP-Structure 

扩展预留：

-  Surya（未来升级） 
-  Docling（结构化解析增强） 

---

# 8. 成功指标（KPIs）


| 指标      | 目标    |
| ------- | ----- |
| 阅读顺序正确率 | ≥ 90% |
| 表格恢复成功率 | ≥ 85% |
| 多栏识别准确率 | ≥ 88% |
| 结构一致性   | ≥ 95% |


