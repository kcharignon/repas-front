// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Fragments d'adresse factices (essais 7 et 8) : de taille exacte, vérifiables à l'arrivée.
// Forme : `<taille>.<empreinte>.<corps>`, la taille étant le nombre total de caractères du fragment.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const HEADER_FIXED = 2 + 8 // deux points et huit caractères d'empreinte

/** Empreinte FNV-1a sur 32 bits, en 8 caractères hexadécimaux. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function body(length: number, seed: number): string {
  let state = (seed || 1) >>> 0
  let out = ''
  for (let i = 0; i < length; i++) {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    out += ALPHABET[state % ALPHABET.length]
  }
  return out
}

/** Fragment de `size` caractères exactement (le fragment ne contient que du ASCII : un caractère = un octet). */
export function makeFragment(size: number): string {
  const headerLength = String(size).length + HEADER_FIXED
  if (size <= headerLength) throw new RangeError('Fragment trop court')
  const content = body(size - headerLength, size)
  return `${size}.${checksum(content)}.${content}`
}

export type FragmentVerdict =
  | { kind: 'ok'; text: string }
  | { kind: 'intact'; length: number; text: string }
  | { kind: 'abîmé'; length: number; text: string }
  | { kind: 'inconnu'; length: number; text: string }

/** Vérifie la valeur reçue après `#lab=` : la taille annoncée, la taille reçue, l'empreinte. */
export function verifyFragment(value: string): FragmentVerdict {
  if (value === 'ok') return { kind: 'ok', text: 'fragment « ok » reçu' }
  const found = /^(\d+)\.([0-9a-f]{8})\.([A-Za-z0-9_-]*)$/.exec(value)
  if (!found) {
    return {
      kind: 'inconnu',
      length: value.length,
      text: `forme inconnue (${value.length} caractères)`,
    }
  }
  const [, declared, sum, content] = found
  const length = value.length
  if (Number(declared) !== length) {
    return {
      kind: 'abîmé',
      length,
      text: `taille annoncée ${declared}, reçue ${length} : fragment tronqué ou complété`,
    }
  }
  if (checksum(content ?? '') !== sum) {
    return { kind: 'abîmé', length, text: `${length} caractères reçus mais contenu modifié` }
  }
  return { kind: 'intact', length, text: `${length} caractères reçus, contenu intact` }
}

/** Ce que l'adresse de la page porte après `#lab=` (`null` : pas de fragment du banc). */
export function readLabHash(hash: string): FragmentVerdict | null {
  if (!hash.startsWith('#lab=')) return null
  return verifyFragment(hash.slice('#lab='.length))
}

export function fragmentUrl(origin: string, sizeKo: number): string {
  return `${origin}/#lab=${makeFragment(sizeKo * 1024)}`
}
