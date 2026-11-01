package eu.kantin.repas.drive

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Ce que l'application fait passer par l'agent pendant un passage (un seul à la fois, [DrivePass]) : un plan de Repas ([DrivePlan],
 * `drive.start`) ou la lecture du magasin ([SetupRequest], `drive.setup`, DRV-320). Les deux ont un `runId`, **une enseigne**, un message pour l'agent,
 * une page où le drive s'ouvre et un résultat `aborted` en cas d'abandon.
 */
interface PassRequest {
    val runId: String

    /**
     * L'enseigne de ce passage (`retailer` du message). C'est elle, et elle seule, qui dit où ce message peut partir ([RetailerSite.acceptsPlanOn]) :
     * jamais vers une page d'une autre enseigne.
     */
    val site: RetailerSite

    /** Le message du protocole v1 (`plan` ou `setup`) en JSON compact : ce que l'on envoie à l'agent et ce que l'on garde pour la reprise. */
    val text: String

    /**
     * La page où le drive s'ouvre : celle où l'utilisateur est déjà connecté et d'où il ouvre son magasin ([RetailerSite.startUrl]). Elle sert aussi de
     * repli (« Ouvrir l'accueil du drive ») quand le site refuse ou n'affiche pas la page (ticket E de l'audit du 2026-10-18).
     */
    val startUrl: String

    /** Vrai pour la lecture du magasin : l'agent n'a rien à faire avant que la page soit celle d'un magasin ([RetailerSite.isStorePage]). */
    val isSetup: Boolean

    /**
     * Vrai quand [startUrl] est l'adresse d'un magasin que l'utilisateur a collée (DRV-741, lecture du magasin seulement) et non l'accueil de l'enseigne :
     * la page peut être celle d'un site mobile à refuser que l'enseigne redirige (une enseigne fictive des tests : Leclerc n'en a plus, DRV-754) ; ce n'est pas un défaut tant qu'elle charge.
     */
    val opensAddress: Boolean get() = false

    /**
     * Le résultat `aborted` du protocole v1 pour ce passage (abandon par l'utilisateur ou `drive.cancel`) : aucune ligne (l'application ne sait
     * pas ce que l'agent a déjà mis au panier), le code `CANCELLED`. [agentVersion] : la version de l'agent embarqué.
     */
    fun abortedResult(agentVersion: String): String
}

private const val PROTOCOL = 1
private const val UNKNOWN_AGENT_VERSION = "0.0.0"
private val AGENT_SEMVER = Regex("\\d+\\.\\d+\\.\\d+")

/** Le résultat `aborted` d'un passage ; [storeId] est absent pour une lecture du magasin dont Repas ne connaissait pas le magasin. */
private fun abortedResultJson(runId: String, storeId: String?, agentVersion: String, message: String): String = JSONObject()
    .put("v", PROTOCOL)
    .put("type", "result")
    .put("runId", runId)
    .put("agentVersion", if (AGENT_SEMVER.matches(agentVersion)) agentVersion else UNKNOWN_AGENT_VERSION)
    .put("outcome", "aborted")
    .apply { if (storeId != null) put("store", JSONObject().put("id", storeId)) }
    .put("error", JSONObject().put("code", "CANCELLED").put("message", message))
    .put("lines", JSONArray())
    .toString()

/**
 * Une demande de lecture du magasin (`drive.setup {runId}`, DRV-320) : le message `setup` du protocole v1, sans magasin.
 *
 * [address] (DRV-741) : l'adresse d'un magasin que Repas a reçue de l'utilisateur (collée depuis le site de l'enseigne), déjà jugée par
 * [RetailerSite.openableStoreAddress]. L'application l'ouvre à la place de l'accueil : l'enseigne la redirige au besoin vers la bonne
 * adresse de magasin (pour Leclerc, la page `m-courses…/magasin-N-N-ville` de sa version mobile est déjà celle du magasin, DRV-754), et l'agent lit le magasin sur la page finale (flux habituel, « Utiliser ce magasin »). Elle ne va **jamais** à l'agent : le
 * message du protocole [text] est le même, et seul le magasin lu sur la page finale revient à Repas.
 */
