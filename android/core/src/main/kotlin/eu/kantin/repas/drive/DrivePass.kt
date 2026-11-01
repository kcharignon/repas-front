package eu.kantin.repas.drive

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** D'où vient un passage : de Repas (`drive.start`, `drive.setup`), ou du menu « Plan d'essai » de la variante de débogage. */
enum class PassSource { REPAS, DEBUG }

/** Le passage en cours : sa demande (un plan ou la lecture du magasin), d'où il vient et l'heure (ms) de son début. */
class ActivePass(val request: PassRequest, val source: PassSource, val startedAt: Long)

/** Le résultat de `DrivePass.start`. */
sealed interface StartOutcome {
    /** Un nouveau passage commence. */
    data object Started : StartOutcome

    /** Le même passage est déjà en cours (Repas a renvoyé son plan après un rechargement) : on le rouvre, rien ne change. */
    data object Resumed : StartOutcome

    /** Un autre passage est en cours : un seul à la fois. [runId] est celui qui occupe la place. */
    class Busy(val runId: String) : StartOutcome
}

/** Où vont les passages non terminés et les résultats pas encore livrés : une seule valeur texte, gardée par le téléphone. */
interface PassStore {
    fun load(): String?
    fun save(value: String?)
}

/**
 * Le passage du plan et son retour (DRV-314) : un seul passage à la fois, gardé 24 h pour la reprise, et les résultats en attente de livraison
 * à Repas. Kotlin pur : le temps, la persistance et la version de l'agent viennent de l'extérieur, ce qui permet de tout tester sans téléphone.
 *
 * - **Un seul passage.** `start` refuse un second plan (`Busy`) tant que le premier n'est ni terminé, ni abandonné, ni périmé.
 * - **Reprise.** Un passage de Repas est écrit dans le [PassStore] (identifiant et plan, jamais un cookie) ; au redémarrage de l'application il
 *   est relu s'il a moins de 24 h. Un passage de débogage n'est jamais écrit.
 * - **Résultat.** `finish` reçoit le message `result` de l'agent (du bon `runId`), clôt le passage et met `drive.result` dans la file ; `abort`
 *   fait de même avec un résultat `aborted`. La file est livrée à la page de Repas quand elle peut la recevoir (`pendingMessages`, puis
 *   `delivered`) et survit à un rechargement de la page et à la fin du processus.
 */
