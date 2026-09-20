import { buildExperienceConfig, readRawEnv } from './env'
import type { FarmExperienceConfig } from './types'

/** Built once at module load so a misconfigured .env fails fast and loudly. */
export const experienceConfig: FarmExperienceConfig = buildExperienceConfig(readRawEnv())

export type { FarmExperienceConfig, FarmPoint, ParallaxConfig, SceneLayerImages } from './types'