class SetupRequest private constructor(override val runId: String, override val site: RetailerSite, val address: String?) : PassRequest {
    override val text: String = JSONObject()
        .put("v", PROTOCOL)
        .put("type", "setup")
        .put("runId", runId)
        .put("retailer", site.id)
        .put("returnPath", "/drive/retour")
        .toString()

    /** L'accueil du drive de l'enseigne (l'utilisateur s'y connecte et y choisit son magasin), ou l'adresse de magasin qu'il a donnée. */
    override val startUrl: String get() = address ?: site.startUrl
    override val isSetup: Boolean get() = true
    override val opensAddress: Boolean get() = address != null

    override fun abortedResult(agentVersion: String): String =
        abortedResultJson(runId, null, agentVersion, "Lecture du magasin abandonnée.")

    companion object {
        /**
         * La demande pour cet identifiant de passage et cette enseigne (celle d'avant le multi-enseignes quand l'appelant n'en dit pas), ou `null`
         * si ce n'est pas un UUID, ou si [address] (facultative) n'est pas une adresse de magasin acceptable pour cette enseigne.
         */
        fun of(runId: Any?, site: RetailerSite = RetailerSites.DEFAULT.legacy, address: String? = null): SetupRequest? {
            val id = (runId as? String)?.takeIf { DrivePlan.isRunId(it) } ?: return null
            if (address != null && site.openableStoreAddress(address) == null) return null
            return SetupRequest(id, site, address)
        }

        /**
         * La demande d'un message `drive.setup` (ou d'un `setup` gardé) : le `runId` est un UUID, `retailer` (facultatif) une enseigne du registre
         * [sites]. Un message qui ne dit pas l'enseigne est celui de l'enseigne d'avant le multi-enseignes ([RetailerSites.legacy]) ; une enseigne
         * qui n'est pas au registre (ou qui n'est pas un texte) le fait refuser. `address` (facultative, absente ou `null` : l'accueil) est jugée par
         * [RetailerSite.openableStoreAddress] ; une adresse qui ne l'est pas fait refuser tout le message.
         */
        fun parse(json: JSONObject, sites: RetailerSites = RetailerSites.DEFAULT): SetupRequest? {
            val site = if (json.has("retailer")) sites.byId(json.opt("retailer") as? String) else sites.legacy
            val address = json.opt("address")
            if (address != null && address != JSONObject.NULL && address !is String) return null
            return site?.let { of(json.opt("runId"), it, address as? String) }
        }
    }
}

/** Relit un passage gardé par le téléphone : un `plan` ou un `setup`. */
object PassRequests {
    fun parseText(text: String?, sites: RetailerSites = RetailerSites.DEFAULT): PassRequest? = try {
        val json = if (text == null) null else JSONObject(text)
        when (json?.opt("type")) {
            "plan" -> DrivePlan.parse(json, sites)
            // Un `setup` gardé : l'enseigne est celle du message ; un message d'avant le multi-enseignes qui ne la dit pas est celui de l'enseigne d'avant.
            "setup" -> SetupRequest.parse(json, sites)
            else -> null
        }
    } catch (_: JSONException) {
        null
    }
}

