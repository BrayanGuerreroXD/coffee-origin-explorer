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
  /** Clamp for the fitted zoom, in pixels per world unit. Fallback path only. */
  minZoom: 40,
  maxZoom: 220,

  /**
   * Tilt of the map plane away from the camera, in radians — about 24°.
   * This is what makes it read as a map you are leaning over rather than a
   * picture hanging flat, and under a perspective camera it is also what makes
   * the top of the drawing converge.
   */
  tilt: 0.42,

  /** Vertical field of view in degrees. Narrow keeps the distortion gentle. */
  fov: 32,

  /**
   * Extra size given to every layer to pay for the tilt.
   *
   * Rotating a plane away from the camera pushes its top edge farther off, so
   * that edge projects narrower and shorter and the top corners pull inward,
   * leaving wedges of bare paper. Enlarging the planes past the keystone is
   * what keeps the drawing filling the frame.
   */
  keystone: 1.32,
} as const

export type SceneWorld = typeof SCENE_WORLD
