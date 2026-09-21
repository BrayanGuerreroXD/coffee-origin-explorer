import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { isWebGLAvailable } from '../../utils/webgl'
import { useResponsiveZoom } from '../../hooks/useResponsiveZoom'
import { ParallaxContext, useParallax } from '../../hooks/useParallax'
import type { PointProjection } from '../../hooks/pointProjection'
import type { CameraControl } from '../../hooks/cameraControl'
import type { FarmPoint } from '../../config/types'
import { SCENE_WORLD } from '../../config/scene'
import { fitDistance } from '../../utils/viewport'
import { CameraRig } from './CameraRig'
import { FarmScene } from './FarmScene'
import { SceneFallback } from './SceneFallback'
import '../../styles/scene.css'

export interface SceneCanvasProps {
  className?: string
  /** DOM overlay rendered above the canvas, typically the interest points. */
  children?: ReactNode
  points: FarmPoint[]
  projection: PointProjection
  /** Point whose map area should light up: hovered, focused or open. */
  highlightedPointId: string | null
  /** Point to fly the camera to, or null to return to the framing shot. */
  focusPointId: string | null
  accent: string
  control: CameraControl
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

/** Public entry point of the scene: the WebGL map plus its DOM overlay. */
export function SceneCanvas({
  className,
  children,
  points,
  projection,
  highlightedPointId,
  focusPointId,
  accent,
  control,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { size } = useResponsiveZoom(containerRef)
  const distance = useMemo(() => fitDistance(size), [size])

  useEffect(() => {
    control.setBase(distance)
  }, [control, distance])

  /*
   * Wheel and drag are handled here, on the DOM container, rather than inside
   * the canvas: the gestures belong to the page, and keeping them out of the
   * frame loop means a drag never triggers a React render.
   */
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    let drag: { pointerId: number; x: number; y: number } | null = null

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      control.zoomBy(event.deltaY * 0.0016 * control.base)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      element.setPointerCapture(event.pointerId)
      element.classList.add('scene--grabbing')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      // Pixels to world units at the current distance, so the map keeps pace
      // with the cursor at any zoom level.
      const halfFov = (SCENE_WORLD.fov * Math.PI) / 360
      const worldPerPixel = (2 * control.distance * Math.tan(halfFov)) / element.clientHeight
      control.panBy(
        -(event.clientX - drag.x) * worldPerPixel,
        (event.clientY - drag.y) * worldPerPixel,
      )
      drag.x = event.clientX
      drag.y = event.clientY
    }

    const endDrag = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return
      drag = null
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
      element.classList.remove('scene--grabbing')
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', endDrag)
    element.addEventListener('pointercancel', endDrag)

    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', endDrag)
      element.removeEventListener('pointercancel', endDrag)
    }
  }, [control])

  /*
   * React context does not cross the Canvas boundary: R3F renders its children
   * with its own reconciler root, so a provider outside is invisible inside.
   * The parallax controller is read here and re-provided within the canvas —
   * without this bridge the layers silently read the default still controller
   * and the map never moves, while the DOM points, which live outside, do.
   */
  const parallax = useParallax()

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
              // Perspective, not orthographic: the tilt has to produce real
              // convergence, otherwise the map reads as a flat picture that
              // happens to have been drawn at an angle.
              camera={{ position: [0, 0, distance], fov: SCENE_WORLD.fov, near: 0.1, far: 100 }}
              dpr={[1, 2]}
              // Transparent so the sky gradient on `.scene` shows through
              // wherever the artwork does not reach, which is what keeps a tall
              // phone letterboxed instead of distorted.
              gl={{ antialias: true, alpha: true }}
              shadows={false}
            >
              <ParallaxContext.Provider value={parallax}>
                <CameraRig control={control} focusPointId={focusPointId} projection={projection} />
                <FarmScene
                  points={points}
                  projection={projection}
                  highlightedPointId={highlightedPointId}
                  accent={accent}
                />
              </ParallaxContext.Provider>
            </Canvas>
          </SceneErrorBoundary>
          <div className="scene__overlay">{children}</div>
        </>
      )}
    </div>
  )
}
