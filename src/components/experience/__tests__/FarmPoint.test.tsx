import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FarmPoint } from '../FarmPoint'
import type { FarmPoint as FarmPointData } from '../../../config/types'

/** Local fixture: the tests must not depend on the real .env content. */
const POINT: FarmPointData = {
  id: 'cultivo',
  title: 'El cultivo',
  tag: 'Cultivo',
  image: '/img/cultivo.jpg',
  description: 'Las plantas crecen bajo sombra.',
  position: [1.7, 1.1],
  depth: 0.55,
}

describe('FarmPoint', () => {
  it('exposes the title and the tag in its accessible name', () => {
    render(<FarmPoint point={POINT} isActive={false} onSelect={vi.fn()} />)

    const button = screen.getByRole('button', { name: /El cultivo/ })
    expect(button).toHaveAccessibleName('El cultivo — Cultivo')
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('reflects isActive through aria-expanded', () => {
    const { rerender } = render(<FarmPoint point={POINT} isActive={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')

    rerender(<FarmPoint point={POINT} isActive onSelect={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'active')
  })

  it('reveals the label on keyboard focus, not only on hover', async () => {
    const user = userEvent.setup()
    render(<FarmPoint point={POINT} isActive={false} onSelect={vi.fn()} />)

    const label = screen.getByText('El cultivo')
    expect(label).toHaveAttribute('data-visible', 'false')

    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    expect(label).toHaveAttribute('data-visible', 'true')
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'focus')

    await user.tab()
    expect(label).toHaveAttribute('data-visible', 'false')
  })

  it('reveals the label on hover too', async () => {
    const user = userEvent.setup()
    render(<FarmPoint point={POINT} isActive={false} onSelect={vi.fn()} />)

    const label = screen.getByText('El cultivo')
    await user.hover(screen.getByRole('button'))
    expect(label).toHaveAttribute('data-visible', 'true')

    await user.unhover(screen.getByRole('button'))
    expect(label).toHaveAttribute('data-visible', 'false')
  })

  it('keeps the label visible while the point is selected', () => {
    render(<FarmPoint point={POINT} isActive onSelect={vi.fn()} />)

    expect(screen.getByText('El cultivo')).toHaveAttribute('data-visible', 'true')
  })

  it('calls onSelect with its own point on click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<FarmPoint point={POINT} isActive={false} onSelect={onSelect} />)

    await user.click(screen.getByRole('button'))

    expect(onSelect.mock.calls[0][0]).toBe(POINT)
  })

  it('applies the placement style and the accent override', () => {
    render(
      <FarmPoint
        point={{ ...POINT, accent: '#e8a33d' }}
        isActive={false}
        onSelect={vi.fn()}
        style={{ left: '120px', top: '80px' }}
      />,
    )

    const button = screen.getByRole('button')
    expect(button.style.left).toBe('120px')
    expect(button.style.top).toBe('80px')
    expect(button.style.getPropertyValue('--point-accent')).toBe('#e8a33d')
  })
})
