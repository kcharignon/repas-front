// Les deux conteneurs de l'agent dans la page (l'interface, puis le repère) : posés à la racine du document, aux z-index les plus hauts. Les lectures de la page qui jugent ce qui
// recouvre un contrôle (le toucher y tombe sur l'agent, pas sur la page) et le diagnostic de formes les reconnaissent ici, au même endroit.

/** Les z-index des conteneurs de l'agent (l'interface, puis le repère). */
export const AGENT_Z: ReadonlySet<string> = new Set(['2147483647', '2147483646'])

/** Un élément est l'un des deux conteneurs de l'agent. */
export function isAgentContainer(element: Element): boolean {
  const doc = element.ownerDocument
  return (
    element.parentElement === doc.documentElement &&
    AGENT_Z.has(doc.defaultView?.getComputedStyle(element).zIndex ?? '')
  )
}
