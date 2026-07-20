import { describe, expect, it } from 'vitest'
import {
  buildFormatPackageFileMap,
  buildStandaloneHtmlDownload,
  downloadFormatPackageEntries,
  downloadStandaloneHtml,
  downloadOpenZipPackage,
  type DownloadAdapter,
} from './formatPackageDownload'

describe('format-package download helpers', () => {
  it('creates an independently downloadable self-contained HTML file', () => {
    const file = buildStandaloneHtmlDownload({ sourceName: 'C:\\notes\\release.md', markdown: '# Release' })
    expect(file).toMatchObject({ path: 'release.html', mediaType: 'text/html' })
    expect(file.content).toContain('<title>release</title>')
    expect(file.content).toContain('<h1>Release</h1>')
  })

  it('exposes package files by name without representing them as a ZIP', () => {
    const files = buildFormatPackageFileMap({ sourceName: 'readme.md', markdown: '# Readme' })
    expect(Object.keys(files)).toEqual(['readme.md', 'readme.html'])
    expect(files['readme.html'].mediaType).toBe('text/html')
  })

  it('uses the caller transport for HTML and every package entry', async () => {
    const downloaded: string[] = []
    const adapter: DownloadAdapter = { download: (file) => { downloaded.push(file.path) } }
    await downloadStandaloneHtml({ sourceName: 'guide.md', markdown: '# Guide' }, adapter)
    const files = await downloadFormatPackageEntries({ sourceName: 'guide.md', markdown: '# Guide' }, adapter)
    expect(downloaded).toEqual(['guide.html', 'guide.md', 'guide.html'])
    expect(Object.keys(files)).toEqual(['guide.md', 'guide.html'])
  })

  it('uses the binary transport for one open ZIP download', async () => {
    const downloaded: string[] = []
    const pkg = await downloadOpenZipPackage(
      { sourceName: 'guide.md', markdown: '# Guide' },
      { download: (file) => { downloaded.push(`${file.path}:${file.content[0]}`) } },
    )
    expect(downloaded).toEqual(['guide.mdpack.zip:80'])
    expect(pkg.manifest.format).toBe('md-reader.open-package')
  })
})
