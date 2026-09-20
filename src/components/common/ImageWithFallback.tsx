import { useState } from 'react'
import { LoadingIndicator } from './LoadingIndicator'
import '../../styles/modal.css'

export interface ImageWithFallbackProps {
  src: string
  /** Required: the image always carries a description, in every state. */
  alt: string
  className?: string
}

type ImageStatus = 'loading' | 'loaded' | 'error'

/**
 * Photo with an explicit loading state and a designed error panel, so the
 * browser's broken-image glyph never reaches the user.
 */
export function ImageWithFallback({ src, alt, className }: ImageWithFallbackProps) {
  const [status, setStatus] = useState<ImageStatus>('loading')

  // Reset while rendering rather than in an effect: a new src means the old
  // status is stale immediately, with no intermediate paint.
  const [renderedSrc, setRenderedSrc] = useState(src)
  if (src !== renderedSrc) {
    setRenderedSrc(src)
    setStatus('loading')
  }

  const rootClassName = ['image-frame', className].filter(Boolean).join(' ')

  if (status === 'error') {
    return (
      <div className={rootClassName} data-status="error">
        <div className="image-frame__fallback" role="img" aria-label={alt}>
          <span className="image-frame__bean" aria-hidden="true" />
          <p className="image-frame__caption">No pudimos cargar esta fotografía</p>
        </div>
      </div>
    )
  }

  return (
    <div className={rootClassName} data-status={status}>
      {status === 'loading' && (
        <div className="image-frame__placeholder">
          <LoadingIndicator label="Cargando fotografía" />
        </div>
      )}
      <img
        className="image-frame__img"
        src={src}
        alt={alt}
        decoding="async"
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  )
}
