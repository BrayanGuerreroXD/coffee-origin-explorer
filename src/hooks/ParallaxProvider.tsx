import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ParallaxContext, type ParallaxController, type ParallaxVector } from './useParallax'
import { useReducedMotion } from './useReducedMotion'
import { lerp, normalizePointer } from '../utils/math'

export interface ParallaxProviderProps {
  children: ReactNode
  /** Lerp factor per frame. Lower is softer. */
  smoothing?: number
  /** Element the pointer is tracked against. Defaults to the provider wrapper. */
  className?: string
}

/**
 * Owns the single pointer listener and the single animation loop of the
 * experience, and publishes the smoothed value through context.
 *
 * Touch input is deliberately ignored: on a touch device there is no hovering
 * pointer to follow, and dragging the scene is out of scope for V1.
 */
export function ParallaxProvider({ children, smoothing = 0.08, className }: ParallaxProviderProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const target = useRef<ParallaxVector>({ x: 0, y: 0 })
  const current = useRef<ParallaxVector>({ x: 0, y: 0 })
  const listeners = useRef(new Set<(value: ParallaxVector) => void>())
  const reducedMotion = useReducedMotion()

  const controller = useMemo<ParallaxController>(
    () => ({
      value: current.current,
      reducedMotion,
      subscribe(listener) {
        listeners.current.add(listener)
        return () => {
          listeners.current.delete(listener)
        }
      },
    }),
    [reducedMotion],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    if (reducedMotion) {
      target.current.x = 0
      target.current.y = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === 'touch') return
      const next = normalizePointer(event.clientX, event.clientY, host.getBoundingClientRect())
      target.current.x = next.x
      target.current.y = next.y
    }

    const onPointerLeave = () => {
      target.current.x = 0
      target.current.y = 0
    }

    host.addEventListener('pointermove', onPointerMove, { passive: true })
    host.addEventListener('pointerleave', onPointerLeave)
    return () => {
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [reducedMotion])

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const value = current.current
      value.x = lerp(value.x, target.current.x, smoothing)
      value.y = lerp(value.y, target.current.y, smoothing)
      for (const listener of listeners.current) listener(value)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [smoothing])

  return (
    <ParallaxContext.Provider value={controller}>
      <div ref={hostRef} className={className}>
        {children}
      </div>
    </ParallaxContext.Provider>
  )
}
