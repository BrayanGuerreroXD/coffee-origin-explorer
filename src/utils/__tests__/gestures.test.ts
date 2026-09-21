import { describe, expect, it } from 'vitest'
import { startsMapDrag } from '../gestures'

/**
 * Regression cover for a bug that reached the user: the pan gesture was bound
 * to the scene container, which also holds the marker overlay, so pressing a
 * marker started a drag, the container captured the pointer, and the click
 * never landed. Points stopped opening entirely.
 */
describe('startsMapDrag', () => {
  function build() {
    const scene = document.createElement('div')
    scene.className = 'scene'

    const canvas = document.createElement('canvas')
    scene.append(canvas)

    const overlay = document.createElement('div')
    overlay.className = 'farm-points'

    const marker = document.createElement('button')
    marker.setAttribute('data-farm-point', 'cultivo')

    const dot = document.createElement('span')
    marker.append(dot)
    overlay.append(marker)
    scene.append(overlay)
    document.body.append(scene)

    return { scene, canvas, overlay, marker, dot }
  }

  it('starts a drag on the map itself', () => {
    const { canvas, scene, overlay } = build()
    expect(startsMapDrag(canvas)).toBe(true)
    expect(startsMapDrag(scene)).toBe(true)
    // The overlay is transparent to the pointer, but it is not a marker.
    expect(startsMapDrag(overlay)).toBe(true)
  })

  it('leaves a gesture that began on a marker alone', () => {
    const { marker } = build()
    expect(startsMapDrag(marker)).toBe(false)
  })

  it('also leaves a gesture that began inside a marker alone', () => {
    const { dot } = build()
    expect(startsMapDrag(dot)).toBe(false)
  })

  it('treats a non-element target as map', () => {
    expect(startsMapDrag(null)).toBe(true)
  })
})
