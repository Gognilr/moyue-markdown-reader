import GithubSlugger from 'github-slugger'
import type { Heading, Image, Link, Root, Table } from 'mdast'
import type { DocumentDiagnostic, DocumentHealthReport } from '../../types'
import { markdownToAst } from '../export/markdownToIr'

/** Tables wider than this are difficult to read in the normal document column. */
export const WIDE_TABLE_COLUMN_COUNT = 8
/** Image dimensions above this value tend to create unnecessarily large exports. */
export const LARGE_IMAGE_PIXEL_COUNT = 16_000_000
/** Large enough to materially affect a portable Markdown package or export. */
export const LARGE_IMAGE_BYTE_COUNT = 10 * 1024 * 1024

export interface ResourceMetadata {
  /** `false` is a verified absence; omit it when a host has not inspected the resource. */
  exists?: boolean
  byteLength?: number
  width?: number
  height?: number
}

/**
 * A host-provided index of resources, keyed by the exact Markdown URL.  It is
 * deliberately injected: this module never reads files, decodes images, or
 * makes network requests on its own.
 */
export type ResourceInventory = Readonly<Record<string, ResourceMetadata | undefined>> | ((url: string) => ResourceMetadata | undefined)

export interface EncodingHealthInput {
  /** A decoder or file-opening layer may flag a lossy/uncertain decode here. */
  suspicious: boolean
  detectedLabel?: string
  reason?: string
  line?: number
  column?: number
}

export interface ExportFontHealthInput {
  name: string
  /** Exact glyphs known to be supported by the selected export font. */
  supportedCharacters?: string | ReadonlySet<string>
}

export interface DocumentHealthOptions {
  resourceInventory?: ResourceInventory
  encoding?: EncodingHealthInput
  /** Optional export constraints; absent means no export-specific claims. */
  export?: { font?: ExportFontHealthInput; checkUnsupportedSyntax?: boolean }
}

