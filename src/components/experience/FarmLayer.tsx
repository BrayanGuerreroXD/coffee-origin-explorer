import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { SRGBColorSpace, type Mesh, type Texture } from 'three'
import { experienceConfig } from '../../config'
import { layerCoverSize } from '../../utils/viewport'
import { layerOffset, useParallax } from '../../hooks/useParallax'

export interface FarmLayerProps {
  /** Texture URL, taken from the environment-driven config. */
  src: string
  /** Parallax factor of this layer, see LAYER_FACTORS. */
  factor: number
  /** Draw order, back to front. Also derives the plane's Z offset. */
  renderOrder: number
  opacity?: number
}

/**
 * Distance between consecutive layers on the Z axis. Under an orthographic
 * camera this only disambiguates depth sorting; it produces no perspective.
 */
const Z_STEP = 0.01

function textureAspect(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined
  if (!image?.width || !image?.height) return 1
  return image.width / image.height
}

/** One textured plane of the illustrated map, displaced by the shared parallax. */
export function FarmLayer({ src, factor, renderOrder, opacity = 1 }: FarmLayerProps) {
  const meshRef = useRef<Mesh>(null)
  const texture = useTexture(src)
  const parallax = useParallax()
  const { maxX, maxY } = experienceConfig.parallax

  // Sized from the artwork's own aspect ratio and the world box, not from the
  // viewport, so the illustration is never distorted and stays in register with
  // the interest points whatever the screen shape.
  const cover = useMemo(() => layerCoverSize(textureAspect(texture)), [texture])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    if (parallax.reducedMotion) {
      mesh.position.x = 0
      mesh.position.y = 0
      return
    }

    const offset = layerOffset(parallax.value, factor, maxX, maxY)
    // Opposite to the pointer: the map appears to sit behind the cursor, and
    // the difference in speed between layers is what reads as depth.
    mesh.position.x = -offset.x
    mesh.position.y = -offset.y
  })

  return (
    <mesh
      ref={meshRef}
      renderOrder={renderOrder}
      position-z={renderOrder * Z_STEP}
      scale={[cover.width, cover.height, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        // The renderer outputs sRGB; without this the illustration looks washed out.
        map-colorSpace={SRGBColorSpace}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
