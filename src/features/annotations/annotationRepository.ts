import type { DocumentAnnotations } from '../../types'

const STORAGE_PREFIX = 'md-reader:annotations:'

export interface AnnotationRepository {
  load(documentKey: string): DocumentAnnotations
  save(data: DocumentAnnotations): void
  remove(documentKey: string): void
  export(documentKey: string): string | null
  import(serialized: string): DocumentAnnotations
}

export function createEmptyDocumentAnnotations(documentKey: string): DocumentAnnotations {
  return { version: 1, documentKey, annotations: [], excerpts: [], updatedAt: Date.now() }
}

function storageKey(documentKey: string): string {
  return `${STORAGE_PREFIX}${documentKey}`
}

function parse(data: string, documentKey?: string): DocumentAnnotations {
  const parsed = JSON.parse(data) as Partial<DocumentAnnotations>
  if (parsed.version !== 1 || typeof parsed.documentKey !== 'string' || !Array.isArray(parsed.annotations) || !Array.isArray(parsed.excerpts)) {
    throw new Error('批注数据格式无效')
  }
  if (documentKey && parsed.documentKey !== documentKey) throw new Error('批注数据不属于当前文档')
  return parsed as DocumentAnnotations
}

/** localStorage sidecar：以文档绝对路径或调用方提供的稳定 key 为 key，不修改原文件。 */
export const localStorageAnnotationRepository: AnnotationRepository = {
  load(documentKey) {
    const raw = localStorage.getItem(storageKey(documentKey))
    return raw ? parse(raw, documentKey) : createEmptyDocumentAnnotations(documentKey)
  },
  save(data) {
    localStorage.setItem(storageKey(data.documentKey), JSON.stringify({ ...data, updatedAt: Date.now() }))
  },
  remove(documentKey) {
    localStorage.removeItem(storageKey(documentKey))
  },
  export(documentKey) {
    return localStorage.getItem(storageKey(documentKey))
  },
  import(serialized) {
    return parse(serialized)
  },
}
