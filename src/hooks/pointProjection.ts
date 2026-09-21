/**
 * Where each interest point currently lands on screen.
 *
 * Once the map is tilted under a perspective camera there is no closed-form
 * pixel position for a point any more: it depends on the camera, on the tilt
 * and on the parallax offset of the frame being drawn. So the scene itself
 * projects the points every frame and publishes the result here, and the DOM
 * overlay just follows. One source of truth means the markers cannot drift off
 * the drawing they belong to.
 */
export interface ProjectedPoint {
  left: number
  top: number
}

/** Where a point sits in world space once the map's tilt has been applied. */
export interface WorldPoint {
  x: number
  y: number
  z: number
}

export interface PointProjection {
  /** Latest screen position per point id, in CSS pixels. Mutated in place. */
  readonly positions: Map<string, ProjectedPoint>
  /** Same points in world space, which is what the camera needs to fly to one. */
  readonly world: Map<string, WorldPoint>
  /**
   * True while a projector inside the canvas is driving this store. Without
   * WebGL nothing drives it, and the overlay falls back to its own flat
   * projection, which is correct for the static fallback image.
   */
  readonly live: boolean
  setLive(live: boolean): void
  subscribe(listener: () => void): () => void
  /** Called by the projector once per frame, after positions are updated. */
  publish(): void
}

export function createPointProjection(): PointProjection {
  const positions = new Map<string, ProjectedPoint>()
  const world = new Map<string, WorldPoint>()
  const listeners = new Set<() => void>()
  let live = false

  return {
    positions,
    world,
    get live() {
      return live
    },
    setLive(next) {
      live = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish() {
      for (const listener of listeners) listener()
    },
  }
}
