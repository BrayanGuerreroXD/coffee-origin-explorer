import { useCallback, useEffect, useId, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ModalContent } from './ModalContent'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { FarmPoint } from '../../config/types'
import '../../styles/modal.css'

export interface ExperienceModalProps {
  point: FarmPoint | null
  isOpen: boolean
  onClose: () => void
  location: string
  /** Blur radius in pixels applied to the backdrop. */
  backdropBlur?: number
}

type Bezier = [number, number, number, number]

/**
 * Motion values mirror the timing tokens in styles/tokens.css, in seconds,
 * because the Motion API takes numbers rather than CSS durations.
 */
const MOTION: {
  backdropIn: number
  panelIn: number
  out: number
  easeOut: Bezier
  easeIn: Bezier
} = {
  backdropIn: 0.26,
  panelIn: 0.42,
  out: 0.22,
  easeOut: [0.22, 1, 0.36, 1],
  easeIn: [0.6, 0, 0.98, 0.6],
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ExperienceModal({
  point,
  isOpen,
  onClose,
  location,
  backdropBlur = 0,
}: ExperienceModalProps) {
  const reducedMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const baseId = useId()
  const titleId = `${baseId}-title`
  const descriptionId = `${baseId}-description`

  const open = isOpen && point !== null

  // Focus handover, scroll lock and the key handlers all share the open/close
  // lifecycle, so they live in one effect with one symmetric cleanup.
  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    returnFocusRef.current = previouslyFocused

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!active || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus?.()
      returnFocusRef.current = null
    }
  }, [open, onClose])

  const onBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      // Only a click that both starts and ends on the backdrop closes it. Using
      // the target/currentTarget identity instead of stopPropagation keeps a
      // text selection that is released outside the panel from closing it.
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  const backdropTransition = reducedMotion
    ? { duration: 0 }
    : { duration: MOTION.backdropIn, ease: MOTION.easeOut }

  const panelTransition = reducedMotion
    ? { duration: 0 }
    : { duration: MOTION.panelIn, ease: MOTION.easeOut }

  const exitTransition = reducedMotion
    ? { duration: 0 }
    : { duration: MOTION.out, ease: MOTION.easeIn }

  const panelMotion = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 8 },
      }

  return createPortal(
    <AnimatePresence>
      {open && point ? (
        <motion.div
          className="modal-backdrop"
          data-testid="modal-backdrop"
          onClick={onBackdropClick}
          style={backdropBlur > 0 ? { backdropFilter: `blur(${backdropBlur}px)` } : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitTransition }}
          transition={backdropTransition}
        >
          <motion.div
            ref={panelRef}
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            data-reduced-motion={reducedMotion ? 'true' : 'false'}
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={{ ...panelMotion.exit, transition: exitTransition }}
            transition={
              reducedMotion
                ? panelTransition
                : { ...panelTransition, delay: MOTION.backdropIn * 0.5 }
            }
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="modal-panel__close"
              aria-label="Cerrar ventana de información"
              onClick={onClose}
            >
              <span aria-hidden="true">&times;</span>
            </button>

            <ModalContent
              point={point}
              location={location}
              titleId={titleId}
              descriptionId={descriptionId}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
