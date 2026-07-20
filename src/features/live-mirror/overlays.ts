import type { TextAnchor } from '../../types'

export type LiveMirrorOverlayKind = 'search' | 'annotation' | 'warning' | 'risk' | 'open-task'

export interface LiveMirrorOverlay {
  id: string
  kind: LiveMirrorOverlayKind
  /** One-based Markdown line, so a consumer can navigate without rendered DOM. */
  line: number
  /** Zero-based character offsets in the source Markdown. */
  start: number
  end: number
  label: string
}

export interface LiveMirrorAnnotationInput {
  id: string
  anchor: Pick<TextAnchor, 'quote'>
  label?: string
}

export interface LiveMirrorOverlayOptions {
  searchQuery?: string
  annotations?: readonly LiveMirrorAnnotationInput[]
  /** Extra diagnostics from a verifier or route engine.  They remain source-addressable. */
  warnings?: readonly { id: string; line: number; label: string; risk?: boolean }[]
}

export interface LiveMirrorSegment {
  id: string
  start: number
  end: number
  startLine: number
  endLine: number
  fingerprint: string
  overlays: LiveMirrorOverlay[]
}

export interface LiveMirrorOverlayIndex {
  markdownLength: number
  segmentSize: number
  segments: LiveMirrorSegment[]
  overlays: LiveMirrorOverlay[]
}

export interface LiveMirrorOverlayUpdate {
  index: LiveMirrorOverlayIndex
  /** Segment fingerprints found in the previous snapshot; suitable for UI cache reuse. */
  reusedSegmentIds: string[]
  /** New or changed segments.  Rendering is deliberately left to the caller. */
  affectedSegmentIds: string[]
}

const defaultSegmentSize = 180

/**
 * Scans only source text and supplied metadata.  It neither touches the DOM nor opens
 * another window, making the model safe to refresh after an external file update.
 */
export function scanLiveMirrorOverlays(markdown: string, options: LiveMirrorOverlayOptions = {}): LiveMirrorOverlay[] {
  return scanLiveMirrorOverlaysFromLines(markdown, options, splitLines(markdown))
}

function scanLiveMirrorOverlaysFromLines(markdown: string, options: LiveMirrorOverlayOptions, lines: SourceLine[]): LiveMirrorOverlay[] {
  const overlays: LiveMirrorOverlay[] = []
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line.text)) { inFence = !inFence; continue }
    if (inFence) continue

    const task = line.text.match(/^\s*[-*+]\s+\[ \]\s+(.+)$/)
    if (task) overlays.push(makeOverlay('open-task', `task:${line.number}:${task[1]}`, line, task.index ?? 0, line.text.length, task[1]))

    const marker = line.text.match(/(?:^|\s)(?:>\s*)?\[!(WARNING|CAUTION|DANGER)\]|(?:⚠|警告|风险|危険|warning|caution|danger)/i)
    if (marker) {
      const risk = /DANGER|CAUTION|风险|危険|danger|caution/i.test(marker[0])
      overlays.push(makeOverlay(risk ? 'risk' : 'warning', `marker:${line.number}:${marker.index}`, line, marker.index ?? 0, marker.index! + marker[0].length, line.text.trim()))
    }
  }

  const query = options.searchQuery?.trim()
  if (query) overlays.push(...findTextOverlays(markdown, query, 'search', 'search'))
  for (const annotation of options.annotations ?? []) {
    const quote = annotation.anchor.quote.trim()
    if (quote) overlays.push(...findTextOverlays(markdown, quote, 'annotation', `annotation:${annotation.id}`, annotation.label))
  }
  for (const warning of options.warnings ?? []) {
    const sourceLine = lines[warning.line - 1]
    if (!sourceLine) continue
    overlays.push({
      id: warning.id,
      kind: warning.risk ? 'risk' : 'warning',
      line: warning.line,
      start: sourceLine.start,
      end: sourceLine.start + sourceLine.text.length,
      label: warning.label,
    })
  }
  return dedupeAndSort(overlays)
}

