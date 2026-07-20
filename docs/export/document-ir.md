# P3 DocumentIR contract

`src/features/export/documentIr.ts` is the single export-facing semantic model. It is deliberately independent from React, HTML, CSS, and Tauri so later DOCX and Typst/PDF backends receive the same content, table semantics, theme tokens, and pagination intent.

The current foundation supports headings, paragraphs, nested lists/task state, blockquotes, code (including Mermaid intent), display/inline math, images, thematic breaks, GFM tables, and common inline formatting. Raw HTML and link definitions are intentionally omitted from this first deterministic IR; a production backend must emit an explicit diagnostic before unsupported input is lost.

`markdownToAst()` parses Markdown with remark-parse + GFM + math. `markdownAstToDocumentIR()` transforms that AST, while `markdownToDocumentIR()` is the convenience entry point. The conversion is pure: identical input produces identical IR.

## Table planning

`planTableLayout()` classifies columns as text, number, percentage, currency, date, code, or status. It gives numeric/currency/percentage columns right alignment and status columns centered unless Markdown explicitly requests another alignment. Its width output is expressed in backend-neutral character-width units and supports `auto`, `equal`, `content`, and `fixedRatio` strategies. When the aggregate minimum width exceeds the page width, `requiresLandscape` is raised for a later backend/preflight decision.

## DOCX backend

`docxExport.ts` consumes `DocumentIR` directly and emits an editable OOXML
document through `docx`. It generates native heading paragraphs, paragraphs,
real Word numbering/bullets, code paragraphs, and `w:tbl` tables. Tables have
explicit DXA widths, fixed `tblGrid` geometry, repeating header rows and
non-splitting body rows; they are never rasterized. `createDocxBlob()` is
browser-only and returns a `.docx` Blob, while `downloadDocx()` starts a normal
browser download without requiring a server or Tauri command.

The current backend preserves inline formatting and table alignment. Images and
math are represented as readable placeholders pending a resource-fetching and
OMML conversion pass; this is intentionally visible rather than silently
dropped.
