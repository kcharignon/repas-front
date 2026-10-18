import { LIMITS, PROTOCOL_VERSION, ProtocolError, validateResult } from '@drive-protocol'

import type { DriveResult } from './draft'

/**
 * Le pont natif de l'application Repas (DRV-317) : l'objet `repasNative` que `addWebMessageListener` expose à la page. On lui envoie du
 * texte JSON (`postMessage`), il répond par des événements `message` dont `data` est du texte JSON (64 Ko au plus dans les deux sens).
 */
export interface NativeBridge {
  postMessage(message: string): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void
}

/** `window.repasNative` s'il existe et a bien la forme d'un pont ; `null` hors de l'application (navigateur ordinaire). */
export function findNativeBridge(win: object): NativeBridge | null {
  const candidate = (win as { repasNative?: unknown }).repasNative
  if (typeof candidate !== 'object' || candidate === null) return null
  const { postMessage, addEventListener } = candidate as Record<string, unknown>

  return typeof postMessage === 'function' && typeof addEventListener === 'function'
    ? (candidate as NativeBridge)
    : null
}

/** Ce que répond `app.info`. */
export interface AppInfo {
  version: string
  versionCode: number
  /** Le drive est utilisable (agent intact, WebView assez récente). */
  drive: boolean
}

/** Un message de l'application, reconnu et validé. */
export type Inbound =
  | { type: 'app.info'; info: AppInfo }
  | { type: 'error'; code: string }
  | { type: 'drive.error'; code: string; runId: string | null }
  | { type: 'drive.result'; result: DriveResult }
  /** Un message du bon type mais mal formé (`detail` : le champ fautif, jamais sa valeur). */
  | { type: 'invalid'; detail: string | null }

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le nombre d'octets d'un texte en UTF-8 (la borne du pont se compte en octets). */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Lit un événement `message` du pont. `null` : à ignorer (pas du texte, pas du JSON de version 1, type inconnu). Les messages que l'on
 * reconnaît mais qui sont mal formés ressortent en `invalid`, sans jamais recopier leur contenu.
 */
export function parseInbound(data: unknown): Inbound | null {
  if (typeof data !== 'string' || byteLength(data) > LIMITS.messageBytes) return null
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  const message = record(value)
  if (message === null || message.v !== PROTOCOL_VERSION) return null

  switch (message.type) {
    case 'app.info': {
      const { version, versionCode, drive } = message
      if (typeof version !== 'string' || version === '' || version.length > 64)
        return { type: 'invalid', detail: 'version' }
      if (!Number.isSafeInteger(versionCode) || (versionCode as number) < 0)
        return { type: 'invalid', detail: 'versionCode' }
      if (typeof drive !== 'boolean') return { type: 'invalid', detail: 'drive' }

      return { type: 'app.info', info: { version, versionCode: versionCode as number, drive } }
    }
    case 'error':
    case 'drive.error': {
      if (typeof message.code !== 'string' || !CODE.test(message.code))
        return { type: 'invalid', detail: 'code' }
      if (message.type === 'error') return { type: 'error', code: message.code }
      const runId = message.runId ?? null
      if (runId !== null && (typeof runId !== 'string' || !UUID.test(runId)))
        return { type: 'invalid', detail: 'runId' }

      return { type: 'drive.error', code: message.code, runId }
    }
    case 'drive.result':
      try {
        return { type: 'drive.result', result: validateResult(message.result) }
      } catch (error) {
        return { type: 'invalid', detail: error instanceof ProtocolError ? error.path : null }
      }
    default:
      return null
  }
}
