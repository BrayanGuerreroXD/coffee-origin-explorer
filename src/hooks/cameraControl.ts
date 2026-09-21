import { clamp } from '../utils/math'
import { SCENE_WORLD } from '../config/scene'

/**
 * Where the camera is being asked to go.
 *
 * Input handling lives in the DOM — wheel and drag on the scene container —
 * while the camera itself is moved inside the frame loop. This little store is
 * the seam between them: the listeners write the goal, the rig eases towards
 * it. Keeping it out of React state matters, because a pointer drag would
 * otherwise re-render the tree sixty times a second.
 */
export interface CameraControl {
  /** Desired camera centre, in world units. */
  x: number
  y: number
  /** Desired distance from the map plane. */
  distance: number
  /** Distance that frames the whole map; also the zoomed-out limit. */
  base: number
  setBase(base: number): void
  zoomBy(delta: number): void
  panBy(dxWorld: number, dyWorld: number): void
  focusOn(x: number, y: number, distance: number): void
  reset(): void
}

/** How close the camera may get, and how far back it may pull, relative to base. */
export const MIN_DISTANCE_FACTOR = 0.34
export const MAX_DISTANCE_FACTOR = 1.0
/** Distance used when a point is opened. */
export const FOCUS_DISTANCE_FACTOR = 0.46

export function createCameraControl(base = 10): CameraControl {
  const reach = SCENE_WORLD.width * 0.38

  const control: CameraControl = {
    x: 0,
    y: 0,
    distance: base,
    base,

    setBase(next) {
      const wasFramed = Math.abs(control.distance - control.base) < 0.001
      control.base = next
      // Only follow a resize when the user had not zoomed in themselves.
      if (wasFramed) control.distance = next
      control.distance = clamp(
        control.distance,
        next * MIN_DISTANCE_FACTOR,
        next * MAX_DISTANCE_FACTOR,
      )
    },

    zoomBy(delta) {
      control.distance = clamp(
        control.distance + delta,
        control.base * MIN_DISTANCE_FACTOR,
        control.base * MAX_DISTANCE_FACTOR,
      )
    },

    panBy(dxWorld, dyWorld) {
      control.x = clamp(control.x + dxWorld, -reach, reach)
      control.y = clamp(control.y + dyWorld, -reach * 0.6, reach * 0.6)
    },

    focusOn(x, y, distance) {
      control.x = clamp(x, -reach, reach)
      control.y = clamp(y, -reach * 0.6, reach * 0.6)
      control.distance = clamp(
        distance,
        control.base * MIN_DISTANCE_FACTOR,
        control.base * MAX_DISTANCE_FACTOR,
      )
    },

    reset() {
      control.x = 0
      control.y = 0
      control.distance = control.base
    },
  }

  return control
}
