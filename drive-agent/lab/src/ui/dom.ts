// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Construction du DOM par `createElement` et `textContent` seulement : jamais de HTML injecté (pas d'`innerHTML`).

export type Child = Node | string | null | undefined | false

export interface Props {
  class?: string
  text?: string
  attrs?: Record<string, string>
  on?: Record<string, (event: Event) => void>
  /** Valeur initiale d'un champ. */
  value?: string
  disabled?: boolean
  hidden?: boolean
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (props.class) element.className = props.class
  if (props.text !== undefined) element.textContent = props.text
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value)
  for (const [name, handler] of Object.entries(props.on ?? {}))
    element.addEventListener(name, handler)
  if (props.value !== undefined) (element as unknown as HTMLInputElement).value = props.value
  if (props.disabled !== undefined)
    (element as unknown as HTMLButtonElement).disabled = props.disabled
  if (props.hidden !== undefined) element.hidden = props.hidden
  append(element, ...children)
  return element
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
}

export function clear(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild)
}
