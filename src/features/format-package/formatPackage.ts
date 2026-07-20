import type { DocumentAnnotations } from '../../types'
import { serializeAnnotationSidecar } from '../annotations/annotationSidecar'
import { markdownToStandaloneHtml, type StandaloneHtmlOptions } from './standaloneHtml'

export interface FormatPackageInput {
  /** Original basename or path. Directories are removed from emitted names. */
  sourceName: string
  markdown: string
  annotations?: DocumentAnnotations
  html?: StandaloneHtmlOptions
}

export interface FormatPackageEntry {
  path: string
  content: string
  mediaType: 'text/markdown' | 'text/html' | 'application/json'
}

export interface FormatPackage {
  /** Entries are deliberately independent of ZIP/desktop APIs and easy to test. */
  entries: FormatPackageEntry[]
  manifest: { version: 1; sourceName: string; annotationSidecar?: string }
}

/**
 * Defines the exact files a future ZIP/native writer must materialize. This
 * function never claims to create a .zip: callers may pass entries to their
 * chosen platform writer, or export each entry individually.
 */
export function buildFormatPackage(input: FormatPackageInput): FormatPackage {
  const base = normalizeBaseName(input.sourceName)
  const markdownPath = `${base}.md`
  const htmlPath = `${base}.html`
  const entries: FormatPackageEntry[] = [
    { path: markdownPath, content: input.markdown, mediaType: 'text/markdown' },
    { path: htmlPath, content: markdownToStandaloneHtml(input.markdown, { title: base, ...input.html }), mediaType: 'text/html' },
  ]
  const annotationSidecar = input.annotations ? `${base}.mdreader.json` : undefined
  if (input.annotations) entries.push({ path: annotationSidecar!, content: serializeAnnotationSidecar(input.annotations), mediaType: 'application/json' })
  return { entries, manifest: { version: 1, sourceName: markdownPath, ...(annotationSidecar ? { annotationSidecar } : {}) } }
}

export function normalizeBaseName(sourceName: string): string {
  const leaf = sourceName.replace(/\\/g, '/').split('/').pop()?.trim() || 'document'
  const withoutExtension = leaf.replace(/\.(md|markdown)$/i, '')
  return withoutExtension || 'document'
}
