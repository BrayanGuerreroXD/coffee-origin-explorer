import {
  Component,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { isWebGLAvailable } from '../../utils/webgl'
import { useResponsiveZoom } from '../../hooks/useResponsiveZoom'
import { FarmScene } from './FarmScene'
import { SceneFallback } from './SceneFallback'
import '../../styles/scene.css'

export interface SceneCanvasProps {
  className?: string
  /** DOM overlay rendered above the canvas, typically the interest points. */
  children?: ReactNode
}

interface SceneErrorBoundaryProps {
  children: ReactNode
  onError: () => void
}

/**
 * Catches a renderer failure at runtime — a lost or refused WebGL context makes
 * R3F throw during render — so the experience degrades to the static map
 * instead of blanking the page.
 */
class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The WebGL scene failed, falling back to the static map.', error, info)
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Keeps the camera fitted to the container.
 *
 * The zoom is mutated rather than re-keyed: R3F only applies the `camera` prop
 * when it builds the camera, and re-keying would tear down and rebuild the
 * camera on every resize tick. Mutating plus `updateProjectionMatrix` is the
 * cheap path. It runs in the frame loop, not an effect, so the projection is
 * updated on the camera the renderer is about to use and nothing is mutated
 * during React's commit phase.
 */
function CameraZoomSync({ zoom }: { zoom: number }) {
  useFrame((state) => {
    if (state.camera.zoom === zoom) return
    state.camera.zoom = zoom
    state.camera.updateProjectionMatrix()
  })

  return null
}

/** Public entry point of the scene: the WebGL map plus its DOM overlay. */
export function SceneCanvas({ className, children }: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { zoom } = useResponsiveZoom(containerRef)

  // Detected once: the answer cannot change while the page is open.
  const supported = useMemo(() => isWebGLAvailable(), [])
  const [failed, setFailed] = useState(false)
  const onError = useCallback(() => setFailed(true), [])

  const usesFallback = !supported || failed

  return (
    <div ref={containerRef} className={className ? `scene ${className}` : 'scene'}>
      {usesFallback ? (
        <SceneFallback>{children}</SceneFallback>
      ) : (
        <>
          <SceneErrorBoundary onError={onError}>
            <Canvas
              className="scene__canvas"
              // R3F writes `position: relative; width: 100%; height: 100%` inline
              // on its wrapper, and a stylesheet rule cannot outrank that. The
              // percentage height never resolves here, because `.scene` gets its
              // height from the flex row rather than from a definite `height`, so
              // the wrapper collapsed and the canvas fell back to its 150px
              // intrinsic default. Overriding through the style prop, which R3F
              // merges after its own defaults, gives it a definite box to measure.
              style={{ position: 'absolute', inset: 0 }}
              orthographic
              camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom }}
              dpr={[1, 2]}
              // Transparent so the sky gradient on `.scene` shows through
              // wherever the artwork does not reach, which is what keeps a tall
              // phone letterboxed instead of distorted.
              gl={{ antialias: true, alpha: true }}
              shadows={false}
            >
              <CameraZoomSync zoom={zoom} />
              <FarmScene />
            </Canvas>
          </SceneErrorBoundary>
          <div className="scene__overlay">{children}</div>
        </>
      )}
    </div>
  )
}
