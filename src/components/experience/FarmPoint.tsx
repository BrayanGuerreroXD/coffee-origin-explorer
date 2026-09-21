import { useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import type { FarmPoint as FarmPointData } from '../../config/types'
import { experienceConfig } from '../../config'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import '../../styles/points.css'

export interface FarmPointProps {
  point: FarmPointData
  isActive: boolean
  onSelect: (point: FarmPointData) => void
  /** Absolute placement handed down by the overlay, in pixels. */
  style?: CSSProperties
  /** Reports hover and keyboard focus so the map can light up the matching area. */
  onHoverChange?: (id: string | null) => void
}

/** Hover scale duration, inside the 180-240ms band of the spec timing table. */
const HOVER_DURATION_S = 0.2
const EASE_OUT = [0.22, 1, 0.36, 1] as const

type PointState = 'rest' | 'hover' | 'focus' | 'active'

/**
 * One interest point as a real DOM button.
 *
 * The visual dot is deliberately smaller than the button: the button carries
 * the 48px hit area required by section 13, the dot carries the illustration.
 * Hover and keyboard focus produce the same visual state, so no information is
 * hover-only.
 */
export function FarmPoint({ point, isActive, onSelect, style, onHoverChange }: FarmPointProps) {
  const [isHovered, setHovered] = useState(false)
  const [isFocused, setFocused] = useState(false)
  const reducedMotion = useReducedMotion()

  const highlighted = isActive || isHovered || isFocused
  const state: PointState = isActive ? 'active' : isFocused ? 'focus' : isHovered ? 'hover' : 'rest'
  const showPulse = experienceConfig.pointPulseEnabled && !reducedMotion && !highlighted

  const rootStyle = { ...style } as unknown as Record<string, string>
  if (point.accent) rootStyle['--point-accent'] = point.accent
  if (point.labelOffset) {
    rootStyle['--label-dx'] = `${point.labelOffset[0]}px`
    rootStyle['--label-dy'] = `${point.labelOffset[1]}px`
  }

  return (
    <button
      type="button"
      className="farm-point"
      data-farm-point={point.id}
      data-state={state}
      style={rootStyle as CSSProperties}
      aria-label={`${point.title} — ${point.tag}`}
      aria-haspopup="dialog"
      aria-expanded={isActive}
      onClick={() => onSelect(point)}
      onPointerEnter={() => {
        setHovered(true)
        onHoverChange?.(point.id)
      }}
      onPointerLeave={() => {
        setHovered(false)
        onHoverChange?.(null)
      }}
      onFocus={() => {
        setFocused(true)
        onHoverChange?.(point.id)
      }}
      onBlur={() => {
        setFocused(false)
        onHoverChange?.(null)
      }}
    >
      <span className="farm-point__halo" aria-hidden="true" />
      {showPulse ? <span className="farm-point__pulse" aria-hidden="true" /> : null}
      <motion.span
        className="farm-point__dot"
        aria-hidden="true"
        animate={{ scale: highlighted ? 1.22 : 1 }}
        transition={{ duration: reducedMotion ? 0 : HOVER_DURATION_S, ease: EASE_OUT }}
      />
      <span className="farm-point__label">
        <span className="farm-point__label-text" data-visible={highlighted ? 'true' : 'false'}>
          {point.title}
        </span>
      </span>
    </button>
  )
}
