import { Suspense } from 'react'
import { experienceConfig } from '../../config'
import type { SceneLayerImages } from '../../config/types'
import { LAYER_FACTORS } from '../../hooks/useParallax'
import { FarmLayer } from './FarmLayer'

/**
 * Back to front. `points` is absent on purpose: the interest points are DOM
 * nodes overlaid on the canvas, not a textured plane.
 */
const LAYER_ORDER = ['paper', 'map', 'foreground'] as const satisfies readonly (keyof SceneLayerImages &
  keyof typeof LAYER_FACTORS)[]

/**
 * Contents of the Canvas. Unlit on purpose — every layer is a pre-illustrated
 * texture, so lights would only cost frames and wash the artwork out.
 */
export function FarmScene() {
  const { layers } = experienceConfig

  return (
    <Suspense fallback={null}>
      {LAYER_ORDER.map((name, index) => (
        <FarmLayer key={name} src={layers[name]} factor={LAYER_FACTORS[name]} renderOrder={index} />
      ))}
    </Suspense>
  )
}
