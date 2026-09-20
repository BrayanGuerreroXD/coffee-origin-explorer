export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * clamp(alpha, 0, 1)
}

/**
 * Maps a coordinate inside a box to the [-1, 1] range used by the parallax.
 * Y is flipped so that positive means "towards the top of the screen", which
 * matches scene-space rather than DOM-space.
 */
export function normalizePointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
  const x = ((clientX - rect.left) / rect.width) * 2 - 1
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1)
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
}
