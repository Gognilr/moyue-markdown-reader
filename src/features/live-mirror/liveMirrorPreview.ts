import { isTauri } from '../../services/fileService'
import type { LiveMirrorOverlay } from './overlays'

export const LIVE_MIRROR_OPEN_EVENT = 'markdown-preview:open-live-mirror'
export const MAX_LIVE_MIRROR_SNAPSHOT_BYTES = 4 * 1024 * 1024

export interface LiveMirrorPreviewOverlay {
  id: string
  kind: LiveMirrorOverlay['kind']
  line: number
  label: string
}

export interface LiveMirrorPreviewSnapshot {
  title: string
  markdown: string
  overlays: LiveMirrorPreviewOverlay[]
}

/** Keep the native payload limit visible to the invoking UI as well as Rust. */
export function validateLiveMirrorPreviewSnapshot(snapshot: LiveMirrorPreviewSnapshot): string | null {
  if (!snapshot.title.trim()) return 'Live Mirror requires a document title.'
  if (new TextEncoder().encode(snapshot.markdown).byteLength > MAX_LIVE_MIRROR_SNAPSHOT_BYTES) {
    return 'Live Mirror temporary windows support documents up to 4 MiB.'
  }
  if (snapshot.overlays.length > 10_000) return 'Live Mirror contains too many overlays to open safely.'
  return null
}

async function invokePreview<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/**
 * Browser builds explicitly return null: they do not claim that a popup or a
 * second browser tab is an equivalent native, always-on-top temporary window.
 */
export async function openLiveMirrorPreview(snapshot: LiveMirrorPreviewSnapshot): Promise<{ path: string, reused_window: boolean } | null> {
  const invalid = validateLiveMirrorPreviewSnapshot(snapshot)
  if (invalid) throw new Error(invalid)
  return invokePreview('open_live_mirror_preview', { snapshot })
}

export async function liveMirrorPreviewSnapshot(): Promise<LiveMirrorPreviewSnapshot | null> {
  return invokePreview('live_mirror_preview_snapshot')
}

export async function listenForLiveMirrorPreview(listener: () => void): Promise<() => void> {
  if (!isTauri()) return () => undefined
  const { listen } = await import('@tauri-apps/api/event')
  return listen(LIVE_MIRROR_OPEN_EVENT, () => listener())
}
