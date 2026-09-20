import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneFallback } from '../SceneFallback'
import { experienceConfig } from '../../../config'

describe('SceneFallback', () => {
  it('renders the background illustration with a descriptive alt', () => {
    render(<SceneFallback />)

    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('src', experienceConfig.layers.background)
    expect(image.getAttribute('alt')).toContain(experienceConfig.location)
  })

  it('keeps the overlay children visible', () => {
    render(
      <SceneFallback>
        <button type="button">Ver el cultivo</button>
      </SceneFallback>,
    )

    expect(screen.getByRole('button', { name: 'Ver el cultivo' })).toBeInTheDocument()
  })

  it('announces that the animated version is unavailable', () => {
    render(<SceneFallback />)

    expect(screen.getByRole('status')).toHaveTextContent(/no está disponible/i)
  })
})
