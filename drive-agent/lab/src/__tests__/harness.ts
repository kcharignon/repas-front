// Outils des tests d'interface : un banc monté dans jsdom avec un réseau, un presse-papiers et une navigation simulés.
// Aucun test ne touche le réseau : `fetch` est un double qui répond avec des données inventées (fixtures.ts).
import { expect, vi } from 'vitest'

import type { LabEnv, PageWindow } from '../env'
import { createLab, HOST_ID, type Lab } from '../ui/shell'
import { PRODUCTS, searchPage } from './fixtures'

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const defaultRoute: Route = (url) => {
  if (url.includes('/recherche.aspx')) return html(searchPage(PRODUCTS))
  if (url.includes('/panier.aspx'))
    return json([{ eTypeEvenement: 1, sNomEvenement: 'Panier999111', nrTotal: 2.5 }])
  return html('', 404)
}

export interface Harness {
  env: LabEnv
  lab: Lab
  root: ShadowRoot
  fetch: ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>
  sleeps: number[]
  navigated: string[]
  copied: string[]
}

export function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

export function mount(options: { path?: string; route?: Route; random?: number } = {}): Harness {
  setPath(options.path ?? '/magasin-999111-999111/accueil.aspx')
  const route = options.route ?? defaultRoute
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async (input, init) => route(input, init),
  )
  const sleeps: number[] = []
  const navigated: string[] = []
  const copied: string[] = []
  let clock = 0
  const env: LabEnv = {
    win: window as PageWindow,
    fetch: fetchMock,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => options.random ?? 0.5,
    now: () => (clock += 7),
    navigate: (url) => void navigated.push(url),
    copy: async (text) => {
      copied.push(text)
      return true
    },
  }
  const lab = createLab(env)
  lab.open()
  return {
    env,
    lab,
    root: lab.host.shadowRoot as ShadowRoot,
    fetch: fetchMock,
    sleeps,
    navigated,
    copied,
  }
}

export function unmount(): void {
  document.getElementById(HOST_ID)?.remove()
  Object.defineProperty(document, 'cookie', { value: '', configurable: true })
  setPath('/')
}

export function button(root: ShadowRoot, part: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (item) => !item.hidden && (item.textContent ?? '').includes(part),
  )
  if (!found)
    throw new Error(`Bouton « ${part} » introuvable. Boutons : ${labels(root).join(' | ')}`)
  return found
}

export function labels(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll('button')).map((item) => (item.textContent ?? '').trim())
}

export function click(root: ShadowRoot, part: string): void {
  button(root, part).click()
}

export function openEssai(harness: Harness, id: number | string): void {
  harness.lab.showEssai(id)
}

/** Le champ relié à une étiquette (par son texte). */
export function field(root: ShadowRoot, labelPart: string): HTMLInputElement {
  const label = Array.from(root.querySelectorAll('label')).find((item) =>
    (item.textContent ?? '').includes(labelPart),
  )
  const control = label ? root.getElementById(label.htmlFor) : null
  if (!control) throw new Error(`Champ « ${labelPart} » introuvable`)
  return control as HTMLInputElement
}

export function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function choose(select: HTMLSelectElement, value: string): void {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Texte de la zone de résultat de l'écran ouvert. */
export function output(root: ShadowRoot): string {
  return root.querySelector('pre.out')?.textContent ?? ''
}

export async function untilOutput(root: ShadowRoot, expected: string | RegExp): Promise<string> {
  await vi.waitFor(() => {
    const text = output(root)
    if (typeof expected === 'string') expect(text).toContain(expected)
    else expect(text).toMatch(expected)
  })
  return output(root)
}

export function posts(harness: Harness): { url: string; body: unknown }[] {
  return harness.fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({ url, body: init?.body }))
}

/** Le JSON du champ `d` d'une requête d'écriture au panier. */
export function cartCall(call: { body: unknown }): Record<string, unknown> {
  return JSON.parse(new URLSearchParams(String(call.body)).get('d') ?? '{}') as Record<
    string,
    unknown
  >
}
