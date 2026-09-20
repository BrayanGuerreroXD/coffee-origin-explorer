import { ImageWithFallback } from '../common/ImageWithFallback'
import type { FarmPoint } from '../../config/types'

export interface ModalContentProps {
  point: FarmPoint
  location: string
  titleId: string
  descriptionId: string
}

/**
 * Pure presentation of a single interest point, following the content sketch
 * in the spec: eyebrow tag, photo, title, divider, description, location.
 */
export function ModalContent({ point, location, titleId, descriptionId }: ModalContentProps) {
  return (
    <div className="modal-content">
      <p className="modal-content__eyebrow">{point.tag}</p>

      <ImageWithFallback
        className="modal-content__image"
        src={point.image}
        alt={`Fotografía de referencia: ${point.title}`}
      />

      <h2 className="modal-content__title" id={titleId}>
        {point.title}
      </h2>

      <hr className="modal-content__divider" />

      <p className="modal-content__description" id={descriptionId}>
        {point.description}
      </p>

      <p className="modal-content__location">{location}</p>
    </div>
  )
}