/**
 * Un plan de Repas à passer au drive (DRV-314) : le message `plan` du protocole v1 reçu par `drive.start`, validé dans sa **forme**, son **enseigne** et
 * son **hôte** seulement. L'application ne lit pas les lignes : c'est l'agent qui les valide et les interprète ; elle ne garde que de quoi contrôler
 * le magasin (hôte et identifiant), rendre le résultat `aborted` et identifier le passage (`runId`).
 *
 * L'enseigne du plan doit être au registre, et son magasin doit être **chez elle** : l'hôte est un hôte de cette enseigne où le pont existe, l'identifiant
 * a la forme de cette enseigne. Un plan d'une enseigne dont l'hôte est celui d'une autre est refusé.
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
class DrivePlan private constructor(
    override val runId: String,
    override val site: RetailerSite,
    val storeId: String,
    val storeHost: String,
    override val text: String,
) : PassRequest {
    /**
     * La page où le drive s'ouvre : l'**accueil de l'enseigne du plan** ([RetailerSite.startUrl]), la même que pour la lecture du magasin, quel que soit
     * l'hôte du magasin du plan. Constat de la recette réelle (2026-10-18, Pixel 9, application 0.1.3) : la racine de l'hôte du magasin
     * (`https://<hôte>/`, ce que ce code ouvrait) et `/magasin-<id>-<id>/` (sans ville, ce qu'il ouvrait avant) sont des **pages 404** du vrai site.
     * L'accueil de l'enseigne, session ouverte, affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer mes courses », qui mène aux
     * vraies pages du magasin (avec la ville, celles que lisent [RetailerSite.isStorePage] et l'agent). Ce n'est pas une page de magasin pour l'agent :
     * il attend, un message d'en-tête dit à l'utilisateur de toucher « Commencer mes courses » (l'application ne clique jamais à sa place), et le
     * message du passage part vers l'agent dès qu'une page de magasin est atteinte ([StoreBanner]) ; si ce n'est pas le magasin du plan, l'agent répond
     * `STORE_MISMATCH`. Le magasin du plan ([storeId], [storeHost]) ne sert qu'à valider le plan et à rendre le résultat `aborted` : il n'est jamais ouvert.
     */
    override val startUrl: String get() = site.startUrl
    override val isSetup: Boolean get() = false

    override fun abortedResult(agentVersion: String): String = abortedResultJson(runId, storeId, agentVersion, "Envoi abandonné.")

    companion object {
        private const val PROTOCOL_VERSION = 1
        private const val MAX_LINES = 100
        private const val RETURN_PATH = "/drive/retour"
        private val RUN_ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

        /** Un identifiant de passage valide (un UUID). */
        fun isRunId(value: String?): Boolean = value != null && RUN_ID.matches(value)

        /**
         * Le plan, ou `null` si ce n'est pas un message `plan` de la forme du protocole : `v` 1, `type` `plan`, `runId` UUID, `retailer` une enseigne du
         * registre [sites], magasin `{id, host}` (identifiant de la forme de cette enseigne, hôte de cette enseigne où le pont existe, en minuscules),
         * `returnPath` `/drive/retour`, `lines` un tableau de 100 éléments au plus ; le tout dans la borne de 64 Ko. Les lignes ne sont pas lues.
         */
        fun parse(plan: JSONObject?, sites: RetailerSites = RetailerSites.DEFAULT): DrivePlan? {
            if (plan == null) return null
            if (plan.opt("v") != PROTOCOL_VERSION || plan.opt("type") != "plan") return null
            val runId = plan.opt("runId") as? String ?: return null
            if (!RUN_ID.matches(runId) || plan.opt("returnPath") != RETURN_PATH) return null
            val site = sites.byId(plan.opt("retailer") as? String) ?: return null
            val store = plan.opt("store") as? JSONObject ?: return null
            val id = store.opt("id") as? String ?: return null
            val host = store.opt("host") as? String ?: return null
            if (!site.isStoreId(id) || !site.isStoreHost(host)) return null
            val lines = plan.opt("lines") as? JSONArray ?: return null
            if (lines.length() > MAX_LINES) return null
            val text = plan.toString()
            return DrivePlan(runId, site, id, host, text).takeIf { BridgeMessages.fitsBound(text) }
        }

        /** Le plan gardé en mémoire persistante (déjà validé quand il y est entré) ; `null` s'il est illisible. */
        fun parseText(text: String?, sites: RetailerSites = RetailerSites.DEFAULT): DrivePlan? = try {
            if (text == null) null else parse(JSONObject(text), sites)
        } catch (_: JSONException) {
            null
        }
    }
}
