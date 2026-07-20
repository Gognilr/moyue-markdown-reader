import GithubSlugger from 'github-slugger'
import { getProjectDocumentLinks, resolveProjectPath } from './projectRoam'

export type ProjectVerificationCode = 'broken-document-link' | 'broken-document-anchor' | 'missing-image' | 'duplicate-anchor' | 'isolated-document'

export interface ProjectDocumentSource {
  /** Absolute or host-relative identity supplied by the opening layer. */
  path: string
  markdown: string
  /** Optional host metadata.  A title is otherwise derived from the first H1. */
  title?: string
}

export interface ProjectVerificationDiagnostic {
  code: ProjectVerificationCode
  path: string
  line: number
  column: number
  description: string
  fixHint: string
}

export interface ProjectResourceFact {
  /** `false` is a verified absence; omitted facts are intentionally unknown. */
  exists?: boolean
}

export type ProjectResourceInventory = Readonly<Record<string, ProjectResourceFact | undefined>> | ((path: string) => ProjectResourceFact | undefined)

export interface ProjectVerificationOptions {
  /** Explicit entry documents take precedence over README discovery. */
  entryPaths?: readonly string[]
  /** Optional, injected facts for non-Markdown resources such as images. */
  resourceInventory?: ProjectResourceInventory
}

export interface RecommendedReadingItem {
  path: string
  title: string
  /** Makes the deterministic ordering explainable in UI without an AI claim. */
  reason: 'entry' | 'linked-from' | 'unlinked'
  linkedFrom?: string
}

export interface ProjectVerificationReport {
  diagnostics: ProjectVerificationDiagnostic[]
  recommendedReadingOrder: RecommendedReadingItem[]
}

/**
 * Checks only documents and resource facts supplied by the host.  It never
 * traverses directories, reads files, or accesses a network; unknown facts
 * remain unknown rather than being reported as failures.
 */
export function verifyProjectDocuments(documents: readonly ProjectDocumentSource[], options: ProjectVerificationOptions = {}): ProjectVerificationReport {
  const byPath = new Map(documents.map((document) => [key(document.path), document]))
  const anchorsByPath = new Map(documents.map((document) => [key(document.path), headingAnchors(document.markdown)]))
  const diagnostics: ProjectVerificationDiagnostic[] = []
  const inbound = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  for (const document of documents) {
    const targets: string[] = []
    for (const link of getProjectDocumentLinks(document.markdown, document.path)) {
      const targetKey = key(link.path)
      targets.push(targetKey)
      if (!byPath.has(targetKey)) diagnostics.push(at(document, link.label, 'broken-document-link',
        `Markdown link points to a supplied document that does not exist: ${link.path}.`,
        'Restore the target document or update the link target.'))
      else {
        inbound.set(targetKey, (inbound.get(targetKey) ?? 0) + 1)
        if (link.fragment && !anchorsByPath.get(targetKey)?.has(normalizeFragment(link.fragment))) {
          diagnostics.push(at(document, link.label, 'broken-document-anchor',
            `Markdown link fragment "#${link.fragment}" does not exist in ${link.path}.`,
            'Update the fragment to a heading anchor in the target document.'))
        }
      }
    }
    outgoing.set(key(document.path), targets)
    diagnostics.push(...duplicateAnchorDiagnostics(document))
    diagnostics.push(...missingImageDiagnostics(document, options.resourceInventory))
  }

  if (documents.length > 1) {
    for (const document of documents) {
      const documentKey = key(document.path)
      if (!outgoing.get(documentKey)?.some((target) => byPath.has(target)) && !inbound.get(documentKey)) {
        diagnostics.push({ code: 'isolated-document', path: document.path, line: 1, column: 1,
          description: `Document "${displayTitle(document)}" has no supplied Markdown links to or from another document.`,
          fixHint: 'Link it from a nearby project document or keep it intentionally standalone.' })
      }
    }
  }

  return { diagnostics, recommendedReadingOrder: recommendReadingOrder(documents, outgoing, options.entryPaths) }
}

