// Le catalogue du faux site : 32 produits INVENTÉS (marques, libellés, prix, identifiants). Rien n'est copié d'une enseigne.
// Les champs ont les noms que `recherche.md` (dépôt back) relève sur le vrai site : c'est la structure qui est imitée, pas le contenu.

/** Le point de livraison du faux magasin (`sNoPointLivraison`) : différent de l'identifiant du magasin, comme sur le vrai site. */
export const DELIVERY_POINT = '123456'

export interface FakeProduct {
  id: number
  label1: string
  label2: string | null
  /** Prix unitaire TTC, en euros. */
  price: number
  /** Prix promotionnel, en euros (`sPrixPromo`). */
  promo?: number
  /** Prix à l'unité de mesure, en euros, et son texte (« 1,29 € / kg »). */
  perMeasure: number
  measure: 'kg' | 'L' | 'pièce'
  /** Stock : 0 = produit en rupture. */
  stock: number
  /** Contenu net structuré (`sUniteMesure`…), pour les produits qui en portent un. */
  structured?: { unit: 'KG' | 'L' | 'U'; each: number; total: number; totalUnit: 'kg' | 'l' | 'u' }
  /** Le site ne donne aucun contenu net lisible : ni seconde ligne, ni prix à l'unité de mesure (l'agent n'en déduit rien). */
  noContent?: boolean
  aisle: number
  family: number
}

let next = 1000000
const make = (
  label1: string,
  label2: string | null,
  price: number,
  perMeasure: number,
  measure: FakeProduct['measure'],
  stock: number,
  extra: Partial<FakeProduct> = {},
): FakeProduct => ({
  id: ++next,
  label1,
  label2,
  price,
  perMeasure,
  measure,
  stock,
  aisle: 10 + Math.floor((next - 1000001) / 5),
  family: 300 + (next - 1000000),
  ...extra,
})

export const PRODUCTS: readonly FakeProduct[] = [
  // Farine : un produit en rupture (1000002), un en promotion (1000003), un au contenu structuré (1000005).
  make('Farine de blé T55 Moulin Imaginaire', '1 kg', 1.29, 1.29, 'kg', 12),
  make('Farine de blé T45 Moulin Imaginaire', '1 kg', 1.45, 1.45, 'kg', 0),
  make('Farine de blé T65 Meunier Fictif', '2 x 500 g', 2.8, 2.8, 'kg', 5, { promo: 2.49 }),
  make('Farine de sarrasin Moulin Imaginaire', '500 g', 1.99, 3.98, 'kg', 3),
  make('Farine complète Moulin Imaginaire', null, 2.1, 2.1, 'kg', 8, {
    structured: { unit: 'KG', each: 1, total: 1, totalUnit: 'kg' },
  }),
  make('Sucre en poudre Épicerie Factice', '1 kg', 1.35, 1.35, 'kg', 20),
  make('Sucre glace Épicerie Factice', '500 g', 1.1, 2.2, 'kg', 7),
  make('Sucre roux Épicerie Factice', '750 g', 2.2, 2.93, 'kg', 0),
  make('Sel fin Salines du Test', '1 kg', 0.65, 0.65, 'kg', 30),
  make('Gros sel Salines du Test', '1 kg', 0.7, 0.7, 'kg', 14),
  make('Lait demi-écrémé UHT Laiterie du Test', '6 x 1 L', 7.2, 1.2, 'L', 9, {
    structured: { unit: 'L', each: 1, total: 6, totalUnit: 'l' },
  }),
  make('Lait entier UHT Laiterie du Test', '1 L', 1.3, 1.3, 'L', 11),
  make('Lait écrémé UHT Laiterie du Test', '1 L', 1.2, 1.2, 'L', 0),
  make('Oeufs frais de plein air Ferme Fictive', '6 pièces', 2.4, 0.4, 'pièce', 15),
  make('Oeufs frais de plein air Ferme Fictive', '12 pièces', 4.5, 0.38, 'pièce', 10),
  make('Beurre doux Laiterie du Test', '250 g', 2.3, 9.2, 'kg', 18),
  make('Beurre demi-sel Laiterie du Test', '250 g', 2.35, 9.4, 'kg', 6),
  make('Huile de tournesol Jardin Inventé', '1 L', 2.6, 2.6, 'L', 22),
  make('Huile d’olive vierge Jardin Inventé', '75 cl', 6.9, 9.2, 'L', 4),
  make('Huile de colza Jardin Inventé', '1 L', 2.9, 2.9, 'L', 12, { promo: 2.5 }),
  make('Poivre noir moulu Épicerie Factice', '40 g', 1.8, 45, 'kg', 25),
  make('Poivre noir en grains Épicerie Factice', '50 g', 2.4, 48, 'kg', 13),
  make('Riz long grain Moulin Imaginaire', '1 kg', 1.9, 1.9, 'kg', 17),
  make('Riz basmati Moulin Imaginaire', '500 g', 2.1, 4.2, 'kg', 9),
  make('Spaghetti Pasta Fictive', '500 g', 1.05, 2.1, 'kg', 40),
  make('Coquillettes Pasta Fictive', '500 g', 1.05, 2.1, 'kg', 35),
  make('Tomates concassées Jardin Inventé', '400 g', 0.95, 2.38, 'kg', 28),
  make('Tomates grappe Jardin Inventé', '500 g', 2.2, 4.4, 'kg', 6),
  make('Crème fraîche épaisse Laiterie du Test', '20 cl', 1.5, 7.5, 'L', 10),
  make('Yaourt nature Laiterie du Test', '8 x 125 g', 2.4, 2.4, 'kg', 16),
  // Un produit dont le contenu net ne se lit nulle part (DRV-613 : l'agent garde alors le nombre du plan).
  make('Cacao maigre Plantation Fictive', null, 3.2, 3.2, 'kg', 14, { noContent: true }),
  // Un produit dont les deux libellés portent des caractères invisibles (largeur nulle, sens de lecture, marque d'ordre des octets, joint de
  // mots) : le back refuse en bloc un tel libellé (`422 DRIVE_CHOICE_INVALID`), l'agent doit les retirer à la lecture (1000032).
  make(
    'Vinaigre\u200B de cidre\u202E Verger\uFEFF Imaginaire',
    '75\u2060 cl\u200F',
    2.4,
    3.2,
    'L',
    6,
  ),
]

/** Un texte sans accent ni majuscule : « Œufs » et « oeufs » se valent, comme dans une recherche. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').toLowerCase()
}

/** Les produits dont le libellé contient tous les mots cherchés, dans l'ordre du catalogue. */
export function searchCatalog(query: string): FakeProduct[] {
  const words = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return []
  return PRODUCTS.filter((product) => {
    const label = normalize(`${product.label1} ${product.label2 ?? ''}`)
    return words.every((word) => label.includes(word))
  })
}

export function findProduct(id: number): FakeProduct | undefined {
  return PRODUCTS.find((product) => product.id === id)
}

/** Le prix payé : le prix promotionnel quand il y en a un. */
export const paidPrice = (product: FakeProduct): number => product.promo ?? product.price
