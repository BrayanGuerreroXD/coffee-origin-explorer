import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImageWithFallback } from '../ImageWithFallback'

const SRC = 'https://example.test/photo.jpg'
const ALT = 'Fotografía de referencia: El cultivo'

describe('ImageWithFallback', () => {
  it('shows the loading state before the image resolves', () => {
    render(<ImageWithFallback src={SRC} alt={ALT} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: ALT })).toBeInTheDocument()
  })

  it('shows the image once it loads', () => {
    render(<ImageWithFallback src={SRC} alt={ALT} />)

    fireEvent.load(screen.getByRole('img', { name: ALT }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const image = screen.getByRole('img', { name: ALT })
    expect(image.tagName).toBe('IMG')
    expect(image).toHaveAttribute('src', SRC)
    expect(image).toHaveAttribute('alt', ALT)
  })

  it('passes decoding and loading hints to the image element', () => {
    render(<ImageWithFallback src={SRC} alt={ALT} />)

    const image = screen.getByRole('img', { name: ALT })
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  it('shows the designed fallback panel when the image fails', () => {
    render(<ImageWithFallback src={SRC} alt={ALT} />)

    fireEvent.error(screen.getByRole('img', { name: ALT }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('No pudimos cargar esta fotografía')).toBeInTheDocument()
    // The description survives the failure.
    expect(screen.getByRole('img', { name: ALT })).toBeInTheDocument()
  })

  it('returns to the loading state when src changes', () => {
    const { rerender } = render(<ImageWithFallback src={SRC} alt={ALT} />)
    fireEvent.load(screen.getByRole('img', { name: ALT }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<ImageWithFallback src="https://example.test/other.jpg" alt={ALT} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
