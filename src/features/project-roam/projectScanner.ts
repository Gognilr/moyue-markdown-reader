import type { ProjectDocumentSource } from './projectVerification'
import { isTauri } from '../../services/fileService'
import { collectInspectableLocalReferences } from '../health/localResourceInventory'
import { resolveProjectPath } from './projectRoam'
import type { LocalResourceInventoryItem } from '../../types'

export interface ScannedProjectMarkdown {
  documents: ProjectDocumentSource[]
  truncated: boolean
}

/**
 * Requests the native, picker-scoped project snapshot. Browser preview and
 * unsaved documents intentionally have no directory scanning fallback.
 */
export async function scanCurrentAuthorizedProject(currentPath: string | null): Promise<ScannedProjectMarkdown | null> {
  if (!currentPath || !isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<ScannedProjectMarkdown>('scan_authorized_project_markdown', { currentPath })
}

/** Current editor text wins over the disk snapshot, without writing a file. */
export function includeCurrentProjectDocument(scan: ScannedProjectMarkdown, currentPath: string, markdown: string): ScannedProjectMarkdown {
  const key = (path: string) => path.replace(/\\/g, '/').toLowerCase()
  const currentKey = key(currentPath)
  const documents = scan.documents.filter((document) => key(document.path) !== currentKey)
  documents.push({ path: currentPath, markdown })
  return { ...scan, documents }
}

/**
 * Converts only explicit, authored relative resources into verified facts.
 * Each native call still rejects paths that escape its document directory.
 */
export async function inspectScannedProjectResources(documents: readonly ProjectDocumentSource[]): Promise<Record<string, { exists: boolean }>> {
  if (!isTauri()) return {}
  const { invoke } = await import('@tauri-apps/api/core')
  const inventories = await Promise.all(documents.map(async (document) => {
    const references = collectInspectableLocalReferences(document.markdown)
    if (!references.length) return [] as LocalResourceInventoryItem[]
    return await invoke<LocalResourceInventoryItem[]>('inspect_local_resources', { documentPath: document.path, references })
  }))
  const facts: Record<string, { exists: boolean }> = {}
  documents.forEach((document, index) => inventories[index].forEach((item) => {
    facts[resolveProjectPath(document.path, item.reference.split(/[?#]/, 1)[0])] = { exists: item.exists }
  }))
  return facts
}
