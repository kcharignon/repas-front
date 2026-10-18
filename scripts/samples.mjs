// Exemples de contrat du back (DRV-501) : copie, vérification.
//
//   node scripts/samples.mjs update <sha> [<chemin du dépôt back>]   recopie les exemples du commit <sha> du back
//   node scripts/samples.mjs verify                                   les exemples sont ceux du commit noté dans SOURCE.md (réseau)
//
// Sans chemin, les fichiers viennent de GitHub (comme `api:update`, utilisable dans Docker). Avec le chemin d'un dépôt local du back,
// ils sont lus par `git show <sha>:…` (hors Docker : le conteneur n'a pas git) : utile avant que le back soit fusionné.
// Les exemples sont des copies à l'octet près (`.prettierignore`) : on ne les modifie jamais à la main.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const REPOSITORY = 'kcharignon/repas'
const FOLDER = 'drive-agent/fixtures/contract'
const BACK_FOLDER = 'docs/drive/samples'
const FILES = ['plan.sample.json', 'choices.sample.json', 'estimate.sample.json', 'settings.sample.json']
const SOURCE = `${FOLDER}/SOURCE.md`

const SHA = /^[0-9a-f]{40}$/

function sourceText(sha) {
  return `# Exemples de contrat du back

Copies à l'octet près de \`${BACK_FOLDER}/\` du dépôt back \`${REPOSITORY}\`, produites par \`make drive-samples\` côté back
(réponses réelles de l'API pour une même liste envoyée de 5 lignes ; valeurs inventées : magasin \`123456\` / \`Ville-Test\`).

Commit du back : \`${sha}\`

Ne pas modifier à la main. Mettre à jour : \`make samples-update ref=<sha>\` (ou \`npm run samples:update -- <sha> [<chemin du dépôt back>]\`),
puis relire le diff : c'est le contrat que le front fige. Le test \`src/features/drive/__tests__/contract.spec.ts\` les confronte au
contrat OpenAPI figé (\`api/openapi.json\`), à \`buildPlanMessage\` et au protocole de l'agent ; \`npm run samples:verify\` (réseau)
vérifie qu'ils sont bien ceux du commit ci-dessus.
`
}

const recorded = () => {
  const found = /Commit du back : `([0-9a-f]{40})`/.exec(readFileSync(SOURCE, 'utf8'))
  if (found === null) throw new Error(`${SOURCE} ne note pas le commit du back.`)

  return found[1]
}

async function read(sha, file, backPath) {
  if (backPath !== undefined)
    return execFileSync('git', ['-C', backPath, 'show', `${sha}:${BACK_FOLDER}/${file}`], { encoding: 'utf8' })
  const url = `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${BACK_FOLDER}/${file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} : ${response.status}`)

  return await response.text()
}

const [command, sha, backPath] = process.argv.slice(2)

if (command === 'update') {
  if (!SHA.test(sha ?? '')) {
    console.error('Usage : node scripts/samples.mjs update <sha de 40 caractères> [<chemin du dépôt back>]')
    process.exit(2)
  }
  const texts = await Promise.all(FILES.map((file) => read(sha, file, backPath)))
  FILES.forEach((file, index) => writeFileSync(`${FOLDER}/${file}`, texts[index]))
  writeFileSync(SOURCE, sourceText(sha))
  console.log(`Exemples recopiés depuis ${REPOSITORY}@${sha} : relire le diff de ${FOLDER}.`)
} else if (command === 'verify') {
  const pinned = recorded()
  for (const file of FILES) {
    if ((await read(pinned, file)) !== readFileSync(`${FOLDER}/${file}`, 'utf8')) {
      console.error(`${FOLDER}/${file} n'est pas le fichier de ${REPOSITORY}@${pinned} : lancer « npm run samples:update -- ${pinned} ».`)
      process.exit(1)
    }
  }
  console.log(`Les exemples correspondent à ${REPOSITORY}@${pinned}.`)
} else {
  console.error('Usage : node scripts/samples.mjs update <sha> [<chemin du dépôt back>] | verify')
  process.exit(2)
}
