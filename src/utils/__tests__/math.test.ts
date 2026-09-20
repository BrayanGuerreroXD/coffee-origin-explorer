import { describe, expect, it } from 'vitest'
import { clamp, lerp, normalizePointer } from '../math'

describe('clamp', () => {
  it('returns the value untouched when it sits inside the bounds', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(-3, -10, 10)).toBe(-3)
  })

  it('returns the lower bound for a value below it', () => {
    expect(clamp(-5, 0, 1)).toBe(0)
  })

  it('returns the upper bound for a value above it', () => {
    expect(clamp(42, 0, 1)).toBe(1)
  })

  it('returns the bound itself when the value sits exactly on it', () => {
    expect(clamp(0, 0, 1)).toBe(0)
    expect(clamp(1, 0, 1)).toBe(1)
  })
})

describe('lerp', () => {
  it('returns the start value at alpha 0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })

  it('returns the end value at alpha 1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })

  it('returns the midpoint at alpha 0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('interpolates towards a smaller target', () => {
    expect(lerp(1, -1, 0.25)).toBeCloseTo(0.5, 10)
  })

  it('clamps an alpha above 1', () => {
    expect(lerp(0, 10, 1.5)).toBe(10)
    expect(lerp(0, 10, 1000)).toBe(10)
  })

  it('clamps an alpha below 0', () => {
    expect(lerp(0, 10, -0.5)).toBe(0)
  })
})

describe('normalizePointer', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 }

  it('maps the centre of the rect to the origin', () => {
    const centre = normalizePointer(200, 100, rect)
    // toBeCloseTo, because flipping Y turns the exact zero into -0.
    expect(centre.x).toBeCloseTo(0, 10)
    expect(centre.y).toBeCloseTo(0, 10)
  })

  it('flips Y so that the top of the rect is +1', () => {
    // Top-left corner of the rect.
    expect(normalizePointer(100, 50, rect)).toEqual({ x: -1, y: 1 })
  })

  it('maps the bottom-right corner to (1, -1)', () => {
    expect(normalizePointer(300, 150, rect)).toEqual({ x: 1, y: -1 })
  })

  it('maps the remaining corners consistently', () => {
    expect(normalizePointer(300, 50, rect)).toEqual({ x: 1, y: 1 })
    expect(normalizePointer(100, 150, rect)).toEqual({ x: -1, y: -1 })
  })

  it('clamps a coordinate that falls outside the rect', () => {
    expect(normalizePointer(10_000, -10_000, rect)).toEqual({ x: 1, y: 1 })
    expect(normalizePointer(-10_000, 10_000, rect)).toEqual({ x: -1, y: -1 })
  })

  it('returns the origin for a zero-sized rect instead of dividing by zero', () => {
    expect(normalizePointer(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(normalizePointer(10, 10, { left: 0, top: 0, width: 200, height: 0 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(normalizePointer(10, 10, { left: 0, top: 0, width: 0, height: 100 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('produces intermediate values inside the rect', () => {
    // A quarter across and a quarter down.
    const result = normalizePointer(150, 75, rect)
    expect(result.x).toBeCloseTo(-0.5, 10)
    expect(result.y).toBeCloseTo(0.5, 10)
  })
})
