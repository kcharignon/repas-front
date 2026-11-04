// La page de présentation `/presentation` (ADR 0021) : une page statique de `public/presentation/`, hors de l'application. Ce test la garde sur ce
// que le build et le navigateur ne diraient pas : la voix du produit (tutoiement, phrases courtes, pas de point d'exclamation, glossaire), la
// politique de contenu du site (aucun code ni style en ligne, aucune ressource d'un autre site : la page ne mesure pas l'audience, et le dit),
// les fichiers promis (images, polices, image de partage), les métadonnées de partage et le routage (service worker, Caddy).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicDir = join(root, 'public')
const html = readFileSync(join(publicDir, 'presentation', 'index.html'), 'utf8')
const css = readFileSync(join(publicDir, 'presentation', 'presentation.css'), 'utf8')
const doc = new DOMParser().parseFromString(html, 'text/html')

/** Les adresses de l'application que la page lie : des routes du site, pas des fichiers. */
const APP_ROUTES = new Set([
  '/presentation',
  '/inscription',
  '/connexion',
  '/installer',
  '/confidentialite',
])
/** Les seules adresses d'un autre site que la page peut lier (un lien qu'on touche, jamais une ressource chargée). */
const EXTERNAL_LINKS = new Set(['https://github.com/kcharignon/repas'])

const clean = (text: string) => text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()

/** Les blocs de texte que le visiteur lit (titres, paragraphes, questions, puces). */
const blocks = [...doc.querySelectorAll('h1, h2, h3, p, summary, .ticks li')].map((node) =>
  clean(node.textContent ?? ''),
)
/** Les textes alternatifs : ils sont lus à voix haute, ils suivent la même voix. */
const alts = [...doc.querySelectorAll('img[alt]')]
  .map((img) => clean(img.getAttribute('alt') ?? ''))
  .filter((alt) => alt !== '')
const readable = [...blocks, ...alts]

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter((part) => part !== '')
const words = (sentence: string) => sentence.split(' ').filter((token) => /[\p{L}\d]/u.test(token))

describe('la voix de la page', () => {
  it('tutoie : jamais « vous », « votre » ni « vos »', () => {
    const offenders = readable.filter((text) =>
      /(?<![\p{L}\d_])(?:vous|votre|vos|vôtres?)(?![\p{L}\d_])/iu.test(text),
    )
    expect(offenders).toEqual([])
  })

  it('ne met aucun point d’exclamation ni tiret cadratin', () => {
    expect(readable.filter((text) => /[!—]/.test(text))).toEqual([])
  })

  it('écrit des phrases de 15 mots au plus', () => {
    const tooLong = readable.flatMap(sentences).filter((sentence) => words(sentence).length > 15)
    expect(tooLong).toEqual([])
  })

  it('emploie les mots du glossaire (pas de jargon d’architecture)', () => {
    const forbidden =
      /(?<![\p{L}\d_])(?:agents?|plans?|passages?|ponts?|api|webview|apk|jetons?|enseignes?|retailers?|caddies?|fiches?|résumés?|mon compte|mémoris\p{L}*|persist\p{L}*)(?![\p{L}\d_])/iu
    const offenders = readable.filter((text) =>
      forbidden.test(text.replace(/créer mon compte/gi, '')),
    )
    expect(offenders).toEqual([])
  })

  it('met une espace insécable avant « : », « ? » et dans les guillemets', () => {
    const body = doc.body.innerHTML
    expect(body).not.toMatch(/[\p{L}\d] [:?]/u)
    expect(body).not.toMatch(/« (?!<)/)
    expect(body).not.toMatch(/ »/)
  })

  it('n’annonce que ce qui existe aujourd’hui (pas d’assistant vocal)', () => {
    expect(html).not.toMatch(/alexa/i)
  })
})

describe('la politique de contenu du site', () => {
  it('n’a aucun script, style ni gestionnaire en ligne', () => {
    expect(doc.querySelectorAll('script:not([src])')).toHaveLength(0)
    expect(doc.querySelectorAll('style')).toHaveLength(0)
    expect(doc.querySelectorAll('[style]')).toHaveLength(0)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
  })

  it('ne charge rien d’un autre site : ni script, ni police, ni image, ni cadre', () => {
    const loaded = [
      ...doc.querySelectorAll(
        'script[src], link[href]:not([rel="canonical"]), img[src], source[srcset], iframe',
      ),
    ]
    const external = loaded.filter((node) =>
      /^(?:https?:)?\/\//.test(
        node.getAttribute('src') ?? node.getAttribute('href') ?? node.getAttribute('srcset') ?? '',
      ),
    )
    expect(external).toEqual([])
    expect(doc.querySelectorAll('iframe')).toHaveLength(0)
    expect(css).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//)
    expect(css).not.toMatch(/@import/)
  })

  it('ne lie un autre site que par une ancre connue', () => {
    const anchors = [...doc.querySelectorAll('a[href^="http"]')].map((a) => a.getAttribute('href'))
    expect(anchors.filter((href) => !EXTERNAL_LINKS.has(href ?? ''))).toEqual([])
  })
})

