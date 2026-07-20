export type TtsSkipOptions = {
  code?: boolean
  links?: boolean
  tables?: boolean
  describeTables?: boolean
}

export type TtsAvailability = 'available' | 'unavailable'

export type TtsUtteranceOptions = Pick<SpeechSynthesisUtterance, 'lang' | 'pitch' | 'rate' | 'volume' | 'voice'>

export type TtsEngine = {
  availability: TtsAvailability
  speak: (text: string, options?: Partial<TtsUtteranceOptions>) => boolean
  pause: () => void
  resume: () => void
  cancel: () => void
}

/**
 * Builds plain spoken text locally. It neither fetches audio nor sends document
 * contents anywhere; the browser's platform speech implementation is used only
 * after the caller explicitly presses play.
 */
export function markdownToSpeechText(markdown: string, options: TtsSkipOptions = {}): string {
  let value = markdown
  if (options.code) value = value.replace(/(^|\n)```[\s\S]*?```/g, '$1')
  if (options.tables) {
    value = value.replace(/^\|.*\|\s*\n\|(?:\s*:?-+:?\s*\|)+\s*\n(?:\|.*\|\s*\n?)+/gm, (table) => {
      if (!options.describeTables) return ''
      const rows = table.trim().split('\n').filter((line) => !/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line))
      const cells = rows.map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()).filter(Boolean))
      if (!cells.length) return ''
      return `\n表格，共 ${Math.max(0, cells.length - 1)} 行 ${cells[0].length} 列。表头：${cells[0].join('，')}。\n`
    })
  }
  value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_all, label: string) => label ? `图片：${label}` : '')
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, (_all, label) => options.links ? '' : label)
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getTtsAvailability(speech: SpeechSynthesis | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis): TtsAvailability {
  return speech && typeof SpeechSynthesisUtterance !== 'undefined' ? 'available' : 'unavailable'
}

export function createBrowserTtsEngine(speech: SpeechSynthesis | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis): TtsEngine {
  const availability = getTtsAvailability(speech)
  return {
    availability,
    speak(text, options = {}) {
      if (availability === 'unavailable' || !text.trim() || !speech) return false
      const utterance = new SpeechSynthesisUtterance(text)
      Object.assign(utterance, options)
      speech.cancel()
      speech.speak(utterance)
      return true
    },
    pause: () => speech?.pause(),
    resume: () => speech?.resume(),
    cancel: () => speech?.cancel(),
  }
}
