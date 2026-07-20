import type { LocalResourceInventoryItem } from '../../types'
import type { ResourceInventory, ResourceMetadata } from './documentHealth'
import { isTauri } from '../../services/fileService'
import { markdownToAst } from '../export/markdownToIr'

/**
 * Converts native inventory rows into the URL-keyed contract consumed by the
 * pure health and export-preflight checks.  No filesystem operation happens in
 * this helper, making browser previews explicitly remain "pending".
 */
export function resourceInventoryFromItems(items: readonly LocalResourceInventoryItem[]): ResourceInventory {
  const inventory: Record<string, ResourceMetadata> = {}
  for (const item of items) {
    inventory[item.reference] = item.exists
      ? { exists: true, byteLength: item.byteLength }
      : { exists: false }
  }
  return inventory
}

/**
 * Collects only authored links/images that the native command can safely
 * resolve below the opened document.  Fragments and query strings stay on the
 * original URL so the inventory continues to key diagnostics exactly as
 * Markdown authored them.
 */
export function collectInspectableLocalReferences(markdown: string): string[] {
  const references = new Set<string>()
  const walk = (node: { type?: string; url?: unknown; children?: unknown[] }) => {
    if ((node.type === 'image' || node.type === 'link') && typeof node.url === 'string' && isSafeDocumentRelativeReference(node.url)) {
      references.add(node.url)
    }
    node.children?.forEach((child) => {
      if (child && typeof child === 'object') walk(child as { type?: string; url?: unknown; children?: unknown[] })
    })
  }
  walk(markdownToAst(markdown))
  return [...references]
}

function isSafeDocumentRelativeReference(reference: string): boolean {
  const filePart = reference.split(/[?#]/, 1)[0]
  if (!filePart || filePart.startsWith('/') || filePart.startsWith('\\')) return false
  if (/^[a-z][a-z\d+.-]*:/i.test(filePart)) return false
  return !filePart.split(/[\\/]/).some((part) => part === '..')
}

/**
 * Checks only explicit references against the current document's directory.
 * The Rust command rejects absolute, parent-traversal and remote paths, and
 * never recursively indexes the filesystem. Browser mode has no native file
 * authority, therefore returns an empty (unknown) inventory instead.
 */
export async function inspectCurrentDocumentResources(
  documentPath: string | null,
  references: readonly string[],
): Promise<ResourceInventory> {
  if (!documentPath || !isTauri()) return {}
  const uniqueReferences = [...new Set(references)]
  if (!uniqueReferences.length) return {}
  const { invoke } = await import('@tauri-apps/api/core')
  const items = await invoke<LocalResourceInventoryItem[]>('inspect_local_resources', {
    documentPath,
    references: uniqueReferences,
  })
  return resourceInventoryFromItems(items)
}
