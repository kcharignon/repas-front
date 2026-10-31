// Poser une feuille de style dans un Shadow DOM : sans balise `<style>` (une politique de sécurité de la page pourrait l'interdire) ; à défaut, la balise.
import { h } from './dom'

export function installStyles(
  win: Window & typeof globalThis,
  root: ShadowRoot,
  css: string,
): void {
  try {
    const sheet = new win.CSSStyleSheet()
    sheet.replaceSync(css)
    root.adoptedStyleSheets = [sheet]
  } catch {
    root.appendChild(h('style', { text: css }))
  }
}
