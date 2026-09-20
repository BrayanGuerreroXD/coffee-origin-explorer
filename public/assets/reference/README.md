# Guía para reemplazar las imágenes provisionales

Esta carpeta documenta el material gráfico de `public/assets/`. Todo lo que hay
hoy es **provisional**: ilustraciones originales hechas para que la aplicación
funcione mientras no existan las fotografías y los dibujos definitivos de la
finca. Este documento explica cómo sustituirlas sin tocar una sola línea de
código.

Ver también [`ATTRIBUTIONS.md`](./ATTRIBUTIONS.md) para el estado de licencias.

---

## 1. Qué archivo alimenta cada capa

La escena se arma con siete capas apiladas, cada una con un factor de parallax
distinto. De atrás hacia adelante:

| # | Capa (Three.js)     | Parallax | Archivo                                                      | Contenido                                                     |
|---|---------------------|----------|--------------------------------------------------------------|---------------------------------------------------------------|
| 1 | `BackgroundLayer`   | 0.10     | `farm/background/farm-background-reference.svg`               | Cielo, sol, nubes altas, neblina lejana. **Única capa opaca.** |
| 2 | `MountainLayer`     | 0.20     | `farm/terrain/mountains-reference.svg`                        | Tres cordilleras: la más lejana pálida y fría.                 |
| 3 | `FarmGroundLayer`   | 0.35     | `farm/terrain/ground-reference.svg`                           | La masa de terreno de la finca, lomas y terrazas.              |
| 4 | `VegetationLayer`   | 0.50     | `farm/vegetation/vegetation-reference.svg`                    | Surcos de café, arbustos y árboles de sombra.                  |
| 5 | `BuildingsLayer`    | 0.65     | `farm/objects/buildings-reference.svg`                        | Casa, beneficiadero con tanques y patio de secado.             |
| 6 | `PathsLayer`        | 0.75     | `farm/objects/paths-reference.svg`                            | Caminos y senderos que recorren la finca.                      |
| 7 | `ForegroundEffects` | 1.00     | `farm/vegetation/foreground-reference.svg`                    | Follaje cercano que enmarca la parte baja y los costados.      |

Y una imagen por punto de interés, que se muestra dentro del modal:

| Punto | Título         | Archivo                                       |
|-------|----------------|-----------------------------------------------|
| 1     | El cultivo     | `points/cultivo/cultivo-reference.svg`        |
| 2     | La cosecha     | `points/cosecha/cosecha-reference.svg`        |
| 3     | El beneficio   | `points/beneficio/beneficio-reference.svg`    |
| 4     | El secado      | `points/secado/secado-reference.svg`          |
| 5     | El café listo  | `points/empaque/empaque-reference.svg`        |

---

## 2. Reglas de las capas de la escena

### 2.1 Un solo `viewBox` para las siete

```
viewBox="0 0 1600 1000"
```

Las siete capas comparten exactamente ese `viewBox` (relación 8:5). Así quedan
en registro cuando se apilan. Si una capa nueva usa otra relación de aspecto,
se desalinea con las demás.

### 2.2 Transparencia

- **Capa 1 (fondo): opaca.** Es la única que pinta un cielo completo.
- **Capas 2 a 7: fondo transparente, obligatorio.** No deben llevar un `<rect>`
  opaco que cubra todo el lienzo: se componen unas sobre otras y un rectángulo
  de fondo tapa todo lo que está detrás.

Para formatos rasterizados esto significa PNG o WebP **con canal alfa**. JPEG no
sirve para las capas 2 a 7.

### 2.3 Sobredibujo (overscan) — la regla que más se olvida

Cada capa se desplaza con el puntero. Si el dibujo termina justo en el borde del
`viewBox`, al desplazarse aparece una franja vacía en el borde de la pantalla.

> **Dibujar el contenido bastante más allá de los cuatro bordes del `viewBox`.**
> Como referencia, las piezas actuales extienden geometría hasta unos 400 px
> fuera en cada lado (de `-400` a `2000` en X, y hasta `1400` en Y). Es mejor
> pasarse que quedarse corto.

