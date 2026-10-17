// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 10 : contenu net des produits, déduit de deux façons pour les comparer.
import { CONTENT_SAMPLE, DEFAULT_QUERY } from '../config'
import {
  compareContents,
  contentFromLabel,
  contentFromPrices,
  formatContent,
  type Agreement,
  type Content,
} from '../content'
import type { Product } from '../parse'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, resultsPanel } from '../ui/widgets'
import { describeReply, needStore, search } from './common'

export interface ContentRow {
  byLabel: Content | null
  labelLine: 1 | 2 | null
  byPrices: Content | null
  agreement: Agreement
}

/** Les deux méthodes pour un produit : libellé de seconde ligne (à défaut, de première ligne), puis prix. */
export function compareProduct(product: Product): ContentRow {
  const second = contentFromLabel(product.label2)
  const first = second ? null : contentFromLabel(product.label1)
  const byLabel = second ?? first
  const byPrices = contentFromPrices(
    product.unitPrice,
    product.measurePrice,
    product.measurePriceText,
  )
  return {
    byLabel,
    labelLine: second ? 2 : first ? 1 : null,
    byPrices,
    agreement: compareContents(byLabel, byPrices),
  }
}

export function contentReport(products: readonly Product[]): string[] {
  const sample = products.slice(0, CONTENT_SAMPLE)
  const rows = sample.map((product) => ({ product, row: compareProduct(product) }))
  const count = (test: (row: ContentRow) => boolean) => rows.filter(({ row }) => test(row)).length
  const lines = [
    `Contenu net de ${sample.length} produit(s) : libellé (ligne 2, à défaut ligne 1) et prix unitaire ÷ prix par unité de mesure`,
    `Trouvé par le libellé : ${count((r) => r.byLabel !== null)} (dont ligne 2 : ${count((r) => r.labelLine === 2)}, ligne 1 seulement : ${count((r) => r.labelLine === 1)})`,
    `Trouvé par les prix : ${count((r) => r.byPrices !== null)}`,
    `Les deux méthodes d'accord : ${count((r) => r.agreement === 'accord')} ; en désaccord : ${count((r) => r.agreement === 'écart')}`,
    `Au moins une méthode : ${count((r) => r.byLabel !== null || r.byPrices !== null)} ; aucune : ${count((r) => r.agreement === 'aucune')}`,
    '',
  ]
  rows.forEach(({ product, row }, i) => {
    const source = row.labelLine ? ` (ligne ${row.labelLine})` : ''
    lines.push(
      `${i + 1}. id ${product.id} — ${product.label1 ?? '?'} | ${product.label2 ?? '—'}`,
      `   libellé${source} : ${formatContent(row.byLabel)} · prix : ${formatContent(row.byPrices)} (${product.unitPriceText ?? '?'} ÷ ${product.measurePriceText ?? '?'}) → ${row.agreement}`,
    )
  })
  return lines
}

export const contenu: Essai = {
  id: 10,
  title: 'Contenu net des produits',
  summary: 'Contenu net : libellé ou prix ?',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const go = button(
      'Comparer',
      () => {
        const store = needStore(ctx, panel)
        if (!store) return
        go.disabled = true
        void (async () => {
          let products = ctx.state.lastProducts
          const header: string[] = []
          if (products.length === 0) {
            const query = ctx.state.lastQuery ?? DEFAULT_QUERY
            panel.set([`Pas encore de recherche : le banc cherche « ${query} »…`])
            const outcome = await search(ctx, store, query)
            header.push(`Recherche « ${query} » : ${describeReply(outcome.reply)}`)
            products = outcome.parsed.products
          } else {
            header.push(`Produits de la dernière recherche (« ${ctx.state.lastQuery ?? '?'} »).`)
          }
          panel.set(
            products.length === 0
              ? [...header, 'Aucun produit reconnu : essaie l’essai 2.']
              : [...header, ...contentReport(products)],
          )
        })().finally(() => {
          go.disabled = false
        })
      },
      'primary',
    )
    append(
      ctx.main,
      hint(
        "Utilise la dernière recherche (essai 2) ; pour environ 30 produits, cherche 'farine' ou 'lait'.",
      ),
      h('div', { class: 'row' }, go),
      panel.el,
    )
  },
}
