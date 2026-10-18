// Ticket D de l'audit du 2026-10-18 (H3, H7) : quand le moteur de Leclerc ne répond rien au nom d'un ingrédient, l'agent essaie ses formes
// dérivées UNE par UNE, à la cadence normale, au plus 4, jamais deux fois la même, et s'arrête à la première qui répond. Ici le repli est
// éprouvé sur des adaptateurs simulés (ordre, arrêt, bornes, erreurs) puis sur le vrai adaptateur avec un faux `fetch` (cadence, absence de parallélisme).
import { describe, expect, it } from 'vitest'

import { findKnownProduct, MAX_FALLBACKS, searchByName, searchForms } from '../src/flow'
import { LeclercAdapter, LeclercError, PAUSE_MS, type Candidate } from '../src/leclerc'
import { candidate } from './flow-helpers'
import { fakeSite, fixture, type Call, type Scripted } from './leclerc-helpers'

/** Un moteur simulé qui ne répond qu'à certaines requêtes exactes ; il note les requêtes et refuse d'être appelé en parallèle. */
function engine(answers: Record<string, string[]>, options: { delay?: () => Promise<void> } = {}) {
  const queries: string[] = []
  let inFlight = 0
  let peak = 0
  return {
    queries,
    peak: () => peak,
    adapter: {
      async searchProducts(query: string): Promise<Candidate[]> {
        queries.push(query)
        inFlight += 1
        peak = Math.max(peak, inFlight)
        try {
          await (options.delay?.() ?? Promise.resolve())
          return (answers[query] ?? []).map((id) => candidate(id))
        } finally {
          inFlight -= 1
        }
      },
      async readProductFromSearch(query: string, id: string): Promise<Candidate | null> {
        const found = await this.searchProducts(query)
        return found.find((item) => item.id === id) ?? null
      },
    },
  }
}

describe('searchByName : le nom d’abord, ses formes ensuite', () => {
  it('un nom qui répond ne coûte qu’une requête, et la recherche affichée est le nom', async () => {
    // Given
    const site = engine({ tomate: ['1000001', '1000002'] })

    // When
    const found = await searchByName(site.adapter, 'tomate')

    // Then
    expect(site.queries).toEqual(['tomate'])
    expect(found.query).toBe('tomate')
    expect(found.candidates.map((item) => item.id)).toEqual(['1000001', '1000002'])
  })

  it('« œuf » ne répond que sous « oeuf » : une requête de repli, et c’est « oeuf » qui est dite avoir répondu', async () => {
    // Given
    const site = engine({ oeuf: ['1000014'] })

    // When
    const found = await searchByName(site.adapter, 'œuf')

    // Then
    expect(site.queries).toEqual(['œuf', 'oeuf'])
    expect(found.query).toBe('oeuf')
    expect(found.candidates.map((item) => item.id)).toEqual(['1000014'])
  })

  it('s’arrête dès qu’une forme répond : les suivantes ne sont pas essayées', async () => {
    // Given : « herbes de Provence » a quatre formes ; la deuxième répond
    const site = engine({ 'herbe de provence': ['1000001'], herbes: ['1000002'] })

    // When
    const found = await searchByName(site.adapter, 'herbes de Provence')

    // Then
    expect(site.queries).toEqual(['herbes de Provence', 'herbes de provence', 'herbe de provence'])
    expect(found.query).toBe('herbe de provence')
  })

  it('essaie les formes dans l’ordre de searchForms, sans en omettre', async () => {
    // Given : rien ne répond
    const site = engine({})

    // When
    const found = await searchByName(site.adapter, 'herbes de Provence')

    // Then : le nom, puis ses quatre formes
    expect(site.queries).toEqual(['herbes de Provence', ...searchForms('herbes de Provence')])
    expect(site.queries).toHaveLength(1 + MAX_FALLBACKS)
    expect(found).toEqual({ query: 'herbes de Provence', candidates: [] })
  })

  it('« zzqxkw » ne répond à rien : au plus 5 requêtes, aucune deux fois, et le nom reste la recherche affichée', async () => {
    // Given
    const site = engine({})

    // When
    const found = await searchByName(site.adapter, 'zzqxkw')

    // Then
    expect(site.queries.length).toBeLessThanOrEqual(1 + MAX_FALLBACKS)
    expect(new Set(site.queries).size).toBe(site.queries.length)
    expect(found).toEqual({ query: 'zzqxkw', candidates: [] })
  })

  it('un nom très long n’envoie jamais plus de 5 requêtes (le nom et 4 formes), toutes différentes', async () => {
    // Given
    const name = 'Œufs frais de la ferme du Plateau (élevés en plein air, calibre moyen) à la coque'
    const site = engine({})

    // When
    await searchByName(site.adapter, name)

    // Then
    expect(site.queries).toHaveLength(1 + MAX_FALLBACKS)
    expect(new Set(site.queries).size).toBe(1 + MAX_FALLBACKS)
  })

  it('un nom sans forme (un seul caractère) n’est cherché qu’une fois', async () => {
    const site = engine({})

    const found = await searchByName(site.adapter, 'a')

    expect(site.queries).toEqual(['a'])
    expect(found).toEqual({ query: 'a', candidates: [] })
  })

  it('un nom vide ne fait aucune requête de repli', async () => {
    const site = engine({})

    const found = await searchByName(site.adapter, '   ')

    expect(site.queries.length).toBeLessThanOrEqual(1)
    expect(found.candidates).toEqual([])
  })
})

