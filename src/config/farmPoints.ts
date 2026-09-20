/**
 * Visual layout of the five interest points.
 *
 * These are composition coordinates inside the illustrated map, not real
 * geography. Content (title, text, image) comes from the environment; only the
 * placement lives here, because it is a visual decision rather than content.
 */
export interface PointLayout {
  /** Scene-space position in world units, matching the orthographic frustum. */
  position: [number, number]
  /** Parallax depth, 0 = far, 1 = near. */
  depth: number
}

export const POINT_LAYOUT: readonly PointLayout[] = [
  { position: [1.7, 1.1], depth: 0.55 }, // 1 - cultivo, upper right
  { position: [-1.3, 0.8], depth: 0.6 }, // 2 - cosecha, upper left
  { position: [0.25, -0.05], depth: 0.65 }, // 3 - beneficio, centre
  { position: [-1.75, -1.35], depth: 0.7 }, // 4 - secado, lower left
  { position: [1.65, -1.4], depth: 0.75 }, // 5 - empaque, lower right
]
