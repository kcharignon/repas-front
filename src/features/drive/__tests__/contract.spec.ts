// Concordance entre le back et le front (DRV-501) : les exemples de contrat du back (`drive-agent/fixtures/contract/`, copies de
// `docs/drive/samples/`, produits par les vraies réponses de l'API) sont confrontés au contrat OpenAPI figé, à `buildPlanMessage`, au
// protocole de l'agent et aux écrans. Si le back change un champ, régénérer les exemples (`make samples-update ref=<sha>`) et le contrat
// (`make api-update ref=<sha>`) fait échouer ce test à l'endroit exact de l'écart.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { validatePlan } from '@drive-protocol'
import type { PlanLine } from '@drive-protocol'

import type { DriveEstimate, DrivePlan, DriveSettings } from '@/api'
import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { buildPlanMessage } from '../buildPlanMessage'
import DriveEstimateBlock from '../DriveEstimate.vue'
import DriveSendView from '../DriveSendView.vue'
import DriveSettingsView from '../DriveSettingsView.vue'
import ProductsView from '../ProductsView.vue'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const read = (path: string): unknown => JSON.parse(readFileSync(here(path), 'utf8'))
const sample = (name: string): unknown =>
  read(`../../../../drive-agent/fixtures/contract/${name}.sample.json`)

const plan = sample('plan') as DrivePlan
const choices = sample('choices') as { member: unknown[]; totalItems: number }
const estimate = sample('estimate') as DriveEstimate
const settings = sample('settings') as DriveSettings

// --- Les exemples contre le contrat OpenAPI figé -------------------------------------------------------------------------------

type Node = Record<string, unknown>
const spec = read('../../../../api/openapi.json') as { components: Node }

/** OpenAPI 3.0 vers JSON Schema : `nullable` devient « ou null », et aucune clé inconnue n'est tolérée (le contrat est exact). */
function exact(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(exact)
  if (node === null || typeof node !== 'object') return node
  const { nullable, ...rest } = node as Node
  const converted = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, key === 'example' ? value : exact(value)]),
  ) as Node
  if (converted.properties !== undefined && converted.additionalProperties === undefined)
    converted.additionalProperties = false

  return nullable === true ? { anyOf: [{ type: 'null' }, converted] } : converted
}

const openapi = new Ajv({ strict: false, validateFormats: false, allErrors: true })

/** Les écarts d'un exemple avec le schéma `DriveXxxDTO` du contrat figé, lisibles (chemin et raison), `[]` s'il est conforme. */
function mismatches(schemaName: string, value: unknown): string[] {
  const validate = openapi.compile({
    $ref: `#/components/schemas/${schemaName}`,
    components: exact(spec.components),
  })

  return validate(value)
    ? []
    : (validate.errors ?? []).map(
        ({ instancePath, message, params }) =>
          `${schemaName}${instancePath} ${message} ${JSON.stringify(params)}`,
      )
}

describe('les exemples du back suivent le contrat OpenAPI figé', () => {
  it.each([
    ['plan', 'DrivePlanDTO', plan],
    ['estimate', 'DriveEstimateDTO', estimate],
    ['settings', 'DriveSettingsDTO', settings],
  ] as const)('l’exemple « %s » est exactement un %s', (_name, schema, value) => {
    expect(mismatches(schema, value)).toEqual([])
  })

  it('l’exemple « choices » est une liste {member, totalItems} de ChoiceDTO', () => {
    expect(Object.keys(choices)).toEqual(['member', 'totalItems'])
    expect(choices.totalItems).toBe(choices.member.length)
    choices.member.forEach((choice) => expect(mismatches('ChoiceDTO', choice)).toEqual([]))
  })

  it('un champ renommé, retiré ou ajouté par le back fait échouer le test, avec son chemin', () => {
    const renamed = structuredClone(plan) as unknown as { lines: Node[] }
    const first = renamed.lines[0]!
    first.name = first.ingredientName
    delete first.ingredientName
    delete renamed.lines[1]!.needed

    const problems = mismatches('DrivePlanDTO', renamed)

    expect(problems).toContain(
      'DrivePlanDTO/lines/0 must NOT have additional properties {"additionalProperty":"name"}',
    )
    expect(problems).toContain(
      'DrivePlanDTO/lines/0 must have required property \'ingredientName\' {"missingProperty":"ingredientName"}',
    )
    expect(problems).toContain(
      'DrivePlanDTO/lines/1 must have required property \'needed\' {"missingProperty":"needed"}',
    )
  })
})

// --- Le plan, traduit pour l'agent ---------------------------------------------------------------------------------------------

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
const protocol = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true }).compile(
  read('../../../../drive-agent/protocol/plan.schema.json') as Node,
)

