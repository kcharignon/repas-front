// Leclerc par sa VERSION MOBILE, de bout en bout (DRV-754) : l'agent réel, dans Chromium mobile, contre la variante mobile du faux site (`fake-leclerc/mobile.ts`, les FORMES
// mesurées le 2026-11-01 sur le vrai site, données inventées). Les pages sont servies par `www` puis `m-courses` (sans `.aspx`), les appels AJAX vont au SERVEUR du magasin
// (`fd<N>-courses`, autre hôte : CORS, session envoyée), la connexion est sur `fd<N>-espace-client` (deux temps, une case de vérification, la fenêtre du code reçu par e-mail).
// L'agent ne saisit jamais un identifiant ni un code, ne coche jamais la vérification, ne répond jamais à la question de l'ancien panier : ces gestes sont ceux de la PERSONNE
// (ici, Playwright). Le faux site juge la cadence comme pour le site ordinateur.
import { openWithBridge, openWithFragment, returnedResult, returnsToRepas } from './support/agent'
import { expectPoliteAgent } from './support/cadence'
import { expect, test } from './support/fixtures'
import { fresh, known, planOf, product } from './support/plans'
import {
  MOBILE_HOSTS,
  MOBILE_PLAN_STORE,
  startFakeLeclerc,
  type FakeLeclerc,
  type MobileBehavior,
} from '../fake-leclerc/server'
import { MOBILE_OTHER_PAGE_PATH, MOBILE_PAGE_PATH } from '../fake-leclerc/mobile'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const ONE = { quantity: 1, unitSymbol: 'boîte', dimension: 'PACKAGE', baseFactor: 1 } as const
const FARINE = known('farine', 'Farine', [product(1000001, 2)])

async function withMobile(
  mobile: MobileBehavior,
  use: (fake: FakeLeclerc) => Promise<void>,
  extra: Parameters<FakeLeclerc['setBehavior']>[0] = {},
): Promise<void> {
  const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
  try {
    fake.setBehavior({ mobile, ...extra })
    await use(fake)
  } finally {
    await fake.close()
  }
}

const SESSION = { member: true, chosen: true } as const

