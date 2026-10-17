package eu.kantin.repas.drive

import android.content.Context
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.IOException

/**
 * Le lien entre l'application et l'agent dans la WebView (DRV-313) : l'injection de l'agent dans les pages https de `*.leclercdrive.fr` et
 * le canal de messages. Les règles (origines, bornes, forme des messages) sont dans [BridgeMessages] et [AgentAsset], en Kotlin pur ; ici,
 * seulement la colle avec `androidx.webkit`.
 *
 * - **Injection** : `addDocumentStartJavaScript` (avant tout script de la page), restreinte aux origines autorisées, jamais `*`. Si la
 *   WebView ne l'offre pas, repli par `evaluateJavascript` après `onPageFinished`, pour les mêmes pages seulement.
 * - **Canal** : `addWebMessageListener`, nom `repasHost`, mêmes origines. Aucun `addJavascriptInterface`. Le premier message d'une page
 *   (`hello`, envoyé par `injection.js`) donne le canal de réponse vers elle : c'est par lui que partent les messages vers l'agent.
 * - Un message d'une origine non autorisée, d'un cadre secondaire, trop gros ou mal formé est ignoré ; seule la raison est notée au
 *   journal, jamais le contenu.
 */
internal class AgentHost private constructor(
    val status: AgentStatus,
    private val script: AgentScript?,
    private val onAgentMessage: (Inbound.FromAgent) -> Unit,
) {
    private var reply: JavaScriptReplyProxy? = null
    private val documentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

    /** Vrai si une page du drive a annoncé son agent : un message peut lui être envoyé. */
    val ready: Boolean get() = reply != null

    /** À appeler avant le premier chargement de la WebView. */
    fun attach(webView: WebView) {
        if (status != AgentStatus.READY || script == null) return
        WebViewCompat.addWebMessageListener(webView, BridgeMessages.OBJECT_NAME, BridgeMessages.ORIGIN_RULES) { _, message, origin, isMainFrame, proxy ->
            val text = if (message.type == WebMessageCompat.TYPE_STRING) message.data else null
            when (val inbound = BridgeMessages.screen(text, origin.toString(), isMainFrame)) {
                is Inbound.Hello -> reply = proxy
                is Inbound.FromAgent -> {
                    reply = proxy
                    onAgentMessage(inbound)
                }
                is Inbound.Rejected -> Log.w(TAG, "Message de la page ignoré : ${inbound.reason}")
            }
        }
        if (documentStart) WebViewCompat.addDocumentStartJavaScript(webView, script.source, BridgeMessages.ORIGIN_RULES)
    }

    /** Le repli sans `addDocumentStartJavaScript` : évaluer l'agent quand une page du drive a fini de charger. */
    fun onPageFinished(webView: WebView, url: String?) {
        if (script == null || status != AgentStatus.READY || documentStart || !NavigationPolicy.isAllowed(url)) return
        webView.evaluateJavascript(script.source, null)
    }

    /** Envoie un message du protocole à l'agent de la page courante. `false` si aucune page n'a annoncé son agent, ou si le message est trop gros. */
    fun send(text: String): Boolean {
        val proxy = reply ?: return false
        if (!BridgeMessages.fitsBound(text)) return false
        return try {
            proxy.postMessage(text)
            true
        } catch (_: RuntimeException) {
            false
        }
    }

    /** Demande à l'agent d'ouvrir son diagnostic (commande du protocole, jamais un fragment d'adresse). */
    fun openDiagnostic(): Boolean = send(BridgeMessages.COMMAND_DIAGNOSTIC)

    /** Une phrase pour la fenêtre « Version » : version et début de l'empreinte de l'agent, ou ce qui l'empêche d'agir. */
    fun describe(context: Context): String = when (status) {
        AgentStatus.READY -> context.getString(R.string.agent_ready, script?.version, script?.digest?.take(DIGEST_SHOWN))
        AgentStatus.MISSING -> context.getString(R.string.agent_missing)
        AgentStatus.CORRUPT -> context.getString(R.string.agent_corrupt)
        AgentStatus.WEBVIEW_TOO_OLD -> context.getString(R.string.agent_webview_too_old)
    }

    /** Ce qu'il faut dire à l'utilisateur quand un message ne peut pas partir vers l'agent. */
    fun unavailableMessage(): Int = when (status) {
        AgentStatus.READY -> R.string.agent_not_ready
        AgentStatus.MISSING, AgentStatus.CORRUPT -> R.string.agent_broken
        AgentStatus.WEBVIEW_TOO_OLD -> R.string.agent_webview_too_old
    }

    companion object {
        private const val TAG = "RepasDrive"
        private const val DIGEST_SHOWN = 18

        /** Charge et vérifie l'agent embarqué, et décide si la WebView sait le recevoir. */
        fun create(context: Context, onAgentMessage: (Inbound.FromAgent) -> Unit): AgentHost {
            val (status, script) = AgentAsset.load { name -> readAsset(context, name) }
            if (status == AgentStatus.READY && !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                return AgentHost(AgentStatus.WEBVIEW_TOO_OLD, null, onAgentMessage)
            }
            return AgentHost(status, script, onAgentMessage)
        }

        fun readAsset(context: Context, name: String): ByteArray? = try {
            context.assets.open(name).use { it.readBytes() }
        } catch (_: IOException) {
            null
        }
    }
}