class DrivePass(
    private val store: PassStore,
    private val clock: () -> Long,
    /** La version de l'agent embarqué, pour un résultat `aborted`. */
    private val agentVersion: () -> String,
    /** Les enseignes que l'application sait servir : un passage gardé d'une autre enseigne n'est jamais repris. */
    private val sites: RetailerSites = RetailerSites.DEFAULT,
) {
    private var active: ActivePass? = null
    private val outbox = mutableListOf<String>()

    init {
        restore()
    }

    /** Le passage en cours, s'il a moins de 24 h (un passage plus ancien est oublié). */
    fun current(): ActivePass? {
        val pass = active ?: return null
        if (clock() - pass.startedAt > MAX_AGE_MS) {
            active = null
            persist()
            return null
        }
        return pass
    }

    fun start(request: PassRequest, source: PassSource): StartOutcome {
        val running = current()
        if (running != null) {
            return if (running.request.runId == request.runId && running.source == source) StartOutcome.Resumed else StartOutcome.Busy(running.request.runId)
        }
        active = ActivePass(request, source, clock())
        persist()
        return StartOutcome.Started
    }

    /**
     * Le message `result` de l'agent (ou `setup-result` pour la lecture du magasin) : s'il porte le `runId` du passage en cours, le clôt et
     * (passage de Repas) met `drive.result` dans la file. Rend le passage clos, ou `null` si le résultat n'est pas celui du passage en cours
     * (il est ignoré).
     */
    fun finish(resultText: String): ActivePass? {
        val pass = current() ?: return null
        val result = try {
            JSONObject(resultText)
        } catch (_: JSONException) {
            return null
        }
        val type = result.opt("type")
        if (type != "result" && !(type == "setup-result" && pass.request.isSetup)) return null
        if (result.opt("runId") != pass.request.runId) return null
        close(pass, result)
        return pass
    }

    /**
     * L'abandon (`drive.cancel`, ou l'utilisateur) : clôt le passage en cours par un résultat `aborted`. [runId], s'il est donné, doit être celui
     * du passage. Rend le passage clos, ou `null` s'il n'y en a pas (ou pas celui-là).
     */
    fun abort(runId: String? = null): ActivePass? {
        val pass = current() ?: return null
        if (runId != null && runId != pass.request.runId) return null
        close(pass, JSONObject(pass.request.abortedResult(agentVersion())))
        return pass
    }

    private fun close(pass: ActivePass, result: JSONObject) {
        active = null
        if (pass.source == PassSource.REPAS) outbox += NativeBridge.driveResult(result)
        persist()
    }

    /** Les messages `drive.result` à livrer à la page de Repas, dans l'ordre. */
    fun pendingMessages(): List<String> = outbox.toList()

    /** Les [count] premiers messages ont été postés à la page : on ne les redonne plus. */
    fun delivered(count: Int) {
        repeat(minOf(count, outbox.size)) { outbox.removeAt(0) }
        persist()
    }

    private fun persist() {
        val json = JSONObject()
        active?.takeIf { it.source == PassSource.REPAS }?.let {
            // L'adresse d'un magasin à ouvrir (DRV-741) est gardée à côté du message : le message du protocole ne la porte pas
            json.put("pass", JSONObject().put("plan", it.request.text).put("startedAt", it.startedAt).apply { (it.request as? SetupRequest)?.address?.let { address -> put("address", address) } })
        }
        if (outbox.isNotEmpty()) json.put("outbox", JSONArray(outbox))
        store.save(if (json.length() == 0) null else json.toString())
    }

    private fun restore() {
        val saved = try {
            store.load()?.let { JSONObject(it) }
        } catch (_: JSONException) {
            null
        } ?: return
        saved.optJSONObject("pass")?.let { pass ->
            val request = PassRequests.parseText(pass.optString("plan"), sites)?.let { restored ->
                // Une adresse gardée qui ne passe plus la vérification est oubliée : la lecture reprend à l'accueil
                if (restored is SetupRequest && pass.has("address")) SetupRequest.of(restored.runId, restored.site, pass.optString("address")) ?: restored else restored
            }
            if (request != null && pass.has("startedAt")) active = ActivePass(request, PassSource.REPAS, pass.optLong("startedAt"))
        }
        saved.optJSONArray("outbox")?.let { messages ->
            for (index in 0 until messages.length()) messages.optString(index).takeIf { it.isNotEmpty() }?.let { outbox += it }
        }
        current() // oublie un passage périmé
    }

    companion object {
        /** La durée de la reprise : 24 heures. */
        const val MAX_AGE_MS = 24L * 60 * 60 * 1000
    }
}

/**
 * Ce que l'écran du drive dit en haut d'écran pendant un passage tant que la page n'est pas celle d'un magasin ([RetailerSite.isStorePage])
 * ou que le site l'a refusée : l'agent n'agit que sur une page de magasin, et ne reçoit son message (plan ou lecture du magasin) qu'à ce
 * moment-là. Plutôt qu'un écran qui n'a rien de Repas, un message dit quoi faire, et ne fait jamais rien à la place de l'utilisateur.
 *
 * Pour un plan (ticket E de l'audit du 2026-10-18) : le drive s'ouvre sur l'accueil de l'enseigne, qui affiche l'accueil du magasin, où il faut toucher
 * « Commencer mes courses » ([OPEN], sans alarme : c'est l'attente normale) ; si le site refuse la page, tarde ou n'a pas d'agent ([PLAN],
 * [VERIFICATION]), le bouton « Ouvrir l'accueil du drive » recharge cette page de départ ([PassRequest.startUrl]). Dès que l'utilisateur est sur une
 * page de magasin, le message du passage part tout seul vers l'agent.
 *
 * L'ordre que Leclerc impose : un magasin d'abord, la connexion ensuite (« Avant de vous authentifier, veuillez sélectionner un Drive. »). Aucun
 * de ces messages ne parle donc de connexion avant le magasin ; la connexion n'est demandée que par l'agent, quand elle manque. Si la page de
 * connexion s'affiche avant tout magasin ([RetailerSite.isLoginPage]), [STORE_FIRST] ramène au choix du magasin.
 *
 * **Seules les enseignes qui ont des pages de magasin** ([RetailerSite.hasStorePages]) ont les messages de magasin ([SETUP], [OPEN], [STORE_FIRST]) : chez
 * les autres, le magasin se choisit dans la page du site et l'agent le lit lui-même, l'écran n'a rien à dire sur les pages ordinaires (DRV-733). Les
 * messages d'une page qui cloche ([PLAN], [VERIFICATION], [MOBILE]) et l'arrivée de « Finaliser » ([BASKET]) valent pour toutes.
 */
