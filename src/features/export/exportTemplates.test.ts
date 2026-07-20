import { describe, expect, it } from 'vitest'
import { exportTemplates, getExportTemplate, resolveExportPresentation, suggestExportTemplate } from './exportTemplates'

describe('export templates', () => {
  it('ships the six planned built-ins with complete portable tokens', () => {
    expect(exportTemplates.map((item) => item.id)).toEqual([
      'technical-report', 'requirements', 'meeting-minutes', 'academic-brief', 'chinese-official', 'readme',
    ])
    for (const template of exportTemplates) {
      expect(template.tokens.fonts.body.length).toBeGreaterThan(0)
      expect(template.tokens.page.marginsPt.left).toBeGreaterThan(0)
      expect(template.tokens.table.headerRepeat).toBe(true)
    }
  })

  it('recommends deterministically without replacing the caller choice', () => {
    expect(suggestExportTemplate('# 需求规格说明\n\n验收标准')).toBe('requirements')
    expect(suggestExportTemplate('# README\n\nQuick start', 'README.md')).toBe('readme')
    expect(suggestExportTemplate('plain document')).toBe('technical-report')
  })

  it('only emits explicitly supplied cover metadata', () => {
    const presentation = resolveExportPresentation('technical-report', { title: '导出契约', version: 'v1.2', logo: { alt: 'Logo', source: 'logo.png' } })
    expect(presentation.template).toBe(getExportTemplate('technical-report'))
    expect(presentation.coverFields).toEqual([
      { key: 'title', label: '标题', value: '导出契约' },
      { key: 'version', label: '版本', value: 'v1.2' },
    ])
  })
})
