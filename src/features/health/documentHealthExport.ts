import type { DocumentHealthReport } from '../../types'

export interface DocumentHealthExport {
  format: 'md-reader.document-health'
  version: 1
  /** Basename only: the report must not disclose an absolute local path. */
  sourceName: string
  checkedAt: number
  diagnostics: DocumentHealthReport['diagnostics']
}

export interface DocumentHealthDownloadAdapter {
  download(file: { path: string; content: string; mediaType: string }): void | Promise<void>
}

/** Creates a portable JSON snapshot without copying document contents or local paths. */
export function buildDocumentHealthExport(sourceName: string, report: DocumentHealthReport): { path: string; content: string; mediaType: string } {
  const base = sourceBasename(sourceName).replace(/\.(md|markdown)$/i, '') || 'document'
  const snapshot: DocumentHealthExport = {
    format: 'md-reader.document-health',
    version: 1,
    sourceName: sourceBasename(sourceName),
    checkedAt: report.checkedAt,
    diagnostics: report.diagnostics,
  }
  return {
    path: `${base}.health.json`,
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
    mediaType: 'application/json',
  }
}

/** Downloads the exact health snapshot shown in the reader. */
export async function downloadDocumentHealthExport(
  sourceName: string,
  report: DocumentHealthReport,
  adapter: DocumentHealthDownloadAdapter = browserDocumentHealthDownloadAdapter,
) {
  const file = buildDocumentHealthExport(sourceName, report)
  await adapter.download(file)
  return file
}

function sourceBasename(sourceName: string): string {
  return sourceName.split(/[\\/]/).pop()?.trim() || 'document.md'
}

const browserDocumentHealthDownloadAdapter: DocumentHealthDownloadAdapter = {
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
