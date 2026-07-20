import { describe, expect, it } from 'vitest'
import {
  annotationSidecarFileName,
  buildAnnotationSidecarExportFile,
  hasPortableAnnotationData,
  localStorageAnnotationsToSidecar,
  parseAnnotationSidecar,
  serializeAnnotationSidecar,
  sidecarToLocalStorageAnnotations,
} from './annotationSidecar'
import { createEmptyDocumentAnnotations } from './annotationRepository'

const sample = {
  version: 1 as const,
  documentKey: 'C:/notes/plan.md',
  annotations: [{ id: 'a-1', kind: 'note' as const, anchor: { quote: '必须验证', prefix: '前文', suffix: '后文', headingPath: ['计划'] }, note: '补一个测试', createdAt: 10, updatedAt: 11 }],
  excerpts: [{ id: 'e-1', content: '必须验证', anchor: { quote: '必须验证', prefix: '前文', suffix: '后文', headingPath: ['计划'] }, createdAt: 12 }],
  updatedAt: 13,
}

describe('portable annotation sidecar', () => {
  it('only offers portable migration when there is annotation or excerpt data', () => {
    expect(hasPortableAnnotationData(createEmptyDocumentAnnotations('C:/notes/empty.md'))).toBe(false)
    expect(hasPortableAnnotationData(sample)).toBe(true)
  })

  it('serializes a deterministic v2 envelope and reads it back', () => {
    const serialized = serializeAnnotationSidecar(sample)
    expect(serialized).toContain('"schema": "md-reader.annotation-sidecar"')
    expect(serialized).toContain('"version": 2')
    expect(parseAnnotationSidecar(serialized, sample.documentKey)).toEqual({ data: sample })
  })

  it('migrates the previous localStorage-shaped v1 record without changing its anchors', () => {
    const legacy = JSON.stringify(sample)
    const parsed = parseAnnotationSidecar(legacy, sample.documentKey)
    expect(parsed).toEqual({ data: sample, migratedFrom: 1 })
    expect(parseAnnotationSidecar(localStorageAnnotationsToSidecar(legacy)).migratedFrom).toBeUndefined()
    expect(JSON.parse(sidecarToLocalStorageAnnotations(localStorageAnnotationsToSidecar(legacy)))).toEqual(sample)
  })

  it('rejects malformed, foreign, or unsupported records before they reach storage', () => {
    expect(() => parseAnnotationSidecar('{not json')).toThrow('不是有效 JSON')
    expect(() => parseAnnotationSidecar(JSON.stringify({ ...sample, annotations: [{ ...sample.annotations[0], kind: 'script' }] }))).toThrow('类型无效')
    expect(() => parseAnnotationSidecar(serializeAnnotationSidecar(sample), 'C:/notes/other.md')).toThrow('不属于当前文档')
    expect(() => parseAnnotationSidecar(JSON.stringify({ schema: 'md-reader.annotation-sidecar', version: 9 }))).toThrow('不支持')
  })

  it('produces an adjacent file model without leaking source directories', () => {
    expect(annotationSidecarFileName('C:\\work\\plan.markdown')).toBe('plan.mdreader.json')
    expect(buildAnnotationSidecarExportFile('/work/plan.md', createEmptyDocumentAnnotations('/work/plan.md'))).toMatchObject({
      fileName: 'plan.mdreader.json', mediaType: 'application/json',
    })
  })
})