test.describe('session ouverte sur m-courses', () => {
  test('un produit choisi : recherche et panier sont des POST au serveur du magasin, la quantité demandée est au panier, à la cadence normale', async ({
    page,
    agentCode,
  }) => {
    await withMobile(SESSION, async (fake) => {
      // Given : la personne est connectée, sur la page de son magasin (m-courses) ; le plan nomme le serveur du magasin (fd8)
      await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
        path: MOBILE_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      // When : l'agent lit le magasin dans la page, cherche, met au panier
      await returnsToRepas(page, fake)

      // Then
      expect(fake.cart()).toEqual({ 1000001: 2 })
      expect(fake.paced().map((call) => [call.kind, call.method, call.host])).toEqual([
        ['search', 'POST', 'fd8-courses.leclercdrive.fr'],
        ['cart', 'POST', 'fd8-courses.leclercdrive.fr'],
      ])
      expectPoliteAgent(fake)
      expect(await returnedResult(page, fake)).toMatchObject({
        outcome: 'completed',
        store: { id: '000001' },
        lines: [{ ingredientSlug: 'farine', outcome: 'ADDED' }],
      })
    })
  })

  test('un nouveau produit : la liste vient de la recherche JSON (libellés décodés), rien n’est choisi seul, le choix de la personne met le produit au panier', async ({
    page,
    agentCode,
  }) => {
    await withMobile(SESSION, async (fake) => {
      await openWithFragment(page, fake, agentCode, PLAN(fresh('sel', 'Sel', { needed: ONE })), {
        path: MOBILE_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      await expect(page.getByText('Résultats pour « sel »', { exact: true })).toBeVisible()
      // Les libellés ont des entités HTML dans la réponse : à l'écran, de vrais accents
      await expect(page.getByRole('listitem').filter({ hasText: 'Sel' }).first()).toBeVisible()
      expect(fake.cart(), 'l’agent ne choisit jamais seul').toEqual({})
      await page.getByRole('listitem').first().getByRole('button', { name: 'Choisir' }).click()
      await returnsToRepas(page, fake)

      expect(Object.keys(fake.cart())).toHaveLength(1)
      expectPoliteAgent(fake)
    })
  })

  test('un produit introuvable : « Aucun produit trouvé », la main reste à la personne, aucune écriture', async ({
    page,
    agentCode,
  }) => {
    await withMobile(SESSION, async (fake) => {
      await openWithFragment(
        page,
        fake,
        agentCode,
        PLAN(fresh('zzqxkw', 'Zzqxkw', { searchQuery: 'zzqxkw' })),
        { path: MOBILE_PAGE_PATH, origin: fake.mobileOrigins.courses },
      )

      await expect(page.getByText(/Aucun produit trouvé pour « zzqxkw »/)).toBeVisible()
      expect(fake.cart()).toEqual({})
      expect(fake.paced().every((call) => call.kind === 'search')).toBe(true)
      await page.getByRole('button', { name: 'Pas cette fois' }).click()
      await returnsToRepas(page, fake)
    })
  })

  test('un produit indisponible (le panier le refuse) : le passage le dit, rien n’est mis au panier à tort', async ({
    page,
    agentCode,
  }) => {
    await withMobile(
      SESSION,
      async (fake) => {
        await openWithFragment(
          page,
          fake,
          agentCode,
          PLAN(known('cereales', 'Céréales', [product(1000033, 2)], { searchQuery: 'cereales' })),
          { path: MOBILE_PAGE_PATH, origin: fake.mobileOrigins.courses },
        )

        await expect(page.getByText('Ces produits ne sont plus disponibles')).toBeVisible()
        expect(fake.cart()).toEqual({})
      },
      { availability: 'real-out' },
    )
  })

  test('la réponse du serveur n’est pas celle qu’on lit : « le site a changé » AVEC la cause, et rien n’est écrit', async ({
    page,
    agentCode,
  }) => {
    await withMobile({ ...SESSION, searchShape: 'no-list' }, async (fake) => {
      await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
        path: MOBILE_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      await expect(page.getByText('Leclerc a changé son site')).toBeVisible()
      await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()
      expect(await returnedResult(page, fake)).toMatchObject({
        outcome: 'error',
        error: {
          code: 'CONTRACT_CHANGED',
          message: expect.stringContaining('SEARCH_NO_LIST'),
        },
      })
      expect(fake.cart()).toEqual({})
    })
  })

  test('un pied de page sans lien vers le serveur : « La page n’est pas prête », aucune requête, la cause revient à Repas', async ({
    page,
    agentCode,
  }) => {
    await withMobile({ ...SESSION, footer: 'none' }, async (fake) => {
      await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
        path: MOBILE_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      await expect(page.getByRole('heading', { name: 'La page n’est pas prête' })).toBeVisible({
        timeout: 20_000,
      })
      expect(fake.paced()).toEqual([])
      expect(fake.cart()).toEqual({})
      await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()
      expect(await returnedResult(page, fake)).toMatchObject({
        outcome: 'error',
        error: { code: 'UNSUPPORTED_PAGE', message: 'Page non prise en charge (PAGE_SERVER_HOST)' },
      })
    })
  })

  test('deux hôtes différents dans les liens : l’agent n’en choisit pas', async ({
    page,
    agentCode,
  }) => {
    await withMobile({ ...SESSION, footer: 'two-hosts' }, async (fake) => {
      await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
        path: MOBILE_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      await expect(page.getByRole('heading', { name: 'La page n’est pas prête' })).toBeVisible()
      expect(fake.paced()).toEqual([])
    })
  })
})

test('la question de l’ancien panier : l’agent attend, ne touche aucun des deux boutons, n’écrit rien ; la personne répond, « C’est noté », le passage continue', async ({
  page,
  agentCode,
}) => {
  await withMobile({ ...SESSION, question: true }, async (fake) => {
    // Given : connectée, la page demande « compléter ton ancien panier ? »
    const app = await openWithBridge(page, fake, agentCode, {
      path: MOBILE_PAGE_PATH,
      origin: fake.mobileOrigins.courses,
      asApplication: true,
    })
    app.answerHello(PLAN(FARINE))

    // Then : la carte dit de choisir dans la page ; ni repère d'étape, ni contrôle entouré ; les deux boutons sont intacts, rien n'est écrit
    await expect(page.getByRole('heading', { name: 'Choisis dans la page' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.getByText('La page te demande si tu veux compléter ton ancien panier.'),
    ).toBeVisible()
    await expect(page.getByText('Touche ici')).toHaveCount(0)
    await expect(page.getByText(/Étape \d sur \d|Il reste une étape/)).toHaveCount(0)
    await page.waitForTimeout(3_000)
    await expect(page.locator('#merge-yes')).toBeVisible()
    await expect(page.locator('#merge-no')).toBeVisible()
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})

    // When : la PERSONNE répond
    await page.locator('#merge-no').click()

    // Then : « C'est noté », puis le passage jusqu'au bout
    expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
    expect(fake.cart()).toEqual({ 1000001: 2 })
  })
})

test('premier usage complet : accueil, code postal, ville, magasin, connexion en deux temps et code par e-mail, ancien panier, passage ; rien n’est saisi ni coché par l’agent', async ({
  page,
  agentCode,
}) => {
  test.setTimeout(180_000)
  await withMobile(
    { question: true, loginCode: true },
    async (fake) => {
      const app = await openWithBridge(page, fake, agentCode, {
        path: '/',
        origin: fake.mobileOrigins.www,
        asApplication: true,
      })
      app.answerHello(PLAN(FARINE))

      // (1) L'accueil : le champ « Où souhaitez-vous récupérer vos courses ? » est désigné, la carte dit quoi faire ; le mur de cookies reste touchable
      await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.locator('.g-step').filter({ hasText: 'Étape 1 sur 2' })).toBeVisible()
      // Le mur de cookies : la carte dit d'y répondre d'abord, le repère est retiré ; la personne répond, la carte revient au champ
      await expect(page.getByText('D’abord, réponds aux cookies, dans la page.')).toBeVisible()
      await expect(page.getByText('Touche ici')).toBeHidden()
      await page.getByRole('button', { name: 'Tout accepter' }).click()
      await expect(page.locator('#cookie-wall')).toHaveCount(0)
      await expect(page.getByText('Écris ton code postal dans la page.')).toBeVisible()
      await expect(page.getByText('Touche ici')).toBeVisible()

      // La personne écrit son code postal : la carte se réduit (le clavier est ouvert) et dit la suite ; elle touche la ville, puis la flèche du magasin
      await page.locator('#postal').fill('69720')
      await expect(page.locator('.g-bar-text')).toHaveText('Étape 1 sur 2 · Touche ta ville')
      await page.locator('#suggestion').click()
      await expect(page.locator('.g-bar-text')).toHaveText('Étape 1 sur 2 · Touche ton magasin')
      await page.locator('#pick').click()

      // (2) Le magasin est choisi : l'agent touche « Commencer mes courses » ; la page de m-courses reçoit le plan ; la personne n'est pas connectée
      await expect(page).toHaveURL(new RegExp(`${MOBILE_PAGE_PATH}$`))
      await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
      await expect(page.locator('.g-step').filter({ hasText: 'Il reste une étape' })).toBeVisible()
      // Le menu de m-courses est fermé : la carte dit de l'ouvrir ; ouvert, elle dit quoi toucher et le repère n'entoure que le mot « Connexion »
      await expect(page.getByText('Ouvre le menu, en haut de la page.')).toBeVisible()
      await page.locator('#menu').click()
      await expect(page.getByText('Touche « Connexion » dans le menu.')).toBeVisible()
      await page.locator('#login-link').click()

      // (3) La connexion, en deux temps, sur UNE adresse : la carte dit l'étape de connexion (jamais celle du magasin), y compris pendant la fenêtre du code reçu par e-mail
      await expect(page).toHaveURL(/authentification\.aspx/)
      await expect(
        page.getByText('Écris ton e-mail, puis ton mot de passe. Tu les tapes toi-même.'),
      ).toBeVisible()
      await expect(page.getByText('Choisis ton magasin')).toHaveCount(0)
      await page.locator('#continue').click()
      await expect(page.locator('#hcaptcha')).not.toBeChecked()
      await page.locator('#hcaptcha').check()
      await page.locator('#next').click()
      await expect(page.locator('#step3')).toBeVisible()
      await page.waitForTimeout(3_000)
      await expect(
        page.getByText('Leclerc t’a envoyé un code par e-mail. Tape-le dans la page.'),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Je suis toujours là' })).toHaveCount(0)
      await expect(page.locator('#trust')).not.toBeChecked()
      await page.locator('#validate').click()

      // (4) Le compte s'ouvre ; la personne revient aux courses
      await expect(page).toHaveURL(/home-espace-client-ccc\.aspx/)
      await page.locator('#back-to-shop').click()

      // (5) Connectée, la page demande « compléter ton ancien panier ? » : l'agent attend, n'écrit rien
      await expect(page.getByRole('heading', { name: 'Choisis dans la page' })).toBeVisible()
      expect(fake.paced()).toEqual([])
      expect(fake.cart()).toEqual({})
      await page.locator('#merge-yes').click()

      // (6) Le passage va jusqu'au bout, sans retour dans Repas
      expect(await app.received('result')).toMatchObject({ outcome: 'completed' })
      expect(fake.cart()).toEqual({ 1000001: 2 })
      expectPoliteAgent(fake)
    },
    { cookieWall: 'tall' },
  )
})

test('« Inscription » touché par erreur : la création de compte dit à la personne de toucher « Me connecter »', async ({
  page,
  agentCode,
}) => {
  await withMobile({ chosen: true }, async (fake) => {
    const app = await openWithBridge(page, fake, agentCode, {
      path: MOBILE_PAGE_PATH,
      origin: fake.mobileOrigins.courses,
      asApplication: true,
    })
    app.answerHello(PLAN(FARINE))
    await page.locator('#menu').click()
    await expect(page.getByText('Touche « Connexion » dans le menu.')).toBeVisible()

    await page.locator('#signup-link').click()

    await expect(page).toHaveURL(/creation-compte-ccc\.aspx/)
    await expect(
      page.getByText('Tu es sur la création de compte. Touche « Me connecter ».'),
    ).toBeVisible()
    await expect(page.getByText('Touche ici')).toBeVisible()
    await page.locator('#to-login').click()
    await expect(page).toHaveURL(/authentification\.aspx/)
    await expect(
      page.getByText('Écris ton e-mail, puis ton mot de passe. Tu les tapes toi-même.'),
    ).toBeVisible()
  })
})

test('« Arrêter pour l’instant » pendant le choix du magasin : rien n’est demandé au serveur, rien n’est écrit', async ({
  page,
  agentCode,
}) => {
  await withMobile({}, async (fake) => {
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/',
      origin: fake.mobileOrigins.www,
      asApplication: true,
    })
    app.answerHello(PLAN(FARINE))

    await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Arrêter pour l’instant/ }).click()

    expect(await app.received('result')).toMatchObject({ outcome: 'aborted' })
    expect(fake.cart()).toEqual({})
    expect(fake.paced()).toEqual([])
  })
})

