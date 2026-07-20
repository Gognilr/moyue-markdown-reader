import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { inlineText } from './documentIr'

describe('Markdown AST to DocumentIR', () => {
  it('keeps document semantics without a renderer or DOM', () => {
    const ir = markdownToDocumentIR(`# 报告\n\n正文有 **重点** 与 $x^2$。\n\n- [x] 完成\n\n\`\`\`mermaid\ngraph TD\n\`\`\`\n\n| 金额 | 状态 |\n| ---: | :---: |\n| $1,200 | done |`)

    expect(ir.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'code', 'table'])
    expect(ir.blocks[0]).toMatchObject({ kind: 'heading', depth: 1 })
    expect(inlineText((ir.blocks[1] as { children: any[] }).children)).toBe('正文有 重点 与 x^2。')
    expect(ir.blocks[2]).toMatchObject({ kind: 'list', items: [{ checked: true }] })
    expect(ir.blocks[3]).toMatchObject({ kind: 'code', diagram: 'mermaid' })
    expect(ir.blocks[4]).toMatchObject({ kind: 'table', align: ['right', 'center'] })
  })

  it('is deterministic for identical markdown input', () => {
    const markdown = '## 标题\n\n> 引用\n\n---'
    expect(markdownToDocumentIR(markdown)).toEqual(markdownToDocumentIR(markdown))
  })

  it('promotes a standalone Markdown image to an exportable block', () => {
    expect(markdownToDocumentIR('![架构图](assets/architecture.png "系统架构")').blocks).toEqual([
      { kind: 'image', url: 'assets/architecture.png', alt: '架构图', title: '系统架构' },
    ])
  })
})
