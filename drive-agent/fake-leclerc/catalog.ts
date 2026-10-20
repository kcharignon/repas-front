// Le catalogue du faux site : 127 produits INVENTÉS (marques, libellés, prix, identifiants). Rien n'est copié d'une enseigne.
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
  /**
   * La photo du produit (DRV-633) : par défaut une photo servie par le faux hôte d'images ; `none` (aucune adresse dans le JSON), `foreign` (une
   * adresse d'un autre hôte, que l'agent doit refuser), `missing` (une adresse correcte dont l'image répond 404).
   */
  photo?: 'none' | 'foreign' | 'missing'
  aisle: number
  family: number
  /**
   * DRV-647 (0.38.0) : un produit de marque de distributeur, que la page de recherche range dans une AUTRE liste (`objContenuMDD`) que les résultats
   * (`widgets`), comme le vrai site semble le faire pour les produits frais ; il n'est cherché que si le faux site a le mode `mddList`.
   */
  mdd?: boolean
}

/** Les rangs, dans la recherche « carotte », des 6 produits frais (DRV-642). */
const FRESH_CARROTS: ReadonlySet<number> = new Set([5, 11, 19, 20, 33, 39])

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
  // Photos (DRV-633) : 1000001 et 1000002 ont une photo ; 1000003 une adresse d'un autre hôte (refusée), 1000004 une photo qui répond 404, 1000005 aucune.
  make('Farine de blé T55 Moulin Imaginaire', '1 kg', 1.29, 1.29, 'kg', 12),
  make('Farine de blé T45 Moulin Imaginaire', '1 kg', 1.45, 1.45, 'kg', 0),
  make('Farine de blé T65 Meunier Fictif', '2 x 500 g', 2.8, 2.8, 'kg', 5, {
    promo: 2.49,
    photo: 'foreign',
  }),
  make('Farine de sarrasin Moulin Imaginaire', '500 g', 1.99, 3.98, 'kg', 3, { photo: 'missing' }),
  make('Farine complète Moulin Imaginaire', null, 2.1, 2.1, 'kg', 8, {
    structured: { unit: 'KG', each: 1, total: 1, totalUnit: 'kg' },
    photo: 'none',
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
  // mots, trait d'union conditionnel, opérateur invisible) : le back refuse en bloc un tel libellé (`422 DRIVE_CHOICE_INVALID`), l'agent doit
  // les retirer à la lecture (1000032).
  make(
    'Vinaigre\u200B de ci\u00ADdre\u202E Verger\uFEFF Imaginaire',
    '75\u2060 cl\u200F\u2061',
    2.4,
    3.2,
    'L',
    6,
  ),
  // DRV-635. Un produit à stock nul dont la fiche dit « Bientôt disponible » : le mode « disponibilité trompeuse » du faux site le fait accepter par le panier, comme le site mobile
  // de l'enseigne (1000033). Un produit en stock au libellé qui porte une apostrophe, pour le moteur de recherche à apostrophe stricte (1000034).
  make("Céréales fourrées P'tit Fermier Chocolat noisette", '450 g', 2.19, 4.87, 'kg', 0),
  make("Gâteaux C'est Nous Pépites", '300 g', 1.85, 6.17, 'kg', 9),
  // DRV-643. Une recherche aux nombreux résultats (« biscuit » : 45 produits, 1000035 à 1000079), pour l'affichage de la liste par lots en défilant. Un libellé
  // qui ne contient aucun mot des autres recherches du faux site. Deux sont en rupture (1000040, 1000075), un en promotion (1000050).
  ...Array.from({ length: 45 }, (_unused, index) =>
    make(
      `Biscuit sablé Sablerie Fictive série ${String(index + 1).padStart(2, '0')}`,
      `${150 + index} g`,
      (100 + index * 10) / 100,
      (600 + index * 10) / 100,
      'kg',
      index === 5 || index === 40 ? 0 : 10 + index,
      index === 15 ? { promo: 1.9 } : {},
    ),
  ),
  // DRV-646. Des produits frais dont le diagnostic mesure les rayons (« tomate », « pomme », « courgette ») : des rayons et des familles inventés,
  // plusieurs produits par rayon, un produit d'un autre rayon pour que les groupes diffèrent (1000080 à 1000087).
  make('Tomates cerises Jardin Inventé', '250 g', 1.99, 7.96, 'kg', 14, { aisle: 41, family: 410 }),
  make('Pommes Gala Verger Imaginaire', '1 kg', 2.49, 2.49, 'kg', 30, { aisle: 41, family: 411 }),
  make('Pommes Golden Verger Imaginaire', '1 kg', 2.39, 2.39, 'kg', 22, { aisle: 41, family: 411 }),
  make('Compote de pommes Verger Imaginaire', '4 x 100 g', 1.55, 3.88, 'kg', 18, {
    aisle: 12,
    family: 345,
  }),
  make('Jus de pomme Verger Imaginaire', '1 L', 1.65, 1.65, 'L', 12, { aisle: 15, family: 520 }),
  make('Courgettes Jardin Inventé', '500 g', 1.79, 3.58, 'kg', 16, { aisle: 41, family: 412 }),
  make('Courgettes bio Jardin Inventé', '500 g', 2.29, 4.58, 'kg', 7, { aisle: 41, family: 412 }),
  make('Courgettes grillées surgelées Jardin Inventé', '600 g', 2.95, 4.92, 'kg', 9, {
    aisle: 60,
    family: 601,
  }),
  // DRV-642. Une recherche de légumes aux rayons mêlés (« carotte » : 40 produits, 1000088 à 1000127) pour classer par rayon : 6 produits frais
  // (rayon 41, famille 413) dispersés parmi 34 produits d'autres rayons (conserves 7, jus 15, surgelés 60), dans un ordre du site où les frais
  // ne sont ni en tête ni groupés. Des identifiants de rayon inventés, jamais ceux d'une enseigne.
  ...Array.from({ length: 40 }, (_unused, index) => {
    const fresh = FRESH_CARROTS.has(index)
    const number = String(index + 1).padStart(2, '0')
    const [kind, aisle, family] = fresh
      ? ['Carottes fraîches Jardin Inventé lot', 41, 413]
      : index % 3 === 0
        ? ['Jus de carotte Verger Imaginaire série', 15, 521]
        : index % 3 === 1
          ? ['Carottes râpées en boîte Conserverie Fictive série', 7, 71]
          : ['Poêlée de carottes surgelée Jardin Inventé série', 60, 602]
    return make(
      `${kind} ${number}`,
      `${400 + index} g`,
      (150 + index * 5) / 100,
      (300 + index * 5) / 100,
      'kg',
      12,
      { aisle: aisle as number, family: family as number },
    )
  }),
  // DRV-647 (0.38.0). Des produits frais de marque de distributeur (1000128 à 1000131), rangés dans `objContenuMDD` : rayon 41, famille 414 « Legumes ».
  make('Tomates rondes Nos Régions Inventées', '1 kg', 2.49, 2.49, 'kg', 20, {
    aisle: 41,
    family: 414,
    mdd: true,
  }),
  make('Tomates grappe Marque Repère Inventée', '500 g', 1.99, 3.98, 'kg', 12, {
    aisle: 41,
    family: 414,
    mdd: true,
  }),
  make('Courgettes Nos Régions Inventées', '1 kg', 1.89, 1.89, 'kg', 15, {
    aisle: 41,
    family: 414,
    mdd: true,
  }),
  make('Carottes Nos Régions Inventées', '1 kg', 1.29, 1.29, 'kg', 25, {
    aisle: 41,
    family: 414,
    mdd: true,
  }),
  // DRV-652. Un article que la liste compte en tranches : le contenu net est en grammes (rien à convertir en tranches), mais le libellé dit le nombre de
  // tranches (1000132 : 20, 1000133 : 8, 1000134 : aucun nombre de tranches), de quoi préremplir « Combien de tranches y a-t-il dans ce produit ? ».
  make(
    'Fromage cheddar en tranches Fromagerie Fictive',
    '20 Tranches - 340g',
    2.99,
    8.79,
    'kg',
    12,
  ),
  make('Fromage cheddar en tranches Fromagerie Fictive', '8 Tranches - 150g', 1.89, 12.6, 'kg', 9),
  make('Fromage cheddar râpé Fromagerie Fictive', '200 g', 1.75, 8.75, 'kg', 14),
  // Un fromage en tranches sans photo (1000135) : l'écran de quantité ne laisse ni trou ni image cassée.
  make(
    'Fromage cheddar fondu en tranches Fromagerie Fictive',
    '10 Tranches - 200g',
    1.49,
    7.45,
    'kg',
    8,
    {
      photo: 'none',
    },
  ),
]

/** Un texte sans accent ni majuscule : « Œufs » et « oeufs » se valent, comme dans une recherche. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').toLowerCase()
}

/**
 * Le moteur « apostrophe stricte » (DRV-635), d'après le relevé du 2026-10-19 sur le vrai site : « c'est » et « cest » retrouvent « C'est », « c est » (l'apostrophe
 * remplacée par une espace) ne trouve RIEN. Les mots se séparent aux espaces seulement, l'apostrophe est retirée des deux côtés, et un mot cherché est le
 * début d'un mot du libellé (« est » n'est le début d'aucun mot de « Gâteaux C'est Nous », « cest » l'est). Accents et majuscules sont ignorés.
 */
function searchWithStrictApostrophe(query: string): FakeProduct[] {
  const tokens = (text: string) => normalize(text).replace(/['’]/g, '').split(/\s+/).filter(Boolean)
  const words = tokens(query)
  if (words.length === 0) return []
  return PRODUCTS.filter((product) => {
    const labelWords = tokens(`${product.label1} ${product.label2 ?? ''}`)
    return words.every((word) => labelWords.some((labelWord) => labelWord.startsWith(word)))
  })
}

/**
 * Les produits dont le libellé contient tous les mots cherchés, dans l'ordre du catalogue. Par défaut la recherche est tolérante (sans accents
 * ni majuscules, `œ` = `oe`). Avec `strict`, elle imite un moteur sensible aux accents, à la ligature et au pluriel (le vrai site, d'après les
 * hypothèses H3 et H7 de l'audit du 2026-10-18) : seules les majuscules sont ignorées, « œuf » ne trouve pas les « Oeufs », « creme » ne trouve
 * pas la « Crème », « spaghettis » ne trouve pas le « Spaghetti » ; un mot cherché est une partie d'un mot du libellé (« oeuf » trouve « Oeufs »).
 */
export function searchCatalog(
  query: string,
  strict = false,
  strictApostrophe = false,
): FakeProduct[] {
  if (strictApostrophe) return searchWithStrictApostrophe(query)
  if (strict) {
    const words = query
      .normalize('NFC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
    if (words.length === 0) return []
    return PRODUCTS.filter((product) => {
      const label = `${product.label1} ${product.label2 ?? ''}`.normalize('NFC').toLowerCase()
      return words.every((word) => label.includes(word))
    })
  }
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
