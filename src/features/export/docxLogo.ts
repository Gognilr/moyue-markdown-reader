import { fileService } from '../../services/fileService'
import type { ExportDocumentMetadata } from './exportTemplates'

const supportedTypes = new Set(['png', 'jpg', 'gif', 'bmp'])

/**
 * Resolves only a front-matter-declared local logo. This is deliberately not a
 * general URL loader: remote, absolute and parent-traversal sources are never
 * read as part of an export.
 */
export async function resolveDocxLogo(
  metadata: ExportDocumentMetadata,
  documentPath: string | null,
): Promise<ExportDocumentMetadata> {
  const logo = metadata.logo
  if (!logo || !isSafeRelativeLogo(logo.source) || !documentPath) return metadata
  const type = imageType(logo.source)
  if (!type) return metadata

  const directory = await fileService.getDirname(documentPath)
  if (!directory) return metadata
  const path = await fileService.joinPath(directory, logo.source)
  const url = await fileService.convertFileSrc(path)
  try {
    const response = await fetch(url)
    if (!response.ok) return metadata
    const data = new Uint8Array(await response.arrayBuffer())
    return { ...metadata, logo: { ...logo, data, type } }
  } catch {
    return metadata
  }
}

export function isSafeRelativeLogo(source: string): boolean {
  const path = source.trim()
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-z][a-z\d+.-]*:/i.test(path)) return false
  return !path.split(/[\\/]/).some((part) => part === '..')
}

export function imageType(source: string): 'png' | 'jpg' | 'gif' | 'bmp' | undefined {
  const extension = source.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase()
  const normalized = extension === 'jpeg' ? 'jpg' : extension
  return normalized && supportedTypes.has(normalized) ? normalized as 'png' | 'jpg' | 'gif' | 'bmp' : undefined
}
