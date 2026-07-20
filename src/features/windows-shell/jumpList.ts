import type { HistoryItem } from '../../types'
import { isTauri } from '../../services/fileService'

export interface JumpListPayloadEntry { path: string; title: string }

export function buildJumpListPayload(history: readonly HistoryItem[]): { recent: JumpListPayloadEntry[]; favorites: JumpListPayloadEntry[] } {
  const existing = history.filter((item) => /\.(md|markdown)$/i.test(item.path))
  return {
    favorites: existing.filter((item) => item.isFavorite).slice(0, 10).map(({ path, title }) => ({ path, title })),
    recent: [...existing].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 10).map(({ path, title }) => ({ path, title })),
  }
}

export async function syncWindowsJumpList(history: readonly HistoryItem[]): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('sync_windows_jump_list', buildJumpListPayload(history))
}
