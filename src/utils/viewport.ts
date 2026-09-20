import { clamp } from './math'
import { SCENE_WORLD } from '../config/scene'

export interface Size {
  width: number
  height: number
}

/**
 * Pixels per world unit needed to fit the whole map inside the container.
 *
 * This is a "contain" fit, not a "cover" fit: every interest point has to stay
 * on screen without scrolling. Layers compensate by being drawn larger than
 * the viewport, see SCENE_WORLD.overscan.
 */
export function fitZoom(container: Size, world: Size = SCENE_WORLD): number {
  if (container.width <= 0 || container.height <= 0) return SCENE_WORLD.minZoom
  const zoom = Math.min(container.width / world.width, container.height / world.height)
  return clamp(zoom, SCENE_WORLD.minZoom, SCENE_WORLD.maxZoom)
}

/**
 * Converts a scene coordinate to a pixel offset from the top-left of the
 * container, matching how an orthographic camera at the origin with the given
 * zoom projects that point. Y is flipped because scene-space grows upwards and
 * CSS grows downwards.
 */
export function worldToScreen(
  x: number,
  y: number,
  container: Size,
  zoom: number,
): { left: number; top: number } {
  return {
    left: container.width / 2 + x * zoom,
    top: container.height / 2 - y * zoom,
  }
}

/** Size in world units that a layer must span to cover the container plus overscan. */
export function layerCoverSize(container: Size, zoom: number): Size {
  const factor = 1 + SCENE_WORLD.overscan
  if (zoom <= 0) return { width: SCENE_WORLD.width * factor, height: SCENE_WORLD.height * factor }
  return {
    width: (container.width / zoom) * factor,
    height: (container.height / zoom) * factor,
  }
}