describe('searchByName : en série', () => {
  it('une requête de repli ne part qu’une fois la précédente terminée, jamais en parallèle', async () => {
    // Given : chaque réponse attend un tour de boucle de plus que la requête suivante ne mettrait à partir
    const site = engine({}, { delay: () => new Promise((resolve) => setTimeout(resolve, 5)) })

    // When
    await searchByName(site.adapter, 'herbes de Provence')

    // Then
    expect(site.queries).toHaveLength(5)
    expect(site.peak()).toBe(1)
  })
})

describe('searchByName : les erreurs', () => {
  it.each(['BLOCKED', 'NOT_LOGGED_IN', 'NETWORK', 'CONTRACT_CHANGED'] as const)(
    'une erreur %s sur la recherche de repli remonte telle quelle, sans autre requête',
    async (code) => {
      // Given : le nom ne répond rien, la première forme est refusée par le site
      const queries: string[] = []
      const adapter = {
        searchProducts(query: string): Promise<Candidate[]> {
          queries.push(query)
          return queries.length === 1
            ? Promise.resolve([])
            : Promise.reject(
                new LeclercError(code, null, code === 'CONTRACT_CHANGED' ? 'HTTP_404' : null),
              )
        },
      }

      // When
      const failure = await searchByName(adapter, 'herbes de Provence').catch(
        (error: unknown) => error,
      )

      // Then
      expect(failure).toBeInstanceOf(LeclercError)
      expect((failure as LeclercError).code).toBe(code)
      expect(queries).toHaveLength(2)
    },
  )

  it('une erreur sur la première recherche remonte aussi : aucun repli ne la masque', async () => {
    const queries: string[] = []
    const adapter = {
      searchProducts(query: string): Promise<Candidate[]> {
        queries.push(query)
        return Promise.reject(new LeclercError('BLOCKED', 403))
      },
    }

    const failure = await searchByName(adapter, 'œuf').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(LeclercError)
    expect(queries).toEqual(['œuf'])
  })
})

// —— Le vrai adaptateur, un faux `fetch` ——————————————————————————————————————————————————————————————————————————————————————

const GOOD: Scripted = { body: fixture('recherche-farine.html') }
const EMPTY: Scripted = { body: fixture('recherche-vide.html') }
const wordOf = (call: Call): string =>
  decodeURIComponent(call.url.split('TexteRecherche=')[1] ?? '')