enum class StoreBanner {
    /** Pas de passage, ou la page est celle d'un magasin : rien à dire. */
    NONE,

    /**
     * Lecture du magasin (`drive.setup`) : choisir son magasin, puis toucher « Utiliser ce magasin ». Rien sur la connexion : Leclerc veut le magasin
     * d'abord. Aussi pendant que l'adresse de magasin donnée par l'utilisateur charge (DRV-741), même si c'est celle d'un site mobile à refuser : l'enseigne la redirige.
     */
    SETUP,

    /**
     * Envoi d'un plan, accueil du magasin ou autre page qui n'en est pas une : toucher « Commencer mes courses » pour ouvrir son magasin. Pas de bouton. Seulement quand un
     * magasin a déjà été ouvert dans l'application ([StorePathMemory.hasPath]) : au premier usage ce bouton n'existe pas encore sur le site (DRV-753), le message se tait.
     */
    OPEN,

    /**
     * La page de connexion de Leclerc s'affiche avant qu'un magasin soit ouvert ([RetailerSite.isLoginPage]), pour un envoi comme pour la
     * lecture du magasin : Leclerc refuserait la connexion (« veuillez sélectionner un Drive »). Le message ramène au choix du magasin. Pas de bouton.
     */
    STORE_FIRST,

    /** Envoi d'un plan : « Cette page n'est pas celle de ton magasin » (page refusée, trop lente ou sans agent), avec le bouton « Ouvrir l'accueil du drive ». */
    PLAN,

    /** Le site demande une vérification (403, 429) : la faire sur la page, Repas reprend ensuite. La page reste visible ; le bouton reste là si ce n'était pas un défi. */
    VERIFICATION,

    /**
     * La page est un site mobile que l'enseigne fait refuser ([SiteMode.DESKTOP], [RetailerSite.mobileSiteLabel]) : l'agent n'y agit pas et rien ne lui est envoyé.
     * Le bouton « Ouvrir l'accueil du drive » recommence depuis l'accueil de l'enseigne. **Aucune enseigne servie n'en a plus** (Leclerc passe par sa version
     * mobile depuis DRV-754, comme Auchan) : ce message n'est montré qu'aux enseignes fictives des tests, jamais à un proche.
     */
    MOBILE,

    /**
     * La page du MOT DE PASSE de l'enseigne (DRV-757) : on y navigue mais aucun code de Repas n'y vit, par choix (ADR 0027 : le pont et l'agent n'existent que sur les pages du site
     * lui-même, jamais sur la page du mot de passe) : ni carte ni repère n'y sont possibles. L'ÉCRAN le dit à leur place, en bandeau natif au-dessus de la page, pour que la
     * personne ne soit jamais seule : se connecter dans la page, en tapant elle-même son mot de passe. Pas de bouton.
     */
    LOGIN,

    /** Arrivée de « Finaliser sur Leclerc » (DRV-631), sans passage : « Ton panier est dans l'icône en haut à droite. » Pas de bouton ; disparaît à la première navigation. */
    BASKET,
    ;

    /** Ce message porte le bouton « Ouvrir l'accueil du drive ». */
    val hasAction: Boolean get() = this == PLAN || this == VERIFICATION || this == MOBILE

