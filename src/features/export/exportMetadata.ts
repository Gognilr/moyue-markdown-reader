import type { ExportDocumentMetadata } from './exportTemplates'

/**
 * Extracts only the small, explicitly supported export presentation fields.
 * This deliberately is not a general YAML parser: unknown front-matter is
 * ignored and no Markdown content is rewritten while exporting.
 */
export function extractExportMetadata(markdown: string, fallbackTitle = ''): ExportDocumentMetadata {
  const values = readFrontMatter(markdown)
  const title = (values.title ?? firstHeading(markdown) ?? fallbackTitle) || undefined
  const metadata: ExportDocumentMetadata = {
    title,
    subtitle: values.subtitle,
    classification: values.classification,
    version: values.version,
    author: values.author,
    date: values.date,
    logo: values.logo ? { source: values.logo, alt: values.logoAlt ?? 'Company logo' } : undefined,
  }
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => Boolean(value))) as ExportDocumentMetadata
}

function readFrontMatter(markdown: string): Partial<Record<'title' | 'subtitle' | 'classification' | 'version' | 'author' | 'date' | 'logo' | 'logoAlt', string>> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return {}
  const supported = new Set(['title', 'subtitle', 'classification', 'version', 'author', 'date', 'logo', 'logo_alt'])
  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/)
    if (!field || !supported.has(field[1])) continue
    const value = unquote(field[2])
    if (value) result[field[1] === 'logo_alt' ? 'logoAlt' : field[1]] = value
  }
  return result
}

function unquote(value: string): string {
  const quoted = value.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/)
  return (quoted?.[1] ?? quoted?.[2] ?? value).trim()
}

function firstHeading(markdown: string): string | undefined {
  const source = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  const heading = source.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim()
  return heading || undefined
}
