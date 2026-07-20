# Smart Table Studio core contract

`src/features/export/tableStudio.ts` is the UI-independent core for the export table workbench. It supplements the existing `planTableLayout()` planner; it does not modify Markdown or render an editor control.

## Sidecar persistence

`TableStudioSidecar` stores only export choices, including manual column widths and a selected wide-table strategy. A client persists it beside its source (for example, as a future `.mdreader.json` entry). `withColumnWidth()` is the drag-handler target: it validates the target column and creates a new immutable sidecar value, while leaving the `TableIR` and Markdown untouched.

Each table has:

- a structure fingerprint: column count, alignment and normalized headings;
- a content fingerprint: normalized table cells;
- a local settings-key fingerprint: both fingerprints plus document occurrence index.

`reassociateTableSettings()` retains a setting after ordinary table-content edits only when exactly one existing setting has the matching structure. If several tables share that structure, it refuses to guess. This prevents a manual width chosen for one repeated template from silently being applied to another table.

## Export previews

`chooseWideTableStrategy()` returns deterministic, backend-neutral previews for landscape page, narrower margins, smaller table font and linked split-table modes. The preview records effective width, scale, overflow and fit state. It selects the first fitting option in that order, falling back to linked split tables. DOCX/PDF UI and native backend application intentionally remain separate follow-up work.
