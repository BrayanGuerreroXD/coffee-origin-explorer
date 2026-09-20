import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {}
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return supported() ? window.matchMedia(QUERY).matches : false
}

/**
 * Tracks the OS "reduce motion" setting and keeps following it if the user
 * changes it while the page is open.
 *
 * Uses useSyncExternalStore rather than an effect: the preference is external
 * state that already exists when the first render happens, so reading it in an
 * effect and calling setState would render the animated version for one frame
 * to exactly the people who asked not to see it.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
