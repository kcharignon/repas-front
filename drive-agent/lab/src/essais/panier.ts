// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 3 : ajouter un produit au panier, puis le retirer. Une confirmation avant chaque écriture.
import { append, h } from '../ui/dom'
import type { Essai } from '../ui/types'
import { hint, labelled, resultsPanel, button } from '../ui/widgets'
import { offerAdd, productPicker } from './cartFlow'

export const panier: Essai = {
  id: 3,
  title: 'Ajouter puis retirer un produit',
  summary: 'Ajoute 1 produit au vrai panier, puis le retire.',
  render(ctx) {
    const panel = resultsPanel(ctx)
    const zone = h('div')
    const id = h('input', { attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off' } })
    let label: string | null = null
    id.addEventListener('input', () => {
      label = null
    })
    const picker = productPicker(ctx, (product) => {
      id.value = product.id
      label = product.label1
    })
    append(
      ctx.main,
      hint(
        "Choisis un produit peu cher vu à l'essai 2 et absent de ton panier. 1 exemplaire est ajouté après ta confirmation.",
      ),
      picker,
      labelled('Identifiant du produit (chiffres)', id),
      h(
        'div',
        { class: 'row' },
        button(
          'Préparer l’ajout…',
          () => offerAdd(ctx, panel, zone, { productId: id.value, label }),
          'primary',
        ),
      ),
      zone,
      panel.el,
    )
  },
}
