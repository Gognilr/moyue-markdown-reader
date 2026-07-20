# 导出黄金样本

可执行的 P3 黄金 Markdown 位于 [`test/fixtures/export/p3-golden-mixed-content.md`](../../test/fixtures/export/p3-golden-mixed-content.md)。它有意包含：中文/英文/Emoji、中英混排公式、Mermaid 与 TypeScript 代码、一个本地资源、一个远程资源，以及 50 行 × 8 列的长表。

对应的 `p3GoldenExport.test.ts` 不把二进制文件或视觉截图误称为稳定基准。它验证：

- 源 Markdown 能确定性进入共享 `DocumentIR`；
- DOCX Blob 是 ZIP，且 `word/document.xml` 包含真实 Word 表格、表头、代码与正文文本；
- PDF Blob 有 PDF 文件头、分页计划和跨页表头重复；
- 预检会报告远程资源、宽表与 HTML 风险，而不会静默忽略；
- 当前内置 PDF 标准字体对 CJK 会替代字符，因此该限制被作为显式回归断言，不能包装成高保真已完成。

真实 Word/LibreOffice/Acrobat 页面截图和用户指定字体下的视觉基准仍属于发布人工验收，不在本仓库的无头单测覆盖范围内。