function recommendReadingOrder(documents: readonly ProjectDocumentSource[], outgoing: ReadonlyMap<string, readonly string[]>, entryPaths: readonly string[] | undefined): RecommendedReadingItem[] {
  const byPath = new Map(documents.map((document) => [key(document.path), document]))
  const readmes = documents.filter((document) => /(^|[\\/])readme\.(?:md|markdown)$/i.test(document.path))
  const requested = entryPaths?.map(key).filter((path) => byPath.has(path))
  const roots = requested?.length ? requested : readmes.length ? readmes.map((document) => key(document.path)) : [...byPath.keys()].sort()
  const result: RecommendedReadingItem[] = []
  const visited = new Set<string>()
  const queue: Array<{ path: string; reason: RecommendedReadingItem['reason']; linkedFrom?: string }> = roots.map((path) => ({ path, reason: 'entry' }))
  while (queue.length) {
    const next = queue.shift()!
    if (visited.has(next.path)) continue
    const document = byPath.get(next.path)
    if (!document) continue
    visited.add(next.path)
    result.push({ path: document.path, title: displayTitle(document), reason: next.reason, ...(next.linkedFrom ? { linkedFrom: next.linkedFrom } : {}) })
    const children = [...new Set(outgoing.get(next.path) ?? [])].filter((path) => byPath.has(path)).sort()
    for (const child of children) queue.push({ path: child, reason: 'linked-from', linkedFrom: document.path })
  }
  for (const [path, document] of [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!visited.has(path)) result.push({ path: document.path, title: displayTitle(document), reason: 'unlinked' })
  }
  return result
}

function duplicateAnchorDiagnostics(document: ProjectDocumentSource): ProjectVerificationDiagnostic[] {
  const slugger = new GithubSlugger()
  const seen = new Set<string>()
  const diagnostics: ProjectVerificationDiagnostic[] = []
  document.markdown.split(/\r?\n/).forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) return
    const heading = match[2].trim()
    const base = new GithubSlugger().slug(heading)
    slugger.slug(heading)
    if (seen.has(base)) diagnostics.push({ code: 'duplicate-anchor', path: document.path, line: index + 1, column: 1,
      description: `Heading anchor "${base}" is duplicated in this document.`, fixHint: 'Rename one heading so fragments have one unambiguous target.' })
    seen.add(base)
  })
  return diagnostics
}

function headingAnchors(markdown: string): ReadonlySet<string> {
  const slugger = new GithubSlugger()
  const anchors = new Set<string>()
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) anchors.add(slugger.slug(match[2].trim()))
  }
  return anchors
}

function missingImageDiagnostics(document: ProjectDocumentSource, inventory: ProjectResourceInventory | undefined): ProjectVerificationDiagnostic[] {
  const diagnostics: ProjectVerificationDiagnostic[] = []
  const pattern = /!\[[^\]]*\]\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)/g
  for (const match of document.markdown.matchAll(pattern)) {
    const raw = match[1].replace(/^<|>$/g, '')
    if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) continue
    const resolved = resolveProjectPath(document.path, decodeURIComponent(raw.split('#', 1)[0]))
    if (resourceFact(inventory, resolved)?.exists === false) {
      const before = document.markdown.slice(0, match.index)
      diagnostics.push({ code: 'missing-image', path: document.path, line: before.split(/\r?\n/).length, column: before.length - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')),
        description: `Image target was verified missing: ${resolved}.`, fixHint: 'Restore the image or update the Markdown image target.' })
    }
  }
  return diagnostics
}

function at(document: ProjectDocumentSource, label: string, code: ProjectVerificationCode, description: string, fixHint: string): ProjectVerificationDiagnostic {
  const index = document.markdown.indexOf(`[${label}](`)
  const before = index < 0 ? '' : document.markdown.slice(0, index)
  return { code, path: document.path, line: before.split(/\r?\n/).length, column: index < 0 ? 1 : index - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')), description, fixHint }
}

function resourceFact(inventory: ProjectResourceInventory | undefined, path: string) { return typeof inventory === 'function' ? inventory(path) : inventory?.[path] }
function key(path: string) { return path.replace(/\\/g, '/').toLowerCase() }
function normalizeFragment(fragment: string) { return decodeURIComponent(fragment).trim().replace(/^#/, '').toLowerCase() }
function displayTitle(document: ProjectDocumentSource) { return document.title?.trim() || /^#\s+(.+?)\s*#*\s*$/m.exec(document.markdown)?.[1].trim() || document.path.split(/[\\/]/).pop()?.replace(/\.(?:md|markdown)$/i, '') || document.path }
