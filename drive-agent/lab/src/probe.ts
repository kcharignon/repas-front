// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 1 : sonde d'environnement. Ne lit aucun cookie (seulement : le cookie `datadome` existe-t-il ?).
import { EXCERPT_CHARS, LAB_VERSION } from './config'
import type { PageWindow } from './env'
import { readLabHash } from './fragment'
import { hasCookie } from './redact'
import { findDeliveryPoint, isLeclercHost, parseStore, type StoreInfo } from './store'

const yesNo = (value: boolean) => (value ? 'oui' : 'non')

/** Politiques de sécurité déclarées par des balises `<meta http-equiv="Content-Security-Policy">` de la page. */
export function metaPolicies(doc: Document): string[] {
  const policies: string[] = []
  for (const meta of Array.from(doc.querySelectorAll('meta[http-equiv]'))) {
    const name = meta.getAttribute('http-equiv')?.toLowerCase() ?? ''
    if (name.includes('content-security-policy')) policies.push(meta.getAttribute('content') ?? '')
  }
  return policies
}

/** Texte de la sonde. L'écran montre tout ; le texte copié masque ensuite le magasin (redact.ts). */
export function probeLines(win: PageWindow): { lines: string[]; store: StoreInfo | null } {
  const { location, navigator, screen, document: doc } = win
  const store = parseStore(location)
  const lines: string[] = [`Banc d'essai version ${LAB_VERSION}`]

  lines.push(`Hôte : ${location.host}`)
  lines.push(`Hôte de Leclerc Drive : ${yesNo(isLeclercHost(location.host))}`)
  lines.push(`Chemin : ${location.pathname}`)
  if (store) {
    lines.push(
      `Magasin lu dans l'adresse : ${store.id} (début d'adresse : ${store.basePath.slice(1)})`,
    )
    const point = findDeliveryPoint(doc.documentElement.outerHTML, store)
    lines.push(
      point.from === 'page'
        ? `Point de livraison (sNoPointLivraison) trouvé dans la page : ${point.value}`
        : `Point de livraison non trouvé dans la page : on prendrait ${point.value} (l'adresse)`,
    )
  } else {
    lines.push("Magasin lu dans l'adresse : aucun (ouvre une page de ton magasin : /magasin-…/)")
  }

  lines.push(
    `Cookie « datadome » visible par la page : ${yesNo(hasCookie(doc.cookie, 'datadome'))}` +
      " (non : absent, ou protégé contre la lecture par un script). La valeur n'est jamais lue.",
  )
  lines.push(`Agent utilisateur : ${navigator.userAgent}`)
  lines.push(
    `Écran : ${screen.width} x ${screen.height} ; fenêtre : ${win.innerWidth} x ${win.innerHeight} ; ratio : ${win.devicePixelRatio}`,
  )
  lines.push(`Contexte sécurisé (https) : ${yesNo(win.isSecureContext)}`)
  lines.push(`Wake Lock (écran allumé) disponible : ${yesNo('wakeLock' in navigator)}`)
  lines.push(`Page dans un cadre : ${yesNo(win.top !== win)}`)

  const policies = metaPolicies(doc)
  if (policies.length === 0) {
    lines.push(
      "Politique de sécurité dans une balise <meta http-equiv> : aucune. (Celle des en-têtes HTTP n'est pas visible d'une page : voir DRV-004.)",
    )
  } else {
    policies.forEach((policy, i) =>
      lines.push(
        `Politique de sécurité (balise meta ${i + 1}) : ${policy.slice(0, EXCERPT_CHARS)}`,
      ),
    )
  }

  const fragment = readLabHash(location.hash)
  lines.push(
    fragment
      ? `Fragment du banc dans l'adresse : ${fragment.text}`
      : "Fragment du banc dans l'adresse : aucun (#lab=…)",
  )
  return { lines, store }
}
