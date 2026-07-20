import { describe, expect, it } from 'vitest'
import { compareMarkdownDocuments, extractCompareBlocks } from './documentCompare'
import { markdownToAst } from '../export/markdownToIr'

describe('rendered document comparison', () => {
  it('compares semantic blocks rather than source lines', () => {
    const model = compareMarkdownDocuments('# Plan\n\nKeep the service small.\n\n- Validate input', '# Plan\n\nKeep the service deliberately small.\n\n- Validate input\n- Log outcome')
    expect(model.entries.map((entry) => entry.kind)).toEqual(['unchanged', 'modified', 'unchanged', 'added'])
    expect(model.entries[1].left?.kind).toBe('paragraph')
    expect(model.summary).toMatchObject({ unchanged: 2, modified: 1, added: 1, removed: 0 })
  })

  it('matches table rows by configured primary key and exposes changed cells', () => {
    const before = '| ID | Status |\n| - | - |\n| A-1 | Draft |\n| B-2 | Done |'
    const after = '| ID | Status |\n| - | - |\n| A-1 | Approved |\n| B-2 | Done |'
    const model = compareMarkdownDocuments(before, after, { tableKeyColumn: 0 })
    const changed = model.entries.find((entry) => entry.kind === 'modified')
    expect(changed?.left?.cells).toEqual(['A-1', 'Draft'])
    expect(changed?.right?.cells).toEqual(['A-1', 'Approved'])
    expect(changed?.cellChanges?.[1]).toMatchObject({ kind: 'modified', left: 'Draft', right: 'Approved' })
  })

  it('keeps a changed keyed row paired when it was also reordered', () => {
    const before = '| ID | Status |\n| - | - |\n| A-1 | Draft |\n| B-2 | Done |'
    const after = '| ID | Status |\n| - | - |\n| B-2 | Done |\n| A-1 | Approved |'
    const model = compareMarkdownDocuments(before, after, { tableKeyColumn: 0 })
    const row = model.entries.find((entry) => entry.left?.cells?.[0] === 'A-1')
    expect(row).toMatchObject({ kind: 'modified', right: { cells: ['A-1', 'Approved'] } })
    expect(row?.cellChanges?.[1]?.kind).toBe('modified')
    expect(model.entries.filter((entry) => entry.kind === 'added' || entry.kind === 'removed').map((entry) => entry.left?.cells?.[0] ?? entry.right?.cells?.[0])).not.toContain('A-1')
  })

  it('uses the strongest same-table row match when no key column is supplied', () => {
    const before = '| Name | Owner | State |\n| - | - | - |\n| Roadmap | Lin | Draft |'
    const after = '| Name | Owner | State |\n| - | - | - |\n| Roadmap | Lin | Approved |'
    const model = compareMarkdownDocuments(before, after)
    const row = model.entries.find((entry) => entry.left?.cells?.[0] === 'Roadmap')
    expect(row).toMatchObject({ kind: 'modified', right: { cells: ['Roadmap', 'Lin', 'Approved'] } })
    expect(row?.cellChanges?.[2]).toMatchObject({ kind: 'modified', left: 'Draft', right: 'Approved' })
  })

  it('retains headings, list items and one-based source lines for host navigation', () => {
    const blocks = extractCompareBlocks(markdownToAst('# Intro\n\nText\n\n- First\n  - Nested\n\n```ts\nconst x = 1\n```'))
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list-item', 'list-item', 'code'])
    expect(blocks[2]).toMatchObject({ line: 5, headingPath: ['Intro'] })
  })
})
