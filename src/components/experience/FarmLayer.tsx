import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { SRGBColorSpace, type Mesh } from 'three'
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

/** One textured plane of the illustrated map, displaced by the shared parallax. */
export function FarmLayer({ src, factor, renderOrder, opacity = 1 }: FarmLayerProps) {
  const meshRef = useRef<Mesh>(null)
  const texture = useTexture(src)
  const size = useThree((state) => state.size)
  const zoom = useThree((state) => state.camera.zoom)
  const parallax = useParallax()
  const { maxX, maxY } = experienceConfig.parallax

  // The plane is a unit quad scaled to cover the viewport plus overscan, so
  // parallax can never drag an empty edge into frame.
  const cover = useMemo(() => layerCoverSize(size, zoom), [size, zoom])

  // Last cover applied imperatively, so the frame loop can re-fit the plane
  // without waiting for a React render when the camera zoom changes.
  const fitted = useRef({ width: 0, height: 0, zoom: 0 })

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    const current = fitted.current
    const cameraZoom = state.camera.zoom
    if (
      current.width !== state.size.width ||
      current.height !== state.size.height ||
      current.zoom !== cameraZoom
    ) {
      current.width = state.size.width
      current.height = state.size.height
      current.zoom = cameraZoom
      // Allocates only when the viewport actually changed, not every frame.
      const next = layerCoverSize(state.size, cameraZoom)
      mesh.scale.set(next.width, next.height, 1)
    }

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
