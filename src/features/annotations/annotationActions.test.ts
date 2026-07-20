import { describe, expect, it } from 'vitest'
import { addAnnotation, addBookmark, addExcerpt, addNote, addUnderline, importDocumentAnnotations, removeAnnotation, removeExcerpt, updateAnnotationNote } from './annotationActions'
import { createEmptyDocumentAnnotations } from './annotationRepository'

const anchor = { quote: '重要结论', prefix: '前文', suffix: '后文', headingPath: ['结论'] }

describe('annotation actions', () => {
  it('adds and removes annotations without mutating the source document model', () => {
    const base = createEmptyDocumentAnnotations('doc')
    const added = addAnnotation(base, 'highlight', anchor, '稍后核验')
    expect(base.annotations).toHaveLength(0)
    expect(added.annotations[0]).toMatchObject({ kind: 'highlight', note: '稍后核验', anchor })
    expect(removeAnnotation(added, added.annotations[0].id).annotations).toHaveLength(0)
  })

  it('adds and removes excerpts', () => {
    const added = addExcerpt(createEmptyDocumentAnnotations('doc'), '重要结论', anchor)
    expect(added.excerpts[0]).toMatchObject({ content: '重要结论', anchor })
    expect(removeExcerpt(added, added.excerpts[0].id).excerpts).toHaveLength(0)
  })

  it('creates underline, bookmark and note annotations through explicit reader actions', () => {
    const base = createEmptyDocumentAnnotations('doc')
    const underlined = addUnderline(base, anchor)
    const bookmarked = addBookmark(underlined, anchor, '返回这里')
    const noted = addNote(bookmarked, anchor, '需要负责人确认')
    expect(noted.annotations.map((annotation) => annotation.kind)).toEqual(['note', 'bookmark', 'underline'])
    expect(noted.annotations[0].note).toBe('需要负责人确认')
  })

  it('edits a note without changing its anchor and leaves an unknown id untouched', () => {
    const added = addAnnotation(createEmptyDocumentAnnotations('doc'), 'highlight', anchor, '旧备注')
    const edited = updateAnnotationNote(added, added.annotations[0].id, '  新备注  ')
    expect(edited.annotations[0]).toMatchObject({ anchor, note: '新备注' })
    expect(updateAnnotationNote(edited, 'missing', 'ignored')).toBe(edited)
  })

  it('accepts imported document annotations only for the current document', () => {
    const current = createEmptyDocumentAnnotations('doc')
    const imported = addBookmark(createEmptyDocumentAnnotations('doc'), anchor)
    const result = importDocumentAnnotations(current, imported)
    expect(result.annotations).toEqual(imported.annotations)
    expect(() => importDocumentAnnotations(current, createEmptyDocumentAnnotations('other'))).toThrow('不属于当前文档')
  })
})
