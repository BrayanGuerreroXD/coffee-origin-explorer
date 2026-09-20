import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParallaxProvider } from '../ParallaxProvider'
import {
  LAYER_FACTORS,
  layerOffset,
  useParallax,
  type ParallaxVector,
} from '../useParallax'

describe('useParallax outside a provider', () => {
  it('returns a still controller so components stay renderable in isolation', () => {
    const { result } = renderHook(() => useParallax())

    expect(result.current.value).toEqual({ x: 0, y: 0 })
    expect(result.current.reducedMotion).toBe(true)
  })

  it('returns a subscribe that hands back a callable unsubscribe', () => {
    const { result } = renderHook(() => useParallax())

    const unsubscribe = result.current.subscribe(() => {})

    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe('layerOffset', () => {
  it('scales the value by the factor and by maxX / maxY', () => {
    const value: ParallaxVector = { x: 1, y: -1 }

    expect(layerOffset(value, 0.5, 0.4, 0.2)).toEqual({ x: 0.2, y: -0.1 })
  })

  it('scales each axis independently', () => {
    const offset = layerOffset({ x: 0.5, y: 0.25 }, 1, 2, 8)

    expect(offset.x).toBeCloseTo(1, 10)
    expect(offset.y).toBeCloseTo(2, 10)
  })

  it('returns zero displacement for a zero factor', () => {
    expect(layerOffset({ x: 1, y: 1 }, 0, 10, 10)).toEqual({ x: 0, y: 0 })
  })

  it('returns zero displacement for a centred pointer', () => {
    expect(layerOffset({ x: 0, y: 0 }, 1, 10, 10)).toEqual({ x: 0, y: 0 })
  })
})

describe('LAYER_FACTORS', () => {
  const ORDER = ['paper', 'map', 'points', 'foreground'] as const

  it('covers exactly the known layers', () => {
    expect(Object.keys(LAYER_FACTORS).sort()).toEqual([...ORDER].sort())
  })

  it('increases strictly from background to foreground', () => {
    // The depth illusion depends on this: deeper layers must move less.
    const factors = ORDER.map((name) => LAYER_FACTORS[name])

    for (let i = 1; i < factors.length; i += 1) {
      expect(factors[i]).toBeGreaterThan(factors[i - 1])
    }
  })

  it('keeps every factor inside (0, 1]', () => {
    for (const name of ORDER) {
      expect(LAYER_FACTORS[name]).toBeGreaterThan(0)
      expect(LAYER_FACTORS[name]).toBeLessThanOrEqual(1)
    }
  })
})

// --- ParallaxProvider ------------------------------------------------------

interface PendingFrame {
  id: number
  callback: FrameRequestCallback
}

let frames: PendingFrame[] = []
let nextFrameId = 1
let cancelSpy: ReturnType<typeof vi.fn>

/** Runs every frame currently queued. The loop re-queues itself as it runs. */
function runFrame(): void {
  const pending = frames
  frames = []
  act(() => {
    for (const frame of pending) frame.callback(0)
  })
}

function installMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
}

/** jsdom reports a zero-sized rect, which normalizePointer maps to (0, 0). */
function stubRect(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

function dispatchPointerMove(
  element: Element,
  clientX: number,
  clientY: number,
  pointerType = 'mouse',
): void {
  const init = { clientX, clientY, bubbles: true, pointerType }
  const event =
    typeof window.PointerEvent === 'function'
      ? new window.PointerEvent('pointermove', init)
      : Object.assign(new MouseEvent('pointermove', init), { pointerType })
  act(() => {
    element.dispatchEvent(event)
  })
}

beforeEach(() => {
  frames = []
  nextFrameId = 1
  cancelSpy = vi.fn((id: number) => {
    frames = frames.filter((frame) => frame.id !== id)
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.push({ id, callback })
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', cancelSpy)
  installMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParallaxProvider', () => {
  function mount(smoothing = 0.5) {
    const seen: ParallaxVector[] = []
    let controller: ReturnType<typeof useParallax> | undefined

    function Probe() {
      controller = useParallax()
      return null
    }

    const utils = render(
      <ParallaxProvider smoothing={smoothing} className="host">
        <Probe />
      </ParallaxProvider>,
    )

    const host = utils.container.querySelector('.host') as HTMLDivElement
    expect(host).not.toBeNull()
    stubRect(host, 200, 100)

    if (!controller) throw new Error('the probe never received a controller')
    const unsubscribe = controller.subscribe((value) => {
      seen.push({ x: value.x, y: value.y })
    })

    return { ...utils, host, controller, seen, unsubscribe }
  }

  it('starts its animation loop on mount', () => {
    mount()
    expect(frames).toHaveLength(1)
  })

  it('reports reducedMotion from the media query', () => {
    const { controller } = mount()
    expect(controller.reducedMotion).toBe(false)
  })

  it('notifies subscribers once per frame', () => {
    const { seen } = mount()

    runFrame()
    runFrame()

    expect(seen).toHaveLength(2)
  })

  it('moves the published value towards the pointer without jumping to it', () => {
    const { host, controller, seen } = mount(0.5)

    // Right edge, top edge: normalized target is (1, 1).
    dispatchPointerMove(host, 200, 0)

    runFrame()
    expect(seen).toHaveLength(1)
    expect(seen[0].x).toBeCloseTo(0.5, 10)
    expect(seen[0].y).toBeCloseTo(0.5, 10)
    expect(seen[0].x).toBeLessThan(1)
    expect(controller.value.x).toBeCloseTo(0.5, 10)

    runFrame()
    expect(seen[1].x).toBeCloseTo(0.75, 10)
    expect(seen[1].x).toBeGreaterThan(seen[0].x)
    expect(seen[1].x).toBeLessThan(1)

    runFrame()
    expect(seen[2].x).toBeCloseTo(0.875, 10)
    expect(seen[2].x).toBeLessThan(1)
  })

  it('approaches but never overshoots the pointer target', () => {
    const { host, controller } = mount(0.2)

    dispatchPointerMove(host, 200, 100) // target (1, -1)

    for (let i = 0; i < 40; i += 1) runFrame()

    expect(controller.value.x).toBeGreaterThan(0.9)
    expect(controller.value.x).toBeLessThanOrEqual(1)
    expect(controller.value.y).toBeLessThan(-0.9)
    expect(controller.value.y).toBeGreaterThanOrEqual(-1)
  })

  it('returns towards the centre when the pointer leaves', () => {
    const { host, controller } = mount(0.5)

    dispatchPointerMove(host, 200, 0)
    for (let i = 0; i < 10; i += 1) runFrame()
    const reached = controller.value.x
    expect(reached).toBeGreaterThan(0.9)

    act(() => {
      host.dispatchEvent(new Event('pointerleave'))
    })
    runFrame()

    expect(controller.value.x).toBeLessThan(reached)
  })

  it('ignores touch pointers', () => {
    const { host, controller } = mount(0.5)

    dispatchPointerMove(host, 200, 0, 'touch')
    runFrame()

    expect(controller.value.x).toBe(0)
    expect(controller.value.y).toBe(0)
  })

  it('stops notifying a listener that unsubscribed', () => {
    const { host, seen, unsubscribe } = mount()

    dispatchPointerMove(host, 200, 0)
    runFrame()
    expect(seen).toHaveLength(1)

    unsubscribe()
    runFrame()
    runFrame()

    expect(seen).toHaveLength(1)
  })

  it('removes its listeners and cancels its frame on unmount', () => {
    const { host, unmount, seen } = mount()

    const removeSpy = vi.spyOn(host, 'removeEventListener')
    runFrame()
    const before = seen.length

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerleave', expect.any(Function))
    expect(cancelSpy).toHaveBeenCalled()

    // No frame is left queued, and a late pointer event changes nothing.
    expect(frames).toHaveLength(0)
    dispatchPointerMove(host, 200, 0)
    runFrame()
    expect(seen).toHaveLength(before)
  })

  it('stays still when the user asked for reduced motion', () => {
    installMatchMedia(true)
    const { host, controller } = mount(0.5)

    expect(controller.reducedMotion).toBe(true)

    dispatchPointerMove(host, 200, 0)
    runFrame()
    runFrame()

    expect(controller.value.x).toBe(0)
    expect(controller.value.y).toBe(0)
  })
})
