/// <reference types="node" />
// Node types are referenced here on purpose: the app tsconfig does not list
// them, and this suite reads the real .env.example from disk. Vite refuses to
// serve dotfiles, so a `?raw` import is not an option.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  resolveAssetPath,
  EnvConfigError,
  REQUIRED_KEYS,
  buildExperienceConfig,
  parseEnvText,
  toBoolean,
  toNumber,
  validateRawEnv,
  type RawEnv,
} from '../env'
import { POINT_LAYOUT } from '../farmPoints'

/** A complete, valid fixture. Tests remove or override keys from a copy of it. */
function makeRawEnv(overrides: RawEnv = {}): RawEnv {
  const raw: RawEnv = {
    VITE_APP_TITLE: 'Origen de un cafe',
    VITE_APP_LOCATION: 'Gramalote, Norte de Santander',
    VITE_APP_SUBTITLE: 'Una finca, cinco lugares.',

    VITE_FARM_PAPER_IMAGE: '/img/paper.svg',
    VITE_FARM_MAP_IMAGE: '/img/map.svg',
    VITE_FARM_FOREGROUND_IMAGE: '/img/foreground.svg',
  }

  for (let index = 1; index <= 5; index += 1) {
    raw['VITE_POINT_' + index + '_ID'] = 'point-' + index
    raw['VITE_POINT_' + index + '_TITLE'] = 'Title ' + index
    raw['VITE_POINT_' + index + '_TAG'] = 'Tag ' + index
    raw['VITE_POINT_' + index + '_IMAGE'] = '/img/point-' + index + '.svg'
    raw['VITE_POINT_' + index + '_TEXT'] = 'Description ' + index
  }

  return { ...raw, ...overrides }
}

describe('toNumber', () => {
  it('parses a numeric string', () => {
    expect(toNumber('12', 0)).toBe(12)
    expect(toNumber('0', 99)).toBe(0)
  })

  it('accepts a negative value', () => {
    expect(toNumber('-1.5', 0)).toBe(-1.5)
  })

  it('accepts a decimal value', () => {
    expect(toNumber('0.45', 0)).toBe(0.45)
  })

  it('tolerates surrounding whitespace', () => {
    expect(toNumber('  7  ', 0)).toBe(7)
  })

  it('falls back on undefined', () => {
    expect(toNumber(undefined, 0.08)).toBe(0.08)
  })

  it('falls back on an empty string', () => {
    expect(toNumber('', 3)).toBe(3)
  })

  it('falls back on a whitespace-only string', () => {
    expect(toNumber('   ', 3)).toBe(3)
  })

  it('falls back on a non-numeric string', () => {
    expect(toNumber('abc', 5)).toBe(5)
    expect(toNumber('12px', 5)).toBe(5)
  })

  it('treats Infinity as not finite and falls back', () => {
    expect(toNumber('Infinity', 4)).toBe(4)
    expect(toNumber('-Infinity', 4)).toBe(4)
  })

  it('treats NaN as not finite and falls back', () => {
    expect(toNumber('NaN', 4)).toBe(4)
  })
})

describe('toBoolean', () => {
  it('reads "true" as true', () => {
    expect(toBoolean('true', false)).toBe(true)
  })

  it('is case insensitive', () => {
    expect(toBoolean('TRUE', false)).toBe(true)
    expect(toBoolean('True', false)).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(toBoolean(' true ', false)).toBe(true)
  })

  it('reads "false" as false', () => {
    expect(toBoolean('false', true)).toBe(false)
  })

  it('reads any other non-empty string as false', () => {
    expect(toBoolean('yes', true)).toBe(false)
    expect(toBoolean('1', true)).toBe(false)
    expect(toBoolean('0', true)).toBe(false)
  })

  it('falls back on undefined', () => {
    expect(toBoolean(undefined, true)).toBe(true)
    expect(toBoolean(undefined, false)).toBe(false)
  })

  it('falls back on an empty or whitespace-only string', () => {
    expect(toBoolean('', true)).toBe(true)
    expect(toBoolean('   ', true)).toBe(true)
  })
})

