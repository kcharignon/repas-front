import { WALL_TEXT } from '../retailers/consent'
import type { GuideSub, GuideSubText } from '../retailers/guide'

/**
 * Les mots de chaque sous-étape du guide pour Auchan (DRV-757, voix de `repas-po` : tutoiement, quinze mots au plus par phrase, aucun jargon). Le libellé cité (`{label}`) est
 * celui de l'élément que la page montre et que le repère entoure, lu à l'instant (la barre dit « Choisir mon mode de livraison » ou « Choisir vos courses » selon la page :
 * jamais un mot que l'écran n'a pas) ; sans libellé, `bare`. Les états du panneau de choix du drive sont une FORME PLAUSIBLE, non mesurée au-delà du constat du 2026-11-01.
 */
export const GUIDE_TEXTS: Readonly<Partial<Record<GuideSub, GuideSubText>>> = {
  wall: WALL_TEXT,
  bar: {
    text: 'Touche « {label} », en haut de la page.',
    bare: 'Touche la barre, en haut de la page.',
    short: 'Touche la barre du haut',
  },
  connexion: {
    text: 'Touche « {label} », en haut de la page, pour te connecter.',
    // « en haut à droite » : mesuré sur le téléphone (2026-11-01), le bouton de connexion du bandeau est sans nom, tout à droite (x 840 à 1042 sur 1080, y 135 à 235) et ouvre « Se connecter »
    bare: 'Touche l’icône de connexion, en haut à droite de la page.',
    short: 'Touche la connexion',
  },
  field: { text: 'Écris ton code postal ou ta ville.', short: 'Écris ton code postal' },
  city: { text: 'Touche ta ville dans la liste.', short: 'Touche ta ville' },
  shop: { text: 'Touche ton magasin dans la liste.', short: 'Touche ton magasin' },
  confirm: {
    text: 'Touche « {label} » pour garder ce magasin.',
    bare: 'Touche le bouton pour garder ce magasin.',
    short: 'Garde ce magasin',
  },
}
