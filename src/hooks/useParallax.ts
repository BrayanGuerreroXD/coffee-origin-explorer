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
 * Parallax factor of every scene layer, back to front. Matching the spec:
 * deeper layers move less, which is what reads as depth.
 */
export const LAYER_FACTORS = {
  background: 0.1,
  mountain: 0.2,
  ground: 0.35,
  vegetation: 0.5,
  buildings: 0.65,
  paths: 0.75,
  points: 0.85,
  foreground: 1.0,
} as const

export type LayerName = keyof typeof LAYER_FACTORS