const TWO_LINES = [
  known('farine', 'Farine', [product(1000001, 3)]),
  known('sucre', 'Sucre', [product(1000006, 1)]),
]

test('un client devenu visiteur EN COURS de passage : la session est relue avant chaque écriture, aucune ligne suivante n’est écrite, jamais « Panier rempli »', async ({
  page,
  agentCode,
}) => {
  await withMobile(SESSION, async (fake) => {
    // Given : connecté ; la première ligne s'écrit
    await openWithFragment(page, fake, agentCode, PLAN(...TWO_LINES), {
      path: MOBILE_PAGE_PATH,
      origin: fake.mobileOrigins.courses,
    })
    await expect.poll(() => fake.cart()[1000001]).toBe(3)

    // When : la page se met à jour (comme le ferait l'application Angular) : la barre disparaît, le menu « Connexion / Inscription » revient
    await page.evaluate(() => {
      document.getElementById('last-login')?.remove()
      const item = document.createElement('li')
      item.textContent = 'Connexion / Inscription'
      document.getElementById('menu-list')?.append(item)
    })

    // Then : la ligne suivante n'est PAS écrite, le passage s'arrête sur « Tu n'es pas connecté », jamais sur « Panier rempli »
    await expect(page.getByText('Connecte-toi à Leclerc')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Tes produits sont dans ton panier/)).toHaveCount(0)
    expect(fake.cart()).toEqual({ 1000001: 3 })
    expect(fake.paced().filter((call) => call.kind === 'cart')).toHaveLength(1)
    await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()
    expect(await returnedResult(page, fake)).toMatchObject({
      outcome: 'error',
      error: { code: 'NOT_LOGGED_IN' },
    })
  })
})

