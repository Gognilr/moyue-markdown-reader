import type { ProjectDocumentLink, ProjectRoamState } from '../../types'

const markdownExtension = /\.(?:md|markdown)$/i
const externalScheme = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

function splitFragment(target: string): { path: string; fragment?: string } {
  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return { path: target }
  const fragment = target.slice(hashIndex + 1)
  return { path: target.slice(0, hashIndex), ...(fragment ? { fragment } : {}) }
}

function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index < 0 ? '' : path.slice(0, index)
}

/** Resolve a local Markdown reference without Node path APIs, so it is browser-safe. */
export function resolveProjectPath(currentPath: string, target: string): string {
  if (/^[a-z]:[\\/]/i.test(target) || target.startsWith('/')) return target
  const separator = currentPath.includes('\\') ? '\\' : '/'
  const drive = /^[a-z]:/i.exec(currentPath)
  const base = directoryOf(currentPath).split(/[\\/]/).filter(Boolean).filter((part) => part !== drive?.[0])
  for (const part of target.split(/[\\/]/)) {
    if (!part || part === '.') continue
    if (part === '..') base.pop()
    else base.push(part)
  }
  const prefix = drive ? `${drive[0]}${separator}` : currentPath.startsWith('/') ? '/' : ''
  return `${prefix}${base.join(separator)}`
}

/** Extract navigable, local Markdown links only. Images, URLs, and same-page anchors are excluded. */
export function getProjectDocumentLinks(markdown: string, currentPath: string): ProjectDocumentLink[] {
  const found = new Map<string, ProjectDocumentLink>()
  const linkPattern = /(?<!!)(?:\[([^\]]+)\])\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)/g
  for (const match of markdown.matchAll(linkPattern)) {
    const label = match[1]?.trim()
    const rawTarget = match[2]?.trim().replace(/^<|>$/g, '')
    if (!label || !rawTarget || externalScheme.test(rawTarget)) continue
    const target = splitFragment(rawTarget)
    if (!target.path || !markdownExtension.test(target.path)) continue
    const path = resolveProjectPath(currentPath, decodeURIComponent(target.path))
    const link: ProjectDocumentLink = { label, path, ...(target.fragment ? { fragment: decodeURIComponent(target.fragment) } : {}) }
    const key = `${path}#${link.fragment ?? ''}`
    if (!found.has(key)) found.set(key, link)
  }
  return [...found.values()]
}

/** Directory breadcrumbs keep project context visible without needing a Vault/index. */
export function getProjectBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const separator = path.includes('\\') ? '\\' : '/'
  const drive = /^[a-z]:/i.exec(path)?.[0]
  const parts = path.split(/[\\/]/).filter(Boolean).filter((part) => part !== drive)
  const file = parts.pop()
  const prefix = drive ? `${drive}${separator}` : path.startsWith('/') ? '/' : ''
  const crumbs: Array<{ label: string; path: string }> = []
  let built = prefix.replace(/[\\/]$/, '')
  for (const part of parts) {
    built = built ? `${built}${separator}${part}` : part
    crumbs.push({ label: part, path: built })
  }
  if (file) crumbs.push({ label: file.replace(markdownExtension, ''), path })
  return crumbs
}

export function createProjectRoamState(currentPath: string, markdown: string, backStack: string[] = []): ProjectRoamState {
  return { currentPath, backStack, links: getProjectDocumentLinks(markdown, currentPath) }
}
