// L'agent construit, injecté dans une page du faux site, des deux façons dont l'application le fait vivre :
//  - par le FRAGMENT d'adresse (`#repas=…`), le résultat revenant par navigation vers le faux Repas ;
//  - par le PONT de l'application (`window.repasHost`), avec le vrai script d'injection de l'application Android (`injection.js`) :
//    un faux « canal natif » joue le rôle de l'application (il reçoit les messages de l'agent et lui envoie les siens).
// L'agent n'est pas modifié : seul le Shadow DOM de son interface est ouvert pour que Playwright puisse le piloter.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page } from '@playwright/test'

import {
  decodeMessage,
  encodeMessage,
  validateResult,
  type ResultMessage,
  type SetupResultMessage,
} from '../../protocol'
import { PAGE_PATH, type FakeLeclerc } from '../../fake-leclerc/server'

const here = dirname(fileURLToPath(import.meta.url))
const INJECTION = readFileSync(
  join(here, '../../../android/app/src/main/assets/injection.js'),
  'utf8',
)
/** Le marqueur que l'agent construit garde jusqu'à ce qu'on y écrive l'origine de Repas (agent.ts). */
const ORIGIN_MARKER = '__REPAS_ORIGIN__'

/** L'interface de l'agent est dans un Shadow DOM FERMÉ : pour les tests, on l'ouvre (l'agent lui-même n'est pas touché). */
const OPEN_SHADOW = `(() => {
  const attach = Element.prototype.attachShadow
  Element.prototype.attachShadow = function (init) { return attach.call(this, { ...init, mode: 'open' }) }
})()`

/** Le faux canal natif de la WebView : ce que l'application expose à la page avant l'injection. */
const NATIVE_CHANNEL = `(() => {
  const listeners = []
  window.repasHost = {
    postMessage(text) { if (typeof window.__repasToApp === 'function') window.__repasToApp(text) },
    addEventListener(type, listener) { if (type === 'message') listeners.push(listener) },
  }
  window.__repasFromApp = (text) => listeners.forEach((listener) => listener({ data: text }))
})()`

/**
 * L'agent construit, avec l'origine du faux Repas écrite dedans (comme pour un favori qui rend son résultat par navigation), et lancé
 * une fois la page chargée : un favori s'exécute sur une page déjà là. (Au tout début du chargement, `document.documentElement` n'existe
 * pas encore et l'interface ne pourrait pas s'y poser.)
 */
function withOrigin(agentCode: string, origin: string): string {
  if (!agentCode.includes(ORIGIN_MARKER))
    throw new Error('Le marqueur d’origine a disparu de l’agent construit.')
  const code = agentCode.replaceAll(ORIGIN_MARKER, origin)
  return `(() => {
  const start = () => {
${code}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()`
}

/** Ouvre une page du faux magasin avec l'agent et un message de Repas dans le fragment (`message` brut : fragment illisible). */
export async function openWithFragment(
  page: Page,
  fake: FakeLeclerc,
  agentCode: string,
  message: unknown,
  { path = `${PAGE_PATH}/` }: { path?: string } = {},
): Promise<void> {
  await page.addInitScript(OPEN_SHADOW)
  await page.addInitScript({ content: withOrigin(agentCode, fake.repas) })
  const fragment = typeof message === 'string' ? message : encodeMessage(message)
  await page.goto(`${fake.leclerc}${path}#repas=${fragment}`)
}

/** Le résultat que l'agent a rendu à Repas par navigation : lu dans l'adresse du faux Repas, puis validé par le protocole. */
export async function returnedResult(
  page: Page,
  fake: FakeLeclerc,
): Promise<ResultMessage | SetupResultMessage> {
  await page.waitForURL((url) => url.origin === fake.repas && url.pathname === '/drive/retour')
  const { hash } = new URL(page.url())
  expect(hash).toMatch(/^#result=/)
  return validateResult(decodeMessage(hash.slice('#result='.length)))
}

/** L'application simulée, côté pont : les messages que l'agent lui a envoyés, et de quoi lui en envoyer. */
export interface FakeApp {
  readonly messages: Record<string, unknown>[]
  /** Envoie un message à l'agent de la page courante. */
  send(message: unknown): Promise<void>
  /** À chaque chargement de page (message `hello`), l'application renvoie ce message : son plan, tant que le passage dure. */
  answerHello(message: unknown): void
  /** Attend le premier message d'un type donné (`result`, `setup-result`…). */
  received(type: string): Promise<Record<string, unknown>>
}

/** Injecte l'agent comme l'application Android : `injection.js` avec l'agent à la place du marqueur, par-dessus un faux canal natif. */
export async function openWithBridge(
  page: Page,
  fake: FakeLeclerc,
  agentCode: string,
  { path = `${PAGE_PATH}/` }: { path?: string } = {},
): Promise<FakeApp> {
  const messages: Record<string, unknown>[] = []
  let hello: string | null = null
  const deliver = async (text: string) => {
    // Comme l'application, qui parle à la page une fois chargée ; la page peut se recharger : au prochain « hello », on réessaie.
    await page.waitForFunction(() => document.readyState !== 'loading').catch(() => undefined)
    await page
      .evaluate(
        (data) =>
          (window as unknown as { __repasFromApp(text: string): void }).__repasFromApp(data),
        text,
      )
      .catch(() => undefined)
  }
  await page.exposeFunction('__repasToApp', (text: string) => {
    const message = JSON.parse(text) as Record<string, unknown>
    messages.push(message)
    if (message.type === 'hello' && hello !== null) void deliver(hello)
  })
  await page.addInitScript(OPEN_SHADOW)
  await page.addInitScript(NATIVE_CHANNEL)
  await page.addInitScript({ content: INJECTION.replace('/*__AGENT__*/', () => agentCode) })
  await page.goto(`${fake.leclerc}${path}`)
  return {
    messages,
    send: (message) => deliver(JSON.stringify(message)),
    answerHello(message) {
      hello = JSON.stringify(message)
      // La page a peut-être déjà dit « hello » : l'application répond aussitôt.
      if (messages.some((seen) => seen.type === 'hello')) void deliver(hello)
    },
    async received(type) {
      await expect
        .poll(() => messages.some((message) => message.type === type), {
          message: `message « ${type} » de l’agent`,
        })
        .toBe(true)
      return messages.find((message) => message.type === type) as Record<string, unknown>
    },
  }
}