describe('avec le vrai adaptateur : la cadence normale est respectée', () => {
  it('chaque requête de repli part 800 ms au moins après la fin de la précédente, une à la fois', async () => {
    // Given : seule la forme « oeuf » répond
    const site = fakeSite((call) => (wordOf(call) === 'oeuf' ? GOOD : EMPTY))
    const adapter = new LeclercAdapter(site.deps)

    // When
    const found = await searchByName(adapter, 'œuf')

    // Then : « œuf » (vide), puis « oeuf » ; l'attente entre les deux est celle du Pacer
    expect(site.calls.map(wordOf)).toEqual(['œuf', 'oeuf'])
    expect(found.query).toBe('oeuf')
    expect(found.candidates).toHaveLength(5)
    expect(site.maxInFlight()).toBe(1)
    const gap = (site.calls[1]?.at ?? 0) - ((site.calls[0]?.at ?? 0) + 50)
    expect(gap).toBeGreaterThanOrEqual(PAUSE_MS)
  })

  it('rien ne répond : cinq requêtes au plus, toutes distinctes, séparées d’au moins 800 ms, jamais en parallèle', async () => {
    // Given
    const site = fakeSite(() => EMPTY)
    const adapter = new LeclercAdapter(site.deps)

    // When
    const found = await searchByName(adapter, 'herbes de Provence')

    // Then
    const words = site.calls.map(wordOf)
    expect(words).toHaveLength(1 + MAX_FALLBACKS)
    expect(new Set(words).size).toBe(words.length)
    expect(site.maxInFlight()).toBe(1)
    const gaps = site.calls
      .slice(1)
      .map((call, index) => call.at - ((site.calls[index]?.at ?? 0) + 50))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(PAUSE_MS)
    expect(found).toEqual({ query: 'herbes de Provence', candidates: [] })
  })
})

// —— Un produit connu (H3) ————————————————————————————————————————————————————————————————————————————————————————————————————

describe('findKnownProduct : le libellé complet d’abord, ses formes ensuite, « introuvable » en dernier recours', () => {
  const LABEL = 'Crème fraîche épaisse Laiterie du Test 20 cl'

  it('un produit retrouvé par son libellé complet ne coûte qu’une requête', async () => {
    const site = engine({ [LABEL]: ['1000028'] })

    const seen = await findKnownProduct(site.adapter, LABEL, '1000028')

    expect(site.queries).toEqual([LABEL])
    expect(seen?.id).toBe('1000028')
  })

  it('un produit que le libellé complet ne retrouve pas est cherché par les formes du libellé, et la première qui le retrouve arrête le repli', async () => {
    // Given : le moteur ne comprend le libellé que sans accent
    const site = engine({ 'creme fraiche epaisse laiterie du test 20 cl': ['1000028'] })

    // When
    const seen = await findKnownProduct(site.adapter, LABEL, '1000028')

    // Then
    expect(site.queries).toEqual([LABEL, 'creme fraiche epaisse laiterie du test 20 cl'])
    expect(seen?.id).toBe('1000028')
  })

  it('une forme qui répond sans le produit voulu n’arrête pas le repli : c’est le produit qui compte, pas une réponse', async () => {
    // Given : le libellé sans accent rend d'autres produits, le premier mot seul rend le bon
    const site = engine({
      'creme fraiche epaisse laiterie du test 20 cl': ['1000099'],
      creme: ['1000099', '1000028'],
    })

    // When
    const seen = await findKnownProduct(site.adapter, LABEL, '1000028')

    // Then
    expect(site.queries).toEqual([LABEL, ...searchForms(LABEL)])
    expect(seen?.id).toBe('1000028')
  })

  it('un produit qu’aucune forme ne retrouve est introuvable (« plus disponible » reste le dernier recours), après 5 requêtes au plus', async () => {
    const site = engine({ [LABEL]: ['1000099'] })

    const seen = await findKnownProduct(site.adapter, LABEL, '1000028')

    expect(seen).toBeNull()
    expect(site.queries.length).toBeLessThanOrEqual(1 + MAX_FALLBACKS)
    expect(new Set(site.queries).size).toBe(site.queries.length)
    expect(site.peak()).toBe(1)
  })
})
