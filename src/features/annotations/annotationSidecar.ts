import type { Annotation, AnnotationKind, DocumentAnnotations, Excerpt, TextAnchor } from '../../types'

/** Stable, portable envelope written beside a Markdown document. */
export const ANNOTATION_SIDECAR_SCHEMA = 'md-reader.annotation-sidecar'
export const ANNOTATION_SIDECAR_VERSION = 2 as const
export const ANNOTATION_SIDECAR_MEDIA_TYPE = 'application/json'

export interface AnnotationSidecarV2 {
  schema: typeof ANNOTATION_SIDECAR_SCHEMA
  version: typeof ANNOTATION_SIDECAR_VERSION
  documentKey: string
  annotations: Annotation[]
  excerpts: Excerpt[]
  updatedAt: number
}

export interface ParsedAnnotationSidecar {
  data: DocumentAnnotations
  /** Present when a legacy localStorage-shaped v1 record was upgraded in memory. */
  migratedFrom?: 1
}

export interface AnnotationSidecarExportFile {
  /** Adjacent sidecar name, without any source directory. */
  fileName: string
  mediaType: typeof ANNOTATION_SIDECAR_MEDIA_TYPE
  content: string
}

/** A migration button is meaningful only when there is portable user data to write. */
export function hasPortableAnnotationData(data: DocumentAnnotations): boolean {
  return data.annotations.length > 0 || data.excerpts.length > 0
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`批注 sidecar 字段无效：${field}`)
  return value
}

function requireTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`批注 sidecar 时间戳无效：${field}`)
  return value
}

function parseAnchor(value: unknown, field: string): TextAnchor {
  if (!isRecord(value)) throw new Error(`批注 sidecar 锚点无效：${field}`)
  const headingPath = value.headingPath
  if (!Array.isArray(headingPath) || headingPath.some((heading) => typeof heading !== 'string')) {
    throw new Error(`批注 sidecar 标题路径无效：${field}.headingPath`)
  }
  return {
    quote: requireString(value.quote, `${field}.quote`),
    prefix: requireString(value.prefix, `${field}.prefix`, true),
    suffix: requireString(value.suffix, `${field}.suffix`, true),
    headingPath: [...headingPath],
  }
}

function parseAnnotation(value: unknown, index: number): Annotation {
  const field = `annotations[${index}]`
  if (!isRecord(value)) throw new Error(`批注 sidecar 批注无效：${field}`)
  const kind = value.kind
  if (kind !== 'highlight' && kind !== 'underline' && kind !== 'bookmark' && kind !== 'note') {
    throw new Error(`批注 sidecar 类型无效：${field}.kind`)
  }
  if (value.note !== undefined && typeof value.note !== 'string') throw new Error(`批注 sidecar 备注无效：${field}.note`)
  return {
    id: requireString(value.id, `${field}.id`),
    kind: kind as AnnotationKind,
    anchor: parseAnchor(value.anchor, `${field}.anchor`),
    ...(value.note === undefined ? {} : { note: value.note }),
    createdAt: requireTimestamp(value.createdAt, `${field}.createdAt`),
    updatedAt: requireTimestamp(value.updatedAt, `${field}.updatedAt`),
  }
}

function parseExcerpt(value: unknown, index: number): Excerpt {
  const field = `excerpts[${index}]`
  if (!isRecord(value)) throw new Error(`批注 sidecar 摘录无效：${field}`)
  return {
    id: requireString(value.id, `${field}.id`),
    content: requireString(value.content, `${field}.content`),
    anchor: parseAnchor(value.anchor, `${field}.anchor`),
    createdAt: requireTimestamp(value.createdAt, `${field}.createdAt`),
  }
}

