import { useCallback, useState } from 'react'
import { experienceConfig } from '../../config'
import type { FarmPoint } from '../../config/types'
import { ParallaxProvider } from '../../hooks/ParallaxProvider'
import { ExperienceModal } from '../modal/ExperienceModal'
import { FarmPointsOverlay } from './FarmPointsOverlay'
import { SceneCanvas } from './SceneCanvas'
import '../../styles/experience.css'

/**
 * Composition root of the experience.
 *
 * State is deliberately minimal, per the spec: an id and a flag, with the
 * active point derived from the id. `activePointId` is kept while the modal
 * animates out so the exit transition still has content to render; the overlay
 * is told the selection is over immediately so `aria-expanded` stays truthful.
 */
export function FarmExperience() {
  const [activePointId, setActivePointId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const activePoint: FarmPoint | null =
    experienceConfig.points.find((point) => point.id === activePointId) ?? null

  const handleSelect = useCallback((point: FarmPoint) => {
    setActivePointId(point.id)
    setIsModalOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  return (
    <>
      {/*
        The scene is inert while the dialog is open so assistive technology and
        pointer input cannot reach the map behind it. The modal traps keyboard
        focus on its own; this covers everything else.
      */}
      <div className="experience" inert={isModalOpen}>
        <header className="experience__header">
          <h1 className="experience__title">{experienceConfig.title}</h1>
          <p className="experience__location">{experienceConfig.location}</p>
          <p className="experience__subtitle">{experienceConfig.subtitle}</p>
        </header>

        <ParallaxProvider
          className="experience__stage"
          smoothing={experienceConfig.parallax.smoothing}
        >
          <SceneCanvas>
            <FarmPointsOverlay
              points={experienceConfig.points}
              activePointId={isModalOpen ? activePointId : null}
              onSelect={handleSelect}
            />
          </SceneCanvas>
        </ParallaxProvider>

        {/* Two wordings, one per input model: there is no cursor to move on touch. */}
        <p className="experience__hint">
          <span className="experience__hint--pointer">
            Mueve el cursor para recorrer la finca y elige un punto para conocer cada etapa del
            café.
          </span>
          <span className="experience__hint--touch">
            Toca cada punto para conocer las etapas del café.
          </span>
        </p>
      </div>

      <ExperienceModal
        point={activePoint}
        isOpen={isModalOpen}
        onClose={handleClose}
        location={experienceConfig.location}
        backdropBlur={experienceConfig.modalBackdropBlur}
      />
    </>
  )
}
