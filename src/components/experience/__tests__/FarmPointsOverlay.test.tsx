import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FarmPointsOverlay } from '../FarmPointsOverlay'
import type { FarmPoint } from '../../../config/types'

/** Local fixture: the tests must not depend on the real .env content. */
const POINTS: FarmPoint[] = [
  {
    id: 'cultivo',
    title: 'El cultivo',
    tag: 'Cultivo',
    image: '/img/cultivo.jpg',
    description: 'Las plantas crecen bajo sombra.',
    position: [1.7, 1.1],
    depth: 0.55,
  },
  {
    id: 'cosecha',
    title: 'La cosecha',
    tag: 'Cosecha',
    image: '/img/cosecha.jpg',
    description: 'Recolección grano a grano.',
    position: [-1.3, 0.8],
    depth: 0.6,
  },
  {
    id: 'beneficio',
    title: 'El beneficio',
    tag: 'Beneficio',
    image: '/img/beneficio.jpg',
    description: 'Despulpado y fermentación.',
    position: [0.25, -0.05],
    depth: 0.65,
  },
  {
    id: 'secado',
    title: 'El secado',
    tag: 'Secado',
    image: '/img/secado.jpg',
    description: 'Secado al sol en marquesina.',
    position: [-1.75, -1.35],
    depth: 0.7,
    accent: '#e8a33d',
  },
  {
    id: 'empaque',
    title: 'El empaque',
    tag: 'Empaque',
    image: '/img/empaque.jpg',
    description: 'Trilla, selección y empaque.',
    position: [1.65, -1.4],
    depth: 0.75,
    labelOffset: [0, 4],
  },
]

function renderOverlay(overrides: Partial<Parameters<typeof FarmPointsOverlay>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <FarmPointsOverlay points={POINTS} activePointId={null} onSelect={onSelect} {...overrides} />,
  )
  return { onSelect }
}

describe('FarmPointsOverlay', () => {
  it('renders one button per point inside a labelled group', () => {
    renderOverlay()

    const group = screen.getByRole('group', { name: 'Puntos de interés de la finca' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('gives every button the accessible name of its point', () => {
    renderOverlay()

    for (const point of POINTS) {
      expect(
        screen.getByRole('button', { name: `${point.title} — ${point.tag}` }),
      ).toBeInTheDocument()
    }
  })

  it('keeps the DOM order of the points array', () => {
    renderOverlay()

    const ids = screen.getAllByRole('button').map((button) => button.dataset.farmPoint)
    expect(ids).toEqual(POINTS.map((point) => point.id))
  })

  it('calls onSelect with the clicked point', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderOverlay()

    await user.click(screen.getByRole('button', { name: 'El beneficio — Beneficio' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0]).toBe(POINTS[2])
  })

  it('reaches every button with Tab, in array order', async () => {
    const user = userEvent.setup()
    renderOverlay()

    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      await user.tab()
      expect(button).toHaveFocus()
    }
  })

  it('activates a focused point with Enter and with Space', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderOverlay()

    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'La cosecha — Cosecha' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onSelect.mock.calls[0][0]).toBe(POINTS[1])

    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect.mock.calls[1][0]).toBe(POINTS[1])
  })

  it('marks only the active point as expanded', () => {
    renderOverlay({ activePointId: 'secado' })

    expect(screen.getByRole('button', { name: 'El secado — Secado' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'El cultivo — Cultivo' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
