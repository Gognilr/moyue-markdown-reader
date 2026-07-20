import { describe, expect, it } from 'vitest'
import { createLiveMirrorOverlayIndex, scanLiveMirrorOverlays, updateLiveMirrorOverlayIndex } from './overlays'

describe('Live Mirror overlay scanner', () => {
  const markdown = '# Plan\n\n- [ ] ship it\n- [x] done\n\n> [!WARNING] check backup\n\nTarget phrase\n\n```md\n- [ ] ignored\nWARNING ignored\n```\n'

  it('finds search, annotation, warning/risk and unfinished task overlays without scanning fenced code', () => {
    const overlays = scanLiveMirrorOverlays(markdown, {
      searchQuery: 'target',
      annotations: [{ id: 'a1', anchor: { quote: 'phrase' }, label: 'saved note' }],
    })
    expect(overlays.filter((item) => item.kind === 'open-task')).toHaveLength(1)
    expect(overlays.some((item) => item.kind === 'warning')).toBe(true)
    expect(overlays.some((item) => item.kind === 'search' && item.line === 8)).toBe(true)
    expect(overlays.some((item) => item.kind === 'annotation' && item.label === 'saved note')).toBe(true)
    expect(overlays.every((item) => item.line !== 10 && item.line !== 11)).toBe(true)
  })

  it('creates segment-local overlays and identifies reusable source segments', () => {
    const before = createLiveMirrorOverlayIndex(markdown, {}, 3)
    const after = updateLiveMirrorOverlayIndex(before, `${markdown}\nNew tail`, {}, )
    expect(before.segments[0].overlays.some((item) => item.kind === 'open-task')).toBe(true)
    expect(after.reusedSegmentIds.length).toBeGreaterThan(0)
    expect(after.affectedSegmentIds.length).toBeGreaterThan(0)
  })

  it('keeps host health diagnostics source-addressable alongside source warnings', () => {
    const overlays = scanLiveMirrorOverlays(markdown, {
      warnings: [{ id: 'health:heading', line: 1, label: 'Heading structure needs review' }],
    })
    expect(overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'health:heading', kind: 'warning', line: 1, label: 'Heading structure needs review' }),
    ]))
  })

  it('indexes a multi-megabyte document within the bounded large-file budget', () => {
    const largeMarkdown = Array.from({ length: 40_000 }, (_, index) =>
      index % 200 === 0 ? `## Section ${index}\n\n- [ ] task ${index}` : `Paragraph ${index} with enough text to model a realistic technical document.`).join('\n\n')
    const startedAt = performance.now()
    const index = createLiveMirrorOverlayIndex(largeMarkdown)
    const elapsedMs = performance.now() - startedAt

    expect(largeMarkdown.length).toBeGreaterThan(2_000_000)
    expect(index.markdownLength).toBe(largeMarkdown.length)
    expect(index.segments.length).toBeGreaterThan(200)
    expect(index.overlays.filter((item) => item.kind === 'open-task')).toHaveLength(200)
    expect(elapsedMs).toBeLessThan(2_000)
  })
})