test('une page qui ne dit rien de la connexion (la page du panier du serveur) : « Connecte-toi », aucune recherche, aucune écriture', async ({
  page,
  agentCode,
}) => {
  await withMobile(SESSION, async (fake) => {
    await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
      path: '/magasin-000001-000001-Ville-Test/mobile-detail-panier.aspx',
      origin: fake.mobileOrigins.server,
    })

    await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(3_000)
    expect(fake.paced()).toEqual([])
    expect(fake.cart()).toEqual({})
  })
})

test('Leclerc exige la preuve de la connexion sur TOUTE page, y compris celle du site ordinateur : un état inconnu n’écrit rien dans un panier anonyme', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : une page de magasin du site ordinateur dont l'en-tête ne dit ni « Se connecter » ni « Se déconnecter »
  fake.setBehavior({ unknownSession: true })

  await openWithFragment(page, fake, agentCode, planOf([FARINE]))

  // Then : l'étape « Connecte-toi », rien n'est cherché ni écrit
  await expect(page.getByRole('heading', { name: 'Connecte-toi' })).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(fake.paced()).toEqual([])
  expect(fake.cart()).toEqual({})
  await page.getByRole('button', { name: 'Arrêter pour l’instant' }).click()
  expect(await returnedResult(page, fake)).toMatchObject({ outcome: 'aborted', lines: [] })
})

