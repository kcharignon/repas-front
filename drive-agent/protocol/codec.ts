import { ProtocolError } from './error'
import { LIMITS } from './types'

/** Le plus long texte base64url qui décode à `messageBytes` octets au plus. */
const MAX_TEXT = Math.ceil((LIMITS.messageBytes * 4) / 3)

/** JSON, puis UTF-8, puis base64url sans bourrage (`+` devient `-`, `/` devient `_`, pas de `=`). */
export function encodeMessage(message: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(message))
  if (bytes.length > LIMITS.messageBytes) throw new ProtocolError('', 'message trop volumineux')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** L'inverse d'`encodeMessage` : refuse un texte qui n'est pas du base64url, plus de 64 Ko décodés, de l'UTF-8 ou du JSON invalides. */
export function decodeMessage(text: string): unknown {
  if (text.length > MAX_TEXT) throw new ProtocolError('', 'message trop volumineux')
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new ProtocolError('', 'base64url invalide')
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const binary = atob(padded)
  if (binary.length > LIMITS.messageBytes) throw new ProtocolError('', 'message trop volumineux')
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    )
  } catch {
    throw new ProtocolError('', 'JSON ou UTF-8 invalide')
  }
}
