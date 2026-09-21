import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type Mesh, type MeshBasicMaterial } from 'three'
import type { FarmPoint } from '../../config/types'
import { lerp } from '../../utils/math'

export interface PointHighlightProps {
  point: FarmPoint
  active: boolean
  z: number
  /** Accent colour, taken from the CSS token so the wash matches the markers. */
  color: string
}

/** Radius of the wash in world units. Roughly one coffee lot on this map. */
const RADIUS = 0.62
const OPACITY = 0.3
const EASE = 0.12

/**
 * Builds the falloff mask once and shares it between every highlight.
 *
 * A hard-edged disc would read as a UI sticker dropped on the drawing; a soft
 * radial falloff reads as the area of the map lighting up, which is the effect
 * the client asked for.
 */
function createFalloffTexture(): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.72)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

let sharedFalloff: CanvasTexture | null = null

function falloffTexture(): CanvasTexture {
  if (!sharedFalloff) sharedFalloff = createFalloffTexture()
  return sharedFalloff
}

/**
 * Washes the area of the map around one point in the accent colour while that
 * point is hovered, focused or open. It sits on the map plane, so it tilts,
 * pans and zooms with the drawing rather than floating over it.
 */
export function PointHighlight({ point, active, z, color }: PointHighlightProps) {
  const meshRef = useRef<Mesh>(null)
  const texture = useMemo(() => falloffTexture(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const material = mesh.material as MeshBasicMaterial
    const target = active ? OPACITY : 0
    material.opacity = lerp(material.opacity, target, EASE)
    mesh.visible = material.opacity > 0.004
  })

  return (
    <mesh
      ref={meshRef}
      position={[point.position[0], point.position[1], z]}
      scale={[RADIUS * 2, RADIUS * 2, 1]}
      visible={false}
      renderOrder={50}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