El desplazamiento máximo está configurado en `.env`
(`VITE_PARALLAX_MAX_X`, `VITE_PARALLAX_MAX_Y`); si se suben esos valores, hay
que ampliar también el sobredibujo.

### 2.4 Dónde caen los puntos interactivos

Los cinco marcadores se dibujan encima de la escena, en estas posiciones
normalizadas `(x, y medido desde abajo)`:

| Punto        | (x, y)        | Equivalente en el `viewBox` de 1600×1000 |
|--------------|---------------|------------------------------------------|
| El cultivo   | (0.83, 0.81)  | (1328, 190)                              |
| La cosecha   | (0.25, 0.72)  | (400, 280)                               |
| El beneficio | (0.55, 0.49)  | (880, 510)                               |
| El secado    | (0.16, 0.11)  | (256, 890)                               |
| El café listo| (0.82, 0.10)  | (1312, 900)                              |

**No colocar una casa, un árbol denso ni un detalle de alto contraste justo
encima de esas cinco posiciones.** Deben quedar zonas tranquilas para que el
marcador y su foco de teclado se lean con claridad.

### 2.5 Profundidad: lo que realmente vende el 2.5D

No es el parallax, es el color:

- **Lejos:** más claro, más frío, menos contraste, menos saturación.
- **Cerca:** más oscuro, más cálido, más contraste, más saturación.

Toda la paleta sale de `src/styles/tokens.css`. Reutilizar esos valores para que
la ilustración y la interfaz hablen el mismo idioma:

| Familia   | Valores                                        |
|-----------|------------------------------------------------|
| Tierra    | `#2b1e16` · `#4a3527` · `#6f5238` · `#a98763`   |
| Vegetación| `#1f3a24` · `#2f5733` · `#4c7a45` · `#7da362`   |
| Arcilla   | `#b4643a`                                      |
| Cereza    | `#c0392b` · `#e05a3f` · `#e8a33d`              |
| Cielo     | `#cfe3e6` → `#f2e6d2`                          |

### 2.6 Restricciones técnicas de los SVG

- Sin imágenes rasterizadas incrustadas (`<image>`, `data:`).
- Sin referencias externas (fuentes, hojas de estilo, scripts).
- Sin tipografías embebidas.
- Cada archivo por debajo de ~40 KB. Los actuales van de 4 a 13 KB.
- El SVG debe ser XML bien formado: si no lo es, la textura falla en silencio
  dentro de Three.js y es muy difícil de diagnosticar.

Verificación rápida antes de dar por buena una capa:

```bash
node -e "require('fs').readdirSync('.').filter(f=>f.endsWith('.svg')).forEach(f=>{try{new (require('xmldom').DOMParser)().parseFromString(require('fs').readFileSync(f,'utf8'))}catch(e){console.log('FAIL',f)}})"
```

o, sin dependencias, en PowerShell:

```powershell
Get-ChildItem -Recurse -Filter *.svg |
  ForEach-Object { try { [xml](Get-Content -Raw $_.FullName) | Out-Null; "OK   $($_.Name)" }
                   catch { "FAIL $($_.Name)" } }
```

---

## 3. Reglas de las imágenes de los puntos

- **`viewBox="0 0 1200 800"`** — proporción 3:2, la forma que tendrá la
  fotografía definitiva. Si se cambia la proporción, cambia la caja del modal.
- Cada pieza debe leerse con claridad al tamaño del modal, no solo en grande.
- Misma paleta que la escena.
- Mientras sean provisionales, **deben llevar una marca visible e inequívoca**:
  las actuales usan una cinta esquinera roja con la palabra `REFERENCIA`, un
  marco punteado y una etiqueta «Ilustración provisional · no es la finca».
  Esa marca **desaparece únicamente cuando se sustituye por material real de la
  finca**, nunca antes.

---

## 4. Cuando lleguen las fotografías reales

### 4.1 Formato

| Uso                        | Formato recomendado | Alternativa |
|----------------------------|---------------------|-------------|
| Imagen del modal (punto)   | **WebP** o **AVIF** | JPEG        |
| Capa de escena con alfa    | **WebP** con alfa   | PNG-24      |
| Capa de escena sin alfa    | **WebP**            | JPEG        |

