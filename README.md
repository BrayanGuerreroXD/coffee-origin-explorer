# ☕ Origen de un café

> An interactive, hand-drawn map of a coffee farm in Gramalote, Norte de Santander, Colombia.
> Move the cursor, lean into the hills, and open the five places where a cup of coffee begins.

---

## 🌱 Why this exists

Two reasons, and they matter equally.

**🧪 To learn Three.js properly.** Not by following a spinning-cube tutorial, but by building
something with real constraints: a tilted perspective camera that has to stay framed on any
screen, DOM markers that must stay glued to a drawing while it pans and zooms, a parallax that
has to read as depth without making anyone seasick, and a fallback for the machines where WebGL
never starts. React Three Fiber is the library under the microscope here — every architectural
decision in this repository was an excuse to understand how it actually behaves.

**🇨🇴 To put Norte de Santander coffee on a screen it deserves.** Colombian coffee is famous;
the people who grow it usually are not. Gramalote is a small municipality in the mountains of
Norte de Santander, and like so many towns in that range, its economy is carried by families who
plant, pick, ferment, wash, dry and bag coffee by hand, season after season. This project exists
to give one of those farms a place on the internet that feels like it was made with care — a map
you can wander rather than a product page you scroll past.

The five points on the map are the five stages of that work: **el cultivo**, **la cosecha**,
**el beneficio**, **el secado** and **el café listo**. 🌄 🍒 💧 ☀️ 📦

> ⚠️ Every image and every text in this repository right now is **provisional**. They are
> placeholders so the project can run before the family's real photographs and their real story
> exist. Nothing here should be presented as a genuine photograph of the farm.

---

## 🚀 Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The project runs from `.env.example` as it ships, without touching a line of code.

| Command           | What it does                                |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Development server at http://localhost:5173 |
| `npm run build`   | Production build, with type checking        |
| `npm run preview` | Serves the built output                     |
| `npm test`        | The full test suite                         |
| `npm run lint`    | ESLint                                      |
| `npm run format`  | Prettier over `src/`                        |

### 🎨 Regenerating the artwork

The SVGs are not drawn by hand. Two Node generators emit them deterministically from a seed,
which is the only way to get the density of marks that a pen-and-ink look needs.

```bash
node scripts/generate-map.mjs
node scripts/generate-vignettes.mjs
```

---

## 📝 Changing the content

Everything the visitor reads lives in `.env`. No visual component touches `import.meta.env`;
only `src/config/env.ts` does, and it validates at start-up, failing with an error that names
every missing variable.

| Variable                                                   | Controls                                  |
| ---------------------------------------------------------- | ----------------------------------------- |
| `VITE_APP_TITLE`, `VITE_APP_LOCATION`, `VITE_APP_SUBTITLE` | The page header                           |
| `VITE_FARM_PAPER_IMAGE`                                    | The paper the map sits on                 |
| `VITE_FARM_MAP_IMAGE`                                      | The drawing itself                        |
| `VITE_FARM_FOREGROUND_IMAGE`                               | Foreground marks and vignette             |
| `VITE_POINT_N_ID`                                          | Internal id of point N                    |
| `VITE_POINT_N_TITLE`                                       | Title on the marker and in the modal      |
| `VITE_POINT_N_TAG`                                         | Short label above the title               |
| `VITE_POINT_N_IMAGE`                                       | The modal's image                         |
| `VITE_POINT_N_TEXT`                                        | Its description                           |
| `VITE_PARALLAX_MAX_X`, `VITE_PARALLAX_MAX_Y`               | Parallax reach, in scene units            |
| `VITE_PARALLAX_SMOOTHING`                                  | Easing per frame; lower is slower         |
| `VITE_POINT_PULSE_ENABLED`                                 | The attention ring on the markers         |
| `VITE_MODAL_BACKDROP_BLUR`                                 | Backdrop blur behind the modal, in pixels |

To swap an image, drop the file in `public/assets/` and point the variable at its public path.
No component needs to change.

The five marker positions deliberately do **not** come from `.env`: they are a visual decision
rather than content, and they live in `src/config/farmPoints.ts` in scene units.

---

## 🧭 How it is put together

