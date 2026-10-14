// Contrat de l'API du back : récupération, génération des types, vérifications (ADR 0002).
//
//   node scripts/api.mjs update [<ref>]   figer le contrat sur un commit du dépôt back (par défaut le dernier de `main`)
//   node scripts/api.mjs generate          générer src/api/schema.d.ts depuis api/openapi.json
//   node scripts/api.mjs check             les types commités sont ceux que produit api/openapi.json (hors réseau)
//   node scripts/api.mjs verify            api/openapi.json est bien le fichier du commit figé (réseau)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CONTRACT = 'api/contract.json'
const SPEC = 'api/openapi.json'
const SCHEMA = 'src/api/schema.d.ts'

const contract = () => JSON.parse(readFileSync(CONTRACT, 'utf8'))
const rawUrl = ({ repository, ref, path }) => `https://raw.githubusercontent.com/${repository}/${ref}/${path}`

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} : ${response.status}`)
  return await response.text()
}

function generate(output) {
  execFileSync('npx', ['openapi-typescript', SPEC, '-o', output], { stdio: ['ignore', 'ignore', 'inherit'] })
}

const [command, argument] = process.argv.slice(2)

if (command === 'update') {
  const current = contract()
  let ref = argument
  if (!ref) {
    const latest = await fetch(`https://api.github.com/repos/${current.repository}/commits/main`)
    if (!latest.ok) throw new Error(`dernier commit de main : ${latest.status}`)
    ref = (await latest.json()).sha
  }
  const next = { ...current, ref }
  writeFileSync(SPEC, await download(rawUrl(next)))
  writeFileSync(CONTRACT, `${JSON.stringify(next, null, 2)}\n`)
  generate(SCHEMA)
  console.log(`Contrat figé sur ${current.repository}@${ref} : relire le diff de ${SPEC} et ${SCHEMA}.`)
} else if (command === 'generate') {
  generate(SCHEMA)
} else if (command === 'check') {
  const dir = mkdtempSync(join(tmpdir(), 'repas-api-'))
  try {
    const output = join(dir, 'schema.d.ts')
    generate(output)
    if (readFileSync(output, 'utf8') !== readFileSync(SCHEMA, 'utf8')) {
      console.error(`${SCHEMA} ne correspond plus à ${SPEC} : lancer « npm run api:generate » et relire le diff.`)
      process.exit(1)
    }
    console.log(`${SCHEMA} est à jour.`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
} else if (command === 'verify') {
  const pinned = contract()
  if ((await download(rawUrl(pinned))) !== readFileSync(SPEC, 'utf8')) {
    console.error(`${SPEC} n'est pas le fichier de ${pinned.repository}@${pinned.ref} : lancer « npm run api:update -- ${pinned.ref} ».`)
    process.exit(1)
  }
  console.log(`${SPEC} correspond à ${pinned.repository}@${pinned.ref}.`)
} else {
  console.error('Usage : node scripts/api.mjs update [<ref>] | generate | check | verify')
  process.exit(2)
}
