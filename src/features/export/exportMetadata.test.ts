import { describe, expect, it } from 'vitest'
import { extractExportMetadata } from './exportMetadata'

describe('export metadata extraction', () => {
  it('uses supported front matter for cover, header and footer fields', () => {
    expect(extractExportMetadata(`---\ntitle: 发布说明\nsubtitle: "Windows 客户端"\nclassification: 内部\nversion: v2.1\nauthor: 阅读器团队\ndate: 2026-07-18\nunknown: ignored\n---\n\n# 正文标题`)).toEqual({
      title: '发布说明', subtitle: 'Windows 客户端', classification: '内部', version: 'v2.1', author: '阅读器团队', date: '2026-07-18',
    })
  })

  it('uses the authored H1, then the supplied file name, without inventing other fields', () => {
    expect(extractExportMetadata('# 设计说明\n\n正文', 'fallback')).toEqual({ title: '设计说明' })
    expect(extractExportMetadata('正文', 'fallback')).toEqual({ title: 'fallback' })
  })

  it('keeps an explicitly authored logo reference and its accessible label', () => {
    expect(extractExportMetadata('---\ntitle: 发布说明\nlogo: assets/company-logo.png\nlogo_alt: 阅读器团队标识\n---\n# 正文')).toMatchObject({
      title: '发布说明', logo: { source: 'assets/company-logo.png', alt: '阅读器团队标识' },
    })
  })
})
