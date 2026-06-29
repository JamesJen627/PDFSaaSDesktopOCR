# 📄 Functional Requirements Document (FRD)

## 项目名称：PDFSaaS OCR Desktop（基于 Stirling-PDF 二开）

版本：v1.0  
日期：2026-06-30

---

# 1. 系统概述

## 1.1 系统目标

系统是一个**本地优先的PDF智能OCR处理工具**，基于 Stirling-PDF 二次开发，提供以下能力：

- PDF扫描件转可搜索PDF
- OCR文本识别（中/繁/英）
- 双层PDF生成（Image + Text Layer）
- 批量任务处理
- 桌面端操作界面（Windows优先）

---

## 1.2 核心用户目标

用户可以：

- 拖入PDF → 自动OCR → 输出可搜索PDF
- 批量处理大量扫描文档
- 修正OCR错误
- 导出 Word / Markdown / TXT
- 本地离线处理敏感文件

---

# 2. 功能范围

## 2.1 包含范围（In Scope）

### 核心功能

- PDF上传与解析（基于 Stirling-PDF）
- OCR识别（PaddleOCR主引擎）
- 图像预处理（去噪/矫正）
- 布局分析（表格/段落/阅读顺序）
- 双层PDF生成
- 批量任务队列
- 导出功能
- 桌面UI（Electron）

---

### OCR能力

- 简体中文识别
- 繁体中文识别
- 英文识别
- 混合语言识别
- 手写体（基础支持）

---



## 2.2 不包含范围（Out of Scope）

- 云端SaaS（第一阶段不做）
- 在线协作编辑
- AI问答（RAG）
- 浏览器Web版本

---



# 3. 功能需求（Functional Requirements）

---



# 3.1 PDF输入模块



### FR-001 PDF上传

系统必须支持：

- 拖拽上传PDF
- 文件选择上传
- 批量上传多个PDF
- 支持扫描件PDF

---



### FR-002 PDF解析

系统必须：

- 使用 Stirling-PDF 解析PDF
- 将PDF页面转换为高分辨率图像
- 保留页序信息

---



# 3.2 图像预处理模块



### FR-010 图像增强

系统必须对每页图像执行：

- 去噪（Gaussian / Median）
- 锐化
- 二值化（Otsu / Adaptive）
- 倾斜校正（deskew）
- DPI增强（可选）

依赖：

- OpenCV
- Pillow

---



### FR-011 预处理配置

用户可选择：

- 低质量扫描模式
- 标准模式
- 高精度模式

---



# 3.3 OCR识别模块



### FR-020 OCR主引擎

系统必须使用：

- PaddleOCR

支持：

- 中文（简/繁）
- 英文
- 混合文本

---



### FR-021 OCR备用引擎

当主引擎失败时：

- 使用 Tesseract fallback

---



### FR-022 OCR输出

系统必须输出：

- 文本内容（按页）
- 坐标信息（bounding boxes）
- 置信度（confidence score）

---



### FR-023 OCR错误处理

系统必须：

- 支持失败重试（最多3次）
- 记录错误日志
- 跳过损坏页面

---



# 3.4 布局分析模块



### FR-030 文档结构分析

系统必须使用：

- PP-Structure

实现：

- 表格检测
- 段落划分
- 标题识别
- 阅读顺序重建

---



### FR-031 输出结构

输出结构必须包含：

- blocks（文本块）
- tables（表格结构）
- reading order（阅读顺序）

---



# 3.5 双层PDF生成模块



### FR-040 双层PDF生成

系统必须生成：

- Image Layer（原始扫描图）
- Text Layer（OCR文本层）

---



### FR-041 PDF可搜索能力

输出PDF必须：

- 支持全文搜索
- 支持复制文本
- 保留原始视觉布局

---



### FR-042 PDF/A支持

系统必须支持导出：

- PDF/A标准归档格式（可选）

---



# 3.6 批处理系统



### FR-050 批量处理

系统必须支持：

- 多文件队列处理
- 顺序执行或并行执行
- 任务状态管理

---



### FR-051 任务状态

每个任务必须包含：

- Pending
- Processing
- Completed
- Failed

---



### FR-052 GPU加速（可选）

系统应支持：

- GPU OCR推理加速
- 自动检测CUDA环境

---



# 3.7 编辑与修正模块



### FR-060 OCR结果编辑

用户必须能够：

- 修改OCR文本
- 删除错误区域
- 标记忽略区域（水印/页眉）

---



### FR-061 局部重识别

系统必须支持：

- 选定区域重新OCR

---



# 3.8 导出模块



### FR-070 导出格式

系统必须支持：

- 双层PDF
- TXT
- Markdown
- Word（后续）
- Excel（表格结构）

---



# 3.9 桌面UI模块（Electron）



### FR-080 UI基础能力

系统必须提供：

- PDF拖拽上传
- 任务列表视图
- OCR进度条（按页）
- 结果预览（双层对比）

---



### FR-081 UI预览功能

必须支持：

- 原图 vs OCR文本对比
- 区域高亮

---



### FR-082 多语言支持

支持：

- 简体中文
- 繁体中文
- English

---



# 3.10 任务与队列系统



### FR-090 任务调度

系统必须：

- 支持任务队列
- 支持失败重试
- 支持断点续跑

---



### FR-091 Worker系统

必须支持：

- CPU worker
- GPU worker（可选）

---



# 4. 非功能需求（NFR）

---



## 4.1 性能

- 单页OCR ≤ 1.5s（CPU）
- GPU ≤ 0.5s/page
- 支持 ≥ 1000页PDF
- 支持流式处理（不全量加载）

---



## 4.2 可用性

- UI响应 < 100ms
- 任务进度实时更新

---



## 4.3 可靠性

- OCR失败自动重试3次
- 页面级错误隔离
- 任务不因单页失败中断

---



## 4.4 安全性

- 默认完全本地处理
- 不上传PDF
- 企业模式可关闭网络

---



# 5. 系统约束

- Windows优先
- Electron桌面端
- Python OCR服务必须独立运行
- Stirling-PDF必须fork修改，不采用插件模式

---



# 6. 外部依赖

- Stirling-PDF
- PaddleOCR
- Tesseract
- OpenCV
- Pillow
- PP-Structure

---



# 7. 关键成功指标（KPI）

- OCR准确率 ≥ 90%（中文扫描件）
- 双层PDF成功率 ≥ 99%
- 批处理稳定运行 ≥ 500页任务
- UI操作延迟 < 200ms

---



# 8. 未来扩展（不属于本FRD）

- Web SaaS版本
- AI文档问答（RAG）
- 文档结构化数据库
- 自动摘要与理解
- API服务化

