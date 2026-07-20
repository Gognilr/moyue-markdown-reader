# Live Mirror overlay model

`src/features/live-mirror/overlays.ts` is a source-only scanner for the existing
semantic ribbon.  It produces navigable positions for search results, persisted
annotation quotes, supplied verification warnings, risk markers, and unchecked
Markdown tasks.  Fenced code is excluded from task and warning heuristics.

For a large document, `createLiveMirrorOverlayIndex()` divides source into stable
line segments. `updateLiveMirrorOverlayIndex()` recalculates diagnostics and reports
which segment fingerprints can be reused by a virtualized UI. It does not render
Markdown incrementally and does not create or claim support for a second desktop
mirror window.

`LiveMirrorOverlayLegend` is intentionally a small optional React component. A host
provides its `onNavigate` callback, keeping DOM scrolling and window management out
of the model.
