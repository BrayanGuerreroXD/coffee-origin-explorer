import { useReducedMotion } from '../../hooks/useReducedMotion'
// Shared stylesheet for the modal and its supporting pieces.
import '../../styles/modal.css'

export interface LoadingIndicatorProps {
  /** Accessible description of what is being loaded. User-visible copy, in Spanish. */
  label?: string
}

/**
 * Calm, low-contrast loading state. It is a live region so assistive tech
 * announces it, but it carries no visible text: the three dots are decorative.
 */
export function LoadingIndicator({ label = 'Cargando contenido' }: LoadingIndicatorProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div
      className="loading-indicator"
      role="status"
      aria-label={label}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <span className="loading-indicator__dot" aria-hidden="true" />
      <span className="loading-indicator__dot" aria-hidden="true" />
      <span className="loading-indicator__dot" aria-hidden="true" />
    </div>
  )
}
