import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../types'
import { anchorCanBeSafelyRendered, resolveAnnotationRenderStatus } from './annotationRendering'

const annotation: Annotation = { id: 'saved-highlight', kind: 'highlight', note: '复核', createdAt: 1, updatedAt: 1, anchor: { quote: '保持原文', prefix: '第一段 ', suffix: '，不改写。', headingPath: ['计划'] } }

describe('annotation render resolution', () => {
  it('uses the stable source anchor before allowing a visual decoration', () => {
    const source = '# 计划\n\n第一段 保持原文，不改写。'
    expect(resolveAnnotationRenderStatus(source, [annotation])).toEqual({ 'saved-highlight': 'located' })
    expect(anchorCanBeSafelyRendered(source, annotation.anchor)).toBe(true)
  })
  it('safely degrades a missing quote instead of selecting a nearby guess', () => {
    const stale = { ...annotation, anchor: { ...annotation.anchor, quote: '已经删除' } }
    expect(resolveAnnotationRenderStatus('# 计划\n\n第一段 相近内容。', [stale])).toEqual({ 'saved-highlight': 'unavailable' })
    expect(anchorCanBeSafelyRendered('# 计划\n\n第一段 相近内容。', stale.anchor)).toBe(false)
  })
})
