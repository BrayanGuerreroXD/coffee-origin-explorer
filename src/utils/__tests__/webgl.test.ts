import { describe, expect, it, vi } from 'vitest'
import { isWebGLAvailable } from '../webgl'

describe('isWebGLAvailable', () => {
  it('reports no WebGL in jsdom without throwing', () => {
    expect(() => isWebGLAvailable()).not.toThrow()
    expect(isWebGLAvailable()).toBe(false)
  })

  it('returns false when getContext throws', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockImplementation(() => {
      throw new Error('context creation refused')
    })
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(canvas)

    expect(isWebGLAvailable()).toBe(false)

    createElement.mockRestore()
  })

  it('returns true when a webgl context is returned', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockImplementation((id: string) =>
      id === 'webgl' ? ({} as unknown as RenderingContext) : null,
    )
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(canvas)

    expect(isWebGLAvailable()).toBe(true)

    createElement.mockRestore()
  })
})
