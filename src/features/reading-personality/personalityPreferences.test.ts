import { describe, expect, it } from 'vitest'
import { removePersonalityPin, resolvePinnedPersonality, typographyPersonalities, upsertPersonalityPin } from './personalityPreferences'

describe('document typography personality preferences', () => {
  it('provides all five document treatments with valid display values', () => {
    expect(Object.keys(typographyPersonalities).sort()).toEqual(['book', 'minutes', 'paper', 'readme', 'report'])
    expect(typographyPersonalities.paper.contentWidth).toBeGreaterThan(560)
    expect(typographyPersonalities.minutes.fontFamily).toContain('FangSong')
    expect(typographyPersonalities.book.fontFamily).toContain('Songti')
  })

  it('gives document pins priority over kind pins and supports removal', () => {
    let pins = upsertPersonalityPin({}, { scope: 'kind', target: 'technical', personality: 'report' }, 1)
    pins = upsertPersonalityPin(pins, { scope: 'document', target: '/work/guide.md', personality: 'book' }, 2)
    expect(resolvePinnedPersonality(pins, '/work/guide.md', 'technical')).toBe('book')
    pins = removePersonalityPin(pins, 'document', '/work/guide.md')
    expect(resolvePinnedPersonality(pins, '/work/guide.md', 'technical')).toBe('report')
  })
})
