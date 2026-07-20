import type { CompareEntry } from './documentCompare'

/** A revision held in UI state only; source selection never writes a file. */
export interface LocalDiffSource {
  kind: 'last-saved' | 'disk' | 'picked-file'
  label: string
  markdown: string
  path?: string
}

export function canReadDiskRevision(currentPath: string | null, desktopRuntime: boolean): boolean {
  return Boolean(currentPath && desktopRuntime)
}

/** The in-memory baseline is set only after an open or successful save. */
export function canUseLastSavedRevision(markdown: string | null, currentMarkdown: string): boolean {
  return markdown !== null && markdown !== currentMarkdown
}

export function makeLastSavedDiffSource(markdown: string, displayName: string): LocalDiffSource {
  return { kind: 'last-saved', label: `上次保存版本：${displayName}`, markdown }
}

export function makeDiskDiffSource(path: string, markdown: string, displayName: string): LocalDiffSource {
  return { kind: 'disk', label: `磁盘版本：${displayName}`, markdown, path }
}

export function makePickedFileDiffSource(path: string, markdown: string, displayName: string): LocalDiffSource {
  return { kind: 'picked-file', label: `本地文件：${displayName}`, markdown, path }
}

/** The right side is the live reader whenever it exists; removed blocks have no live target. */
export function currentBlockForDiffEntry(entry: CompareEntry) { return entry.right }

export function diffEntrySearchText(entry: CompareEntry): string | null {
  const normalized = currentBlockForDiffEntry(entry)?.text.replace(/\s+/g, ' ').trim() ?? ''
  return normalized || null
}
