/**
 * Small, framework-neutral primitives for a reader's keyboard and ARIA layer.
 * Hosts opt in to these helpers; they do not install global event listeners.
 */

export type ReaderShortcutId =
  | 'open'
  | 'save'
  | 'find'
  | 'toggleEdit'
  | 'commandPalette'
  | 'nextResult'
  | 'previousResult'
  | 'closeOverlay'
  | 'toggleSidebar'
  | 'focusDocument'

export type ReaderShortcut = Readonly<{
  id: ReaderShortcutId
  key: string
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
  description: string
}>

/** The default map is deliberately portable: Ctrl on Windows/Linux, Cmd on macOS. */
export const READER_SHORTCUTS: readonly ReaderShortcut[] = [
  { id: 'open', key: 'o', ctrlOrMeta: true, description: 'Open a Markdown file' },
  { id: 'save', key: 's', ctrlOrMeta: true, description: 'Save the current document' },
  { id: 'find', key: 'f', ctrlOrMeta: true, description: 'Search in the document' },
  { id: 'toggleEdit', key: 'e', ctrlOrMeta: true, description: 'Toggle reading and editing mode' },
  { id: 'commandPalette', key: 'p', ctrlOrMeta: true, shift: true, description: 'Open the command palette' },
  { id: 'nextResult', key: 'Enter', ctrlOrMeta: true, description: 'Move to the next search result' },
  { id: 'previousResult', key: 'Enter', ctrlOrMeta: true, shift: true, description: 'Move to the previous search result' },
  { id: 'closeOverlay', key: 'Escape', description: 'Close the current dialog, lightbox, or palette' },
  { id: 'toggleSidebar', key: '\\', ctrlOrMeta: true, description: 'Show or hide the sidebar' },
  { id: 'focusDocument', key: 'F6', description: 'Move focus to the reading document' },
] as const

export type KeyboardLikeEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function matchesShortcut(event: KeyboardLikeEvent, shortcut: ReaderShortcut): boolean {
  return event.key.toLocaleLowerCase() === shortcut.key.toLocaleLowerCase()
    && Boolean(event.ctrlKey || event.metaKey) === Boolean(shortcut.ctrlOrMeta)
    && Boolean(event.shiftKey) === Boolean(shortcut.shift)
    && Boolean(event.altKey) === Boolean(shortcut.alt)
}

export function shortcutForEvent(event: KeyboardLikeEvent, shortcuts: readonly ReaderShortcut[] = READER_SHORTCUTS): ReaderShortcut | undefined {
  return shortcuts.find((shortcut) => matchesShortcut(event, shortcut))
}

/** Avoid stealing normal typing and native text-editing shortcuts from editable controls. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

export function shouldHandleReaderShortcut(event: KeyboardLikeEvent, target: EventTarget | null): boolean {
  const shortcut = shortcutForEvent(event)
  if (!shortcut) return false
  return !isEditableTarget(target) || shortcut.id === 'closeOverlay'
}

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function visibleFocusableElements(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

/**
 * Move focus inside a dialog/panel. Returns true only when it actually moved
 * focus, allowing callers to decide whether to call preventDefault().
 */
export function cycleFocus(container: ParentNode, current: Element | null, backwards = false): boolean {
  const elements = visibleFocusableElements(container)
  if (elements.length === 0) return false
  const index = current ? elements.indexOf(current as HTMLElement) : -1
  const nextIndex = backwards
    ? (index <= 0 ? elements.length - 1 : index - 1)
    : (index === -1 || index === elements.length - 1 ? 0 : index + 1)
  elements[nextIndex].focus()
  return true
}

export function readerLandmarkAria(title: string): { role: 'document'; 'aria-label': string; tabIndex: number } {
  return { role: 'document', 'aria-label': title || 'Markdown document', tabIndex: -1 }
}

export function searchStatusMessage(current: number, total: number): string {
  if (total <= 0) return 'No search results.'
  return `Search result ${Math.min(Math.max(current, 1), total)} of ${total}.`
}

/** A stable ID creator suitable for linking input/help/status ARIA attributes. */
export function readerAriaId(prefix: string, seed: string | number): string {
  return `${prefix}-${String(seed).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
