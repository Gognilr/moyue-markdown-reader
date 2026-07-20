import type { BlockIR, DocumentIR, InlineIR } from './documentIr'
import type { ExportPreflightIssue, ExportPreflightReport } from './exportPreflight'

export type ExportOnlyChoice = 'keep' | 'omit'

/**
 * Mutable UI state for a single export attempt.  It is deliberately detached
 * from the editor store: accepting or undoing a repair can never edit Markdown.
 */
export interface ExportPreflightResolutionState {
  appliedAutomaticFixes: readonly string[]
  choices: Readonly<Record<string, ExportOnlyChoice | undefined>>
}

export function createPreflightResolutionState(report: ExportPreflightReport): ExportPreflightResolutionState {
  return {
    appliedAutomaticFixes: report.issues.filter((issue) => issue.disposition === 'autoFixed').map((issue) => issue.id),
    choices: {},
  }
}

export function isAutomaticFixApplied(state: ExportPreflightResolutionState, issueId: string): boolean {
  return state.appliedAutomaticFixes.includes(issueId)
}

export function setAutomaticFixApplied(state: ExportPreflightResolutionState, issueId: string, applied: boolean): ExportPreflightResolutionState {
  const fixes = new Set(state.appliedAutomaticFixes)
  if (applied) fixes.add(issueId)
  else fixes.delete(issueId)
  return { ...state, appliedAutomaticFixes: [...fixes] }
}

export function setExportOnlyChoice(state: ExportPreflightResolutionState, issueId: string, choice: ExportOnlyChoice): ExportPreflightResolutionState {
  return { ...state, choices: { ...state.choices, [issueId]: choice } }
}

/** Blocking risks and unselected choices must not be bypassed by the UI. */
export function canProceedWithExport(report: ExportPreflightReport, state: ExportPreflightResolutionState): boolean {
  return report.canExport
    && report.issues.filter((issue) => issue.disposition === 'needsChoice').every((issue) => state.choices[issue.id] !== undefined)
}

/**
 * Applies only a user-selected omission to an export copy.  The original IR is
 * not mutated, so Undo is just a state change before export.  Links retain
 * their readable label when their remote target is omitted; remote images are
 * removed rather than silently replaced.
 */
export function applyExportOnlyResolutions(document: DocumentIR, report: ExportPreflightReport, state: ExportPreflightResolutionState): DocumentIR {
  const omittedResources = new Set(report.issues
    .filter((issue) => issue.kind === 'remoteResource' && state.choices[issue.id] === 'omit')
    .map((issue) => issue.resource)
    .filter((resource): resource is string => Boolean(resource)))
  if (!omittedResources.size) return document
  return { ...document, blocks: document.blocks.flatMap((block) => mapBlock(block, omittedResources)) }
}

function mapBlock(block: BlockIR, omittedResources: ReadonlySet<string>): BlockIR[] {
  if (block.kind === 'image') return omittedResources.has(block.url) ? [] : [block]
  if (block.kind === 'heading' || block.kind === 'paragraph') return [{ ...block, children: mapInline(block.children, omittedResources) }]
  if (block.kind === 'blockquote') return [{ ...block, blocks: block.blocks.flatMap((child) => mapBlock(child, omittedResources)) }]
  if (block.kind === 'list') return [{ ...block, items: block.items.map((item) => ({ ...item, blocks: item.blocks.flatMap((child) => mapBlock(child, omittedResources)) })) }]
  if (block.kind === 'table') return [{
    ...block,
    header: { ...block.header, cells: block.header.cells.map((cell) => ({ ...cell, children: mapInline(cell.children, omittedResources) })) },
    rows: block.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, children: mapInline(cell.children, omittedResources) })) })),
  }]
  return [block]
}

function mapInline(children: readonly InlineIR[], omittedResources: ReadonlySet<string>): InlineIR[] {
  return children.flatMap((child): InlineIR[] => {
    if (child.kind === 'image') return omittedResources.has(child.url) ? [] : [child]
    if (child.kind === 'link') {
      const nested = mapInline(child.children, omittedResources)
      return omittedResources.has(child.url) ? nested : [{ ...child, children: nested }]
    }
    if ('children' in child) return [{ ...child, children: mapInline(child.children, omittedResources) }]
    return [child]
  })
}

export function resolutionLabel(issue: ExportPreflightIssue, state: ExportPreflightResolutionState): '已自动修复' | '需要选择' | '无法保证' | '已撤销自动修复' {
  if (issue.disposition === 'autoFixed') return isAutomaticFixApplied(state, issue.id) ? '已自动修复' : '已撤销自动修复'
  if (issue.disposition === 'needsChoice') return '需要选择'
  return '无法保证'
}
