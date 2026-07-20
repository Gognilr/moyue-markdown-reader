import { beforeEach, describe, expect, it } from 'vitest'
import { defaultLayout, useLayoutStore } from './useLayoutStore'

describe('useLayoutStore vertical reading preference', () => {
  beforeEach(() => useLayoutStore.setState({ ...defaultLayout }))

  it('is opt-in and can be explicitly turned off again without changing typography', () => {
    const original = useLayoutStore.getState()
    expect(original.isVerticalReading).toBe(false)

    original.toggleVerticalReading()
    expect(useLayoutStore.getState()).toMatchObject({ isVerticalReading: true, fontSize: original.fontSize, fontFamily: original.fontFamily })

    useLayoutStore.getState().toggleVerticalReading()
    expect(useLayoutStore.getState().isVerticalReading).toBe(false)
  })
})
