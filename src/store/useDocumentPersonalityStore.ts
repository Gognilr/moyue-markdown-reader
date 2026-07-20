import { create } from 'zustand'
import type { DocumentPersonalityScope, DocumentTypographyPersonality } from '../types'
import {
  type PersonalityPins,
  removePersonalityPin,
  resolvePinnedPersonality,
  upsertPersonalityPin,
} from '../features/reading-personality/personalityPreferences'

const storageKey = 'md-reader.document-personality-pins.v1'

function loadPins(): PersonalityPins {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as PersonalityPins : {}
  } catch {
    return {}
  }
}

function persistPins(pins: PersonalityPins) {
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(pins)) } catch { /* private mode/storage quota */ }
}

interface DocumentPersonalityState {
  pins: PersonalityPins
  pin: (scope: DocumentPersonalityScope, target: string, personality: DocumentTypographyPersonality) => void
  unpin: (scope: DocumentPersonalityScope, target: string) => void
  resolve: (documentKey?: string | null, documentKind?: string | null) => DocumentTypographyPersonality | null
  replacePins: (pins: PersonalityPins) => void
}

export const useDocumentPersonalityStore = create<DocumentPersonalityState>((set, get) => ({
  pins: loadPins(),
  pin: (scope, target, personality) => {
    if (!target.trim()) return
    const pins = upsertPersonalityPin(get().pins, { scope, target, personality })
    persistPins(pins)
    set({ pins })
  },
  unpin: (scope, target) => {
    const pins = removePersonalityPin(get().pins, scope, target)
    persistPins(pins)
    set({ pins })
  },
  resolve: (documentKey, documentKind) => resolvePinnedPersonality(get().pins, documentKey, documentKind),
  replacePins: (pins) => {
    persistPins(pins)
    set({ pins })
  },
}))
