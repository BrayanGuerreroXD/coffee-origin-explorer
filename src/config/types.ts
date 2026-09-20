/**
 * Single content contract for the experience.
 *
 * Deviation from the spec: `position` is a 2-tuple and depth is explicit.
 * Under an orthographic camera a Z coordinate changes draw order only — it does
 * not produce perspective — so using Z as a parallax depth would be misleading.
 */
export interface FarmPoint {
  id: string
  title: string
  tag: string
  image: string
  description: string
  /** Scene-space position in world units on the orthographic plane. */
  position: [number, number]
  /** Parallax depth, 0 = far background, 1 = foreground. Drives how much it moves. */
  depth: number
  /** Optional label nudge in pixels, applied to the DOM label only. */
  labelOffset?: [number, number]
  /** Optional CSS color override for the point marker. */
  accent?: string
}

export interface ParallaxConfig {
  /** Maximum horizontal displacement in world units, before the layer factor. */
  maxX: number
  /** Maximum vertical displacement in world units, before the layer factor. */
  maxY: number
  /** Lerp factor per frame, 0 < smoothing <= 1. Lower is softer. */
  smoothing: number
}

/**
 * The map is one ink drawing, not a stack of cut-out layers. It is split into
 * only three planes: the paper it sits on, the drawing itself, and a restrained
 * near-foreground. Any more than that and the parallax starts to reveal the
 * seams between pieces of what should read as a single illustration.
 */
export interface SceneLayerImages {
  paper: string
  map: string
  foreground: string
}

export interface FarmExperienceConfig {
  title: string
  location: string
  subtitle: string
  layers: SceneLayerImages
  points: FarmPoint[]
  parallax: ParallaxConfig
  pointPulseEnabled: boolean
  modalBackdropBlur: number
}