describe('les fichiers promis', () => {
  const local = (value: string) => value.split(/[?#]/)[0] ?? value

  it('chaque image, police, feuille et script de la page existe', () => {
    const urls = [
      ...[...doc.querySelectorAll('[src]')].map((node) => node.getAttribute('src')),
      ...[...doc.querySelectorAll('[srcset]')].map((node) => node.getAttribute('srcset')),
      ...[...doc.querySelectorAll('link[href]')].map((node) => node.getAttribute('href')),
      ...[...css.matchAll(/url\('(\/[^')]+)'\)/g)].map((match) => match[1]),
    ].filter((url): url is string => typeof url === 'string' && url.startsWith('/'))
    expect(urls.length).toBeGreaterThan(20)
    const missing = urls.map(local).filter((url) => !existsSync(join(publicDir, url)))
    expect(missing).toEqual([])
  })

  it('chaque lien interne mène à une route du site ou à un fichier', () => {
    const hrefs = [...doc.querySelectorAll('a[href^="/"], a[href^="#"]')].map(
      (a) => a.getAttribute('href') ?? '',
    )
    const unknown = hrefs.filter((href) => !href.startsWith('#') && !APP_ROUTES.has(href))
    expect(unknown).toEqual([])
    const ids = new Set([...doc.querySelectorAll('[id]')].map((node) => node.id))
    expect(hrefs.filter((href) => href.startsWith('#') && !ids.has(href.slice(1)))).toEqual([])
  })

  it('l’image de partage fait 1200 × 630 et reste légère', () => {
    const file = readFileSync(join(publicDir, 'presentation', 'img', 'partage.png'))
    expect(file.subarray(1, 4).toString()).toBe('PNG')
    expect(file.readUInt32BE(16)).toBe(1200)
    expect(file.readUInt32BE(20)).toBe(630)
    expect(file.length).toBeLessThan(400 * 1024)
  })
})

describe('le partage, le référencement et l’accessibilité', () => {
  const meta = (selector: string) => doc.querySelector(selector)?.getAttribute('content') ?? ''

  it('porte un titre, une description, une adresse canonique et les balises de partage', () => {
    expect(doc.documentElement.lang).toBe('fr')
    expect(doc.title.length).toBeLessThanOrEqual(60)
    expect(meta('meta[name="description"]').length).toBeGreaterThan(70)
    expect(meta('meta[name="description"]').length).toBeLessThanOrEqual(160)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://kantin.eu/presentation',
    )
    expect(meta('meta[property="og:image"]')).toBe('https://kantin.eu/presentation/img/partage.png')
    expect(meta('meta[property="og:image:alt"]').length).toBeGreaterThan(10)
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(meta('meta[property="og:title"]')).toBe(doc.title)
  })

  it('a un seul titre de premier niveau et des titres sans saut', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1)
    const levels = [...doc.querySelectorAll('h1, h2, h3')].map((node) =>
      Number(node.tagName.slice(1)),
    )
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1)
      return level
    }, 0)
  })

  it('donne un texte alternatif et une taille à chaque image, vide pour le décor', () => {
    const images = [...doc.querySelectorAll('img')]
    expect(images.length).toBeGreaterThan(10)
    const decor = images.filter((img) => img.getAttribute('src')?.includes('/art/'))
    const content = images.filter((img) => !decor.includes(img))
    expect(decor.map((img) => img.getAttribute('alt'))).toEqual(decor.map(() => ''))
    expect(content.filter((img) => (img.getAttribute('alt') ?? '').length < 20)).toEqual([])
    const unsized = images.filter(
      (img) =>
        !/^\d+$/.test(img.getAttribute('width') ?? '') ||
        !/^\d+$/.test(img.getAttribute('height') ?? ''),
    )
    expect(unsized).toEqual([])
  })

  it('relie chaque section à son titre', () => {
    for (const labelled of doc.querySelectorAll('[aria-labelledby]')) {
      expect(doc.getElementById(labelled.getAttribute('aria-labelledby') ?? '')).not.toBeNull()
    }
  })

  it('propose le même bouton principal, vers l’inscription, en haut, au milieu et en bas', () => {
    const calls = [...doc.querySelectorAll('a[href="/inscription"]')].map((a) =>
      clean(a.textContent ?? ''),
    )
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(new Set(calls)).toEqual(new Set(['Créer mon compte']))
  })

  it('a une version sombre de chaque écran', () => {
    const light = [...doc.querySelectorAll('img[src*="ecran-"]')].map(
      (img) => img.getAttribute('src') ?? '',
    )
    expect(light.length).toBeGreaterThan(3)
    for (const src of light) {
      expect(existsSync(join(publicDir, src.replace('.webp', '-sombre.webp')))).toBe(true)
    }
  })
})

describe('le routage', () => {
  it('le service worker ne garde pas la page et ne la remplace jamais par la coque', () => {
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*'presentation\/\*\*'/)
    expect(config).toMatch(/navigateFallbackDenylist:\s*\[[^\]]*presentation/)
  })

  it('le serveur du site sert la page à /presentation et à /presentation/', () => {
    const caddy = readFileSync(join(root, 'docker', 'Caddyfile'), 'utf8')
    expect(caddy).toMatch(/@vitrine path \/presentation \/presentation\//)
    expect(caddy).toMatch(/rewrite \* \/presentation\/index\.html/)
  })
})