const lineOf = (lines: PlanLine[], slug: string): PlanLine => {
  const line = lines.find((candidate) => candidate.ingredientSlug === slug)
  if (line === undefined) throw new Error(`Ligne absente du message : ${slug}`)

  return line
}

describe('le plan du back, traduit par buildPlanMessage, est valide pour l’agent', () => {
  it('passe le validateur du protocole et son schéma JSON, y compris l’unité sans symbole', () => {
    const message = buildPlanMessage(plan, {}, RUN_ID)

    expect(() => validatePlan(message)).not.toThrow()
    expect(protocol(message)).toBe(true)
    expect(message).toMatchObject({
      v: 1,
      type: 'plan',
      runId: RUN_ID,
      retailer: 'leclerc',
      store: { id: '123456', host: 'exemple.leclercdrive.fr' },
      returnPath: '/drive/retour',
    })
    expect(
      message.lines.map(({ ingredientSlug, name, status }) => [ingredientSlug, name, status]),
    ).toEqual([
      ['farine', 'Farine', 'KNOWN'],
      ['lait', 'Lait', 'KNOWN'],
      ['oeuf', 'Œufs', 'NEW'],
      ['sel', 'Sel', 'KNOWN'],
      ['sucre', 'Sucre', 'HAVE_AT_HOME'],
    ])
  })

  it('traduit les identifiants (retailerProductId devient id), garde l’ordre, les refusés et les conditionnements', () => {
    const { lines } = buildPlanMessage(plan, {}, RUN_ID)

    expect(lineOf(lines, 'farine').products).toEqual([
      {
        id: '555101',
        label: 'Farine de blé T55 1 kg',
        content: { value: 1, unit: 'kg' },
        packs: 1,
        packsStatus: 'COMPUTED',
      },
      {
        id: '555102',
        label: 'Farine de blé T45 500 g',
        content: { value: 500, unit: 'g' },
        packs: 1,
        packsStatus: 'COMPUTED',
      },
    ])
    expect(lineOf(lines, 'lait')).toMatchObject({
      products: [{ id: '555201', packs: 3, packsStatus: 'COMPUTED' }],
      rejected: [{ id: '555299', label: 'Lait entier UHT 1 l' }],
    })
    expect(lineOf(lines, 'oeuf')).toMatchObject({ products: [], rejected: [] })
    expect(lineOf(lines, 'sel').products).toEqual([
      expect.objectContaining({ id: '555401', packs: null, packsStatus: 'TO_CHECK' }),
      expect.objectContaining({ id: '555402', packs: 1, packsStatus: 'COMPUTED' }),
    ])
  })

  it('garde needed pour toutes les lignes à mettre au panier, clés du protocole seulement : l’unité sans symbole porte son nom', () => {
    const { lines } = buildPlanMessage(plan, {}, RUN_ID)

    // Le back écrit aussi le slug et le nom de l'unité (DRV-652) : un agent qui ne les connaît pas rejetterait le plan entier, ils ne partent donc pas
    for (const source of plan.lines.filter((line) => line.status !== 'HAVE_AT_HOME')) {
      const { unitSlug, unitName, ...before } = source.needed
      expect(unitSlug).toBeTypeOf('string')
      expect(unitName).toBeTypeOf('string')
      expect(lineOf(lines, source.ingredientSlug).needed).toEqual(before)
    }
    expect(lineOf(lines, 'oeuf').needed).toEqual({
      quantity: 6,
      unitSymbol: 'unité',
      dimension: 'COUNT',
      baseFactor: 1,
    })
    expect(lineOf(lines, 'sel').needed).toEqual({
      quantity: 2,
      unitSymbol: 'cuillère à soupe',
      dimension: null,
      baseFactor: null,
    })
    expect(lineOf(lines, 'sucre')).toEqual({
      ingredientSlug: 'sucre',
      name: 'Sucre',
      status: 'HAVE_AT_HOME',
    })
  })

  it('reste valide quand l’utilisateur change des lignes (autre produit, passer)', () => {
    const message = buildPlanMessage(
      plan,
      { farine: 'REPLACE', lait: 'SKIP', oeuf: 'SKIP' },
      RUN_ID,
    )

    expect(() => validatePlan(message)).not.toThrow()
    expect(protocol(message)).toBe(true)
    expect(lineOf(message.lines, 'farine')).toMatchObject({
      status: 'NEW',
      replaces: { id: '555101' },
    })
    expect(lineOf(message.lines, 'lait').status).toBe('SKIP')
  })
})

