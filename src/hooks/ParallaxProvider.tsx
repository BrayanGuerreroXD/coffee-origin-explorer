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

/** Mutable, non-rendering state of the loop. Never read during render. */
interface ParallaxStore {
  value: ParallaxVector
  target: ParallaxVector
  listeners: Set<(value: ParallaxVector) => void>
}

function createStore(): ParallaxStore {
  return { value: { x: 0, y: 0 }, target: { x: 0, y: 0 }, listeners: new Set() }
}

/**
 * Owns the single pointer listener and the single animation loop of the
 * experience, and publishes the smoothed value through context.
 *
 * The mutable state lives in a ref, which is the right primitive for data that
 * must never cause a render. The controller reaches it through a getter rather
 * than by capturing `ref.current` during render, so nothing reads the ref while
 * rendering and consumers still see the latest frame.
 *
 * Touch input is deliberately ignored: on a touch device there is no hovering
 * pointer to follow, and dragging the scene is out of scope for V1.
 */
export function ParallaxProvider({ children, smoothing = 0.08, className }: ParallaxProviderProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const storeRef = useRef<ParallaxStore>(createStore())
  const reducedMotion = useReducedMotion()

  const controller = useMemo<ParallaxController>(
    () => ({
      get value() {
        return storeRef.current.value
      },
      reducedMotion,
      subscribe(listener) {
        const { listeners } = storeRef.current
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }),
    [reducedMotion],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    if (reducedMotion) {
      storeRef.current.target.x = 0
      storeRef.current.target.y = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === 'touch') return
      const next = normalizePointer(event.clientX, event.clientY, host.getBoundingClientRect())
      storeRef.current.target.x = next.x
      storeRef.current.target.y = next.y
    }

    const onPointerLeave = () => {
      storeRef.current.target.x = 0
      storeRef.current.target.y = 0
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
      const { value, target, listeners } = storeRef.current
      value.x = lerp(value.x, target.x, smoothing)
      value.y = lerp(value.y, target.y, smoothing)
      for (const listener of listeners) listener(value)
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
