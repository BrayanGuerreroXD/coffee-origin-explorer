/**
 * The world-space contract shared by the WebGL scene and the DOM point overlay.
 *
 * Both draw the same map, one with Three.js and one with absolutely positioned
 * DOM nodes, so they must agree on the size of the map in world units and on
 * how a world coordinate becomes a pixel. That conversion lives in
 * `src/utils/viewport.ts`.
 */
export const SCENE_WORLD = {
  /**
   * Width of the illustrated map in world units. The point layout spans
   * x in [-1.75, 1.75]; the extra room keeps markers off the edges.
   */
  width: 5.2,
  /** Height of the illustrated map in world units. Layout spans y in [-1.4, 1.1]. */
  height: 3.6,
  /**
   * Fraction by which every parallax layer is enlarged past the viewport.
   * Without it the maximum displacement would drag an empty edge into view.
   * Must be at least maxDisplacement * largestLayerFactor / halfViewport.
   */
  overscan: 0.24,
  /** Clamp for the fitted zoom, in pixels per world unit. */
  minZoom: 40,
  maxZoom: 220,
} as const

export type SceneWorld = typeof SCENE_WORLD
