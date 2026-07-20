import type { Annotation, AnnotationKind, DocumentAnnotations, Excerpt, TextAnchor } from '../../types'

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function addAnnotation(data: DocumentAnnotations, kind: AnnotationKind, anchor: TextAnchor, note?: string): DocumentAnnotations {
  const now = Date.now()
  const annotation: Annotation = { id: createId('annotation'), kind, anchor, note: note?.trim() || undefined, createdAt: now, updatedAt: now }
  return { ...data, annotations: [annotation, ...data.annotations], updatedAt: now }
}

/** Convenience actions keep the reading UI from having to know annotation kind strings. */
export function addUnderline(data: DocumentAnnotations, anchor: TextAnchor, note?: string): DocumentAnnotations {
  return addAnnotation(data, 'underline', anchor, note)
}

export function addBookmark(data: DocumentAnnotations, anchor: TextAnchor, note?: string): DocumentAnnotations {
  return addAnnotation(data, 'bookmark', anchor, note)
}

export function addNote(data: DocumentAnnotations, anchor: TextAnchor, note: string): DocumentAnnotations {
  return addAnnotation(data, 'note', anchor, note)
}

/** Update only user-authored note text; anchors and source Markdown remain untouched. */
export function updateAnnotationNote(data: DocumentAnnotations, id: string, note: string): DocumentAnnotations {
  const current = data.annotations.find((annotation) => annotation.id === id)
  if (!current) return data
  const now = Date.now()
  const normalized = note.trim() || undefined
  return {
    ...data,
    annotations: data.annotations.map((annotation) => annotation.id === id
      ? { ...annotation, note: normalized, updatedAt: now }
      : annotation),
    updatedAt: now,
  }
}

/**
 * Accept annotations imported by a caller after it has parsed/validated a sidecar.
 * A mismatched document key is rejected instead of silently attaching notes to another file.
 */
export function importDocumentAnnotations(current: DocumentAnnotations, imported: DocumentAnnotations): DocumentAnnotations {
  if (current.documentKey !== imported.documentKey) throw new Error('导入批注不属于当前文档')
  const now = Date.now()
  return {
    ...imported,
    annotations: [...imported.annotations],
    excerpts: [...imported.excerpts],
    updatedAt: now,
  }
}

export function addExcerpt(data: DocumentAnnotations, content: string, anchor: TextAnchor): DocumentAnnotations {
  const now = Date.now()
  const excerpt: Excerpt = { id: createId('excerpt'), content, anchor, createdAt: now }
  return { ...data, excerpts: [excerpt, ...data.excerpts], updatedAt: now }
}

export function removeAnnotation(data: DocumentAnnotations, id: string): DocumentAnnotations {
  return { ...data, annotations: data.annotations.filter((annotation) => annotation.id !== id), updatedAt: Date.now() }
}

export function removeExcerpt(data: DocumentAnnotations, id: string): DocumentAnnotations {
  return { ...data, excerpts: data.excerpts.filter((excerpt) => excerpt.id !== id), updatedAt: Date.now() }
}