describe('le plan du back pour un agent qui connaît la contenance (DRV-652)', () => {
  const message = buildPlanMessage(plan, {}, RUN_ID, { packSize: true })

  it('est valide pour le validateur et le schéma, avec le slug et le nom de l’unité de chaque ligne', () => {
    expect(() => validatePlan(message)).not.toThrow()
    expect(protocol(message)).toBe(true)
    for (const source of plan.lines.filter((line) => line.status !== 'HAVE_AT_HOME'))
      expect(lineOf(message.lines, source.ingredientSlug).needed).toEqual({
        quantity: source.needed.quantity,
        unitSymbol: source.needed.unitSymbol,
        dimension: source.needed.dimension ?? null,
        baseFactor: source.needed.baseFactor ?? null,
        unitSlug: source.needed.unitSlug,
        unitName: source.needed.unitName,
      })
    expect(lineOf(message.lines, 'sel').needed).toMatchObject({
      unitSlug: 'cuillere-a-soupe',
      unitName: 'cuillère à soupe',
    })
  })

  it('porte la contenance déjà donnée de chaque produit, null quand il n’y en a pas', () => {
    const [first, second] = lineOf(message.lines, 'sel').products ?? []

    expect(first).toMatchObject({ id: '555401', packSize: null })
    expect(second).toMatchObject({
      id: '555402',
      packs: 1,
      packsStatus: 'COMPUTED',
      packSize: { value: 14, unitSlug: 'cuillere-a-soupe' },
    })
  })
})

// --- Les écrans lisent les exemples --------------------------------------------------------------------------------------------

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}
const backed = {
  ...session,
  'GET /api/v1/drive/settings': () => json(settings),
  'GET /api/v1/drive/choices': () => json(choices),
  [`GET /api/v1/drive/plans/${plan.shoppingListId}`]: () => json(plan),
  [`GET /api/v1/drive/estimates/${estimate.shoppingListId}`]: () => json(estimate),
}
const plain = (text: string) => text.replace(/\s+/g, ' ').trim()

async function show(view: object, path: string, props: Record<string, unknown> = {}) {
  const fetchMock = stubApi(backed)
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(view, {
    props,
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1, h2').exists()).toBe(true))
  await flushPromises()

  return { wrapper, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  localStorage.clear()
  window.dispatchEvent(new Event('online'))
})

describe('les écrans lisent les exemples du back sans erreur', () => {
  it('réglages : le magasin, son nom et le résumé des produits mémorisés', async () => {
    const { wrapper, fetchMock } = await show(DriveSettingsView, '/drive/reglages')

    expect(wrapper.text()).toContain('Ville-Test')
    expect(wrapper.text()).toContain('Magasin …456')
    expect(wrapper.findAll('dd').map((value) => value.text())).toEqual(['3', '1', '1'])
    expect(calls(fetchMock)).toContain('GET /api/v1/drive/choices')
  })

  it('Mes produits : le produit préféré de chaque ingrédient, ou « J’en ai toujours »', async () => {
    const { wrapper } = await show(ProductsView, '/drive/produits')
    const text = plain(wrapper.text())

    for (const label of ['Farine de blé T55 1 kg', 'Lait demi-écrémé UHT 50 cl', 'Sel fin 1 kg'])
      expect(text).toContain(label)
    expect(text).toContain('J’en ai toujours')
  })

  it('estimation : le total, la couverture et un statut par ligne', async () => {
    const { wrapper } = await show(DriveEstimateBlock, '/liste', {
      listId: estimate.shoppingListId,
    })
    const text = plain(wrapper.text())

    expect(plain(wrapper.find('dd').text())).toBe('1,99 €')
    expect(text).toContain('1 article sur 4 estimé')
    // Le total et le nombre d'articles estimés, rien d'autre (DRV-628) : le texte du back n'est plus affiché
    expect(text).not.toContain('ne sont pas dans le total')
    expect(text).not.toContain('Estimation peu fiable')
    expect(text).not.toContain(estimate.disclaimer)
    expect(wrapper.findAll('h3').map((title) => title.text())).toEqual([
      'Non estimées (3)',
      'Estimées (1)',
      'J’en ai toujours (1)',
    ])
    for (const status of [
      'estimée',
      'pas de prix connu',
      'pas de produit choisi',
      'à vérifier',
      'j’en ai toujours',
    ])
      expect(text).toContain(status)
  })

  it('envoi : les cinq lignes du plan, avec la quantité de l’unité sans symbole', async () => {
    const { wrapper } = await show(DriveSendView, `/drive/envoi/${plan.shoppingListId}`)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Tes articles'))
    const heading = wrapper.findAll('h2').find((title) => title.text() === 'Tes articles')
    const items = heading?.element.parentElement?.querySelectorAll(':scope > ul > li') ?? []
    const lines = [...items].map((item) => plain(item.textContent))
    expect(lines).toHaveLength(5)
    expect(lines.find((line) => line.startsWith('Œufs'))).toContain('À acheter : 6 unité')
    expect(lines.find((line) => line.startsWith('Sel'))).toContain('quantité à vérifier')
  })
})
