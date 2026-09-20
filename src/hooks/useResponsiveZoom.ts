import { useEffect, useMemo, useState, type RefObject } from 'react'
import { fitZoom, type Size } from '../utils/viewport'

export interface ResponsiveZoom {
  /** Pixels per world unit for the orthographic camera. */
  zoom: number
  /** Last measured size of the observed element, in CSS pixels. */
  size: Size
}

const EMPTY: Size = { width: 0, height: 0 }

/**
 * Keeps the orthographic zoom fitted to the container, so the whole map stays
 * visible on any screen. A fixed zoom would crop a different part of the
 * illustration on every viewport.
 */
export function useResponsiveZoom(ref: RefObject<HTMLElement | null>): ResponsiveZoom {
  const [size, setSize] = useState<Size>(EMPTY)

  useEffect(() => {
    const element = ref.current
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

    // jsdom and older browsers have no ResizeObserver; the window resize event
    // is a coarser but sufficient substitute for a full-bleed container.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  const zoom = useMemo(() => fitZoom(size), [size])

  return { zoom, size }
}
