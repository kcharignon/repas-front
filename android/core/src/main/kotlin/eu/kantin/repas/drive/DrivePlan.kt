package eu.kantin.repas.drive

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Ce que l'application fait passer par l'agent pendant un passage (un seul à la fois, [DrivePass]) : un plan de Repas ([DrivePlan],
 * `drive.start`) ou la lecture du magasin ([SetupRequest], `drive.setup`, DRV-320). Les deux ont un `runId`, un message pour l'agent, une
 * page où le drive s'ouvre et un résultat `aborted` en cas d'abandon.
 */
interface PassRequest {
    val runId: String

    /** Le message du protocole v1 (`plan` ou `setup`) en JSON compact : ce que l'on envoie à l'agent et ce que l'on garde pour la reprise. */
    val text: String

    /**
     * La page où le drive s'ouvre : celle où l'utilisateur est déjà connecté et d'où il ouvre son magasin. Elle sert aussi de repli (« Ouvrir
     * l'accueil du drive ») quand le site refuse ou n'affiche pas la page (ticket E de l'audit du 2026-10-18).
     */
    val startUrl: String

    /** Vrai pour la lecture du magasin : l'agent n'a rien à faire avant que la page soit celle d'un magasin ([NavigationPolicy.isStorePage]). */
    val isSetup: Boolean

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

/** Une demande de lecture du magasin (`drive.setup {runId}`, DRV-320) : le message `setup` du protocole v1, sans magasin. */
class SetupRequest private constructor(override val runId: String) : PassRequest {
    override val text: String = JSONObject()
        .put("v", PROTOCOL)
        .put("type", "setup")
        .put("runId", runId)
        .put("retailer", "leclerc")
        .put("returnPath", "/drive/retour")
        .toString()

    /** L'accueil du drive : l'utilisateur s'y connecte et y choisit son magasin. */
    override val startUrl: String get() = NavigationPolicy.START_URL
    override val isSetup: Boolean get() = true

    override fun abortedResult(agentVersion: String): String =
        abortedResultJson(runId, null, agentVersion, "Lecture du magasin abandonnée.")

    companion object {
        /** La demande pour cet identifiant de passage, ou `null` si ce n'est pas un UUID. */
        fun of(runId: Any?): SetupRequest? = (runId as? String)?.takeIf { DrivePlan.isRunId(it) }?.let { SetupRequest(it) }
    }
}

/** Relit un passage gardé par le téléphone : un `plan` ou un `setup`. */
object PassRequests {
    fun parseText(text: String?): PassRequest? = try {
        val json = if (text == null) null else JSONObject(text)
        when (json?.opt("type")) {
            "plan" -> DrivePlan.parse(json)
            "setup" -> SetupRequest.of(json.opt("runId"))
            else -> null
        }
    } catch (_: JSONException) {
        null
    }
}

/**
 * Un plan de Repas à passer au drive (DRV-314) : le message `plan` du protocole v1 reçu par `drive.start`, validé dans sa **forme** et son
 * **hôte** seulement. L'application ne lit pas les lignes : c'est l'agent qui les valide et les interprète ; elle ne garde que de quoi contrôler
 * le magasin (hôte et identifiant), rendre le résultat `aborted` et identifier le passage (`runId`).
 *
 * Kotlin pur, pour se tester sans téléphone.
 */
class DrivePlan private constructor(
    override val runId: String,
    val storeId: String,
    val storeHost: String,
    override val text: String,
) : PassRequest {
    /**
     * La page où le drive s'ouvre : l'**accueil de l'enseigne** ([NavigationPolicy.START_URL], `https://www.leclercdrive.fr/`), la même que pour la
     * lecture du magasin, quel que soit l'hôte du magasin du plan. Constat de la recette réelle (2026-10-18, Pixel 9, application 0.1.3) : la racine
     * de l'hôte du magasin (`https://<hôte>/`, ce que ce code ouvrait) et `/magasin-<id>-<id>/` (sans ville, ce qu'il ouvrait avant) sont des
     * **pages 404** du vrai site. L'accueil de l'enseigne, session ouverte, affiche l'accueil du magasin de l'utilisateur et son bouton « Commencer
     * mes courses », qui mène aux vraies pages du magasin (`https://<hôte>/magasin-<id>-<id>-<Ville>/…`, celles que lisent
     * [NavigationPolicy.isStorePage] et l'agent). Ce n'est pas une page de magasin pour l'agent : il attend, un message d'en-tête dit à
     * l'utilisateur de toucher « Commencer mes courses » (l'application ne clique jamais à sa place), et le message du passage part vers l'agent dès
     * qu'une page de magasin est atteinte ([StoreBanner]) ; si ce n'est pas le magasin du plan, l'agent répond `STORE_MISMATCH`. Le magasin du plan
     * ([storeId], [storeHost]) ne sert qu'à valider le plan et à rendre le résultat `aborted` : il n'est jamais ouvert.
     */
    override val startUrl: String get() = NavigationPolicy.START_URL
    override val isSetup: Boolean get() = false

    override fun abortedResult(agentVersion: String): String = abortedResultJson(runId, storeId, agentVersion, "Envoi abandonné.")

    companion object {
        private const val PROTOCOL_VERSION = 1
        private const val MAX_LINES = 100
        private const val RETURN_PATH = "/drive/retour"
        private val RUN_ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        private val STORE_ID = Regex("[0-9]{1,12}")
        private val STORE_HOST = Regex("[a-z0-9-]+\\.leclercdrive\\.fr")

        /** Un identifiant de passage valide (un UUID). */
        fun isRunId(value: String?): Boolean = value != null && RUN_ID.matches(value)

        /**
         * Le plan, ou `null` si ce n'est pas un message `plan` de la forme du protocole : `v` 1, `type` `plan`, `runId` UUID, `retailer`
         * `leclerc`, magasin `{id, host}` (identifiant de 1 à 12 chiffres, hôte `*.leclercdrive.fr` en minuscules), `returnPath`
         * `/drive/retour`, `lines` un tableau de 100 éléments au plus ; le tout dans la borne de 64 Ko. Les lignes ne sont pas lues.
         */
        fun parse(plan: JSONObject?): DrivePlan? {
            if (plan == null) return null
            if (plan.opt("v") != PROTOCOL_VERSION || plan.opt("type") != "plan") return null
            val runId = plan.opt("runId") as? String ?: return null
            if (!RUN_ID.matches(runId) || plan.opt("retailer") != "leclerc" || plan.opt("returnPath") != RETURN_PATH) return null
            val store = plan.opt("store") as? JSONObject ?: return null
            val id = store.opt("id") as? String ?: return null
            val host = store.opt("host") as? String ?: return null
            if (!STORE_ID.matches(id) || !STORE_HOST.matches(host) || !NavigationPolicy.isAllowed("https://$host/")) return null
            val lines = plan.opt("lines") as? JSONArray ?: return null
            if (lines.length() > MAX_LINES) return null
            val text = plan.toString()
            return DrivePlan(runId, id, host, text).takeIf { BridgeMessages.fitsBound(text) }
        }

        /** Le plan gardé en mémoire persistante (déjà validé quand il y est entré) ; `null` s'il est illisible. */
        fun parseText(text: String?): DrivePlan? = try {
            if (text == null) null else parse(JSONObject(text))
        } catch (_: JSONException) {
            null
        }
    }
}