    companion object {
        /** Le message à montrer pour la page d'adresse [url], que [trouble] (la surveillance de la page, [OpeningWatch]) juge ainsi. */
        fun of(
            request: PassRequest?,
            url: String?,
            trouble: PageTrouble = PageTrouble.NONE,
            basketHint: Boolean = false,
            loading: Boolean = false,
            /** Un magasin de l'enseigne a déjà été ouvert dans cette application ([StorePathMemory.hasPath]) : « Choisis d'abord ton magasin » serait faux sur la page de connexion d'un envoi (DRV-751). */
            storeKnown: Boolean = false,
        ): StoreBanner = when {
            request == null -> if (basketHint && trouble == PageTrouble.NONE) BASKET else NONE
            trouble == PageTrouble.VERIFICATION -> VERIFICATION
            request.isSetup -> when {
                // L'adresse mobile que l'utilisateur a donnée charge, puis l'enseigne la redirige : pas d'alarme tant que la page n'a pas fini
                trouble == PageTrouble.NONE && request.site.isMobileSite(url) -> if (loading && request.opensAddress) SETUP else MOBILE
                request.site.isStorePage(url) && trouble == PageTrouble.NONE -> NONE
                // Une enseigne sans page de magasin (le magasin se choisit dans la page du site) : aucun message de magasin.
                !request.site.hasStorePages -> NONE
                trouble == PageTrouble.NONE && request.site.isLoginPage(url) -> STORE_FIRST
                else -> SETUP
            }
            trouble != PageTrouble.NONE -> PLAN
            request.site.isMobileSite(url) -> MOBILE
            // Une page du site où le pont n'existe pas (la page du mot de passe) : l'agent n'y est pas, l'écran parle à sa place
            request.site.isNavigable(url) && !request.site.isBridgePage(url) -> LOGIN
            request.site.isStorePage(url) -> NONE
            // L'accueil de l'enseigne : l'agent y suit « Commencer mes courses » ou dit lui-même de le toucher (DRV-625), le bandeau se tait.
            request.site.isHomePage(url) -> NONE
            // Une enseigne sans page de magasin : ni « Commencer mes courses » ni « choisis d'abord ton magasin », propres aux enseignes à pages de magasin.
            !request.site.hasStorePages -> NONE
            // La connexion avant tout magasin : Leclerc la refuse, le message ramène au choix du magasin. Un magasin déjà ouvert (la personne a touché « Se connecter » depuis
            // sa page de magasin, DRV-751) : rien à dire, elle remplit le formulaire.
            request.site.isLoginPage(url) -> if (storeKnown) NONE else STORE_FIRST
            // Toucher « Commencer mes courses » : seulement pour qui a déjà ouvert un magasin (DRV-753). Un premier usage n'a pas ce bouton (il n'apparaît qu'une fois le magasin
            // choisi) : l'agent guide le choix du magasin sur l'accueil, et ce message désignerait un bouton qui n'existe pas.
            else -> if (storeKnown) OPEN else NONE
        }
    }
}

/**
 * Quand envoyer le plan à l'agent (DRV-314) : une fois par page, quand la page a annoncé son agent (`hello`) **et** fini de charger. L'interface
 * de l'agent ne peut pas se poser avant la fin du chargement (pas encore de `document.documentElement`).
 *
 * L'ordre entre `onPageStarted` et le `hello` d'une page n'est pas garanti (l'agent démarre dès la création du document) : le début d'une
 * page ne fait donc oublier que « chargement fini », jamais « agent annoncé ». Chaque `hello` est compté ; le plan est dû tant que le dernier `hello` n'a pas reçu le sien. Si le chargement finit avant le `hello` de la nouvelle page, rien ne part (le dernier `hello` a déjà reçu son plan) : le `hello` de la nouvelle page le fait partir.
 */
class PlanDelivery {
    private var hellos = 0
    private var sentFor = 0
    private var finished = false

    /** Une nouvelle page principale commence à charger. */
    fun pageStarted() {
        finished = false
    }

    /** Une page a annoncé son agent. Vrai s'il faut envoyer le plan maintenant. */
    fun hello(): Boolean {
        hellos++
        return due()
    }

    /** La page a fini de charger. Vrai s'il faut envoyer le plan maintenant. */
    fun pageFinished(): Boolean {
        finished = true
        return due()
    }

    /** L'envoi a échoué : il sera redemandé au prochain événement. */
    fun failed() {
        sentFor = 0
    }

    private fun due(): Boolean {
        if (hellos == 0 || !finished || sentFor == hellos) return false
        sentFor = hellos
        return true
    }
}
