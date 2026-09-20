import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { experienceConfig } from '../../../config'
import { FarmExperience } from '../FarmExperience'

/**
 * The full flow from the spec, driven through the real configuration.
 *
 * jsdom has no WebGL, so SceneCanvas renders its static fallback here. That is
 * the point: the interest points and the modal must work on that path too.
 */
describe('FarmExperience', () => {
  const pointButtons = () =>
    screen.getAllByRole('button').filter((button) => button.hasAttribute('data-farm-point'))

  it('renders exactly the five configured points', () => {
    render(<FarmExperience />)
    expect(pointButtons()).toHaveLength(5)
    expect(experienceConfig.points).toHaveLength(5)
  })

  it('shows no dialog until a point is chosen', () => {
    render(<FarmExperience />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(experienceConfig.points.map((point) => [point.id, point] as const))(
    'opens the matching content for %s',
    async (_id, point) => {
      const user = userEvent.setup()
      render(<FarmExperience />)

      const button = pointButtons().find((el) => el.dataset.farmPoint === point.id)
      expect(button).toBeDefined()
      await user.click(button as HTMLElement)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(point.title)
      expect(within(dialog).getByText(point.description)).toBeInTheDocument()
      expect(within(dialog).getByRole('img')).toHaveAttribute('src', point.image)
    },
  )

  it('closes on Escape and returns focus to the point that opened it', async () => {
    const user = userEvent.setup()
    render(<FarmExperience />)

    const first = pointButtons()[0]
    await user.click(first)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(first).toHaveFocus())
  })

  it('reports the selection through aria-expanded only while the dialog is open', async () => {
    const user = userEvent.setup()
    render(<FarmExperience />)

    const first = pointButtons()[0]
    expect(first).toHaveAttribute('aria-expanded', 'false')

    await user.click(first)
    await screen.findByRole('dialog')
    expect(first).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(first).toHaveAttribute('aria-expanded', 'false'))
  })

  it('opens a different point after the first one is closed', async () => {
    const user = userEvent.setup()
    render(<FarmExperience />)

    await user.click(pointButtons()[0])
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      experienceConfig.points[0].title,
    )

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(pointButtons()[2])
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      experienceConfig.points[2].title,
    )
  })
})