const remoteResource = /^(?:https?:)?\/\//i
const relativeResource = /^(?![a-z][a-z\d+.-]*:|\/|#|$)/i

/**
 * Inspects Markdown only.  It intentionally does no filesystem or network I/O,
 * so a relative reference is reported as pending resolution, not as missing.
 */
export function checkDocumentHealth(markdown: string, options: DocumentHealthOptions = {}): DocumentHealthReport {
  const root = markdownToAst(markdown)
  return { diagnostics: checkMarkdownAst(root, options), checkedAt: Date.now() }
}

export function checkMarkdownAst(root: Root, options: DocumentHealthOptions = {}): DocumentDiagnostic[] {
  const diagnostics: DocumentDiagnostic[] = []
  const slugger = new GithubSlugger()
  const seenAnchors = new Set<string>()
  let previousHeadingDepth: number | undefined

  forEachNode(root, 'heading', (node) => {
    const heading = node as Heading
    const position = sourcePosition(heading)
    if (previousHeadingDepth !== undefined && heading.depth > previousHeadingDepth + 1) {
      diagnostics.push(diagnostic('heading-level-jump', position.line, position.column,
        `Heading level jumps from H${previousHeadingDepth} to H${heading.depth}.`,
        'Insert the missing heading level or promote this heading to keep the outline navigable.'))
    }
    previousHeadingDepth = heading.depth

    const text = plainText(heading)
    const baseAnchor = new GithubSlugger().slug(text)
    slugger.slug(text)
    if (seenAnchors.has(baseAnchor)) {
      diagnostics.push(diagnostic('duplicate-anchor', position.line, position.column,
        `Heading anchor "${baseAnchor}" is duplicated.`,
        'Rename one heading so links and the table of contents have an unambiguous target.'))
    }
    seenAnchors.add(baseAnchor)
  })

  forEachNode(root, 'image', (node) => inspectResource(node as Image, 'relative-image', 'image', diagnostics, options.resourceInventory))
  forEachNode(root, 'link', (node) => inspectResource(node as Link, 'relative-link', 'link', diagnostics, options.resourceInventory))
  forEachNode(root, 'table', (node) => {
    const table = node as Table
    const columns = Math.max(0, ...table.children.map((row) => row.children.length))
    if (columns > WIDE_TABLE_COLUMN_COUNT) {
      const position = sourcePosition(table)
      diagnostics.push(diagnostic('wide-table', position.line, position.column,
        `Table has ${columns} columns; it may overflow the reading column.`,
        'Split the table, shorten columns, or use the table lens for horizontal scrolling.'))
    }
  })

  inspectEncoding(options.encoding, diagnostics)
  inspectExportConstraints(root, options.export, diagnostics)

  return diagnostics
}

type MarkdownNode = {
  type?: string
  children?: MarkdownNode[]
  position?: { start: { line: number; column: number } }
}

function forEachNode(root: MarkdownNode, type: string, callback: (node: MarkdownNode) => void) {
  const walk = (node: MarkdownNode) => {
    if (node.type === type) callback(node)
    node.children?.forEach(walk)
  }
  walk(root)
}

function inspectResource(node: Image | Link, relativeCode: 'relative-image' | 'relative-link', kind: 'image' | 'link', diagnostics: DocumentDiagnostic[], inventory?: ResourceInventory) {
  const position = sourcePosition(node)
  if (remoteResource.test(node.url)) {
    diagnostics.push(diagnostic('remote-resource', position.line, position.column,
      `This ${kind} loads a remote resource: ${node.url}.`,
      'Download and reference a local copy if the document must work offline or be exported.'))
  } else if (relativeResource.test(node.url)) {
    const metadata = lookupResource(inventory, node.url)
    if (metadata?.exists === false) {
      diagnostics.push(diagnostic('missing-local-resource', position.line, position.column,
        `Local ${kind} target "${node.url}" was not found in the supplied resource inventory.`,
        'Restore the referenced file or update the Markdown target.'))
      return
    }
    if (kind === 'image' && metadata?.exists === true && isLargeImage(metadata)) {
      diagnostics.push({ ...diagnostic('oversized-image', position.line, position.column,
        `Image "${node.url}" is large (${describeImageSize(metadata)}).`,
        'Resize or recompress the image before packaging or exporting.'), resolution: 'resolved' })
    }
    diagnostics.push({ ...diagnostic(relativeCode, position.line, position.column,
      `Relative ${kind} target "${node.url}" needs local resolution.`,
      metadata?.exists === true
        ? 'The supplied inventory found this target; keep it beside the Markdown file when moving the document.'
        : 'Keep the target beside the Markdown file or replace it with a verified local path.'), resolution: metadata?.exists === true ? 'resolved' : 'pending' })
  }
}

function lookupResource(inventory: ResourceInventory | undefined, url: string): ResourceMetadata | undefined {
  return typeof inventory === 'function' ? inventory(url) : inventory?.[url]
}

function isLargeImage(metadata: ResourceMetadata) {
  return (metadata.byteLength ?? 0) > LARGE_IMAGE_BYTE_COUNT
    || (metadata.width ?? 0) * (metadata.height ?? 0) > LARGE_IMAGE_PIXEL_COUNT
}

function describeImageSize(metadata: ResourceMetadata) {
  const parts: string[] = []
  if (metadata.width && metadata.height) parts.push(`${metadata.width}×${metadata.height}px`)
  if (metadata.byteLength) parts.push(`${Math.round(metadata.byteLength / 1024 / 1024 * 10) / 10} MB`)
  return parts.join(', ') || 'metadata threshold exceeded'
}

function inspectEncoding(input: EncodingHealthInput | undefined, diagnostics: DocumentDiagnostic[]) {
  if (!input?.suspicious) return
  diagnostics.push(diagnostic('suspicious-encoding', input.line ?? 1, input.column ?? 1,
    `The opening layer reported a suspicious${input.detectedLabel ? ` ${input.detectedLabel}` : ''} text decode${input.reason ? `: ${input.reason}` : '.'}`,
    'Reopen from the original bytes with the intended encoding and save a UTF-8 copy only after reviewing the text.'))
}

function inspectExportConstraints(root: Root, exportInput: DocumentHealthOptions['export'], diagnostics: DocumentDiagnostic[]) {
  if (!exportInput) return
  if (exportInput.font?.supportedCharacters) {
    const supported = exportInput.font.supportedCharacters
    const missing = [...collectText(root)].filter((character) => !isWhitespaceOrAscii(character) && !supportsCharacter(supported, character))
    const uniqueMissing = [...new Set(missing)].slice(0, 12)
    if (uniqueMissing.length) {
      diagnostics.push(diagnostic('export-font-coverage', 1, 1,
        `Export font "${exportInput.font.name}" does not cover supplied text glyphs: ${uniqueMissing.join(' ')}.`,
        'Choose a font with these glyphs or configure a verified fallback before exporting.'))
    }
  }
  if (exportInput.checkUnsupportedSyntax) {
    forEachNode(root, 'html', (node) => {
      const position = sourcePosition(node)
      diagnostics.push(diagnostic('unsupported-export-syntax', position.line, position.column,
        'Raw HTML is not represented by the portable document export model.',
        'Replace the HTML with standard Markdown or review the generated export.'))
    })
    forEachNode(root, 'definition', (node) => {
      const position = sourcePosition(node)
      diagnostics.push(diagnostic('unsupported-export-syntax', position.line, position.column,
        'Reference definitions are not represented directly by the portable document export model.',
        'Use inline links or review the generated export before distribution.'))
    })
  }
}

function collectText(root: MarkdownNode) {
  const text: string[] = []
  const walk = (node: MarkdownNode & { value?: unknown }) => {
    if (typeof node.value === 'string') text.push(node.value)
    node.children?.forEach(walk)
  }
  walk(root)
  return text.join('')
}

function isWhitespaceOrAscii(character: string) {
  return /[\x00-\x7f\s]/.test(character)
}

function supportsCharacter(supported: string | ReadonlySet<string>, character: string) {
  return typeof supported === 'string' ? supported.includes(character) : supported.has(character)
}

function diagnostic(code: DocumentDiagnostic['code'], line: number, column: number, description: string, fixHint: string): DocumentDiagnostic {
  return { id: `${code}:${line}:${column}`, code, severity: 'warning', line, column, description, fixHint }
}

function sourcePosition(node: { position?: { start: { line: number; column: number } } }) {
  return node.position?.start ?? { line: 1, column: 1 }
}

function plainText(node: Heading): string {
  return node.children.map((child) => {
    if ('value' in child && typeof child.value === 'string') return child.value
    if ('children' in child) return child.children.map((nested) => 'value' in nested && typeof nested.value === 'string' ? nested.value : '').join('')
    return ''
  }).join('')
}
