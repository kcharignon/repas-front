package eu.kantin.repas.drive

import java.security.MessageDigest
import java.util.Base64

/** Où en est l'agent embarqué. */
enum class AgentStatus {
    /** L'agent est là, intact, et la WebView sait l'injecter. */
    READY,

    /** Le fichier de l'agent manque dans l'application. */
    MISSING,

    /** Le fichier de l'agent n'a pas l'empreinte attendue : il n'est jamais injecté. */
    CORRUPT,

    /** La WebView du téléphone est trop ancienne pour le canal de messages : il faut la mettre à jour. */
    WEBVIEW_TOO_OLD,
}

/** L'agent prêt à l'injection : le script à évaluer dans les pages, sa version et son empreinte. */
class AgentScript(val source: String, val version: String, val digest: String)

/**
 * L'agent embarqué (DRV-313) : `agent.js`, construit par `make agent-build` et copié dans l'application à la construction, qui échoue
 * si son empreinte SHA-384 n'est pas celle de `android/agent.js.sha384`. À l'exécution l'application la revérifie avant d'injecter
 * quoi que ce soit. Kotlin pur (les fichiers arrivent par une fonction) pour se tester sans téléphone.
 */
object AgentAsset {
    const val AGENT_FILE = "agent.js"
    const val DIGEST_FILE = "agent.js.sha384"
    const val INJECTION_FILE = "injection.js"

    /** Le marqueur de `injection.js` que l'agent remplace. */
    const val PLACEHOLDER = "/*__AGENT__*/"

    /** Le marqueur du mode débogage de `injection.js` : `true` dans la variante de débogage de l'application (DRV-318), `false` ailleurs. */
    const val DEBUG_PLACEHOLDER = "/*__DEBUG__*/false"

    private val HEADER_VERSION = Regex("^/\\*! Repas Drive agent (\\d+\\.\\d+\\.\\d+) \\*/")

    /** `sha384-<base64>` : le format de l'attribut `integrity`, celui de `manifest.json`. */
    fun digestOf(bytes: ByteArray): String =
        "sha384-" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-384").digest(bytes))

    /** La version écrite dans la première ligne de `agent.js`, ou `?`. */
    fun versionOf(agentJs: String): String = HEADER_VERSION.find(agentJs)?.groupValues?.get(1) ?: "?"

    /**
     * Le script évalué dans les pages : `injection.js` où le marqueur est remplacé par l'agent, tel quel, et où le marqueur du mode
     * débogage devient `true` ou `false` (les deux seules valeurs possibles : rien ne vient d'ailleurs).
     */
    fun assemble(injection: String, agentJs: String, debug: Boolean = false): String {
        require(injection.split(PLACEHOLDER).size == 2) { "injection.js doit contenir le marqueur $PLACEHOLDER une fois." }
        return injection.replace(DEBUG_PLACEHOLDER, debug.toString()).replace(PLACEHOLDER, agentJs)
    }

    /**
     * Lit l'agent par `open` (les fichiers de l'application ; `null` s'il manque), le vérifie et le prépare. Le premier cas qui ne va pas
     * donne son statut ; la WebView trop ancienne est décidée par l'appelant, qui connaît ses capacités.
     */
    fun load(open: (String) -> ByteArray?, debug: Boolean = false): Pair<AgentStatus, AgentScript?> {
        val agent = open(AGENT_FILE)
        val expected = open(DIGEST_FILE)
        val injection = open(INJECTION_FILE)
        if (agent == null || expected == null || injection == null) return AgentStatus.MISSING to null
        val digest = digestOf(agent)
        if (digest != expected.toString(Charsets.UTF_8).trim()) return AgentStatus.CORRUPT to null
        val source = agent.toString(Charsets.UTF_8)
        return AgentStatus.READY to AgentScript(assemble(injection.toString(Charsets.UTF_8), source, debug), versionOf(source), digest)
    }
}
