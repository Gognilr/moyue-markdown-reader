import { describe, expect, it } from 'vitest'
import { expandDisclosureBlocks } from './resumeRecovery'

describe('expandDisclosureBlocks', () => {
  it('opens every disclosure block before recovery navigation', () => {
    const details = [{ open: false }, { open: true }, { open: false }]
    const root = { querySelectorAll: () => details } as unknown as ParentNode

    expect(expandDisclosureBlocks(root)).toBe(3)
    expect(details.every((item) => item.open)).toBe(true)
  })
})
