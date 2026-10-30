import { LIMITS, PROTOCOL_VERSION, ProtocolError, validateResult } from '@drive-protocol'

import type { DriveResult } from './draft'
import { parseUpdateState } from './update'
import type { AppUpdateState } from './update'

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
  /**
   * L'application sait se mettre à jour elle-même (DRV-639, variante hors Google Play) : la page peut envoyer `update.*`. Absent (ancienne
   * application, variante de Google Play, construction de débogage) : faux, la page garde l'ancien comportement.
   */
  selfUpdate?: boolean
  /**
   * Les drives que l'application sait servir (DRV-707), par identifiant. Absent (application d'avant les drives multiples, ou liste mal formée) :
   * la clé n'est pas là, et l'application ne sert que le drive d'avant (`appServes`).
   */
  retailers?: string[]
}

/** Un message de l'application, reconnu et validé. */
export type Inbound =
  | { type: 'app.info'; info: AppInfo }
  | { type: 'error'; code: string }
  | { type: 'drive.error'; code: string; runId: string | null }
  | { type: 'drive.result'; result: DriveResult }
  /** L'état de la mise à jour de l'application (DRV-639), à la demande ou à chaque changement. */
  | { type: 'update.state'; state: AppUpdateState }
  /** Un message du bon type mais mal formé (`detail` : le champ fautif, jamais sa valeur). */
  | { type: 'invalid'; detail: string | null }

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Les identifiants de drive annoncés par `app.info` : de 1 à 20 identifiants de 1 à 32 caractères (minuscules, chiffres, tiret), ou `null` si la liste n'est pas lisible. */
function retailerIdsOf(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null
  const ids = value.filter(
    (item): item is string => typeof item === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(item),
  )

  return ids.length === value.length ? ids : null
}

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
      // Facultatif : une application qui ne connaît pas la mise à jour n'écrit pas la clé
      const selfUpdate = message.selfUpdate === true
      // Facultatif aussi : une liste d'identifiants. Mal formée, elle est ignorée (l'application passe pour une ancienne : on n'en suppose pas plus)
      const retailers = retailerIdsOf(message.retailers)

      return {
        type: 'app.info',
        info: {
          version,
          versionCode: versionCode as number,
          drive,
          ...(selfUpdate ? { selfUpdate } : {}),
          ...(retailers === null ? {} : { retailers }),
        },
      }
    }
    case 'update.state': {
      const state = parseUpdateState(message)

      // Un état mal formé est ignoré (jamais pris pour une réponse à `app.info`) : le dernier état connu reste
      return state === null ? null : { type: 'update.state', state }
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
