// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 12 : un produit déjà connu est-il retrouvé par une recherche sur son libellé, avec son stock ?
// Et que répond le panier quand on ajoute un produit en rupture (stock 0) ?
import { pauseBetweenRequests } from '../http'
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { button, hint, labelled, resultsPanel } from '../ui/widgets'
import { BLOCK_MESSAGE, describeReply, needStore, search } from './common'
import { offerAdd, productPicker } from './cartFlow'

export const dispo: Essai = {
  id: 12,
  title: 'Disponibilité d’un produit connu',
  summary: 'Produit connu : stock et rupture.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const zone = h('div')
    const id = h('input', { attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off' } })
    const label = h('input', { attrs: { type: 'text', autocomplete: 'off' } })
    const picker = productPicker(ctx, (product) => {
      id.value = product.id
      label.value = product.label1 ?? ''
    })

    const check = button(
      'Chercher ce produit',
      () => {
        const store = needStore(ctx, panel)
        const productId = id.value.trim()
        const text = label.value.trim()
        if (!store) return
        if (!/^\d{1,12}$/.test(productId) || text === '') {
          panel.set(["Renseigne l'identifiant (chiffres) et le libellé du produit."])
          return
        }
        check.disabled = true
        zone.replaceChildren()
        panel.set([`Recherche de « ${text} »…`])
        void search(ctx, store, text)
          .then((outcome) => {
            const lines = [
              `Produit recherché : id ${productId}, libellé « ${text} »`,
              describeReply(outcome.reply),
            ]
            if (outcome.reply.error !== null || outcome.reply.status !== 200) {
              panel.set([
                ...lines,
                outcome.reply.blocked
                  ? BLOCK_MESSAGE
                  : 'Pas de réponse exploitable : impossible de lire le stock.',
              ])
              return
            }
            const rank = outcome.parsed.products.findIndex((product) => product.id === productId)
            const found = rank >= 0 ? outcome.parsed.products[rank] : undefined
            lines.push(`Produits reconnus dans la recherche : ${outcome.parsed.products.length}`)
            if (found) {
              lines.push(
                `Retrouvé par son identifiant : oui, au rang ${rank + 1}`,
                `Stock (iQteDisponible) : ${found.stock ?? 'non lu'}`,
                `Déjà au panier (iQuantitePanier) : ${found.inCart ?? 'non lu'}`,
              )
            } else {
              lines.push('Retrouvé par son identifiant : non (retiré, ou libellé trop différent)')
            }
            panel.set(lines)

            const outOfStock = found !== undefined && found.stock === 0
            if (found && !outOfStock) {
              append(zone, hint("Disponible : l'essai 3 teste l'ajout."))
              return
            }
            append(
              zone,
              hint(
                outOfStock
                  ? 'Stock 0 : tu peux voir la réponse du panier (après confirmation).'
                  : "Produit introuvable. S'il est en rupture, tu peux voir la réponse du panier (après confirmation).",
              ),
              button(
                'Essayer d’ajouter ce produit…',
                () =>
                  offerAdd(ctx, panel, zone, {
                    productId,
                    label: found?.label1 ?? text,
                    afterAdd: async (storeInfo) => {
                      panel.add(
                        '',
                        'Relecture de la quantité par une recherche (après une pause)...',
                      )
                      await ctx.env.sleep(pauseBetweenRequests(ctx.env.random))
                      const again = await search(ctx, storeInfo, text)
                      const after = again.parsed.products.find(
                        (product) => product.id === productId,
                      )
                      panel.add(
                        again.reply.status === 200
                          ? `Après l'essai, quantité au panier lue (iQuantitePanier) : ${after?.inCart ?? 'produit non retrouvé'}`
                          : describeReply(again.reply),
                      )
                    },
                  }),
                'primary',
              ),
            )
          })
          .finally(() => {
            check.disabled = false
          })
      },
      'primary',
    )

    append(
      ctx.main,
      hint("Choisis un produit de l'essai 2, ou saisis son identifiant et son libellé."),
      picker,
      labelled('Identifiant du produit (chiffres)', id),
      labelled('Libellé du produit', label),
      h('div', { class: 'row' }, check),
      zone,
      panel.el,
    )
  },
}
