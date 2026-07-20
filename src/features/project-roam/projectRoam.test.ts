import { describe, expect, it } from 'vitest'
import { createProjectRoamState, getProjectBreadcrumbs, getProjectDocumentLinks, resolveProjectPath } from './projectRoam'

describe('zero-config project document roaming', () => {
  it('discovers and resolves only local Markdown document links', () => {
    const links = getProjectDocumentLinks('[Guide](docs/guide.md#install) ![Logo](logo.png) [Web](https://example.com) [Self](#here) [Again](docs/guide.md#install) [Notes](../notes.markdown)', 'E:\\repo\\README.md')
    expect(links).toEqual([
      { label: 'Guide', path: 'E:\\repo\\docs\\guide.md', fragment: 'install' },
      { label: 'Notes', path: 'E:\\notes.markdown' },
    ])
  })

  it('keeps browser-safe paths, breadcrumbs, and host-owned back state deterministic', () => {
    expect(resolveProjectPath('/repo/docs/guide.md', '../README.md')).toBe('/repo/README.md')
    expect(getProjectBreadcrumbs('E:\\repo\\docs\\guide.md')).toEqual([
      { label: 'repo', path: 'E:\\repo' }, { label: 'docs', path: 'E:\\repo\\docs' }, { label: 'guide', path: 'E:\\repo\\docs\\guide.md' },
    ])
    expect(createProjectRoamState('/repo/README.md', '[Guide](docs/guide.md)', ['/repo/old.md'])).toMatchObject({ backStack: ['/repo/old.md'], links: [{ path: '/repo/docs/guide.md' }] })
  })
})
