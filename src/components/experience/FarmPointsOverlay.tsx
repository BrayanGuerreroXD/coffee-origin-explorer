import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FarmPoint } from './FarmPoint'
import type { FarmPoint as FarmPointData } from '../../config/types'
import { experienceConfig } from '../../config'
import { LAYER_FACTORS, layerOffset, useParallax } from '../../hooks/useParallax'
import { fitZoom, worldToScreen, type Size } from '../../utils/viewport'
import type { PointProjection } from '../../hooks/pointProjection'

export interface FarmPointsOverlayProps {
  points: FarmPointData[]
  activePointId: string | null
  onSelect: (point: FarmPointData) => void
  className?: string
  /**
   * Screen positions published by the scene. When a projector is driving it,
   * the markers follow the real camera; otherwise they fall back to the flat
   * projection below, which is what the static no-WebGL image needs.
   */
  projection?: PointProjection
  /** Forwarded from each marker, for the map-area highlight. */
  onHoverChange?: (id: string | null) => void
}

const GROUP_LABEL = 'Puntos de interés de la finca'

/**
 * How much a point's own depth is allowed to deviate from the group movement.
 * The spec asks for one coherent layer, not five independently drifting dots,
 * so this only trims a fraction of the shared offset.
 */
const DEPTH_INFLUENCE = 0.35

const EMPTY_SIZE: Size = { width: 0, height: 0 }

/**
 * DOM layer holding the five interest points above the WebGL canvas.
 *
 * It is a sibling of the canvas rather than a set of meshes: focus order, ARIA
 * and keyboard activation come for free, and the points survive the no-WebGL
 * fallback. Pointer movement is applied imperatively to the container, so the
 * parallax never triggers a React render.
 */
export function FarmPointsOverlay({
  points,
  activePointId,
  onSelect,
  className,
  projection,
  onHoverChange,
}: FarmPointsOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>(EMPTY_SIZE)
  const parallax = useParallax()

  const zoom = useMemo(() => fitZoom(size), [size])
  const zoomRef = useRef(zoom)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    }

    // jsdom and very old browsers: a window resize is the best signal available.
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  /*
   * Live path: the scene has projected the points through the real camera, so
   * each marker is placed absolutely from that result. Nothing is transformed
   * here — the tilt and the parallax are already baked into the projection.
   */
  useEffect(() => {
    const element = rootRef.current
    if (!element || !projection) return

    const place = () => {
      if (!projection.live) return
      const markers = element.querySelectorAll<HTMLElement>('[data-farm-point]')
      element.style.transform = ''
      for (const marker of markers) {
        const id = marker.dataset.farmPoint
        const position = id ? projection.positions.get(id) : undefined
        if (!position) continue
        marker.style.left = `${position.left.toFixed(2)}px`
        marker.style.top = `${position.top.toFixed(2)}px`
        marker.style.setProperty('--point-dx', '0px')
        marker.style.setProperty('--point-dy', '0px')
      }
    }

    place()
    return projection.subscribe(place)
  }, [projection, points])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    // The flat fallback only runs when no projector is driving the store.
    if (projection?.live) return

    if (parallax.reducedMotion) {
      element.style.transform = ''
      return
    }

    const markers = Array.from(element.querySelectorAll<HTMLElement>('[data-farm-point]'))
    const depthFactors = points.map(
      (point) => (point.depth / LAYER_FACTORS.points - 1) * DEPTH_INFLUENCE,
    )
    const { maxX, maxY } = experienceConfig.parallax

    const unsubscribe = parallax.subscribe((value) => {
      // A projector may start driving the store after this effect was set up.
      if (projection?.live) return
      const currentZoom = zoomRef.current
      const offset = layerOffset(value, LAYER_FACTORS.points, maxX, maxY)
      // Scene space grows upwards, CSS downwards, hence the flipped Y.
      const x = offset.x * currentZoom
      const y = -offset.y * currentZoom
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
      for (let index = 0; index < markers.length; index += 1) {
        const factor = depthFactors[index] ?? 0
        markers[index].style.setProperty('--point-dx', `${(x * factor).toFixed(2)}px`)
        markers[index].style.setProperty('--point-dy', `${(y * factor).toFixed(2)}px`)
      }
    })

    return () => {
      unsubscribe()
      element.style.transform = ''
    }
  }, [parallax, points, projection])

  return (
    <div
      ref={rootRef}
      className={className ? `farm-points ${className}` : 'farm-points'}
      role="group"
      aria-label={GROUP_LABEL}
    >
      {points.map((point) => {
        const { left, top } = worldToScreen(point.position[0], point.position[1], size, zoom)
        const style = { left: `${left}px`, top: `${top}px` } as CSSProperties
        return (
          <FarmPoint
            key={point.id}
            point={point}
            isActive={point.id === activePointId}
            onSelect={onSelect}
            style={style}
            onHoverChange={onHoverChange}
          />
        )
      })}
    </div>
  )
}
