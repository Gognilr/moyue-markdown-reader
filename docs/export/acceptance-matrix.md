# P3 high-fidelity export acceptance matrix

The executable semantic fixture is [`test/fixtures/export/p3-golden-mixed-content.md`](../../test/fixtures/export/p3-golden-mixed-content.md), exercised by `src/features/export/p3GoldenExport.test.ts`. “Automated” means deterministic IR/format structure only; it never substitutes for Office or PDF-renderer visual evidence.

| Area | Fixture / scale | Automated structural gate | Still requires release evidence |
| --- | --- | --- | --- |
| Document structure | heading, quote, task list, code, Mermaid, math | shared `DocumentIR` has typed blocks; DOCX ZIP contains `word/document.xml` table/text nodes; PDF has `%PDF-` header | Word/PDF visual hierarchy and page breaks |
| Mixed language | Chinese, English, numerals, money, URL, Emoji | source and OOXML preserve selected Chinese/code strings | PDF CJK glyph embedding: current backend reports substitutions, so this is **not passed** |
| Table columns | 8-column wide table | IR has 8 cells; DOCX plan preserves 8 columns and sums widths to page text width | 2/4/12-column visual fixtures and landscape policy |
| Long table | 50 rows + header | DOCX plan has 51 rows; PDF plan spans pages and repeats table headers | 100/500-row load, Word/LibreOffice row/page behavior |
| Code/formula | TS code, inline and display math | typed code/math blocks survive IR; DOCX contains code text | OMML formula and Mermaid/image raster/vector backends |
| Resources | local image/link and HTTPS image | inventory accepts known local paths; preflight flags remote resource | actual attachment packaging, offline render and image pixels |
| Width/HTML risk | 8 columns; explicit `<br>` | preflight returns `wideTable`, `remoteResource`, `unsupportedHtml`, each with remediation | interactive preview, landscape/appendix choice, renderer screenshots |
| Compatibility | Word 2021/365, LibreOffice, Chrome/Edge/Acrobat | no false automated claim | store generated DOCX/PDF and page screenshots per supported application/version |

Current automated gate: `npm test -- --run src/features/export/p3GoldenExport.test.ts`. It proves native DOCX table structure and genuine PDF bytes, but does not prove pixel-perfect output or CJK PDF fidelity. Binary artifact snapshots must only be added together with a reproducible generator and an explicit target-renderer/version manifest.
