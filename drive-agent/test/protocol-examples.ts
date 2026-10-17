// Les exemples de `drive-agent/protocol/examples/` : `valid/` contient des messages, `invalid/` des enveloppes
// `{path, why, schemaCannotSee?, message}` (le chemin attendu de l'erreur, pourquoi, et si JSON Schema ne peut pas voir la faute).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', 'protocol')

export interface InvalidExample {
  name: string
  path: string
  why: string
  /** Vrai : la faute dépasse JSON Schema (doublon, cohérence entre champs) ; seuls les validateurs la voient. */
  schemaCannotSee: boolean
  message: unknown
}

export interface ValidExample {
  name: string
  message: unknown
}

function names(folder: string): string[] {
  return readdirSync(join(ROOT, 'examples', folder))
    .filter((file) => file.endsWith('.json'))
    .sort()
}

function read(folder: string, file: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, 'examples', folder, file), 'utf8'))
}

/** Les exemples valides dont le nom commence par `plan` ou `result`. */
export function validExamples(kind: 'plan' | 'result'): ValidExample[] {
  return names('valid')
    .filter((file) => file.startsWith(`${kind}-`))
    .map((file) => ({ name: file.replace('.json', ''), message: read('valid', file) }))
}

export function invalidExamples(kind: 'plan' | 'result'): InvalidExample[] {
  return names('invalid')
    .filter((file) => file.startsWith(`${kind}-`))
    .map((file) => {
      const wrapper = read('invalid', file) as Record<string, unknown>
      return {
        name: file.replace('.json', ''),
        path: wrapper.path as string,
        why: wrapper.why as string,
        schemaCannotSee: wrapper.schemaCannotSee === true,
        message: wrapper.message,
      }
    })
}

export function schema(kind: 'plan' | 'result'): object {
  return JSON.parse(readFileSync(join(ROOT, `${kind}.schema.json`), 'utf8')) as object
}
