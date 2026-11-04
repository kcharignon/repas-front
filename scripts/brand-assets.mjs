// Identité visuelle de Repas : icône (anneau-horloge, fourchette, couteau) et logo (mot « Repas » en Playfair Display Bold).
// Une seule géométrie, écrite ici ; tout le reste en est tiré : icônes PNG et ICO du site, dessin vectoriel Android, logos SVG,
// géométrie du composant RepasLogo.vue, fichiers de l'autre dépôt (back, skill Alexa). Référence : docs/logo/README.md.
//
//   node scripts/brand-assets.mjs [--back ../Repas]     (Node 24, Playwright du dépôt)
//
// Le mot est déjà converti en tracés (scripts/brand/repas-word.json, Playfair Display Bold, licence SIL OFL) : aucune police n'est nécessaire.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backFlag = process.argv.indexOf('--back')
const backRoot = resolve(backFlag > 0 ? process.argv[backFlag + 1] : join(root, '..', 'Repas'))
const WORD = JSON.parse(readFileSync(join(root, 'scripts/brand/repas-word.json'), 'utf8'))

const COLORS = { basil: '#1E6B4C', saffron: '#F4B73F', cream: '#F4F6F3', night: '#0F1F18', mist: '#EAF1EC', white: '#FFFFFF' }
const round = (n) => Math.round(n * 100) / 100

