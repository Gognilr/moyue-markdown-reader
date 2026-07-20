import type { BlockIR, DocumentIR, InlineIR, TableRowIR } from '../export/documentIr'
import { markdownToDocumentIR } from '../export/markdownToIr'

export interface StandaloneHtmlOptions {
  /** Title shown by browsers and used as the document heading when desired. */
  title?: string
  /** Extra CSS may refine the built-in, intentionally dependency-free theme. */
  extraCss?: string
}

const BASE_CSS = `
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif; color: #202124; background: #fff; }
body { max-width: 880px; margin: 0 auto; padding: 40px 24px 72px; line-height: 1.75; word-break: break-word; }
h1,h2,h3,h4,h5,h6 { line-height: 1.28; margin: 1.7em 0 .7em; } h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: .35em; }
a { color: #0969da; } img { display: block; max-width: 100%; height: auto; margin: 1rem 0; }
pre { overflow: auto; padding: 1rem; border-radius: 8px; background: #f6f8fa; } code { font-family: ui-monospace, Consolas, monospace; } p code, li code { padding: .1em .3em; background: #f0f2f4; border-radius: 4px; }
blockquote { border-left: 4px solid #d0d7de; margin: 1rem 0; padding: .1rem 1rem; color: #57606a; } table { border-collapse: collapse; display: block; overflow-x: auto; max-width: 100%; } th,td { border: 1px solid #d0d7de; padding: .45rem .7rem; text-align: left; } th { background: #f6f8fa; }
hr { border: 0; border-top: 1px solid #d0d7de; margin: 2rem 0; } .math { font-family: "Cambria Math", serif; } .task { list-style: none; margin-left: -1.2rem; }
@media (prefers-color-scheme: dark) { :root { color: #e6edf3; background: #0d1117; } a { color: #58a6ff; } pre, th, p code, li code { background: #161b22; } blockquote { color: #8b949e; } th,td,h1 { border-color: #30363d; } }
`

/**
 * Produces one portable HTML document.  It intentionally leaves image and link
 * URLs unchanged: a package creator can copy resources later without silently
 * rewriting authored references.
 */
export function documentIrToStandaloneHtml(document: DocumentIR, options: StandaloneHtmlOptions = {}): string {
  const title = options.title ?? 'Markdown document'
  const css = `${BASE_CSS}\n${options.extraCss ?? ''}`
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n<style>${css}</style>\n</head>\n<body>\n<main>\n${document.blocks.map(renderBlock).join('\n')}\n</main>\n</body>\n</html>\n`
}

export function markdownToStandaloneHtml(markdown: string, options: StandaloneHtmlOptions = {}): string {
  return documentIrToStandaloneHtml(markdownToDocumentIR(markdown), options)
}

function renderBlock(block: BlockIR): string {
  switch (block.kind) {
    case 'heading': return `<h${block.depth}>${renderInline(block.children)}</h${block.depth}>`
    case 'paragraph': return `<p>${renderInline(block.children)}</p>`
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      const start = block.ordered && block.start && block.start !== 1 ? ` start="${block.start}"` : ''
      return `<${tag}${start}>${block.items.map((item) => `<li${item.checked !== null && item.checked !== undefined ? ' class="task"' : ''}>${item.checked !== null && item.checked !== undefined ? `<input type="checkbox" disabled${item.checked ? ' checked' : ''}> ` : ''}${item.blocks.map(renderBlock).join('')}</li>`).join('')}</${tag}>`
    }
    case 'blockquote': return `<blockquote>${block.blocks.map(renderBlock).join('')}</blockquote>`
    case 'code': return `<pre><code${block.language ? ` class="language-${escapeAttribute(block.language)}"` : ''}>${escapeHtml(block.value)}</code></pre>`
    case 'math': return `<div class="math" data-display="true">${escapeHtml(block.value)}</div>`
    case 'thematicBreak': return '<hr>'
    case 'image': return `<figure><img src="${escapeAttribute(block.url)}" alt="${escapeAttribute(block.alt)}"${block.title ? ` title="${escapeAttribute(block.title)}"` : ''}></figure>`
    case 'table': return `<table><thead>${renderRow(block.header, true, block.align)}</thead><tbody>${block.rows.map((row) => renderRow(row, false, block.align)).join('')}</tbody></table>`
  }
}

function renderRow(row: TableRowIR, header: boolean, align: Array<'left' | 'center' | 'right' | null>): string {
  const tag = header ? 'th' : 'td'
  return `<tr>${row.cells.map((cell, index) => `<${tag}${align[index] ? ` style="text-align:${align[index]}"` : ''}>${renderInline(cell.children)}</${tag}>`).join('')}</tr>`
}

function renderInline(children: InlineIR[]): string {
  return children.map((child): string => {
    switch (child.kind) {
      case 'text': return escapeHtml(child.value)
      case 'emphasis': return `<em>${renderInline(child.children)}</em>`
      case 'strong': return `<strong>${renderInline(child.children)}</strong>`
      case 'delete': return `<del>${renderInline(child.children)}</del>`
      case 'link': return `<a href="${escapeAttribute(child.url)}"${child.title ? ` title="${escapeAttribute(child.title)}"` : ''}>${renderInline(child.children)}</a>`
      case 'image': return `<img src="${escapeAttribute(child.url)}" alt="${escapeAttribute(child.alt)}"${child.title ? ` title="${escapeAttribute(child.title)}"` : ''}>`
      case 'inlineCode': return `<code>${escapeHtml(child.value)}</code>`
      case 'break': return '<br>'
      case 'math': return `<span class="math">${escapeHtml(child.value)}</span>`
    }
  }).join('')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!)
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
