// L'arbre d'accessibilité de la carte de l'agent, tel que Chromium le calcule (DRV-764) : ce que lit un lecteur d'écran sur un navigateur de bureau. C'est l'arbre du moteur
// (`Accessibility.getFullAXTree`), pas celui que Playwright déduit du DOM : un `aria-hidden`, un `inert` ou un élément retiré de l'arbre y paraissent « ignorés ». Sur Android la WebView
// en fait un arbre de vues que ce test ne voit pas (voir `drive-agent/README.md`, « Carte et lecteur d'écran »).
import type { Page } from '@playwright/test'

import { S } from '../../src/ui/strings'

export interface AxNode {
  role: string
  name: string
  ignored: boolean
  /** Les propriétés utiles du moteur : `live`, `atomic`, `expanded`, `modal`, `focusable`, `focused`… */
  props: Record<string, unknown>
  children: AxNode[]
}

interface RawNode {
  nodeId: string
  ignored?: boolean
  role?: { value?: string }
  name?: { value?: string }
  properties?: { name: string; value: { value: unknown } }[]
  childIds?: string[]
}

/** Le sous-arbre de la carte (le dialogue de l'agent) ; `null` si le moteur ne le montre pas du tout. */
export async function agentTree(page: Page): Promise<AxNode | null> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Accessibility.enable')
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: RawNode[] }
    const byId = new Map(nodes.map((node) => [node.nodeId, node]))
    const build = (raw: RawNode): AxNode => ({
      role: raw.role?.value ?? '',
      name: raw.name?.value ?? '',
      ignored: raw.ignored === true,
      props: Object.fromEntries((raw.properties ?? []).map((one) => [one.name, one.value.value])),
      children: (raw.childIds ?? []).flatMap((id) => {
        const child = byId.get(id)
        return child === undefined ? [] : [build(child)]
      }),
    })
    const root = nodes.find(
      (node) => node.role?.value === 'dialog' && node.name?.value === S.dialog,
    )
    return root === undefined ? null : build(root)
  } finally {
    await cdp.detach()
  }
}

/** Tous les nœuds que le moteur expose (ni ignorés), à plat, dans l'ordre de lecture. Un nœud ignoré laisse passer ses enfants (ils sont lus à sa place). */
export function exposed(node: AxNode): AxNode[] {
  return [...(node.ignored ? [] : [node]), ...node.children.flatMap(exposed)]
}

/** Tous les nœuds du sous-arbre, ignorés compris, à plat. */
export const everyNode = (node: AxNode): AxNode[] => [node, ...node.children.flatMap(everyNode)]

/** « rôle : nom » de chaque nœud exposé qui a un nom, pour des messages d'échec lisibles. */
export const outline = (node: AxNode): string[] =>
  exposed(node)
    .filter((one) => one.name !== '')
    .map((one) => `${one.role} : ${one.name}`)

/** Le texte que lit un lecteur d'écran dans la carte : les textes exposés, collés. */
export function spoken(node: AxNode): string {
  return exposed(node)
    .filter((one) => one.role === 'StaticText')
    .map((one) => one.name)
    .join(' ')
}
