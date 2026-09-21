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
  const factor = (1 + SCENE_WORLD.overscan) * SCENE_WORLD.keystone

  it('covers the world box plus the overscan', () => {
    const cover = layerCoverSize(1.6)

    expect(cover.width).toBeGreaterThanOrEqual(SCENE_WORLD.width * factor - 0.001)
    expect(cover.height).toBeGreaterThanOrEqual(SCENE_WORLD.height * factor - 0.001)
  })

  it('never distorts the artwork', () => {
    for (const aspect of [0.5, 1, 1.6, 3]) {
      const cover = layerCoverSize(aspect)
      expect(cover.width / cover.height).toBeCloseTo(aspect)
    }
  })

  it('touches the limiting axis rather than overshooting both', () => {
    // A wide texture is height limited: it fits the box height and spills sideways.
    const wide = layerCoverSize(4)
    expect(wide.height).toBeCloseTo(SCENE_WORLD.height * factor)
    expect(wide.width).toBeGreaterThan(SCENE_WORLD.width * factor)

    // A tall texture is the mirror case.
    const tall = layerCoverSize(0.5)
    expect(tall.width).toBeCloseTo(SCENE_WORLD.width * factor)
    expect(tall.height).toBeGreaterThan(SCENE_WORLD.height * factor)
  })

  it('falls back to the world box aspect when the texture size is unknown', () => {
    const box = { width: SCENE_WORLD.width * factor, height: SCENE_WORLD.height * factor }
    expect(layerCoverSize(0)).toEqual(box)
    expect(layerCoverSize(Number.NaN)).toEqual(box)
  })
})
