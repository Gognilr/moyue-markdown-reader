import { isTauri } from '../../services/fileService'

/** Names shared with the small, native-only preview lifecycle in Rust. */
export const QUICK_PREVIEW_OPEN_EVENT = 'markdown-preview:open-file'

export interface QuickPreviewOpenResult {
  path: string
  reused_window: boolean
}

export type QuickPreviewAction = 'close' | 'promote'
export type QuickPreviewNavigation = -1 | 1
export type PreviewSessionKind = 'quick' | 'live-mirror'

export interface PreviewKeyboardEvent {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  target?: EventTarget | null
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  // Tests run in a Node environment, and browser fallback must not require a
  // global HTMLElement constructor merely to decide a keyboard shortcut.
  if (!target || typeof target !== 'object') return false
  const candidate = target as { isContentEditable?: boolean; tagName?: unknown }
  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : ''
  return candidate.isContentEditable === true || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

/**
 * Keep the shortcut decision pure so the native window contract can be tested
 * without WebView2. Esc always dismisses the transient surface; Enter promotes
 * it only when it is not being used to edit a control.
 */
export function quickPreviewActionFromKey(event: PreviewKeyboardEvent): QuickPreviewAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'Escape') return 'close'
  if (event.key === 'Enter' && !isEditableTarget(event.target)) return 'promote'
  return null
}

async function invokePreview<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/** Browser builds deliberately do nothing: quick preview is a Windows-native entry point. */
export async function openQuickPreview(path: string): Promise<QuickPreviewOpenResult | null> {
  return invokePreview<QuickPreviewOpenResult>('open_markdown_preview', { path })
}

export async function previewMarkdownPath(): Promise<string | null> {
  return invokePreview<string | null>('preview_markdown_path')
}

/** The shared transient native surface can host either a path preview or a Live Mirror snapshot. */
export async function previewSessionKind(): Promise<PreviewSessionKind | null> {
  return invokePreview<PreviewSessionKind>('preview_session_kind')
}

export async function closeQuickPreview(): Promise<void> {
  await invokePreview<void>('close_markdown_preview')
}

export async function promoteQuickPreview(): Promise<void> {
  await invokePreview<void>('promote_markdown_preview')
}

/** Move only among Markdown siblings of the currently previewed document. */
export async function navigateQuickPreview(direction: QuickPreviewNavigation): Promise<string | null> {
  return invokePreview<string | null>('navigate_markdown_preview', { direction })
}

/** Determine whether this webview is the dedicated preview surface. */
export async function isQuickPreviewWindow(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow().label === 'markdown-quick-preview'
  } catch {
    return false
  }
}

/** Subscribe only in Tauri and return an idempotent unsubscriber for hosts. */
export async function listenForQuickPreviewPath(listener: (path: string) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<string>(QUICK_PREVIEW_OPEN_EVENT, (event) => listener(event.payload))
  return unlisten
}
