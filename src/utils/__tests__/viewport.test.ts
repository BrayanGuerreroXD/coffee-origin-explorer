import { describe, expect, it } from 'vitest'
import { fitZoom, layerCoverSize, worldToScreen } from '../viewport'
import { SCENE_WORLD } from '../../config/scene'

describe('fitZoom', () => {
  it('keeps the whole world box inside the container', () => {
    const container = { width: 1440, height: 900 }
    const zoom = fitZoom(container)

    expect(SCENE_WORLD.width * zoom).toBeLessThanOrEqual(container.width + 0.001)
    expect(SCENE_WORLD.height * zoom).toBeLessThanOrEqual(container.height + 0.001)
  })

  it('fits the limiting axis exactly when within the clamp range', () => {
    // Height limited: 900 / 3.6 = 250 -> clamped to maxZoom; use a smaller box.
    const zoom = fitZoom({ width: 1040, height: 720 })
    expect(zoom).toBeCloseTo(200)
  })

  it('clamps to maxZoom on a very large container', () => {
    expect(fitZoom({ width: 10000, height: 10000 })).toBe(SCENE_WORLD.maxZoom)
  })

  it('clamps to minZoom on a very small container', () => {
    expect(fitZoom({ width: 120, height: 90 })).toBe(SCENE_WORLD.minZoom)
  })

  it('falls back to minZoom for a zero-sized container', () => {
    expect(fitZoom({ width: 0, height: 0 })).toBe(SCENE_WORLD.minZoom)
    expect(fitZoom({ width: 800, height: 0 })).toBe(SCENE_WORLD.minZoom)
  })

  it('accepts an explicit world box', () => {
    expect(fitZoom({ width: 400, height: 400 }, { width: 4, height: 2 })).toBe(100)
  })
})

describe('worldToScreen', () => {
  const container = { width: 800, height: 600 }

  it('maps the world origin to the container centre', () => {
    expect(worldToScreen(0, 0, container, 100)).toEqual({ left: 400, top: 300 })
  })

  it('flips Y, because scene space grows upwards and CSS grows downwards', () => {
    const up = worldToScreen(0, 1, container, 100)
    const down = worldToScreen(0, -1, container, 100)

    expect(up.top).toBe(200)
    expect(down.top).toBe(400)
  })

  it('scales X with the zoom', () => {
    expect(worldToScreen(2, 0, container, 50).left).toBe(500)
  })
})

describe('layerCoverSize', () => {
  it('covers the container plus the overscan', () => {
    const cover = layerCoverSize({ width: 1000, height: 500 }, 100)
    const factor = 1 + SCENE_WORLD.overscan

    expect(cover.width).toBeCloseTo(10 * factor)
    expect(cover.height).toBeCloseTo(5 * factor)
  })

  it('is always larger than the visible area', () => {
    const container = { width: 1280, height: 800 }
    const zoom = fitZoom(container)
    const cover = layerCoverSize(container, zoom)

    expect(cover.width).toBeGreaterThan(container.width / zoom)
    expect(cover.height).toBeGreaterThan(container.height / zoom)
  })

  it('falls back to the world box when the zoom is not usable', () => {
    const factor = 1 + SCENE_WORLD.overscan
    expect(layerCoverSize({ width: 1000, height: 500 }, 0)).toEqual({
      width: SCENE_WORLD.width * factor,
      height: SCENE_WORLD.height * factor,
    })
  })
})