/** Builds a segmented model for large documents without coupling it to a renderer. */
export function createLiveMirrorOverlayIndex(markdown: string, options: LiveMirrorOverlayOptions = {}, segmentSize = defaultSegmentSize): LiveMirrorOverlayIndex {
  // Allow small segments in tests and specialised virtualizers; the normal caller
  // receives the larger default above.
  const safeSize = Math.max(1, Math.floor(segmentSize) || defaultSegmentSize)
  const lines = splitLines(markdown)
  // Reuse the same line index for diagnostics and segmentation. Large documents
  // previously materialized two full line arrays and a new slice per segment.
  const overlays = scanLiveMirrorOverlaysFromLines(markdown, options, lines)
  const segments: LiveMirrorSegment[] = []
  let overlayCursor = 0
  for (let lineStart = 0; lineStart < lines.length; lineStart += safeSize) {
    const firstLine = lines[lineStart]
    const lastLine = lines[Math.min(lines.length - 1, lineStart + safeSize - 1)]
    if (!firstLine || !lastLine) continue
    const start = firstLine.start
    const end = lastLine.end
    const fingerprint = hash(markdown.slice(start, end))
    const id = `segment:${firstLine.number}-${lastLine.number}:${fingerprint}`
    const segmentOverlays: LiveMirrorOverlay[] = []
    while (overlayCursor < overlays.length && overlays[overlayCursor].start < end) {
      if (overlays[overlayCursor].start >= start) segmentOverlays.push(overlays[overlayCursor])
      overlayCursor += 1
    }
    segments.push({
      id, start, end, startLine: firstLine.number, endLine: lastLine.number, fingerprint,
      overlays: segmentOverlays,
    })
  }
  return { markdownLength: markdown.length, segmentSize: safeSize, segments, overlays }
}

/**
 * Recomputes source diagnostics, while exposing unchanged fingerprints for a virtualized
 * ribbon to retain its previous paint.  It intentionally makes no claim about desktop
 * mirror windows or incremental Markdown rendering.
 */
export function updateLiveMirrorOverlayIndex(previous: LiveMirrorOverlayIndex, markdown: string, options: LiveMirrorOverlayOptions = {}): LiveMirrorOverlayUpdate {
  const index = createLiveMirrorOverlayIndex(markdown, options, previous.segmentSize)
  const previousByFingerprint = new Set(previous.segments.map((segment) => segment.fingerprint))
  const reusedSegmentIds = index.segments.filter((segment) => previousByFingerprint.has(segment.fingerprint)).map((segment) => segment.id)
  const reused = new Set(reusedSegmentIds)
  return { index, reusedSegmentIds, affectedSegmentIds: index.segments.filter((segment) => !reused.has(segment.id)).map((segment) => segment.id) }
}

function findTextOverlays(markdown: string, needle: string, kind: 'search' | 'annotation', prefix: string, label?: string): LiveMirrorOverlay[] {
  const lowerHaystack = markdown.toLocaleLowerCase()
  const lowerNeedle = needle.toLocaleLowerCase()
  const found: LiveMirrorOverlay[] = []
  let start = lowerHaystack.indexOf(lowerNeedle)
  let ordinal = 0
  while (start >= 0) {
    const line = lineAt(markdown, start)
    found.push({ id: `${prefix}:${ordinal++}:${start}`, kind, line, start, end: start + needle.length, label: label || needle })
    start = lowerHaystack.indexOf(lowerNeedle, start + Math.max(1, needle.length))
  }
  return found
}

function makeOverlay(kind: LiveMirrorOverlayKind, id: string, line: SourceLine, relativeStart: number, relativeEnd: number, label: string): LiveMirrorOverlay {
  return { id, kind, line: line.number, start: line.start + relativeStart, end: line.start + relativeEnd, label }
}

interface SourceLine { number: number; start: number; end: number; text: string }
function splitLines(markdown: string): SourceLine[] {
  const result: SourceLine[] = []
  let start = 0
  let number = 1
  for (const raw of markdown.split(/\n/)) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    result.push({ number, start, end: start + text.length, text })
    start += raw.length + 1
    number += 1
  }
  return result
}
function lineAt(markdown: string, index: number) { return markdown.slice(0, index).split('\n').length }
function hash(value: string) {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619) }
  return (result >>> 0).toString(36)
}
function dedupeAndSort(overlays: LiveMirrorOverlay[]) {
  const seen = new Set<string>()
  return overlays.filter((overlay) => !seen.has(`${overlay.kind}:${overlay.start}:${overlay.end}:${overlay.id}`) && Boolean(seen.add(`${overlay.kind}:${overlay.start}:${overlay.end}:${overlay.id}`)))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.kind.localeCompare(right.kind))
}
