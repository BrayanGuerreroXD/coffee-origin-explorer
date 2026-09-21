/**
 * Whether a pointerdown should begin a map drag.
 *
 * The markers live in an overlay inside the scene container, so their
 * pointerdown bubbles up to it. Capturing that gesture would retarget every
 * later pointer event to the container, and the button would never receive its
 * click — which is exactly how panning silently broke opening a point.
 */
export function startsMapDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return target.closest('[data-farm-point]') === null
}
