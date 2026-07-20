# P3 导出模板契约

`src/features/export/exportTemplates.ts` 是 DOCX、PDF 和未来原生导出后端共享的展示 token 层。它不读取 DOM、文件系统或网络，也不承诺某一种后端一定能实现每个视觉效果；后端应把不能实现的 token 交给导出预检或明确诊断，而不是静默丢失。

内置模板为：技术报告、需求文档、会议纪要、学术简稿、中文公文和 README。每个模板统一给出颜色、字体回退链、页边距、标题比例、代码、表格、页眉页脚和可选封面元数据。`suggestExportTemplate()` 仅提供确定性的本地建议，调用方必须允许用户覆盖。

## 后端调用方式

1. 从 Markdown 生成 `DocumentIR`，不把 React/HTML 当作导出输入。
2. 按用户选择（或 `suggestExportTemplate` 的建议）调用 `resolveExportPresentation`。
3. DOCX/PDF 后端分别将 `presentation.template.tokens` 映射为原生样式；保留同一语义和 token，不要求逐像素相同。
4. 只渲染 `coverFields` 中实际提供的标题、版本、作者、日期、密级等字段。Logo 是元数据引用，具体读取与嵌入由受信任的宿主文件层完成。

该基础不实现也不宣称实现：用户 `reference.docx` 导入、Word COM、Pandoc、Typst、CJK PDF 字体嵌入、PDF/A 或 Word 同版 PDF。它们是后续后端能力，而非此纯数据模板层的替代品。
