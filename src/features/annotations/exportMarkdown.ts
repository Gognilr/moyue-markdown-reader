import type { Annotation, Excerpt } from '../../types'

export interface AnnotationMarkdownExportOptions {
  documentTitle: string
  annotations?: Annotation[]
  excerpts?: Excerpt[]
}

function formatSource(anchor: { headingPath: string[] }): string {
  return anchor.headingPath.length ? ` · ${anchor.headingPath.join(' > ')}` : ''
}

/** 生成开放、可编辑的审阅 Markdown；锚点元数据仍留在 sidecar 中。 */
export function exportAnnotationsToMarkdown(options: AnnotationMarkdownExportOptions): string {
  const annotations = options.annotations ?? []
  const excerpts = options.excerpts ?? []
  const lines = [`# ${options.documentTitle} · 审阅摘录`, '']

  if (excerpts.length) {
    lines.push('## 摘录', '')
    for (const excerpt of excerpts) {
      lines.push(`> ${excerpt.content.replace(/\n/g, '\n> ')}`, '')
      lines.push(`来源：${options.documentTitle}${formatSource(excerpt.anchor)}`, '')
    }
  }

  if (annotations.length) {
    lines.push('## 批注', '')
    for (const annotation of annotations) {
      lines.push(`- **${annotation.kind}**：${annotation.anchor.quote}${formatSource(annotation.anchor)}`)
      if (annotation.note) lines.push(`  - ${annotation.note}`)
    }
    lines.push('')
  }

  if (!annotations.length && !excerpts.length) lines.push('暂无批注或摘录。', '')
  return lines.join('\n')
}
