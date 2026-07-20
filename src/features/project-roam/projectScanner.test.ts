import { describe, expect, it } from 'vitest'
import { includeCurrentProjectDocument } from './projectScanner'

describe('project scan snapshot', () => {
  it('keeps unsaved current editor text over the native disk snapshot', () => {
    const scan = includeCurrentProjectDocument({
      documents: [{ path: 'E:/guide/README.md', markdown: '# Disk' }, { path: 'E:/guide/docs/a.md', markdown: '# A' }],
      truncated: false,
    }, 'E:\\guide\\README.md', '# Editor')
    expect(scan.documents).toEqual(expect.arrayContaining([{ path: 'E:\\guide\\README.md', markdown: '# Editor' }]))
    expect(scan.documents.filter((item) => item.path.toLowerCase().endsWith('readme.md'))).toHaveLength(1)
  })
})
