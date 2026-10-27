// Les primitives du navigateur dont l'agent se sert pour les messages de l'application, ses requêtes vers le site et son interface :
// `JSON.parse`, `JSON.stringify`, l'encodeur de texte, `fetch` et `attachShadow`. Elles sont prises une fois, au chargement du fichier
// (JSON, encodeur) ou au démarrage de `run` (`fetch`, `attachShadow`, qui tiennent à la fenêtre) : l'application injecte l'agent avant le
// premier script de la page, à ce moment elles sont celles du navigateur. L'agent ne les relit plus par leur nom ensuite, donc un script de
// la page qui en remplace une plus tard n'est jamais appelé avec ce que l'agent traite (le plan, le résultat, les requêtes, l'interface).
// `drive-agent/src` n'appelle JSON qu'ici (règle ESLint, `test/rules.spec.ts`).
const jsonParse = JSON.parse
const jsonStringify = JSON.stringify
const apply = Reflect.apply
const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null
const encode = typeof TextEncoder === 'function' ? TextEncoder.prototype.encode : null

/** Lit un texte JSON ; lève `SyntaxError` s'il n'en est pas un, comme `JSON.parse`. */
export function parseJson(text: string): unknown {
  return jsonParse(text)
}

/** Écrit une valeur en JSON, comme `JSON.stringify` (qui rend `undefined` pour une valeur sans représentation JSON). */
export function stringifyJson(value: unknown): string {
  return jsonStringify(value) as string
}

/** Le nombre d'octets d'un texte en UTF-8 (la borne des messages du pont est en octets, pas en caractères). */
export function byteLength(text: string): number {
  if (encoder === null || encode === null) throw new TypeError('TextEncoder indisponible')
  return (apply(encode, encoder, [text]) as Uint8Array).length
}

type Win = Window & typeof globalThis

/** Ce que la fenêtre de la page prête à l'agent et qui lui reste propre une fois pris. */
export interface WindowPrimitives {
  /** `fetch` de la fenêtre. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  /** `Element.prototype.attachShadow` appliqué à `host`. */
  attachShadow: (host: Element, init: ShadowRootInit) => ShadowRoot
}

/** Prend `fetch` et `attachShadow` de la fenêtre donnée, tels qu'ils sont à cet instant. */
export function takeWindowPrimitives(win: Win): WindowPrimitives {
  const takenFetch = win.fetch
  const takenAttach = win.Element?.prototype?.attachShadow
  return {
    fetch: (input, init) => apply(takenFetch, win, [input, init]) as Promise<Response>,
    attachShadow: (host, init) =>
      (takenAttach === undefined
        ? host.attachShadow(init)
        : apply(takenAttach, host, [init])) as ShadowRoot,
  }
}
