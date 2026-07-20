# Browser PDF backend

For long tables, ordinary rows move intact to the next page.  A source row that is taller than a printable page is deliberately handled as the sole exception: it is emitted as continuation fragments with the header repeated on every continuation page, and `PdfExportPlan.tablePaginationNotices` records the fallback.  The backend does not silently clip such a row.

`src/features/export/pdfExport.ts` converts `DocumentIR` to a real PDF Blob using `pdf-lib`; it does not print the React DOM or relabel another file format. Text is emitted as vector text and tables as independently selectable cell text plus vector rules. The layout planner uses A4 by default (Letter is optional), repeats table headers after a page split, and exposes a serialisable `PdfExportPlan` for regression tests.

The minimal browser backend deliberately uses PDF standard fonts so it works without a server, native runtime, or external font download. Those fonts cover Latin-1 only. Characters outside that range are replaced with `?`, and `substitutedCharacters` reports how many were affected. A production CJK-grade backend must embed licensed Unicode fonts (and needs a font asset plus `fontkit`); it must not claim CJK fidelity from this minimal backend.

Current limitations: images and mathematical notation are represented as selectable fallback text, inline links are textual rather than PDF link annotations, and PDF/A/accessibility conformance has not been implemented or claimed.
