import { createContext, useContext } from 'react'

/** Smoothed pointer offset, both components in the [-1, 1] range. */
export interface ParallaxVector {
  x: number
  y: number
}

/**
 * Shared parallax source for the whole experience.
 *
 * There is exactly one pointer listener and one animation loop. Consumers read
 * `value` imperatively — inside `useFrame` for WebGL layers, inside their own
 * frame callback for DOM layers — so moving the pointer never triggers a React
 * render. `value` is a stable object mutated in place; never destructure and
 * cache its numbers.
 */
export interface ParallaxController {
  readonly value: ParallaxVector
  /** True when the user asked for reduced motion; consumers should stay still. */
  readonly reducedMotion: boolean
  /** Called once per animation frame after `value` has been updated. */
  subscribe(listener: (value: ParallaxVector) => void): () => void
}

const STILL: ParallaxController = {
  value: { x: 0, y: 0 },
  reducedMotion: true,
  subscribe: () => () => {},
}

export const ParallaxContext = createContext<ParallaxController>(STILL)

/**
 * Returns the shared controller. Outside a provider it returns a controller
 * that never moves, so components stay renderable in isolation and in tests.
 */
export function useParallax(): ParallaxController {
  return useContext(ParallaxContext)
}

/** Displacement of one layer, in world units, for the current pointer value. */
export function layerOffset(
  value: ParallaxVector,
  factor: number,
  maxX: number,
  maxY: number,
): ParallaxVector {
  return { x: value.x * maxX * factor, y: value.y * maxY * factor }
}

/**
 * Parallax factor of every plane, back to front. Deeper planes move less, which
 * is what reads as depth.
 *
 * The values are low on purpose. The map is a single ink drawing rather than a
 * stack of cut-outs, so the movement has to stay closer to a gentle drift than
 * to a diorama; too much separation and the drawing visibly comes apart.
 */
export const LAYER_FACTORS = {
  paper: 0.06,
  map: 0.28,
  points: 0.42,
  foreground: 0.7,
} as const

export type LayerName = keyof typeof LAYER_FACTORS
