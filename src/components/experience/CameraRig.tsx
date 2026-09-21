import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { CameraControl } from '../../hooks/cameraControl'
import { FOCUS_DISTANCE_FACTOR } from '../../hooks/cameraControl'
import type { PointProjection } from '../../hooks/pointProjection'
import { useParallax } from '../../hooks/useParallax'
import { lerp } from '../../utils/math'

export interface CameraRigProps {
  control: CameraControl
  /** Point to fly to, or null to return to the framing shot. */
  focusPointId: string | null
  projection: PointProjection
}

/** Damping per frame towards the desired camera state. */
const EASE = 0.08

/**
 * Eases the camera towards whatever the control store is asking for, and flies
 * to a point when one is opened.
 *
 * Deliberately not OrbitControls: rotating would break the illusion of a
 * drawing on paper, and the tilt is fixed by design. The camera only ever moves
 * parallel to the map or along its own axis, so the drawing is never seen from
 * an angle it was not drawn for.
 */
export function CameraRig({ control, focusPointId, projection }: CameraRigProps) {
  const parallax = useParallax()

  useEffect(() => {
    if (!focusPointId) {
      control.reset()
      return
    }
    const target = projection.world.get(focusPointId)
    if (!target) return
    control.focusOn(target.x, target.y, control.base * FOCUS_DISTANCE_FACTOR)
  }, [focusPointId, projection, control])

  useFrame((state) => {
    // Reduced motion still allows zoom and pan; it only removes the easing.
    const alpha = parallax.reducedMotion ? 1 : EASE
    const camera = state.camera
    camera.position.x = lerp(camera.position.x, control.x, alpha)
    camera.position.y = lerp(camera.position.y, control.y, alpha)
    camera.position.z = lerp(camera.position.z, control.distance, alpha)
  })

  return null
}
