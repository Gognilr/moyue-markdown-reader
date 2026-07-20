import { describe, expect, it } from 'vitest'
import { dismissFirstLaunch, FIRST_LAUNCH_DISMISSED_KEY, isMarkdownDrop, shouldShowFirstLaunch } from './firstLaunch'

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }
}

describe('first launch onboarding', () => {
  it('remains visible until the user dismisses it', () => {
    const storage = memoryStorage()
    expect(shouldShowFirstLaunch(storage)).toBe(true)
    dismissFirstLaunch(storage)
    expect(storage.getItem(FIRST_LAUNCH_DISMISSED_KEY)).toBe('1')
    expect(shouldShowFirstLaunch(storage)).toBe(false)
  })

  it('only accepts Markdown files for a drop-open hint', () => {
    expect(isMarkdownDrop([{ name: 'notes.md' } as File])).toBe(true)
    expect(isMarkdownDrop([{ name: 'notes.txt' } as File, { name: 'README.MARKDOWN' } as File])).toBe(true)
    expect(isMarkdownDrop([{ name: 'notes.txt' } as File])).toBe(false)
  })
})