function parseData(record: JsonRecord): DocumentAnnotations {
  if (record.version !== 1) throw new Error('不支持的旧批注数据版本')
  if (!Array.isArray(record.annotations) || !Array.isArray(record.excerpts)) throw new Error('批注 sidecar 集合无效')
  return {
    version: 1,
    documentKey: requireString(record.documentKey, 'documentKey'),
    annotations: record.annotations.map(parseAnnotation),
    excerpts: record.excerpts.map(parseExcerpt),
    updatedAt: requireTimestamp(record.updatedAt, 'updatedAt'),
  }
}

/**
 * Reads both the current portable v2 envelope and the prior v1 localStorage
 * record. The returned object is freshly reconstructed, never a raw JSON cast.
 */
export function parseAnnotationSidecar(serialized: string, expectedDocumentKey?: string): ParsedAnnotationSidecar {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('批注 sidecar 不是有效 JSON')
  }
  if (!isRecord(parsed)) throw new Error('批注 sidecar 必须是对象')

  let data: DocumentAnnotations
  let migratedFrom: 1 | undefined
  if (parsed.schema === ANNOTATION_SIDECAR_SCHEMA) {
    if (parsed.version !== ANNOTATION_SIDECAR_VERSION) throw new Error(`不支持的批注 sidecar 版本：${String(parsed.version)}`)
    if (!Array.isArray(parsed.annotations) || !Array.isArray(parsed.excerpts)) throw new Error('批注 sidecar 集合无效')
    data = {
      version: 1,
      documentKey: requireString(parsed.documentKey, 'documentKey'),
      annotations: parsed.annotations.map(parseAnnotation),
      excerpts: parsed.excerpts.map(parseExcerpt),
      updatedAt: requireTimestamp(parsed.updatedAt, 'updatedAt'),
    }
  } else {
    data = parseData(parsed)
    migratedFrom = 1
  }
  if (expectedDocumentKey !== undefined && data.documentKey !== expectedDocumentKey) {
    throw new Error('批注 sidecar 不属于当前文档')
  }
  return migratedFrom === undefined ? { data } : { data, migratedFrom }
}

/** Validates and serializes a portable v2 sidecar with deterministic formatting. */
export function serializeAnnotationSidecar(data: DocumentAnnotations): string {
  const valid = parseData(data as unknown as JsonRecord)
  const sidecar: AnnotationSidecarV2 = {
    schema: ANNOTATION_SIDECAR_SCHEMA,
    version: ANNOTATION_SIDECAR_VERSION,
    documentKey: valid.documentKey,
    annotations: valid.annotations,
    excerpts: valid.excerpts,
    updatedAt: valid.updatedAt,
  }
  return `${JSON.stringify(sidecar, null, 2)}\n`
}

function basename(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).trim()
  if (!name) throw new Error('无法从空路径生成批注 sidecar 文件名')
  return name.replace(/\.(?:md|markdown)$/i, '') || name
}

/** Returns the adjacent portable filename, e.g. `notes/plan.md` -> `plan.mdreader.json`. */
export function annotationSidecarFileName(sourcePath: string): string {
  return `${basename(sourcePath)}.mdreader.json`
}

/** File model for native save dialogs, drag-out, or format-package integration. */
export function buildAnnotationSidecarExportFile(sourcePath: string, data: DocumentAnnotations): AnnotationSidecarExportFile {
  return {
    fileName: annotationSidecarFileName(sourcePath),
    mediaType: ANNOTATION_SIDECAR_MEDIA_TYPE,
    content: serializeAnnotationSidecar(data),
  }
}

/** Converts old localStorage JSON to a v2 portable sidecar. */
export function localStorageAnnotationsToSidecar(serialized: string, expectedDocumentKey?: string): string {
  return serializeAnnotationSidecar(parseAnnotationSidecar(serialized, expectedDocumentKey).data)
}

/** Converts portable (or legacy) sidecar JSON to the v1 model stored by existing localStorage repositories. */
export function sidecarToLocalStorageAnnotations(serialized: string, expectedDocumentKey?: string): string {
  return JSON.stringify(parseAnnotationSidecar(serialized, expectedDocumentKey).data)
}
