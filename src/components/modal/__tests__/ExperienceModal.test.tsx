import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExperienceModal } from '../ExperienceModal'
import type { FarmPoint } from '../../../config/types'

const POINT: FarmPoint = {
  id: 'cultivo',
  title: 'El cultivo',
  tag: 'Cultivo',
  image: 'https://example.test/cultivo.jpg',
  description: 'Aquí comienza todo.\nLa segunda línea del texto.',
  position: [1.7, 1.1],
  depth: 0.55,
}

const LOCATION = 'Gramalote · Norte de Santander'

function renderModal(overrides: Partial<Parameters<typeof ExperienceModal>[0]> = {}) {
  const onClose = vi.fn()
  const props = { point: POINT, isOpen: true, onClose, location: LOCATION, ...overrides }
  const view = render(<ExperienceModal {...props} />)
  return { ...view, onClose }
}

describe('ExperienceModal', () => {
  it('renders the point title, tag, description and image when open', async () => {
    renderModal()

    expect(await screen.findByRole('heading', { name: 'El cultivo' })).toBeInTheDocument()
    expect(screen.getByText('Cultivo')).toBeInTheDocument()
    expect(screen.getByText(/Aquí comienza todo/)).toBeInTheDocument()
    expect(screen.getByText(/La segunda línea del texto/)).toBeInTheDocument()
    expect(screen.getByText(LOCATION)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /El cultivo/ })).toHaveAttribute('src', POINT.image)
  })

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.modal-backdrop')).toBeNull()
  })

  it('renders nothing when there is no point', () => {
    renderModal({ point: null })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes a dialog labelled by its title and described by its text', async () => {
    renderModal()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    const title = screen.getByRole('heading', { name: 'El cultivo' })
    expect(dialog).toHaveAttribute('aria-labelledby', title.id)

    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Aquí comienza todo')
  })

  it('moves focus into the dialog when it opens', async () => {
    renderModal()

    const closeButton = await screen.findByRole('button', { name: /cerrar/i })
    expect(closeButton).toHaveFocus()
    expect(screen.getByRole('dialog')).toContainElement(closeButton)
  })

  it('closes when the close button is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(await screen.findByRole('button', { name: /cerrar/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop itself is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await screen.findByRole('dialog')

    await user.click(screen.getByTestId('modal-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the click lands inside the panel', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(await screen.findByRole('heading', { name: 'El cultivo' }))
    await user.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('applies the backdrop blur when one is configured', async () => {
    renderModal({ backdropBlur: 6 })

    await screen.findByRole('dialog')
    expect(screen.getByTestId('modal-backdrop')).toHaveStyle({ backdropFilter: 'blur(6px)' })
  })
})
