import { describe, expect, it } from 'vitest'
import { documentLensOriginal, documentLensSourceCitation } from './documentLensActions'
import type { DocumentLensItem } from '../../types'

const item: DocumentLensItem = { id: 'lens-9-x', line: 9, text: 'npm run release\n-- --dry-run', headingPath: ['运维手册', '发布'], categories: ['step'], facets: ['command'], reason: '围栏代码块（bash）' }

describe('document lens command actions', () => {
  it('copies the original command extract without rewriting whitespace', () => {
    expect(documentLensOriginal(item)).toBe('npm run release\n-- --dry-run')
  })

  it('creates a source citation with document, heading and one-based line', () => {
    expect(documentLensSourceCitation(item, 'runbook.md')).toBe('runbook.md > 运维手册 > 发布（第 9 行）\nnpm run release\n-- --dry-run')
  })
})