describe('parseEnvText', () => {
  it('turns the literal backslash-n sequence into a real newline', () => {
    // REGRESSION: the original spec replaced the sequence with itself, a no-op.
    // The source below contains a backslash followed by the letter n.
    const source = 'first\\nsecond'
    expect(source).toContain('\\')

    const parsed = parseEnvText(source)

    expect(parsed).toBe('first\nsecond')
    expect(parsed).not.toContain('\\')
    expect(parsed.split('\n')).toEqual(['first', 'second'])
    expect(parsed.charCodeAt(5)).toBe(10)
  })

  it('converts every occurrence, not only the first', () => {
    expect(parseEnvText('a\\nb\\nc').split('\n')).toEqual(['a', 'b', 'c'])
  })

  it('trims the result', () => {
    expect(parseEnvText('  hello  ')).toBe('hello')
    expect(parseEnvText('\\n  hello  \\n')).toBe('hello')
  })

  it('leaves text without escapes untouched', () => {
    expect(parseEnvText('El cultivo')).toBe('El cultivo')
  })
})

describe('validateRawEnv', () => {
  it('accepts a complete fixture', () => {
    expect(() => validateRawEnv(makeRawEnv())).not.toThrow()
  })

  it('throws EnvConfigError when a required key is absent', () => {
    const raw = makeRawEnv()
    delete raw.VITE_APP_TITLE
    expect(() => validateRawEnv(raw)).toThrow(EnvConfigError)
  })

  it('treats an empty value as missing', () => {
    expect(() => validateRawEnv(makeRawEnv({ VITE_POINT_3_TITLE: '' }))).toThrow(EnvConfigError)
  })

  it('treats a whitespace-only value as missing', () => {
    expect(() => validateRawEnv(makeRawEnv({ VITE_POINT_3_TITLE: '   ' }))).toThrow(EnvConfigError)
  })

  it('names every offending key in the thrown error, not just the first', () => {
    const raw = makeRawEnv({ VITE_APP_SUBTITLE: '  ', VITE_POINT_5_TEXT: '' })
    delete raw.VITE_FARM_MAP_IMAGE

    let caught: unknown
    try {
      validateRawEnv(raw)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(EnvConfigError)
    const missing = (caught as EnvConfigError).missing
    expect(missing).toHaveLength(3)
    expect(missing).toContain('VITE_APP_SUBTITLE')
    expect(missing).toContain('VITE_FARM_MAP_IMAGE')
    expect(missing).toContain('VITE_POINT_5_TEXT')
  })

  it('mentions .env.example in the message so the fix is obvious', () => {
    const raw = makeRawEnv()
    delete raw.VITE_APP_TITLE

    let caught: unknown
    try {
      validateRawEnv(raw)
    } catch (error) {
      caught = error
    }

    const message = (caught as EnvConfigError).message
    expect(message).toContain('.env.example')
    expect(message).toContain('VITE_APP_TITLE')
    expect((caught as EnvConfigError).name).toBe('EnvConfigError')
  })
})

describe('buildExperienceConfig', () => {
  it('rejects an incomplete record before building anything', () => {
    const raw = makeRawEnv()
    delete raw.VITE_POINT_2_IMAGE
    expect(() => buildExperienceConfig(raw)).toThrow(EnvConfigError)
  })

  it('reads the header copy through parseEnvText', () => {
    const config = buildExperienceConfig(
      makeRawEnv({
        VITE_APP_TITLE: '  Origen de un cafe  ',
        VITE_APP_SUBTITLE: 'linea uno\\nlinea dos',
      }),
    )

    expect(config.title).toBe('Origen de un cafe')
    expect(config.location).toBe('Gramalote, Norte de Santander')
    expect(config.subtitle).toBe('linea uno\nlinea dos')
  })

  it('maps every layer image to the right field', () => {
    const config = buildExperienceConfig(makeRawEnv())

    expect(config.layers).toEqual({
      paper: '/img/paper.svg',
      map: '/img/map.svg',
      foreground: '/img/foreground.svg',
    })
  })

  it('produces exactly five points', () => {
    expect(buildExperienceConfig(makeRawEnv()).points).toHaveLength(5)
  })

  it('takes each point field from the matching VITE_POINT_N_* key', () => {
    const config = buildExperienceConfig(
      makeRawEnv({
        VITE_POINT_2_ID: 'cosecha',
        VITE_POINT_2_TITLE: 'La cosecha',
        VITE_POINT_2_TAG: 'Cosecha',
        VITE_POINT_2_IMAGE: '/assets/points/cosecha.svg',
        VITE_POINT_2_TEXT: 'parrafo uno\\nparrafo dos',
      }),
    )

    expect(config.points[1]).toMatchObject({
      id: 'cosecha',
      title: 'La cosecha',
      tag: 'Cosecha',
      image: '/assets/points/cosecha.svg',
      description: 'parrafo uno\nparrafo dos',
    })

    // The other points keep their own values: no cross-contamination.
    expect(config.points[0].id).toBe('point-1')
    expect(config.points[2].id).toBe('point-3')
  })

  it('trims the id and image of every point', () => {
    const config = buildExperienceConfig(
      makeRawEnv({ VITE_POINT_1_ID: '  cultivo  ', VITE_POINT_1_IMAGE: '  /img/a.svg  ' }),
    )

    expect(config.points[0].id).toBe('cultivo')
    expect(config.points[0].image).toBe('/img/a.svg')
  })

  it('takes position and depth from POINT_LAYOUT at the matching index', () => {
    const config = buildExperienceConfig(makeRawEnv())

    config.points.forEach((point, index) => {
      expect(point.position).toEqual(POINT_LAYOUT[index].position)
      expect(point.depth).toBe(POINT_LAYOUT[index].depth)
    })
  })

  it('gives every point a unique id', () => {
    const config = buildExperienceConfig(makeRawEnv())
    const ids = config.points.map((point) => point.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parses the parallax numbers when present', () => {
    const config = buildExperienceConfig(
      makeRawEnv({
        VITE_PARALLAX_MAX_X: '0.9',
        VITE_PARALLAX_MAX_Y: '0.5',
        VITE_PARALLAX_SMOOTHING: '0.2',
      }),
    )

    expect(config.parallax).toEqual({ maxX: 0.9, maxY: 0.5, smoothing: 0.2 })
  })

  it('falls back to the documented parallax defaults', () => {
    expect(buildExperienceConfig(makeRawEnv()).parallax).toEqual({
      maxX: 0.45,
      maxY: 0.28,
      smoothing: 0.08,
    })
  })

  it('falls back to the parallax defaults for unusable values too', () => {
    const config = buildExperienceConfig(
      makeRawEnv({
        VITE_PARALLAX_MAX_X: 'wide',
        VITE_PARALLAX_MAX_Y: '  ',
        VITE_PARALLAX_SMOOTHING: 'NaN',
      }),
    )

    expect(config.parallax).toEqual({ maxX: 0.45, maxY: 0.28, smoothing: 0.08 })
  })

  it('parses pointPulseEnabled and modalBackdropBlur', () => {
    const enabled = buildExperienceConfig(
      makeRawEnv({ VITE_POINT_PULSE_ENABLED: 'true', VITE_MODAL_BACKDROP_BLUR: '14' }),
    )
    expect(enabled.pointPulseEnabled).toBe(true)
    expect(enabled.modalBackdropBlur).toBe(14)

    const disabled = buildExperienceConfig(
      makeRawEnv({ VITE_POINT_PULSE_ENABLED: 'false', VITE_MODAL_BACKDROP_BLUR: '0' }),
    )
    expect(disabled.pointPulseEnabled).toBe(false)
    expect(disabled.modalBackdropBlur).toBe(0)
  })

  it('falls back to pulse enabled and a blur of 8', () => {
    const config = buildExperienceConfig(makeRawEnv())
    expect(config.pointPulseEnabled).toBe(true)
    expect(config.modalBackdropBlur).toBe(8)
  })
})

describe('the shipped .env.example', () => {
  /** Minimal parser for the `KEY="value"` lines the file is made of. */
  function parseDotEnv(text: string): RawEnv {
    const raw: RawEnv = {}
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
      raw[key] = value
    }
    return raw
  }

  /**
   * Vitest does not always expose a `file:` URL for the module, so fall back to
   * the working directory, which is the project root Vite is configured from.
   */
  function readEnvExample(): string {
    const url = new URL('../../../.env.example', import.meta.url)
    if (url.protocol === 'file:') return readFileSync(fileURLToPath(url), 'utf8')
    return readFileSync('.env.example', 'utf8')
  }

  const text = readEnvExample()
  const example = parseDotEnv(text)

  it('was actually read from disk', () => {
    expect(text).toContain('VITE_APP_TITLE')
    expect(Object.keys(example).length).toBeGreaterThanOrEqual(REQUIRED_KEYS.length)
  })

  it('satisfies every required key, so the project runs without editing code', () => {
    expect(() => validateRawEnv(example)).not.toThrow()

    const missing = REQUIRED_KEYS.filter((key) => {
      const value = example[key]
      return value == null || value.trim() === ''
    })
    expect(missing).toEqual([])
  })

  it('builds a complete experience configuration', () => {
    const config = buildExperienceConfig(example)

    expect(config.title.length).toBeGreaterThan(0)
    expect(config.points).toHaveLength(5)
    expect(new Set(config.points.map((point) => point.id)).size).toBe(5)
    for (const point of config.points) {
      expect(point.title.length).toBeGreaterThan(0)
      expect(point.image.startsWith('/')).toBe(true)
      expect(point.description.length).toBeGreaterThan(0)
    }
  })
})

describe('resolveAssetPath', () => {
  const BASE = '/coffee-origin-explorer/'

  it('prefixes a root-relative path with the base', () => {
    expect(resolveAssetPath('/assets/farm/map.svg', BASE)).toBe(
      '/coffee-origin-explorer/assets/farm/map.svg',
    )
  })

  it('does not double the slash between base and path', () => {
    expect(resolveAssetPath('/a.svg', '/base/')).toBe('/base/a.svg')
    expect(resolveAssetPath('/a.svg', '/base')).toBe('/base/a.svg')
    expect(resolveAssetPath('/a.svg', '/base///')).toBe('/base/a.svg')
  })

  it('leaves a path untouched when served from the domain root', () => {
    expect(resolveAssetPath('/assets/x.svg', '/')).toBe('/assets/x.svg')
  })

  it('never rewrites an absolute URL', () => {
    expect(resolveAssetPath('https://cdn.example.com/x.jpg', BASE)).toBe(
      'https://cdn.example.com/x.jpg',
    )
    expect(resolveAssetPath('//cdn.example.com/x.jpg', BASE)).toBe('//cdn.example.com/x.jpg')
    expect(resolveAssetPath('data:image/svg+xml,<svg/>', BASE)).toBe('data:image/svg+xml,<svg/>')
  })

  it('leaves an already relative path alone', () => {
    expect(resolveAssetPath('assets/x.svg', BASE)).toBe('assets/x.svg')
  })

  it('is applied to every configured image', () => {
    const config = buildExperienceConfig(makeRawEnv(), BASE)

    expect(config.layers.map).toBe('/coffee-origin-explorer/img/map.svg')
    expect(config.layers.paper).toBe('/coffee-origin-explorer/img/paper.svg')
    expect(config.layers.foreground).toBe('/coffee-origin-explorer/img/foreground.svg')
    for (const point of config.points) {
      expect(point.image.startsWith(BASE)).toBe(true)
    }
  })
})
