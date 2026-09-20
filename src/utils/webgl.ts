/**
 * Feature detection for WebGL, used to decide between the Three.js scene and
 * the static fallback. It must never throw: some browsers and jsdom raise
 * instead of returning null from `getContext`.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return context != null
  } catch {
    return false
  }
}
