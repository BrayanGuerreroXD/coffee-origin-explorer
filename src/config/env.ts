import type { FarmExperienceConfig, FarmPoint } from './types'
import { POINT_LAYOUT } from './farmPoints'

/**
 * The ONLY module allowed to touch `import.meta.env`.
 * Everything else in the app consumes the typed config it builds.
 */

export class EnvConfigError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(
      'Missing required environment variables: ' +
        missing.join(', ') +
        '. Copy .env.example to .env and fill them in.',
    )
    this.name = 'EnvConfigError'
    this.missing = missing
  }
}

/** Raw, unvalidated string map. Keys match the VITE_* names one to one. */
export type RawEnv = Record<string, string | undefined>

export function toNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  return value.trim().toLowerCase() === 'true'
}

/**
 * Turns the two-character sequence backslash-n, which is all a .env file can
 * carry, into a real newline. The spec's version replaced the sequence with
 * itself and was a no-op.
 */
export function parseEnvText(value: string): string {
  return value.replace(/\\n/g, '\n').trim()
}

const POINT_INDEXES = [1, 2, 3, 4, 5] as const

export const REQUIRED_KEYS: readonly string[] = [
  'VITE_APP_TITLE',
  'VITE_APP_LOCATION',
  'VITE_APP_SUBTITLE',
  'VITE_FARM_BACKGROUND_IMAGE',
  'VITE_FARM_MOUNTAIN_IMAGE',
  'VITE_FARM_GROUND_IMAGE',
  'VITE_FARM_VEGETATION_IMAGE',
  'VITE_FARM_BUILDINGS_IMAGE',
  'VITE_FARM_PATHS_IMAGE',
  'VITE_FARM_FOREGROUND_IMAGE',
  ...POINT_INDEXES.flatMap((i) => [
    'VITE_POINT_' + i + '_ID',
    'VITE_POINT_' + i + '_TITLE',
    'VITE_POINT_' + i + '_TAG',
    'VITE_POINT_' + i + '_IMAGE',
    'VITE_POINT_' + i + '_TEXT',
  ]),
]

export function validateRawEnv(raw: RawEnv): void {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = raw[key]
    return value == null || value.trim() === ''
  })
  if (missing.length > 0) throw new EnvConfigError(missing)
}

function requiredString(raw: RawEnv, key: string): string {
  return (raw[key] as string).trim()
}

function pointFromRaw(raw: RawEnv, index: number): FarmPoint {
  const layout = POINT_LAYOUT[index - 1]
  const prefix = 'VITE_POINT_' + index + '_'
  return {
    id: requiredString(raw, prefix + 'ID'),
    title: parseEnvText(raw[prefix + 'TITLE'] as string),
    tag: parseEnvText(raw[prefix + 'TAG'] as string),
    image: requiredString(raw, prefix + 'IMAGE'),
    description: parseEnvText(raw[prefix + 'TEXT'] as string),
    position: layout.position,
    depth: layout.depth,
  }
}

export function buildExperienceConfig(raw: RawEnv): FarmExperienceConfig {
  validateRawEnv(raw)

  return {
    title: parseEnvText(raw.VITE_APP_TITLE as string),
    location: parseEnvText(raw.VITE_APP_LOCATION as string),
    subtitle: parseEnvText(raw.VITE_APP_SUBTITLE as string),
    layers: {
      background: requiredString(raw, 'VITE_FARM_BACKGROUND_IMAGE'),
      mountain: requiredString(raw, 'VITE_FARM_MOUNTAIN_IMAGE'),
      ground: requiredString(raw, 'VITE_FARM_GROUND_IMAGE'),
      vegetation: requiredString(raw, 'VITE_FARM_VEGETATION_IMAGE'),
      buildings: requiredString(raw, 'VITE_FARM_BUILDINGS_IMAGE'),
      paths: requiredString(raw, 'VITE_FARM_PATHS_IMAGE'),
      foreground: requiredString(raw, 'VITE_FARM_FOREGROUND_IMAGE'),
    },
    points: POINT_INDEXES.map((index) => pointFromRaw(raw, index)),
    parallax: {
      maxX: toNumber(raw.VITE_PARALLAX_MAX_X, 0.45),
      maxY: toNumber(raw.VITE_PARALLAX_MAX_Y, 0.28),
      smoothing: toNumber(raw.VITE_PARALLAX_SMOOTHING, 0.08),
    },
    pointPulseEnabled: toBoolean(raw.VITE_POINT_PULSE_ENABLED, true),
    modalBackdropBlur: toNumber(raw.VITE_MODAL_BACKDROP_BLUR, 8),
  }
}

