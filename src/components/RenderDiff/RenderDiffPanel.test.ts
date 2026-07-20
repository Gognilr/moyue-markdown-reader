import { describe, expect, it } from 'vitest'
import { deriveRenderDiffModel } from './RenderDiffPanel'

describe('RenderDiffPanel input contract', () => {
  it('derives a local semantic comparison from two Markdown strings', () => {
    const model = deriveRenderDiffModel({
      leftMarkdown: '# Plan\n\nKeep this.',
      rightMarkdown: '# Plan\n\nKeep this carefully.',
      leftLabel: 'Saved copy',
      rightLabel: 'Working copy',
    })
    expect(model.leftLabel).toBe('Saved copy')
    expect(model.rightLabel).toBe('Working copy')
    expect(model.entries.map((entry) => entry.kind)).toEqual(['unchanged', 'modified'])
  })
})
