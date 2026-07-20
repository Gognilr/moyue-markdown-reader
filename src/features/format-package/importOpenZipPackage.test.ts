import { describe, expect, it } from 'vitest'
import { buildOpenZipPackage } from './openZipPackage'
import { importOpenZipPackage, isOpenPackagePath } from './importOpenZipPackage'

describe('open ZIP package importer', () => {
  it('opens only the declared Markdown in a v1 Store ZIP without extracting files', () => {
    const archive = buildOpenZipPackage({ sourceName: 'notes.md', markdown: '# Notes\n\nHello.' }).archive
    const imported = importOpenZipPackage('notes.mdpack.zip', archive)
    expect(imported.markdown).toBe('# Notes\n\nHello.')
    expect(imported.path).toBe('package://notes.mdpack.zip/document/notes.md')
    expect(imported.manifest.format).toBe('md-reader.open-package')
    expect(Object.keys(imported.resourceUrls)).toEqual([])
    imported.dispose()
  })

  it('rejects ordinary ZIP bytes and keeps virtual package paths distinct from disk paths', () => {
    expect(() => importOpenZipPackage('other.zip', new Uint8Array([0x50, 0x4b, 3, 4]))).toThrow('Invalid ZIP')
    expect(isOpenPackagePath('package://safe/document/notes.md')).toBe(true)
    expect(isOpenPackagePath('C:/notes.md')).toBe(false)
  })
})
