import type { Annotation, Excerpt } from '../../types'

/** A read-only snapshot used by review Markdown and DOCX exports. */
export interface ReviewExportData {
  documentTitle: string
  annotations?: readonly Annotation[]
  excerpts?: readonly Excerpt[]
}

function source(anchor: { headingPath: readonly string[] }): string {
  return anchor.headingPath.length ? ` · ${anchor.headingPath.join(' > ')}` : ''
}

/**
 * Creates a standalone editable review record. The source Markdown and its
 * sidecar are deliberately never mutated by this operation.
 */
export function reviewExportMarkdown(data: ReviewExportData): string {
  const annotations = data.annotations ?? []
  const excerpts = data.excerpts ?? []
  const lines = [`# ${data.documentTitle} · 审阅记录`, '', '> 此文件是只读审阅快照；导出不会改写原始 Markdown 或批注 sidecar。', '']
  if (excerpts.length) {
    lines.push('## 摘录', '')
    for (const excerpt of excerpts) {
      lines.push(`> ${excerpt.content.replace(/\n/g, '\n> ')}`, '')
      lines.push(`来源：${data.documentTitle}${source(excerpt.anchor)}`, '')
    }
  }
  if (annotations.length) {
    lines.push('## 批注与修订意见', '')
    for (const annotation of annotations) {
      lines.push(`- **${annotation.kind}**：${annotation.anchor.quote}${source(annotation.anchor)}`)
      if (annotation.note) lines.push(`  - 意见：${annotation.note}`)
    }
    lines.push('')
  }
  if (!annotations.length && !excerpts.length) lines.push('暂无批注或摘录。', '')
  return lines.join('\n')
}