// ---------- Le dessin : grille de 108 x 108 d'une icône adaptative Android, centré en (54, 55) ----------
const roundedRect = (x, y, w, h, r) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`

/** Les formes du dessin. role : 'ink' (anneau, liste, couverts) ou 'accent' (la coche, seule en safran). */
function glyphShapes() {
  const shapes = []
  // L'anneau de l'assiette, interrompu là où la coche le traverse (un vrai vide : le dessin ne dépend d'aucun fond).
  const [cx, cy, radius] = [54, 55, 19.5]
  const checkTip = [69, 36.5]
  const angle = Math.atan2(checkTip[1] - cy, checkTip[0] - cx)
  const half = 3.7 / radius
  const at = (t) => [cx + radius * Math.cos(t), cy + radius * Math.sin(t)]
  const [x1, y1] = at(angle + half)
  const [x2, y2] = at(angle - half + 2 * Math.PI)
  shapes.push({ role: 'ink', stroke: 3.4, cap: 'butt', d: `M${round(x1)} ${round(y1)}A${radius} ${radius} 0 1 1 ${round(x2)} ${round(y2)}` })
  // La liste : deux cases, deux lignes.
  shapes.push({ role: 'ink', d: roundedRect(45, 59.3, 3.4, 3.4, 0.8) })
  shapes.push({ role: 'ink', d: roundedRect(50.4, 60, 12, 2, 1) })
  shapes.push({ role: 'ink', d: roundedRect(45, 64.9, 3.4, 3.4, 0.8) })
  shapes.push({ role: 'ink', d: roundedRect(50.4, 65.6, 9, 2, 1) })
  // La coche : son sommet est au centre de l'assiette.
  shapes.push({ role: 'accent', stroke: 4, cap: 'round', d: 'M48 49L54 55L69 36.5' })
  // La fourchette (axe x = 25,5).
  for (const x of [20.9, 24.5, 28.1]) shapes.push({ role: 'ink', d: roundedRect(x, 34, 2, 12, 1) })
  shapes.push({ role: 'ink', d: 'M20.9 42h9.2q0 5.6-3.4 6.6L26.7 52h-2.4L24.3 48.6q-3.4-1-3.4-6.6Z' })
  shapes.push({ role: 'ink', d: 'M24.3 51h2.4L27.5 71a2 2 0 0 1-4 0Z' })
  // Le couteau : dos droit (x = 85,3) de la pointe au bout du manche, tranchant tourné vers l'assiette.
  shapes.push({ role: 'ink', d: 'M85.3 58V36.2Q85.3 34.6 83.5 35.8C80.5 39.5 78.3 47 79.1 53Q79.7 56.6 83.1 58Z' })
  shapes.push({ role: 'ink', d: 'M83.1 57H85.3V71.2A1.8 1.8 0 0 1 81.7 71.2Z' })
  return shapes
}
const SHAPES = glyphShapes()

/** Le dessin en SVG. ink / accent : couleurs ; le cadre (18, 30, 72, 48) est celui des logos sans tuile. */
function glyphMarkup(ink, accent) {
  return SHAPES.map((s) => {
    const color = s.role === 'accent' ? accent : ink
    return s.stroke
      ? `<path d="${s.d}" fill="none" stroke="${color}" stroke-width="${s.stroke}" stroke-linecap="${s.cap}" stroke-linejoin="round"/>`
      : `<path d="${s.d}" fill="${color}"/>`
  }).join('')
}

// ---------- Le logo : le mot et le dessin, mesurés en fraction du corps du mot F ----------
const F = 100
const k = F / WORD.unitsPerEm // 0,1 : les tracés du mot sont à 1 000 unités par em
const baselineInBox = (F - (WORD.ascent - WORD.descent) * k) / 2 + WORD.ascent * k // ligne de base dans une boîte de hauteur F
const wordInkLeft = WORD.bbox.minX * k
const wordInkRight = WORD.bbox.maxX * k
const wordInkBottom = WORD.bbox.maxY * k
const wordAdvance = WORD.advance * k

function layouts() {
  // Horizontal : dessin de 1,12 F de haut, espace de 0,2 F, mot centré sur le dessin.
  const hScale = (1.12 * F) / 48
  const hIconW = 72 * hScale
  const hBase = (1.12 * F) / 2 - F / 2 + baselineInBox
  const hWordX = hIconW + 0.2 * F
  const horizontal = {
    iconTransform: `scale(${round(hScale)}) translate(-18 -30)`,
    wordTransform: `translate(${round(hWordX)} ${round(hBase)}) scale(${k})`,
    box: [0, 0, hWordX + wordInkRight, Math.max(1.12 * F, hBase + wordInkBottom)],
  }
  // Empilé : dessin de 1,8 F de haut au-dessus du mot, espace de 0,2 F, le tout centré.
  const sScale = (1.8 * F) / 48
  const sIconW = 72 * sScale
  const sIconX = wordAdvance / 2 - sIconW / 2
  const sBase = 1.8 * F + 0.2 * F + baselineInBox
  const x0 = Math.min(sIconX, wordInkLeft)
  const x1 = Math.max(sIconX + sIconW, wordInkRight)
  const stack = {
    iconTransform: `translate(${round(sIconX)} 0) scale(${round(sScale)}) translate(-18 -30)`,
    wordTransform: `translate(0 ${round(sBase)}) scale(${k})`,
    box: [x0, 0, x1, sBase + wordInkBottom],
  }
  return { horizontal, stack }
}
const LAYOUTS = layouts()
const viewBox = ([x0, y0, x1, y1], pad = 0) =>
  `${Math.floor(x0 - pad)} ${Math.floor(y0 - pad)} ${Math.ceil(x1 - x0 + 2 * pad)} ${Math.ceil(y1 - y0 + 2 * pad)}`

function logoSvg(layout, ink, accent, pad = 0) {
  const l = LAYOUTS[layout]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(l.box, pad)}" role="img" aria-label="Repas"><title>Repas</title><g transform="${l.iconTransform}">${glyphMarkup(ink, accent)}</g><path transform="${l.wordTransform}" d="${WORD.path}" fill="${ink}"/></svg>\n`
}

const iconSvg = (size, bg = COLORS.basil, box = '0 0 108 108') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${size}" height="${size}"><rect x="-200" y="-200" width="600" height="600" fill="${bg}"/>${glyphMarkup(COLORS.white, COLORS.saffron)}</svg>\n`

