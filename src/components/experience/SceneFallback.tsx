import type { ReactNode } from 'react'
import { experienceConfig } from '../../config'
import '../../styles/scene.css'

export interface SceneFallbackProps {
  className?: string
  /** DOM overlay, so the interest points keep working without WebGL. */
  children?: ReactNode
}

/**
 * Shown when WebGL is unavailable or the renderer fails. A static image of the
 * map with the same overlay on top: the spec forbids ever leaving a blank screen.
 * No Three.js may be imported here — this file has to render when WebGL cannot.
 */
export function SceneFallback({ className, children }: SceneFallbackProps) {
  return (
    <div className={className ? `scene-fallback ${className}` : 'scene-fallback'}>
      <img
        className="scene-fallback__image"
        src={experienceConfig.layers.background}
        alt={`Ilustración de la finca cafetera en ${experienceConfig.location}`}
      />
      <p className="scene-fallback__note" role="status">
        La versión animada del mapa no está disponible en este dispositivo. Se muestra una imagen
        fija de la finca; los puntos de interés siguen funcionando.
      </p>
      <div className="scene-fallback__overlay">{children}</div>
    </div>
  )
}
