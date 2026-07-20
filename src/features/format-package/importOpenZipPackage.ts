import type { OpenZipManifest } from './openZipPackage'

const decoder = new TextDecoder('utf-8', { fatal: true })
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_ENTRIES = 256

export interface ImportedOpenZipPackage {
  name: string
  /** A virtual, read-only document identity. It is never a filesystem path. */
  path: string
  markdown: string
  manifest: OpenZipManifest
  resourceUrls: Readonly<Record<string, string>>
  dispose(): void
}

/** Package identities are virtual and must never be passed to disk APIs. */
export function isOpenPackagePath(path: string | null): boolean {
  return Boolean(path?.startsWith('package://'))
}

interface CentralEntry { path: string; offset: number; size: number; crc: number }

/**
 * Validates and opens only the reader's own uncompressed v1 package.  Nothing
 * is extracted to disk: resource bytes stay in memory and are exposed as blob
 * URLs solely for this preview session.
 */
export function importOpenZipPackage(name: string, archive: Uint8Array): ImportedOpenZipPackage {
  if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Package size is outside the supported 0–64 MiB range.')
  const entries = readCentralDirectory(archive)
  const content = new Map(entries.map((entry) => [entry.path, readStoredEntry(archive, entry)]))
  const manifestBytes = content.get('manifest.json')
  if (!manifestBytes) throw new Error('Package is missing manifest.json.')
  const manifest = parseManifest(manifestBytes)
  validateManifestLayout(manifest, entries)
  const markdown = decodeText(content.get(manifest.document.markdown)!, 'document Markdown')
  const resourceUrls: Record<string, string> = {}
  for (const resource of manifest.resources) {
    const bytes = content.get(resource.path)!
    const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: resource.mediaType }))
    // Markdown references resource paths without the package-only `resources/` prefix.
    resourceUrls[resource.path.slice('resources/'.length)] = url
  }
  return {
    name,
    path: `package://${encodeURIComponent(name)}/${manifest.document.markdown}`,
    markdown: rewritePackageResourceReferences(markdown, resourceUrls),
    manifest,
    resourceUrls,
    dispose: () => Object.values(resourceUrls).forEach((url) => URL.revokeObjectURL(url)),
  }
}

export function rewritePackageResourceReferences(markdown: string, resourceUrls: Readonly<Record<string, string>>): string {
  // Link destinations are rewritten only when they exactly name a manifest
  // resource.  External URLs, anchors, and unknown relative links are intact.
  return markdown.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\s+(?:"[^"]*"|'[^']*'))?(\))/g, (whole, opening, destination, title, closing) => {
    const normalized = destination.replace(/^\.\//, '')
    const url = resourceUrls[normalized]
    return url ? `${opening}${url}${title ?? ''}${closing}` : whole
  })
}

function readCentralDirectory(archive: Uint8Array): CentralEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  let footer = -1
  for (let position = archive.length - 22; position >= Math.max(0, archive.length - 65557); position -= 1) {
    if (view.getUint32(position, true) === 0x06054b50) { footer = position; break }
  }
  if (footer < 0 || footer + 22 > archive.length) throw new Error('Invalid ZIP end-of-central-directory record.')
  if (view.getUint16(footer + 4, true) !== 0 || view.getUint16(footer + 6, true) !== 0) throw new Error('Multi-disk ZIP packages are not supported.')
  const count = view.getUint16(footer + 10, true)
  if (count === 0 || count > MAX_ENTRIES) throw new Error('Package has an unsupported entry count.')
  const size = view.getUint32(footer + 12, true)
  let offset = view.getUint32(footer + 16, true)
  if (offset + size > footer) throw new Error('Invalid ZIP central-directory bounds.')
  const entries: CentralEntry[] = []
  const paths = new Set<string>()
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > archive.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP central-directory entry.')
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const uncompressed = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > archive.length || flags !== 0x0800 || method !== 0 || compressed !== uncompressed || uncompressed > MAX_ENTRY_BYTES) throw new Error('Only UTF-8, uncompressed Store ZIP entries are supported.')
    const path = safeArchivePath(decodeText(archive.subarray(offset + 46, offset + 46 + nameLength), 'ZIP entry name'))
    if (paths.has(path)) throw new Error(`Package contains duplicate entry: ${path}`)
    paths.add(path)
    entries.push({ path, offset: view.getUint32(offset + 42, true), size: uncompressed, crc: view.getUint32(offset + 16, true) })
    offset = next
  }
  return entries
}

