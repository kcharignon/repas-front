// Petite couche de rendu : des nœuds créés par `createElement` et `textContent`, jamais de HTML injecté (règle ESLint de DRV-301).
// Un libellé de produit venu du réseau s'affiche donc tel quel, balises comprises, sans jamais s'exécuter.

export type Child = Node | string | null | undefined | false

export interface Props {
  class?: string
  /** Le texte de l'élément (`textContent`). */
  text?: string
  attrs?: Record<string, string>
  on?: Record<string, (event: Event) => void>
  /** Valeur initiale d'un champ. */
  value?: string
  disabled?: boolean
  hidden?: boolean
}

/** Un attribut qui lancerait du code ou chargerait une page : refusé, même venant de notre propre code. */
const FORBIDDEN_ATTRIBUTE = /^(on|srcdoc$)/i

/** Un élément avec ses propriétés et ses enfants (un texte simple devient un nœud texte). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (props.class) element.className = props.class
  if (props.text !== undefined) element.textContent = props.text
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (FORBIDDEN_ATTRIBUTE.test(name)) throw new Error(`Attribut interdit : ${name}`)
    element.setAttribute(name, value)
  }
  for (const [name, handler] of Object.entries(props.on ?? {}))
    element.addEventListener(name, handler)
  if (props.value !== undefined) (element as unknown as HTMLInputElement).value = props.value
  if (props.disabled !== undefined)
    (element as unknown as HTMLButtonElement).disabled = props.disabled
  if (props.hidden !== undefined) element.hidden = props.hidden
  append(element, ...children)
  return element
}

/** Un nœud texte : ce qu'il contient ne s'interprète jamais. */
export function text(value: string): Text {
  return document.createTextNode(value)
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'string' ? text(child) : child)
  }
}

export function clear(element: Node): void {
  while (element.firstChild) element.removeChild(element.firstChild)
}
