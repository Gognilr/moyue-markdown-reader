import type {
  DocumentPersonalityPin,
  DocumentTypographyPersonality,
  ReadingLayoutPreset,
} from '../../types'
import { readingLayoutPresets, type ReadingLayoutPresetValues } from '../../store/useLayoutStore'

export interface TypographyPersonalityProfile extends ReadingLayoutPresetValues {
  id: DocumentTypographyPersonality
  label: string
  description: string
  /** Closest general-purpose reading preset, useful for compact controls. */
  preset: ReadingLayoutPreset
}

export const typographyPersonalities: Record<DocumentTypographyPersonality, TypographyPersonalityProfile> = {
  readme: { id: 'readme', label: 'README / 指南', description: '技术文档：均衡段宽，便于在目录、步骤和示例间切换。', preset: 'comfortable', ...readingLayoutPresets.comfortable },
  report: { id: 'report', label: '报告', description: '现代黑体：稳定、克制的工作文档阅读节奏。', preset: 'comfortable', ...readingLayoutPresets.comfortable },
  paper: { id: 'paper', label: '论文', description: '宋体精读：稍窄段宽和舒展行距，利于阅读论证。', preset: 'spacious', fontFamily: '"STSong", "Songti SC", SimSun, serif', fontSize: 16, lineHeight: 1.95, contentWidth: 740, letterSpacing: 0.02, paragraphSpacing: 1.4 },
  book: { id: 'book', label: '书籍', description: '宋体书卷：更宽松的连续阅读版式。', preset: 'spacious', ...readingLayoutPresets.spacious },
  minutes: { id: 'minutes', label: '会议纪要', description: '仿宋公文：紧凑清晰，适合核对待办、决议和责任人。', preset: 'compact', ...readingLayoutPresets.compact, fontFamily: 'FangSong, STFangsong, "仿宋", serif' },
}

export type PersonalityPins = Record<string, DocumentPersonalityPin>

export function pinKey(scope: DocumentPersonalityPin['scope'], target: string): string {
  return `${scope}:${target}`
}

export function upsertPersonalityPin(
  pins: PersonalityPins,
  pin: Omit<DocumentPersonalityPin, 'updatedAt'> & { updatedAt?: number },
  now = Date.now(),
): PersonalityPins {
  return {
    ...pins,
    [pinKey(pin.scope, pin.target)]: { ...pin, updatedAt: pin.updatedAt ?? now },
  }
}

export function removePersonalityPin(
  pins: PersonalityPins,
  scope: DocumentPersonalityPin['scope'],
  target: string,
): PersonalityPins {
  const next = { ...pins }
  delete next[pinKey(scope, target)]
  return next
}

/** A document choice is deliberately stronger than a generic type choice. */
export function resolvePinnedPersonality(
  pins: PersonalityPins,
  documentKey: string | null | undefined,
  documentKind: string | null | undefined,
): DocumentTypographyPersonality | null {
  const documentPin = documentKey ? pins[pinKey('document', documentKey)] : undefined
  const kindPin = documentKind ? pins[pinKey('kind', documentKind)] : undefined
  return documentPin?.personality ?? kindPin?.personality ?? null
}
