import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '../useReducedMotion'

type ChangeListener = (event: MediaQueryListEvent) => void

interface FakeMediaQuery {
  list: { matches: boolean; media: string }
  matchMedia: ReturnType<typeof vi.fn>
  listenerCount: () => number
  fireChange: (matches: boolean) => void
}

/**
 * Replaces window.matchMedia for a single test. `src/test/setup.ts` installs a
 * default stub, so every test here overrides it deliberately instead of
 * assuming what the environment provides.
 */
function installMatchMedia(initialMatches: boolean): FakeMediaQuery {
  const listeners = new Set<ChangeListener>()

  const list = {
    matches: initialMatches,
    media: '',
    onchange: null,
    addEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: ChangeListener) => {
      if (type === 'change') listeners.delete(listener)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }

  const matchMedia = vi.fn((query: string) => {
    list.media = query
    return list
  })

  vi.stubGlobal('matchMedia', matchMedia)

  return {
    list,
    matchMedia,
    listenerCount: () => listeners.size,
    fireChange: (matches: boolean) => {
      list.matches = matches
      act(() => {
        for (const listener of [...listeners]) {
          listener({ matches } as MediaQueryListEvent)
        }
      })
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useReducedMotion', () => {
  it('returns false when matchMedia reports no match', () => {
    const fake = installMatchMedia(false)

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)
    expect(fake.matchMedia).toHaveBeenCalled()
    expect(fake.list.media).toBe('(prefers-reduced-motion: reduce)')
  })

  it('returns true when matchMedia reports a match', () => {
    installMatchMedia(true)

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(true)
  })

  it('updates when the media query list fires a change event', () => {
    const fake = installMatchMedia(false)

    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    fake.fireChange(true)
    expect(result.current).toBe(true)

    fake.fireChange(false)
    expect(result.current).toBe(false)
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const fake = installMatchMedia(false)

    const { unmount } = renderHook(() => useReducedMotion())
    expect(fake.listenerCount()).toBe(1)

    unmount()
    expect(fake.listenerCount()).toBe(0)
  })

  it('does not throw when window.matchMedia is undefined', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(window.matchMedia).toBeUndefined()

    const { result, unmount } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)
    expect(() => unmount()).not.toThrow()
  })
})