// ---------- Android : dessin vectoriel de l'icône adaptative (fond basilic séparé, zone sûre de 66 dp) ----------
// Le dessin occupe un peu plus que la zone sûre dans la grille d'icône ; on le réduit à 88 % autour de son centre.
const androidGroup = (inkColor, accentColor) => {
  const paths = SHAPES.map((s) => {
    const color = s.role === 'accent' ? accentColor : inkColor
    const attrs = s.stroke
      ? `android:fillColor="#00000000"\n            android:strokeColor="${color}"\n            android:strokeWidth="${s.stroke}"\n            android:strokeLineCap="${s.cap}"\n            android:strokeLineJoin="round"`
      : `android:fillColor="${color}"`
    return `        <path\n            ${attrs}\n            android:pathData="${s.d}" />`
  }).join('\n')
  return `    <group\n        android:pivotX="54"\n        android:pivotY="55"\n        android:scaleX="0.88"\n        android:scaleY="0.88"\n        android:translateY="-1">\n${paths}\n    </group>`
}
const androidVector = (comment, inkColor, accentColor) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${comment} -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="108"\n    android:viewportHeight="108">\n${androidGroup(inkColor, accentColor)}\n</vector>\n`

// ---------- Rendu : PNG par Chromium, ICO assemblé à la main ----------
async function renderPng(browser, svgText, width, height, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(`<body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg style="display:block" width="${width}" height="${height}" `)}</body>`)
  const buffer = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } })
  await page.close()
  return buffer
}

/** Chromium écrit un PNG sans canal alpha quand l'image est opaque ; la console du Play Store veut un PNG 32 bits : on le réécrit en RVBA. */
function withAlpha(png) {
  const chunks = []
  for (let pos = 8; pos < png.length; pos += 12 + png.readUInt32BE(pos)) {
    chunks.push({ type: png.toString('latin1', pos + 4, pos + 8), data: png.subarray(pos + 8, pos + 8 + png.readUInt32BE(pos)) })
  }
  const header = chunks.find((c) => c.type === 'IHDR').data
  const [width, height, colorType] = [header.readUInt32BE(0), header.readUInt32BE(4), header[9]]
  if (colorType === 6) return png
  if (colorType !== 2) throw new Error(`PNG de type ${colorType} non géré`)
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)))
  const stride = width * 3
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? pixels[y * stride + x - 3] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= 3 && y > 0 ? pixels[(y - 1) * stride + x - 3] : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  const rgba = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const target = y * (width * 4 + 1) + 1 + x * 4
      pixels.copy(rgba, target, y * stride + x * 3, y * stride + x * 3 + 3)
      rgba[target + 3] = 255
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rgba, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16)
    e[0] = size
    e[1] = size
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  console.log('écrit', path.replace(`${root}/`, ''))
}

// ---------- Géométrie du composant Vue ----------
function geometryModule() {
  const shapes = SHAPES.map((s) => `  { role: '${s.role}', d: '${s.d}'${s.stroke ? `, stroke: ${s.stroke}, cap: '${s.cap}'` : ''} },`).join('\n')
  const lay = (l) => `{ viewBox: '${viewBox(l.box)}', iconTransform: '${l.iconTransform}', wordTransform: '${l.wordTransform}' }`
  return `// Généré par scripts/brand-assets.mjs : ne pas modifier à la main (docs/logo/README.md).
export type LogoShape = { role: 'ink' | 'accent'; d: string; stroke?: number; cap?: 'butt' | 'round' }

/** Le dessin de l'icône, sur la grille de 108 x 108 (cadre 18, 30, 72, 48 des logos sans tuile). */
export const LOGO_SHAPES: LogoShape[] = [
${shapes}
]

/** Le mot « Repas » en Playfair Display Bold, en tracés (1 000 unités par em, ligne de base à 0). */
export const LOGO_WORD_PATH =
  '${WORD.path}'

export const LOGO_LAYOUTS = {
  horizontal: ${lay(LAYOUTS.horizontal)},
  stack: ${lay(LAYOUTS.stack)},
} as const
`
}