// Accepter le magasin que la personne a choisi (DRV-755) : le plan est fait pour le magasin 000001, la personne choisit le magasin 000002 sur l'accueil. L'agent ne s'arrête
// plus : une carte dit « Tu as ouvert Autre-Ville » et propose de l'utiliser. Rien n'est écrit dans le panier, rien n'est demandé au serveur du magasin.
const OTHER_TITLE = 'Tu as ouvert Autre-Ville'

/** Le plan est livré sur l'accueil, la personne choisit un magasin, l'agent entre : la page du SECOND magasin reçoit le plan (le référent est l'accueil national). */
async function chooseOtherStore(
  page: Parameters<typeof openWithBridge>[0],
  fake: FakeLeclerc,
  agentCode: string,
) {
  const app = await openWithBridge(page, fake, agentCode, {
    path: '/',
    origin: fake.mobileOrigins.www,
    asApplication: true,
  })
  app.answerHello(PLAN(FARINE))
  await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'Tout accepter' }).click()
  await page.locator('#postal').fill('69720')
  await page.locator('#suggestion').click()
  await page.locator('#pick').click()
  await expect(page).toHaveURL(new RegExp(`${MOBILE_OTHER_PAGE_PATH}$`))
  return app
}

test.describe('un autre magasin que celui du plan, choisi sur l’accueil', () => {
  test('la carte dit la ville ouverte ; « Utiliser ce magasin » rend le magasin à Repas, sans une requête ni une écriture', async ({
    page,
    agentCode,
  }) => {
    await withMobile(
      { otherStore: true },
      async (fake) => {
        const app = await chooseOtherStore(page, fake, agentCode)

        // La carte, pas un écran d'erreur : jamais « Ce n'est pas le bon magasin »
        await expect(page.getByRole('heading', { name: OTHER_TITLE })).toBeVisible()
        await expect(
          page.getByText('Repas avait retenu un autre magasin. Tu veux envoyer ta liste ici ?'),
        ).toBeVisible()
        await expect(
          page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' }),
        ).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Choisir un autre magasin' })).toBeVisible()
        await expect(page.getByRole('button', { name: /Arrêter pour l’instant/ })).toBeVisible()
        // Tant que la personne ne touche rien, rien n'est rendu à Repas
        await page.waitForTimeout(1_500)
        expect(app.messages.some((message) => message.type === 'result')).toBe(false)

        await page.getByRole('button', { name: 'Utiliser ce magasin' }).click()

        // Le résultat est « arrêté » (rien n'a été écrit) et porte le magasin lu sur la page : numéro, serveur, adresse de base, ville
        expect(await app.received('result')).toMatchObject({
          type: 'result',
          outcome: 'aborted',
          store: { id: '000001' },
          lines: [],
          chosenStore: {
            id: '000002',
            host: 'fd8-courses.leclercdrive.fr',
            baseUrl: 'https://fd8-courses.leclercdrive.fr/magasin-000002-000002',
            label: 'Autre-Ville',
          },
        })
        expect(fake.cart()).toEqual({})
        expect(fake.paced()).toEqual([])
      },
      { cookieWall: 'tall' },
    )
  })

  test('« Arrêter pour l’instant » : l’envoi s’arrête sans magasin rendu, la liste est gardée', async ({
    page,
    agentCode,
  }) => {
    await withMobile(
      { otherStore: true },
      async (fake) => {
        const app = await chooseOtherStore(page, fake, agentCode)
        await expect(page.getByRole('heading', { name: OTHER_TITLE })).toBeVisible()

        await page.getByRole('button', { name: /Arrêter pour l’instant/ }).click()

        const result = await app.received('result')
        expect(result).toMatchObject({ outcome: 'aborted', lines: [] })
        expect(result).not.toHaveProperty('chosenStore')
        expect(fake.cart()).toEqual({})
        expect(fake.paced()).toEqual([])
      },
      { cookieWall: 'tall' },
    )
  })

  test('« Choisir un autre magasin » : la carte du choix attend, rien n’est rendu ni écrit ; « Arrêter pour l’instant » ferme sans magasin', async ({
    page,
    agentCode,
  }) => {
    await withMobile(
      { otherStore: true },
      async (fake) => {
        const app = await chooseOtherStore(page, fake, agentCode)
        await expect(page.getByRole('heading', { name: OTHER_TITLE })).toBeVisible()

        await page.getByRole('button', { name: 'Choisir un autre magasin' }).click()

        await expect(page.getByRole('heading', { name: 'Choisis ton magasin' })).toBeVisible()
        await expect(
          page.getByText('Touche la barre du magasin en haut de la page, puis ton magasin.'),
        ).toBeVisible()
        await page.waitForTimeout(2_500)
        expect(app.messages.some((message) => message.type === 'result')).toBe(false)

        await page.getByRole('button', { name: /Arrêter pour l’instant/ }).click()
        const result = await app.received('result')
        expect(result).toMatchObject({ outcome: 'aborted' })
        expect(result).not.toHaveProperty('chosenStore')
        expect(fake.cart()).toEqual({})
      },
      { cookieWall: 'tall' },
    )
  })

  test('un autre magasin ouvert HORS du choix guidé (la page ouverte directement) : « Ce n’est pas le bon magasin », comme avant', async ({
    page,
    agentCode,
  }) => {
    await withMobile({ ...SESSION, otherStore: true }, async (fake) => {
      await openWithFragment(page, fake, agentCode, PLAN(FARINE), {
        path: MOBILE_OTHER_PAGE_PATH,
        origin: fake.mobileOrigins.courses,
      })

      await expect(page.getByRole('heading', { name: 'Ce n’est pas le bon magasin' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Utiliser ce magasin' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Revenir à ma liste dans Repas' }).click()
      const result = await returnedResult(page, fake)
      expect(result).toMatchObject({ outcome: 'error', error: { code: 'STORE_MISMATCH' } })
      expect(result).not.toHaveProperty('chosenStore')
      expect(fake.paced()).toEqual([])
    })
  })
})
