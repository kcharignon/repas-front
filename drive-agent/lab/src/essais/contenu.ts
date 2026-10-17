// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 10 : contenu net des produits, déduit de deux façons pour les comparer.
import { CONTENT_SAMPLE, DEFAULT_QUERY } from '../config'
import {
  compareContents,
  contentFromLabel,
  contentFromPrices,
  contentFromStructured,
  formatContent,
  type Agreement,
  type Content,
  type StructuredReading,
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
  /** Champs structurés du site (`sUniteMesure`, `nrContenanceUnitaire`, `nrContenanceTotale`), lus et ramenés à une unité. */
  structured: StructuredReading
  hasStructured: boolean
}

/** « accord » ou « écart » entre deux contenus, « non comparable » si l'un des deux manque. */
export function versus(
  left: Content | null,
  right: Content | null,
): 'accord' | 'écart' | 'non comparable' {
  if (!left || !right) return 'non comparable'
  return compareContents(left, right) === 'accord' ? 'accord' : 'écart'
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
    structured: contentFromStructured(product.structured),
    hasStructured: product.structured !== undefined,
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
    ...structuredSummary(rows.map(({ row }) => row)),
    '',
  ]
  rows.forEach(({ product, row }, i) => {
    const source = row.labelLine ? ` (ligne ${row.labelLine})` : ''
    lines.push(
      `${i + 1}. id ${product.id} — ${product.label1 ?? '?'} | ${product.label2 ?? '—'}`,
      `   libellé${source} : ${formatContent(row.byLabel)} · prix : ${formatContent(row.byPrices)} (${product.unitPriceText ?? '?'} ÷ ${product.measurePriceText ?? '?'}) → ${row.agreement}`,
    )
    if (product.structured) lines.push(structuredLine(product, row))
  })
  return lines
}

/** Les trois champs structurés tels que lus, puis leur valeur ramenée à une unité et leur accord avec les deux méthodes. */
function structuredLine(product: Product, row: ContentRow): string {
  const fields = product.structured
  const raw = [
    `sUniteMesure=${fields?.unitMeasure ?? '—'}`,
    `nrContenanceUnitaire=${fields?.unitContent ?? '—'}`,
    `nrContenanceTotale=${fields?.totalContent ?? '—'}`,
    `sUniteMesureTotale=${fields?.totalUnit ?? '—'}`,
  ].join(' · ')
  return `   structuré : ${raw} → ${formatContent(row.structured.best)} (libellé : ${versus(row.structured.best, row.byLabel)} · prix : ${versus(row.structured.best, row.byPrices)})`
}

/** Les champs structurés s'accordent-ils avec le libellé et avec les prix ? Ou bien le site n'en donne pas. */
function structuredSummary(rows: readonly ContentRow[]): string[] {
  const present = rows.filter((row) => row.hasStructured)
  const names = 'sUniteMesure, nrContenanceUnitaire, nrContenanceTotale'
  if (present.length === 0) {
    return [`Champs structurés (${names}) : absents des produits de cette recherche.`]
  }
  const tally = (other: (row: ContentRow) => Content | null) => {
    const verdicts = present.map((row) => versus(row.structured.best, other(row)))
    const comparable = verdicts.filter((verdict) => verdict !== 'non comparable').length
    return `d'accord ${verdicts.filter((verdict) => verdict === 'accord').length} sur ${comparable} comparable(s)`
  }
  return [
    `Champs structurés (${names}) : présents sur ${present.length} produit(s) sur ${rows.length}.`,
    `Structuré contre libellé : ${tally((row) => row.byLabel)} ; structuré contre prix : ${tally((row) => row.byPrices)}`,
  ]
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