function readStoredEntry(archive: Uint8Array, entry: CentralEntry): Uint8Array {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  if (entry.offset + 30 > archive.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(`Invalid local ZIP record for ${entry.path}.`)
  const flags = view.getUint16(entry.offset + 6, true)
  const method = view.getUint16(entry.offset + 8, true)
  const size = view.getUint32(entry.offset + 22, true)
  const nameLength = view.getUint16(entry.offset + 26, true)
  const extraLength = view.getUint16(entry.offset + 28, true)
  const dataStart = entry.offset + 30 + nameLength + extraLength
  if (flags !== 0x0800 || method !== 0 || size !== entry.size || dataStart + size > archive.length) throw new Error(`Unsupported local ZIP entry: ${entry.path}`)
  const bytes = archive.slice(dataStart, dataStart + size)
  if (crc32(bytes) !== entry.crc) throw new Error(`Integrity check failed for ${entry.path}.`)
  return bytes
}

function parseManifest(bytes: Uint8Array): OpenZipManifest {
  let value: unknown
  try { value = JSON.parse(decodeText(bytes, 'manifest.json')) } catch { throw new Error('manifest.json is not valid UTF-8 JSON.') }
  if (!value || typeof value !== 'object') throw new Error('manifest.json must be an object.')
  const candidate = value as Partial<OpenZipManifest>
  if (candidate.format !== 'md-reader.open-package' || candidate.version !== 1 || !candidate.document || typeof candidate.document.markdown !== 'string' || typeof candidate.document.html !== 'string' || !Array.isArray(candidate.resources)) throw new Error('This is not a supported md-reader.open-package v1 archive.')
  if (candidate.resources.some((resource) => !resource || typeof resource.path !== 'string' || typeof resource.mediaType !== 'string')) throw new Error('manifest.json has invalid resource records.')
  if ((candidate.theme !== undefined && typeof candidate.theme !== 'string') || (candidate.annotations !== undefined && typeof candidate.annotations !== 'string')) throw new Error('manifest.json has invalid optional paths.')
  return candidate as OpenZipManifest
}

function validateManifestLayout(manifest: OpenZipManifest, entries: readonly CentralEntry[]): void {
  const expected = new Set<string>(['manifest.json', requiredPath(manifest.document.markdown, 'document/'), requiredPath(manifest.document.html, 'document/')])
  for (const resource of manifest.resources) expected.add(requiredPath(resource.path, 'resources/'))
  if (manifest.theme) expected.add(requiredPath(manifest.theme, 'themes/'))
  if (manifest.annotations) expected.add(requiredPath(manifest.annotations, 'annotations/'))
  if (expected.size !== entries.length || entries.some((entry) => !expected.has(entry.path))) throw new Error('Package contains files not declared by its manifest.')
}

function requiredPath(path: string, prefix: string): string {
  const safe = safeArchivePath(path)
  if (!safe.startsWith(prefix) || safe.length === prefix.length) throw new Error(`Manifest path must stay under ${prefix}`)
  return safe
}

function safeArchivePath(path: string): string {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.includes('\0')) throw new Error(`Unsafe package path: ${path}`)
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error(`Unsafe package path: ${path}`)
  return segments.join('/')
}

function decodeText(bytes: Uint8Array, label: string): string { try { return decoder.decode(bytes) } catch { throw new Error(`${label} must be UTF-8.`) } }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
