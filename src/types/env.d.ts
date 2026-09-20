/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_LOCATION: string
  readonly VITE_APP_SUBTITLE: string

  readonly VITE_FARM_BACKGROUND_IMAGE: string
  readonly VITE_FARM_MOUNTAIN_IMAGE: string
  readonly VITE_FARM_GROUND_IMAGE: string
  readonly VITE_FARM_VEGETATION_IMAGE: string
  readonly VITE_FARM_BUILDINGS_IMAGE: string
  readonly VITE_FARM_PATHS_IMAGE: string
  readonly VITE_FARM_FOREGROUND_IMAGE: string

  readonly VITE_POINT_1_ID: string
  readonly VITE_POINT_1_TITLE: string
  readonly VITE_POINT_1_TAG: string
  readonly VITE_POINT_1_IMAGE: string
  readonly VITE_POINT_1_TEXT: string

  readonly VITE_POINT_2_ID: string
  readonly VITE_POINT_2_TITLE: string
  readonly VITE_POINT_2_TAG: string
  readonly VITE_POINT_2_IMAGE: string
  readonly VITE_POINT_2_TEXT: string

  readonly VITE_POINT_3_ID: string
  readonly VITE_POINT_3_TITLE: string
  readonly VITE_POINT_3_TAG: string
  readonly VITE_POINT_3_IMAGE: string
  readonly VITE_POINT_3_TEXT: string

  readonly VITE_POINT_4_ID: string
  readonly VITE_POINT_4_TITLE: string
  readonly VITE_POINT_4_TAG: string
  readonly VITE_POINT_4_IMAGE: string
  readonly VITE_POINT_4_TEXT: string

  readonly VITE_POINT_5_ID: string
  readonly VITE_POINT_5_TITLE: string
  readonly VITE_POINT_5_TAG: string
  readonly VITE_POINT_5_IMAGE: string
  readonly VITE_POINT_5_TEXT: string

  readonly VITE_PARALLAX_MAX_X: string
  readonly VITE_PARALLAX_MAX_Y: string
  readonly VITE_PARALLAX_SMOOTHING: string
  readonly VITE_POINT_PULSE_ENABLED: string
  readonly VITE_MODAL_BACKDROP_BLUR: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
