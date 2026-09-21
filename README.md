# Origen de un café

Experiencia web de una sola pantalla: un mapa ilustrado e interactivo de una finca
cafetera de Gramalote, Norte de Santander. El mapa se dibuja con Three.js sobre una
cámara ortográfica, el cursor produce un parallax suave, y cada uno de los cinco
puntos de interés abre un modal con su fotografía y su texto.

## Arranque

```bash
npm install
cp .env.example .env
npm run dev
```

La aplicación arranca con el contenido de `.env.example` sin tocar una línea de código.

| Comando           | Qué hace                                            |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo en http://localhost:5173     |
| `npm run build`   | Compilación de producción con verificación de tipos |
| `npm run preview` | Sirve la compilación de producción                  |
| `npm test`        | Suite completa de pruebas                           |
| `npm run lint`    | ESLint                                              |
| `npm run format`  | Prettier sobre `src/`                               |

## Cómo cambiar el contenido

Todo el contenido vive en `.env`. Ningún componente visual lee `import.meta.env`:
solo lo hace `src/config/env.ts`, que valida las variables al arrancar y falla con un
error descriptivo si falta alguna obligatoria.

| Variable                                                   | Para qué sirve                               |
| ---------------------------------------------------------- | -------------------------------------------- |
| `VITE_APP_TITLE`, `VITE_APP_LOCATION`, `VITE_APP_SUBTITLE` | Cabecera de la página                        |
| `VITE_FARM_PAPER_IMAGE`                                    | Capa de fondo: el papel                      |
| `VITE_FARM_MAP_IMAGE`                                      | El dibujo del mapa                           |
| `VITE_FARM_FOREGROUND_IMAGE`                               | Primer plano y viñeta                        |
| `VITE_POINT_N_ID`                                          | Identificador interno del punto N            |
| `VITE_POINT_N_TITLE`                                       | Título mostrado en el marcador y en el modal |
| `VITE_POINT_N_TAG`                                         | Etiqueta corta sobre el título               |
| `VITE_POINT_N_IMAGE`                                       | Ruta de la imagen del modal                  |
| `VITE_POINT_N_TEXT`                                        | Texto descriptivo                            |
| `VITE_PARALLAX_MAX_X`, `VITE_PARALLAX_MAX_Y`               | Desplazamiento máximo, en unidades de escena |
| `VITE_PARALLAX_SMOOTHING`                                  | Suavizado por fotograma; más bajo, más lento |
| `VITE_POINT_PULSE_ENABLED`                                 | Anillo de atención en los marcadores         |
| `VITE_MODAL_BACKDROP_BLUR`                                 | Desenfoque del fondo del modal, en píxeles   |

Para sustituir una imagen basta con dejar el archivo en `public/assets/` y apuntar la
variable a su ruta pública. No hace falta tocar componentes.

Las posiciones de los cinco puntos no vienen de `.env`, porque son una decisión visual
y no contenido. Están en `src/config/farmPoints.ts`, en unidades de escena.

## Estructura

```text
src/
├── config/      env.ts es el único módulo que conoce import.meta.env
├── hooks/       parallax compartido, reduced motion, zoom responsive
├── utils/       proyección mundo→píxel, matemática, detección de WebGL
├── components/
│   ├── experience/   escena WebGL, capas, puntos, composición
│   ├── modal/        modal accesible, fuera del canvas
│   └── common/       imagen con fallback, indicador de carga
└── styles/      tokens.css define la paleta; ningún componente fija colores
```

## Decisiones que conviene conocer

**Los puntos son DOM, no mallas de Three.js.** Son `<button>` reales en una capa
superpuesta, movidos por el mismo parallax. Así el foco de teclado y ARIA funcionan
sin esfuerzo, los puntos sobreviven al fallback sin WebGL, y son verificables en
pruebas. La escena y la capa de puntos comparten un único contrato espacial
(`src/config/scene.ts` y `src/utils/viewport.ts`) para no desalinearse.

**El zoom de la cámara se ajusta al contenedor.** Un zoom fijo recortaría una parte
distinta del dibujo en cada pantalla, y el requisito es que los cinco puntos se vean
siempre. Las capas se dibujan más grandes que el mapa para que el parallax no descubra
un borde vacío, conservando la proporción del dibujo: antes que deformarlo en una
pantalla muy alta, se deja ver el papel.

**El mapa es un solo dibujo, no un decorado recortado.** Por eso hay tres planos y no
siete, y por eso la amplitud del parallax es baja: con más separación se nota que la
ilustración está partida en trozos.

## Estado de las imágenes

Las ilustraciones actuales son **provisionales**. Se generan por código con
`node scripts/generate-map.mjs` y `node scripts/generate-vignettes.mjs`, que las
escriben de forma determinista a partir de una semilla. Sirven para que el proyecto se
pueda ejecutar y evaluar antes de disponer del material real, y están pensadas para
sustituirse por las fotografías de la familia y por ilustración encargada.

Las cinco viñetas llevan la marca «Ilustración provisional» de forma visible: ninguna
debe presentarse como una foto real de la finca. Ver
`public/assets/reference/ATTRIBUTIONS.md`.

## Accesibilidad

Los cinco puntos son botones navegables con teclado, con nombre accesible y
`aria-expanded`. El modal es un `role="dialog"` con foco atrapado, cierre con `Escape`,
con el botón y con clic en el fondo, y devuelve el foco al punto que lo abrió. La
escena queda `inert` mientras el modal está abierto. Se respeta
`prefers-reduced-motion`: con esa preferencia activa el parallax se detiene y las
animaciones se reducen a un cambio de opacidad.
