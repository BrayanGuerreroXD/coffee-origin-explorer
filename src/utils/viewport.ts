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

/**
 * Size in world units of a layer plane whose texture has the given aspect
 * ratio, scaled to cover the map plus overscan without distorting the artwork.
 *
 * It is anchored to the world box rather than to the viewport on purpose. If a
 * layer were stretched to the viewport instead, a tall phone would scale the
 * illustration three times more vertically than horizontally, and the artwork
 * would also drift out of register with the interest points, which are placed
 * in world units. On a viewport the artwork cannot fill at this scale, the sky
 * gradient behind the canvas shows through — letterboxing beats distortion.
 */
export function layerCoverSize(aspect: number): Size {
  const factor = 1 + SCENE_WORLD.overscan
  const targetWidth = SCENE_WORLD.width * factor
  const targetHeight = SCENE_WORLD.height * factor
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : targetWidth / targetHeight

  // Cover: grow along whichever axis is still short of the target box.
  const width = Math.max(targetWidth, targetHeight * safeAspect)
  const height = Math.max(targetHeight, targetWidth / safeAspect)
  return width / height > safeAspect
    ? { width, height: width / safeAspect }
    : { width: height * safeAspect, height }
}
