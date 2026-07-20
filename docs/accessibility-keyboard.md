# Keyboard navigation and accessibility primitives

The reader now includes framework-neutral building blocks in `src/features/accessibility/readerNavigation.ts` and optional React adapters in `src/components/Accessibility/`. They are intentionally not globally wired: each screen must explicitly decide which command is safe in its current state.

## Default shortcut map

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+O` | Open a document |
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+F` | Search |
| `Ctrl/Cmd+Shift+P` | Command palette |
| `Ctrl/Cmd+Enter` / `Ctrl/Cmd+Shift+Enter` | Next / previous search result |
| `Esc` | Close the active overlay |
| `Ctrl/Cmd+\\` | Toggle sidebar |
| `F6` | Focus the document landmark |

Use `shouldHandleReaderShortcut(event, event.target)` before acting. It preserves typing in inputs, textareas, selects, content-editable fields, and textbox roles; only `Esc` is allowed through from an editable control so a user can leave an overlay.

## Integrating a reading view

1. Put `readerLandmarkAria(title)` on the element that contains rendered Markdown. This creates a focusable `role="document"` landmark without polluting tab order.
2. Add a persistent `ScreenReaderAnnouncer` and pass it meaningful changes such as `searchStatusMessage(index, count)`. Avoid announcing passive rerenders.
3. Wrap modal *contents* in `FocusTrap` and restore focus to the invoking control when the modal closes. The wrapper deliberately does not claim that it manages dialog lifecycle or initial focus.
4. Give icon-only buttons a concise `aria-label`; connect search fields, hints, and result status using stable `readerAriaId` values.

The helpers have unit coverage for shortcut matching, modifier safety, IDs, landmarks, and status wording. DOM focus cycling is deliberately host-level because it requires a rendered DOM and is not assumed by the core parser tests.
