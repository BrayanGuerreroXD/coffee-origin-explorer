import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { experienceConfig } from '../../config'
import { layerOffset, useParallax } from '../../hooks/useParallax'

export interface ParallaxGroupProps {
  /** Parallax factor, from LAYER_FACTORS. */
  factor: number
  children: ReactNode
}

/**
 * Moves everything inside it by one layer's parallax offset.
 *
 * The markers and their highlights belong to the map drawing, so they are given
 * the map's own factor and put in here together: sharing one transform is what
 * guarantees a marker cannot drift off the lot it points at, whatever the
 * pointer does.
 */
export function ParallaxGroup({ factor, children }: ParallaxGroupProps) {
  const groupRef = useRef<Group>(null)
  const parallax = useParallax()
  const { maxX, maxY } = experienceConfig.parallax

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    if (parallax.reducedMotion) {
      group.position.set(0, 0, 0)
      return
    }

    const offset = layerOffset(parallax.value, factor, maxX, maxY)
    // Opposite to the pointer, matching the layers.
    group.position.set(-offset.x, -offset.y, 0)
  })

  return <group ref={groupRef}>{children}</group>
}