// ---------- Tout écrire ----------
const browser = await chromium.launch()
try {
  const accent = COLORS.saffron
  const variants = {
    clair: [COLORS.basil, accent],
    vert: [COLORS.white, accent],
    sombre: [COLORS.mist, accent],
    'mono-basilic': [COLORS.basil, COLORS.basil],
    'mono-blanc': [COLORS.white, COLORS.white],
  }

  // Logos et icône de référence (docs/logo)
  for (const [name, [ink, acc]] of Object.entries(variants)) {
    write(join(root, `docs/logo/logo-empile-${name}.svg`), logoSvg('stack', ink, acc))
    write(join(root, `docs/logo/logo-horizontal-${name}.svg`), logoSvg('horizontal', ink, acc))
  }
  write(join(root, 'docs/logo/icon.svg'), iconSvg(512))

  // Icônes du site (PWA, iOS, onglet)
  const icon = (size) => renderPng(browser, iconSvg(size), size, size)
  write(join(root, 'public/icons/icon-512.png'), await icon(512))
  write(join(root, 'public/icons/icon-192.png'), await icon(192))
  // Le dessin tient dans les 80 % centraux (zone sûre d'une icône « maskable ») : la même image sert aux deux.
  write(join(root, 'public/icons/icon-maskable-512.png'), await icon(512))
  write(join(root, 'public/icons/apple-touch-icon.png'), await icon(180))
  write(join(root, 'src/assets/logo.png'), await icon(192))
  const tab = (size) => renderPng(browser, iconSvg(size, COLORS.basil, '17 18 74 74'), size, size)
  const ico = buildIco([
    { size: 16, png: await tab(16) },
    { size: 32, png: await tab(32) },
    { size: 48, png: await tab(48) },
  ])
  write(join(root, 'public/favicon.ico'), ico)

  // Application Android : fond basilic séparé, dessin vectoriel (couleur et une seule couleur)
  write(
    join(root, 'android/app/src/main/res/drawable/ic_launcher_foreground.xml'),
    androidVector("L'icône de Repas (anneau-horloge, fourchette, couteau), réduite à 88 % pour tenir dans la zone sûre (le disque central de 66 dp) d'une icône adaptative de 108 dp. Généré par scripts/brand-assets.mjs.", '#FFFFFF', '@color/saffron'),
  )
  write(
    join(root, 'android/app/src/main/res/drawable/ic_launcher_monochrome.xml'),
    androidVector("L'icône thématique d'Android 13 : le même dessin, d'une seule couleur (la coche sépare l'anneau par un vrai vide). Généré par scripts/brand-assets.mjs.", '#FFFFFF', '#FFFFFF'),
  )

  // Fiche du Play Store (STORE-015) : icône 512 x 512 à fond plein, Google applique ses coins
  write(join(root, 'android/store/icon.svg'), iconSvg(512))
  write(join(root, 'android/store/images/icon.png'), withAlpha(await icon(512))) // PNG 32 bits : le canal alpha est exigé par la console

  // Composant Vue
  write(join(root, 'src/design/logoGeometry.ts'), geometryModule())

  // Dépôt du back : onglet de l'API, logo servi par /images, icônes de la fiche du skill Alexa
  if (existsSync(join(backRoot, 'public'))) {
    write(join(backRoot, 'public/favicon.ico'), ico)
    const padded = logoSvg('stack', COLORS.basil, accent, 70)
    write(join(backRoot, 'public/images/logo.png'), await renderPng(browser, padded.replace(/width="\d+" height="\d+"/, ''), 280, 250, { transparent: true }))
    write(join(backRoot, 'docs/voice/skill/assets/fr-FR_largeIcon.png'), await icon(512))
    write(join(backRoot, 'docs/voice/skill/assets/fr-FR_smallIcon.png'), await icon(108))
  } else {
    console.log(`dépôt du back introuvable (${backRoot}) : ses fichiers ne sont pas écrits (option --back).`)
  }
} finally {
  await browser.close()
}
