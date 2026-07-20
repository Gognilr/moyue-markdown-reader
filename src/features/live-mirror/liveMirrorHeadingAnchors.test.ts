import { describe, expect, it } from 'vitest'
import { collectLiveMirrorHeadingAnchors, headingContextAtLine } from './liveMirrorHeadingAnchors'

describe('Live Mirror heading anchors', () => {
  it('uses renderer-compatible unique ids and ignores fenced pseudo headings', () => {
    const anchors = collectLiveMirrorHeadingAnchors('# Overview\n\n## **Details**\n\n```md\n# not a title\n```\n\n## Details')
    expect(anchors).toEqual([
      { line: 1, depth: 1, text: 'Overview', id: 'overview' },
      { line: 3, depth: 2, text: 'Details', id: 'details' },
      { line: 9, depth: 2, text: 'Details', id: 'details-1' },
    ])
  })

  it('finds the nearest preceding heading for an overlay line', () => {
    const anchors = collectLiveMirrorHeadingAnchors('# Intro\nbody\n## Risks\nwarning\n## Next')
    expect(headingContextAtLine(anchors, 4)).toMatchObject({ text: 'Risks', id: 'risks' })
    expect(headingContextAtLine(anchors, 1)).toMatchObject({ text: 'Intro' })
    expect(headingContextAtLine(anchors, 0)).toBeNull()
  })
})
