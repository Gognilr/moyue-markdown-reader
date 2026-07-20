import { describe, expect, it } from 'vitest'
import { collectMarkdownImageReferences } from './MarkdownView'

describe('local Markdown image references', () => {
  it('keeps safe relative images and rejects remote or escaping paths', () => {
    const markdown = [
      '![本地图](assets/architecture.png "架构")',
      '![重复](assets/architecture.png)',
      '![远程](https://example.com/a.png)',
      '![越界](../secret.png)',
    ].join('\n')
    expect(collectMarkdownImageReferences(markdown)).toEqual(['assets/architecture.png'])
  })
})
