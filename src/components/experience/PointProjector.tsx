import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import type { FarmPoint } from '../../config/types'
import type { PointProjection } from '../../hooks/pointProjection'

export interface PointProjectorProps {
  points: FarmPoint[]
  projection: PointProjection
  /** Z offset of the marker plane, just in front of the map. */
  z?: number
}

/**
 * Projects the interest points through the real camera, every frame, and
 * publishes their screen positions for the DOM overlay to follow.
 *
 * It carries no transform of its own: it is mounted inside the tilted, parallax
 * -driven group that holds the map, so its world matrix is already the map's.
 * That is precisely why the markers stay glued to the drawing under any
 * combination of tilt, pan, zoom and pointer movement.
 */
export function PointProjector({ points, projection, z = 0.14 }: PointProjectorProps) {
  const groupRef = useRef<Group>(null)
  const scratch = useMemo(() => new Vector3(), [])

  useEffect(() => {
    projection.setLive(true)
    return () => projection.setLive(false)
  }, [projection])

  useFrame(({ camera, size }) => {
    const group = groupRef.current
    if (!group) return

    for (const point of points) {
      scratch.set(point.position[0], point.position[1], z)
      group.localToWorld(scratch)

      const worldEntry = projection.world.get(point.id)
      if (worldEntry) {
        worldEntry.x = scratch.x
        worldEntry.y = scratch.y
        worldEntry.z = scratch.z
      } else {
        projection.world.set(point.id, { x: scratch.x, y: scratch.y, z: scratch.z })
      }

      scratch.project(camera)

      const left = (scratch.x * 0.5 + 0.5) * size.width
      const top = (-scratch.y * 0.5 + 0.5) * size.height
      const current = projection.positions.get(point.id)
      if (current) {
        current.left = left
        current.top = top
      } else {
        projection.positions.set(point.id, { left, top })
      }
    }

    projection.publish()
  })

  return <group ref={groupRef} />
}
