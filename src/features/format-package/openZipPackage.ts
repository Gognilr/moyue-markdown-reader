import type { DocumentAnnotations } from '../../types'
import { serializeAnnotationSidecar } from '../annotations/annotationSidecar'
import { markdownToStandaloneHtml } from './standaloneHtml'
import { normalizeBaseName } from './formatPackage'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface OpenPackageResource {
  /** Path relative to the source Markdown file, such as `images/plot.png`. */
  path: string
  content: string | Uint8Array
  mediaType?: string
}

export interface OpenZipPackageInput {
  sourceName: string
  markdown: string
  /** Explicitly supplied local resources only; the packer never scans disks. */
  resources?: readonly OpenPackageResource[]
  /** Optional reader CSS, kept as an ordinary editable file in the archive. */
  theme?: { name?: string; css: string }
  annotations?: DocumentAnnotations
}

export interface OpenZipPackageEntry {
  path: string
  content: Uint8Array
  mediaType: string
}

export interface OpenZipPackage {
  fileName: string
  entries: readonly OpenZipPackageEntry[]
  manifest: OpenZipManifest
  archive: Uint8Array
}

export interface OpenZipManifest {
  format: 'md-reader.open-package'
  version: 1
  document: { markdown: string; html: string }
  resources: readonly { path: string; mediaType: string }[]
  theme?: string
  annotations?: string
}

/**
 * Builds a standards-compliant, uncompressed ZIP archive. Its layout is deliberately
 * transparent: Markdown, HTML, resources, CSS and annotations are normal files.
 */
export function buildOpenZipPackage(input: OpenZipPackageInput): OpenZipPackage {
  const base = normalizeBaseName(input.sourceName)
  const markdownPath = `document/${base}.md`
  const htmlPath = `document/${base}.html`
  const entries: OpenZipPackageEntry[] = [
    textEntry(markdownPath, input.markdown, 'text/markdown'),
    textEntry(htmlPath, markdownToStandaloneHtml(input.markdown, { title: base }), 'text/html'),
  ]
  const resources = (input.resources ?? []).map((resource) => {
    const safePath = safeRelativeZipPath(resource.path)
    const archivePath = `resources/${safePath}`
    entries.push({ path: archivePath, content: toBytes(resource.content), mediaType: resource.mediaType ?? 'application/octet-stream' })
    return { path: archivePath, mediaType: resource.mediaType ?? 'application/octet-stream' }
  })
  let theme: string | undefined
  if (input.theme) {
    const name = safeThemeName(input.theme.name ?? 'reader')
    theme = `themes/${name}.css`
    entries.push(textEntry(theme, input.theme.css, 'text/css'))
  }
  let annotations: string | undefined
  if (input.annotations) {
    annotations = `annotations/${base}.mdreader.json`
    entries.push(textEntry(annotations, serializeAnnotationSidecar(input.annotations), 'application/json'))
  }
  const manifest: OpenZipManifest = {
    format: 'md-reader.open-package', version: 1,
    document: { markdown: markdownPath, html: htmlPath }, resources,
    ...(theme ? { theme } : {}), ...(annotations ? { annotations } : {}),
  }
  entries.unshift(textEntry('manifest.json', JSON.stringify(manifest, null, 2), 'application/json'))
  assertUniquePaths(entries)
  return { fileName: `${base}.mdpack.zip`, entries, manifest, archive: encodeStoreZip(entries) }
}

/** Rejects paths that could escape the open package's `resources/` directory. */
export function safeRelativeZipPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.includes('\0')) {
    throw new Error(`Unsafe package resource path: ${path}`)
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe package resource path: ${path}`)
  }
  return segments.join('/')
}

/** Lists central-directory names for verification and importer smoke checks. */
export function readZipDirectoryNames(archive: Uint8Array): string[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  for (let position = archive.length - 22; position >= 0; position -= 1) {
    if (view.getUint32(position, true) !== 0x06054b50) continue
    const count = view.getUint16(position + 10, true)
    let offset = view.getUint32(position + 16, true)
    const names: string[] = []
    for (let index = 0; index < count; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory')
      const nameLength = view.getUint16(offset + 28, true)
      const extraLength = view.getUint16(offset + 30, true)
      const commentLength = view.getUint16(offset + 32, true)
      names.push(decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength)))
      offset += 46 + nameLength + extraLength + commentLength
    }
    return names
  }
  throw new Error('ZIP end-of-central-directory record not found')
}

function textEntry(path: string, content: string, mediaType: string): OpenZipPackageEntry {
  return { path, content: encoder.encode(content), mediaType }
}

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? encoder.encode(content) : content
}

function safeThemeName(name: string): string {
  const compact = name.trim().replace(/[^a-zA-Z0-9_-]+/g, '-')
  if (!compact || compact === '.' || compact === '..') throw new Error(`Unsafe theme name: ${name}`)
  return compact
}

function assertUniquePaths(entries: readonly OpenZipPackageEntry[]) {
  const paths = new Set<string>()
  for (const entry of entries) {
    if (paths.has(entry.path)) throw new Error(`Duplicate package path: ${entry.path}`)
    paths.add(entry.path)
  }
}

function encodeStoreZip(entries: readonly OpenZipPackageEntry[]): Uint8Array {
  const records: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const crc = crc32(entry.content)
    const local = new Uint8Array(30 + name.length + entry.content.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true); localView.setUint16(8, 0, true)
    localView.setUint32(14, crc, true); localView.setUint32(18, entry.content.length, true); localView.setUint32(22, entry.content.length, true)
    localView.setUint16(26, name.length, true); local.set(name, 30); local.set(entry.content, 30 + name.length)
    records.push(local)
    const directory = new Uint8Array(46 + name.length)
    const directoryView = new DataView(directory.buffer)
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true)
    directoryView.setUint16(8, 0x0800, true); directoryView.setUint16(10, 0, true)
    directoryView.setUint32(16, crc, true); directoryView.setUint32(20, entry.content.length, true); directoryView.setUint32(24, entry.content.length, true)
    directoryView.setUint16(28, name.length, true); directoryView.setUint32(42, offset, true); directory.set(name, 46)
    central.push(directory); offset += local.length
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0)
  const footer = new Uint8Array(22)
  const footerView = new DataView(footer.buffer)
  footerView.setUint32(0, 0x06054b50, true); footerView.setUint16(8, entries.length, true); footerView.setUint16(10, entries.length, true)
  footerView.setUint32(12, centralSize, true); footerView.setUint32(16, offset, true)
  return concatBytes([...records, ...central, footer])
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
