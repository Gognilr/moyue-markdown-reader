import type { DocumentAnnotations } from '../../types'
import {
  buildFormatPackage,
  type FormatPackageEntry,
  normalizeBaseName,
} from './formatPackage'
import { markdownToStandaloneHtml, type StandaloneHtmlOptions } from './standaloneHtml'
import { buildOpenZipPackage, type OpenZipPackageInput } from './openZipPackage'

export interface StandaloneHtmlDownloadInput {
  sourceName: string
  markdown: string
  html?: StandaloneHtmlOptions
}

/**
 * A small seam around the DOM download APIs. Desktop integrations can replace
 * it with a native save dialog, while tests do not need a browser DOM.
 */
export interface DownloadAdapter {
  download(file: FormatPackageEntry): void | Promise<void>
}

export interface BinaryDownloadFile {
  path: string
  content: Uint8Array
  mediaType: string
}

export interface BinaryDownloadAdapter {
  download(file: BinaryDownloadFile): void | Promise<void>
}

/** A name-indexed view for callers that need to select individual package files. */
export type FormatPackageFileMap = Record<string, FormatPackageEntry>

/**
 * Returns the portable HTML file that can be downloaded independently. It is
 * intentionally just one HTML file; relative images and links retain their
 * authored URLs and are not embedded or copied.
 */
export function buildStandaloneHtmlDownload(input: StandaloneHtmlDownloadInput): FormatPackageEntry {
  const base = normalizeBaseName(input.sourceName)
  return {
    path: `${base}.html`,
    content: markdownToStandaloneHtml(input.markdown, { title: base, ...input.html }),
    mediaType: 'text/html',
  }
}

/** Exposes the non-ZIP format package as a stable, name-addressable file map. */
export function formatPackageToFileMap(entries: readonly FormatPackageEntry[]): FormatPackageFileMap {
  return Object.fromEntries(entries.map((entry) => [entry.path, entry])) as FormatPackageFileMap
}

/**
 * Builds the individual files offered by a format package. This deliberately
 * does not create a ZIP archive: each entry remains available for a caller to
 * write with its own desktop or browser transport.
 */
export function buildFormatPackageFileMap(input: {
  sourceName: string
  markdown: string
  annotations?: DocumentAnnotations
  html?: StandaloneHtmlOptions
}): FormatPackageFileMap {
  return formatPackageToFileMap(buildFormatPackage(input).entries)
}

/** Downloads one standalone HTML file through the supplied transport. */
export async function downloadStandaloneHtml(
  input: StandaloneHtmlDownloadInput,
  adapter: DownloadAdapter = browserDownloadAdapter,
): Promise<FormatPackageEntry> {
  const file = buildStandaloneHtmlDownload(input)
  await adapter.download(file)
  return file
}

/**
 * Downloads the separate format-package entries one by one. It returns their
 * file map for callers that also want to surface the exact files offered. No
 * ZIP is produced or implied by this operation.
 */
export async function downloadFormatPackageEntries(
  input: Parameters<typeof buildFormatPackage>[0],
  adapter: DownloadAdapter = browserDownloadAdapter,
): Promise<FormatPackageFileMap> {
  const files = buildFormatPackageFileMap(input)
  for (const file of Object.values(files)) await adapter.download(file)
  return files
}

/** Downloads one open, standards-compliant ZIP package (not a proprietary container). */
export async function downloadOpenZipPackage(
  input: OpenZipPackageInput,
  adapter: BinaryDownloadAdapter = browserBinaryDownloadAdapter,
) {
  const pkg = buildOpenZipPackage(input)
  await adapter.download({ path: pkg.fileName, content: pkg.archive, mediaType: 'application/zip' })
  return pkg
}

const browserDownloadAdapter: DownloadAdapter = {
  download(file) {
    const blob = new Blob([file.content], { type: `${file.mediaType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = file.path
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  },
}

const browserBinaryDownloadAdapter: BinaryDownloadAdapter = {
  download(file) {
    // Copy into a plain ArrayBuffer: TypeScript's DOM definitions do not accept
    // a Uint8Array backed by ArrayBufferLike (for example SharedArrayBuffer).
    const bytes = new Uint8Array(file.content)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const blob = new Blob([buffer], { type: file.mediaType })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = file.path
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  },
}
