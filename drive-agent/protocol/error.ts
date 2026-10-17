/** Un message qui n'est pas conforme au protocole : `path` désigne le premier champ fautif (`lines[2].products[0].id`, vide pour la racine). */
export class ProtocolError extends Error {
  readonly code = 'INVALID_MESSAGE'
  readonly path: string

  constructor(path: string, reason: string) {
    super(`${path === '' ? 'message' : path} : ${reason}`)
    this.name = 'ProtocolError'
    this.path = path
  }
}