### 4.2 Tamaño

- **Imagen del modal: máximo 1600 px de ancho.** Más allá de eso no se gana
  nitidez visible y sí se paga en descarga. Recortar a 3:2 (por ejemplo
  1600×1067) para que coincida con la caja actual.
- Capas de la escena: 1600×1000 lógicos; si se exportan en raster, 2× (3200×2000)
  es suficiente para pantallas de alta densidad.
- Objetivo de peso: por debajo de 300 KB por imagen de modal y por debajo de
  500 KB por capa.
- Recordar el sobredibujo también al exportar raster: el lienzo debe incluir el
  margen extra, no solo el área visible.

### 4.3 Accesibilidad y contenido

- Las fotografías deben ser de la finca real o estar claramente identificadas
  como referencia.
- Evitar texto incrustado dentro de la imagen: no se puede traducir ni leer con
  lector de pantalla.
- Cuidar el contraste en las zonas donde caen los marcadores.

---

## 5. Cómo se hace el reemplazo (sin tocar código)

Las rutas de todas las imágenes viven en variables de entorno, en el archivo
`.env` de la raíz del proyecto:

```env
VITE_FARM_BACKGROUND_IMAGE="/assets/farm/background/farm-background-reference.svg"
VITE_FARM_MOUNTAIN_IMAGE="/assets/farm/terrain/mountains-reference.svg"
VITE_FARM_GROUND_IMAGE="/assets/farm/terrain/ground-reference.svg"
VITE_FARM_VEGETATION_IMAGE="/assets/farm/vegetation/vegetation-reference.svg"
VITE_FARM_BUILDINGS_IMAGE="/assets/farm/objects/buildings-reference.svg"
VITE_FARM_PATHS_IMAGE="/assets/farm/objects/paths-reference.svg"
VITE_FARM_FOREGROUND_IMAGE="/assets/farm/vegetation/foreground-reference.svg"

VITE_POINT_1_IMAGE="/assets/points/cultivo/cultivo-reference.svg"
VITE_POINT_2_IMAGE="/assets/points/cosecha/cosecha-reference.svg"
VITE_POINT_3_IMAGE="/assets/points/beneficio/beneficio-reference.svg"
VITE_POINT_4_IMAGE="/assets/points/secado/secado-reference.svg"
VITE_POINT_5_IMAGE="/assets/points/empaque/empaque-reference.svg"
```

Hay dos maneras de sustituir una imagen:

1. **Conservar el nombre.** Dejar el archivo nuevo encima del viejo, con el
   mismo nombre y la misma ruta. No hay que tocar nada más.
2. **Cambiar el nombre.** Poner el archivo nuevo en su carpeta y actualizar la
   variable correspondiente en `.env` (y en `.env.example`). **Ningún componente
   de `src/` contiene rutas de imágenes**, así que no hace falta editar código.

En cualquiera de los dos casos, reiniciar el servidor de desarrollo: Vite lee
`.env` al arrancar.

Al reemplazar una imagen de punto, revisar también el texto de su variable
`VITE_POINT_N_TEXT`: los textos actuales advierten que la imagen es una
referencia, y esa advertencia debe quitarse cuando deje de serlo.

---

## 6. Lista de verificación antes de dar por buena una pieza

- [ ] `viewBox` correcto: `0 0 1600 1000` para capas, `0 0 1200 800` para puntos.
- [ ] Fondo transparente (todas las capas menos la de cielo).
- [ ] Contenido dibujado bien por fuera de los cuatro bordes.
- [ ] Las cinco posiciones de los marcadores quedan despejadas.
- [ ] Lejos claro y frío, cerca oscuro y cálido.
- [ ] Colores tomados de `src/styles/tokens.css`.
- [ ] Sin rasters incrustados, sin fuentes, sin referencias externas.
- [ ] Peso por debajo de ~40 KB (SVG) o de los objetivos de la sección 4.2.
- [ ] XML bien formado (verificado con uno de los comandos de la sección 2.6).
- [ ] Si sigue siendo provisional: marca `REFERENCIA` visible.
- [ ] `ATTRIBUTIONS.md` actualizado si entró material de terceros.
