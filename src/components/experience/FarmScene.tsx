import { Suspense } from 'react'
import { experienceConfig } from '../../config'
import { SCENE_WORLD } from '../../config/scene'
import type { FarmPoint, SceneLayerImages } from '../../config/types'
import type { PointProjection } from '../../hooks/pointProjection'
import { LAYER_FACTORS } from '../../hooks/useParallax'
import { FarmLayer } from './FarmLayer'
import { PointHighlight } from './PointHighlight'
import { PointProjector } from './PointProjector'
import { ParallaxGroup } from './ParallaxGroup'

/**
 * Back to front. `points` is absent on purpose: the interest points are DOM
 * nodes overlaid on the canvas, not a textured plane. Their positions are
 * projected from inside this group so they inherit the same tilt and parallax.
 */
const LAYER_ORDER = ['paper', 'map', 'foreground'] as const satisfies readonly (keyof SceneLayerImages &
  keyof typeof LAYER_FACTORS)[]

/** Just above the map drawing, below the foreground vignette. */
const HIGHLIGHT_Z = 0.13
const MARKER_Z = 0.14

export interface FarmSceneProps {
  points: FarmPoint[]
  projection: PointProjection
  /** Point currently hovered, focused or open — its area of the map lights up. */
  highlightedPointId: string | null
  accent: string
}

/**
 * Contents of the Canvas. Unlit on purpose — every layer is a pre-illustrated
 * texture, so lights would only cost frames and wash the artwork out.
 *
 * Everything sits in one group tilted away from the camera. Under the
 * perspective camera that tilt is what gives the map its convergence, and it
 * has to apply to the markers and the highlights as well, which is why they are
 * children of the same group.
 */
export function FarmScene({ points, projection, highlightedPointId, accent }: FarmSceneProps) {
  const { layers } = experienceConfig

  return (
    <group rotation-x={-SCENE_WORLD.tilt}>
      <Suspense fallback={null}>
        {LAYER_ORDER.map((name, index) => (
          <FarmLayer key={name} src={layers[name]} factor={LAYER_FACTORS[name]} renderOrder={index} />
        ))}
      </Suspense>

      {/* Same factor as the map layer, so none of this can drift off the drawing. */}
      <ParallaxGroup factor={LAYER_FACTORS.map}>
        {points.map((point) => (
          <PointHighlight
            key={point.id}
            point={point}
            active={point.id === highlightedPointId}
            z={HIGHLIGHT_Z}
            color={accent}
          />
        ))}
        <PointProjector points={points} projection={projection} z={MARKER_Z} />
      </ParallaxGroup>
    </group>
  )
}