/**
 * Vite replaces every `import.meta.env.VITE_X` access textually at build time.
 * A computed key works in dev and resolves to undefined in a production
 * bundle, so all keys are spelled out literally here.
 */
export function readRawEnv(): RawEnv {
  return {
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
    VITE_APP_LOCATION: import.meta.env.VITE_APP_LOCATION,
    VITE_APP_SUBTITLE: import.meta.env.VITE_APP_SUBTITLE,

    VITE_FARM_BACKGROUND_IMAGE: import.meta.env.VITE_FARM_BACKGROUND_IMAGE,
    VITE_FARM_MOUNTAIN_IMAGE: import.meta.env.VITE_FARM_MOUNTAIN_IMAGE,
    VITE_FARM_GROUND_IMAGE: import.meta.env.VITE_FARM_GROUND_IMAGE,
    VITE_FARM_VEGETATION_IMAGE: import.meta.env.VITE_FARM_VEGETATION_IMAGE,
    VITE_FARM_BUILDINGS_IMAGE: import.meta.env.VITE_FARM_BUILDINGS_IMAGE,
    VITE_FARM_PATHS_IMAGE: import.meta.env.VITE_FARM_PATHS_IMAGE,
    VITE_FARM_FOREGROUND_IMAGE: import.meta.env.VITE_FARM_FOREGROUND_IMAGE,

    VITE_POINT_1_ID: import.meta.env.VITE_POINT_1_ID,
    VITE_POINT_1_TITLE: import.meta.env.VITE_POINT_1_TITLE,
    VITE_POINT_1_TAG: import.meta.env.VITE_POINT_1_TAG,
    VITE_POINT_1_IMAGE: import.meta.env.VITE_POINT_1_IMAGE,
    VITE_POINT_1_TEXT: import.meta.env.VITE_POINT_1_TEXT,

    VITE_POINT_2_ID: import.meta.env.VITE_POINT_2_ID,
    VITE_POINT_2_TITLE: import.meta.env.VITE_POINT_2_TITLE,
    VITE_POINT_2_TAG: import.meta.env.VITE_POINT_2_TAG,
    VITE_POINT_2_IMAGE: import.meta.env.VITE_POINT_2_IMAGE,
    VITE_POINT_2_TEXT: import.meta.env.VITE_POINT_2_TEXT,

    VITE_POINT_3_ID: import.meta.env.VITE_POINT_3_ID,
    VITE_POINT_3_TITLE: import.meta.env.VITE_POINT_3_TITLE,
    VITE_POINT_3_TAG: import.meta.env.VITE_POINT_3_TAG,
    VITE_POINT_3_IMAGE: import.meta.env.VITE_POINT_3_IMAGE,
    VITE_POINT_3_TEXT: import.meta.env.VITE_POINT_3_TEXT,

    VITE_POINT_4_ID: import.meta.env.VITE_POINT_4_ID,
    VITE_POINT_4_TITLE: import.meta.env.VITE_POINT_4_TITLE,
    VITE_POINT_4_TAG: import.meta.env.VITE_POINT_4_TAG,
    VITE_POINT_4_IMAGE: import.meta.env.VITE_POINT_4_IMAGE,
    VITE_POINT_4_TEXT: import.meta.env.VITE_POINT_4_TEXT,

    VITE_POINT_5_ID: import.meta.env.VITE_POINT_5_ID,
    VITE_POINT_5_TITLE: import.meta.env.VITE_POINT_5_TITLE,
    VITE_POINT_5_TAG: import.meta.env.VITE_POINT_5_TAG,
    VITE_POINT_5_IMAGE: import.meta.env.VITE_POINT_5_IMAGE,
    VITE_POINT_5_TEXT: import.meta.env.VITE_POINT_5_TEXT,

    VITE_PARALLAX_MAX_X: import.meta.env.VITE_PARALLAX_MAX_X,
    VITE_PARALLAX_MAX_Y: import.meta.env.VITE_PARALLAX_MAX_Y,
    VITE_PARALLAX_SMOOTHING: import.meta.env.VITE_PARALLAX_SMOOTHING,
    VITE_POINT_PULSE_ENABLED: import.meta.env.VITE_POINT_PULSE_ENABLED,
    VITE_MODAL_BACKDROP_BLUR: import.meta.env.VITE_MODAL_BACKDROP_BLUR,
  }
}