```text
src/
├── config/      env.ts is the only module that knows about import.meta.env
├── hooks/       shared parallax, reduced motion, camera control, projection store
├── utils/       world-to-pixel projection, maths, gestures, WebGL detection
├── components/
│   ├── experience/   the WebGL scene, layers, markers, camera rig, composition
│   ├── modal/        the accessible dialog, rendered outside the canvas
│   └── common/       image with fallback, loading indicator
└── styles/      tokens.css owns the palette; no component hardcodes a colour
```

### Decisions worth knowing

**🎯 The markers are DOM, not Three.js meshes.** They are real `<button>` elements in an overlay
above the canvas. Keyboard focus and ARIA come for free, they survive the no-WebGL fallback, and
they can be tested in jsdom. Their screen positions are projected by the scene through the real
camera on every frame and published to the overlay — with a tilted perspective camera there is no
closed-form pixel position any more, and one source of truth is what stops a marker drifting off
the lot it points at.

**📐 The camera frames itself.** A fixed zoom would crop a different part of the drawing on every
screen, and all five points have to stay visible. Layers are drawn larger than the map so the
parallax never reveals an empty edge, and larger again to pay for the keystone the tilt
introduces. The drawing's aspect ratio is always preserved: on a very tall screen you get paper
above and below rather than a stretched illustration.

**🗺️ The map is one drawing, not a cut-out diorama.** That is why there are three planes and not
seven, and why the parallax is gentle. With more separation you start to see that the
illustration has been sliced up.

**🖐️ Wheel to zoom, drag to pan, and a flight to whichever point you open.** Deliberately not
`OrbitControls`: rotating would break the illusion of ink on paper, and the tilt is fixed by
design. The camera only ever moves parallel to the map or along its own axis.

**🪟 The modal lives outside the canvas.** It is DOM in a portal, with trapped focus, closing on
the button, on `Escape` and on a backdrop click, and returning focus to the marker that opened
it. The scene is marked `inert` while it is open.

---

## ♿ Accessibility

All five points are keyboard-navigable buttons with an accessible name and `aria-expanded`.
The dialog is a `role="dialog"` with focus management as described above. Hovering **or**
focusing a marker washes that area of the map in the accent colour, so nothing is discoverable
by hover alone. `prefers-reduced-motion` is honoured: the parallax stops and the animations
collapse to a plain opacity change.

---

## 🌍 Deploying to GitHub Pages

A push to `main` builds and publishes the site through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable it once, in the
repository settings:

> **Settings → Pages → Build and deployment → Source: _GitHub Actions_**

The site then lives at **https://brayanguerreroxd.github.io/coffee-origin-explorer/**.

Three things make that work, and each one is a way this would otherwise break:

- **The base path.** Pages serves a project site from a sub-path, so the bundle is built with
  `base: '/coffee-origin-explorer/'`. Without it every asset resolves against the domain root
  and 404s. Set `BASE_PATH=/` to build for a host that serves from the root, such as Netlify or
  Vercel.
- **Asset paths in configuration.** `.env` holds paths like `/assets/farm/map-reference.svg`,
  which are rewritten against the base in `env.ts`. Absolute URLs are left alone, so pointing a
  variable at a CDN keeps working.
- **The environment in CI.** `VITE_*` values are baked in at build time and `.env` is not
  committed, so the workflow copies `.env.example` first. Skip that step and the configuration
  layer throws at start-up and the published page is blank rather than degraded.

To check the production layout locally, `npm run preview` serves the built site on the same
sub-path as Pages:

```bash
npm run build
npm run preview   # http://localhost:4173/coffee-origin-explorer/
```

---

## 🖼️ On the artwork

The current illustrations are placeholders generated by the scripts above. They carry the
density that the style needs, but the value structure is still flat — there are no real darks
anchoring the composition — and they are meant to be replaced by commissioned artwork and by the
family's own photographs.

The five vignettes are visibly marked _Ilustración provisional_. See
`public/assets/reference/ATTRIBUTIONS.md`: everything shipped here is original work for this
project and carries no third-party licence obligation.

---

<div align="center">

**Made for the mountains of Gramalote, Norte de Santander 🏔️**

React 19 · Vite · TypeScript · Three.js via React Three Fiber · Motion

</div>
