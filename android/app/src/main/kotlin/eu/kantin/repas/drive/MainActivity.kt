package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * La coquille de l'application Repas (DRV-317) : le front Repas en plein écran dans une WebView, sur l'origine écrite à la construction
 * (`BuildConfig.REPAS_ORIGIN`). Le drive est un second écran ([DriveActivity]).
 *
 * - **Navigation** : seule l'origine de Repas reste dans la WebView ([ShellNavigation]) ; tout autre lien s'ouvre dans le navigateur du
 *   téléphone, sauf un lien du drive (`*.leclercdrive.fr`, « Finaliser sur Leclerc »), ouvert dans l'écran du drive de l'application ([DriveEntry]). Les liens `https://kantin.eu/…` reçus d'une autre application (courriel de confirmation)
 *   arrivent ici.
 * - **Données** : cookies (dont celui de rafraîchissement du jeton, `HttpOnly`), stockage du site et service worker restent dans le profil
 *   par défaut de la WebView. Le drive a le sien ([DriveProfile]) : la WebView de Repas ne reçoit ni l'agent Leclerc ni les cookies de Leclerc.
 * - **Pont natif** : `window.repasNative`, réservé à l'origine de Repas ([NativeBridge]). Aucun `addJavascriptInterface`.
 * - **Passage du plan (DRV-314)** : `drive.start` ouvre [DriveActivity] sur le magasin du plan ; le résultat revient ici, d'où `drive.result`
 *   est posté à la page (mis en file, et gardé par [DrivePass], si la page s'est rechargée entre-temps). Un passage interrompu (application
 *   fermée ou tuée, moins de 24 h) se reprend ou s'abandonne à la réouverture.
 * - **Connexion avec Google (AUTH-011)** : `google.signIn` fait obtenir un jeton d'identité par la plateforme ([IdentityProviders], par-dessus la
 *   coquille), jamais par une page de Google dans la WebView ; [SignInRelay] en tient une seule à la fois et rend `google.result` ou
 *   `google.error` à la page qui l'a demandée. Le jeton n'est ni gardé ni mis en file, et rien de la demande n'est écrit au journal.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var problems: ProblemPanel
    private val repasOrigin: String = RepasOrigin.parse(BuildConfig.REPAS_ORIGIN) ?: error("REPAS_ORIGIN invalide.")
    private val navigation = ShellNavigation(repasOrigin)

    /** Les liens qui sortent de la coquille s'ouvrent dans le navigateur du téléphone (le service de plateforme du cœur, `LinkOpener`). */
    private val linkOpener: LinkOpener = AndroidLinkOpener(this)

    /**
     * Le canal de réponse vers la page de Repas : celui de son dernier message. Il n'est pas effacé au début d'une page : l'ordre entre
     * `onPageStarted` et le premier message de la page n'est pas garanti (il arrive avant, on l'a mesuré), et effacer le canal d'une page qui
     * ne reparlera pas lui ferait manquer ses résultats. Les chargements que l'application déclenche elle-même l'effacent ([load]).
     */
    private var reply: JavaScriptReplyProxy? = null

    /** Les débuts de page vus depuis le dernier message : tant qu'il y en a, le canal est peut-être celui d'une page disparue. */
    private var startsSinceMessage = 0
    private var loadFailed = false
    private var resumeDialog: AlertDialog? = null

    /** La connexion avec Google (AUTH-011) : créée à la première demande de la page, abandonnée quand l'écran se ferme. */
    private val signInRelay = lazy { SignInRelay(IdentityProviders.create(this)) }

    private val repasApp get() = application as RepasApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Le débogage à distance de la WebView n'existe que dans la version de débogage.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        webView = createWebView()
        problems = ProblemPanel(this, ::problemMessage) { retry() }
        val root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.background))
            addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(problems, FrameLayout.LayoutParams(MATCH, MATCH))
            // Le menu de l'application s'ouvre par `app.menu` depuis le front ; la variante de débogage a en plus ce bouton.
            if (BuildConfig.DEBUG) {
                addView(
                    menuButton { openMenu() }.apply { alpha = 0.7f },
                    FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER_VERTICAL or Gravity.END).apply { setMargins(0, 0, dp(4), 0) },
                )
            }
        }
        keepClearOfSystemBars(root)
        setContentView(root)
        registerBackAction()

        webView.loadUrl(navigation.entryUrl(intent?.dataString) ?: "$repasOrigin/")
    }

    /** Un lien `https://kantin.eu/…` ouvert depuis une autre application pendant que celle-ci tourne. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        navigation.entryUrl(intent.dataString)?.let(::load)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        // Un résultat arrivé pendant que l'écran du drive était devant, ou un passage interrompu par la fermeture de l'application.
        flushOutbox()
        askResumeIfInterrupted()
    }

    override fun onPause() {
        // Les cookies de la WebView sont écrits sur le disque ici, pour que la session survive à la fermeture de l'application.
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        // Une feuille de choix du compte encore ouverte : la demande est abandonnée, sa réponse n'arrivera pas à une page disparue.
        if (signInRelay.isInitialized()) signInRelay.value.cancel()
        resumeDialog?.dismiss()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Retour arrière

    /** Retour arrière dans le front, puis sortie de l'application. */
    private fun goBackOrExit() {
        if (webView.canGoBack()) webView.goBack() else finish()
    }

    /** `targetSdk` 36 : le geste « retour » passe par un rappel (la méthode `onBackPressed` n'est plus appelée depuis Android 13). */
    private fun registerBackAction() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBackOrExit() }
        }
    }

    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onBackPressed() {
        goBackOrExit()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // La WebView

    private fun createWebView(): WebView {
        val view = WebView(this)
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            setGeolocationEnabled(false)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            // Le front n'appelle que son propre site : aucun cookie d'un autre.
            setAcceptThirdPartyCookies(view, false)
        }
        // Le pont natif, avant le premier chargement, réservé à l'origine de Repas. Sans la fonction (WebView très ancienne), la page ne le voit pas.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, NativeBridge.OBJECT_NAME, setOf(repasOrigin)) { _, message, origin, isMainFrame, proxy ->
                val text = if (message.type == WebMessageCompat.TYPE_STRING) message.data else null
                onNativeMessage(text, origin.toString(), isMainFrame, proxy)
            }
        }
        view.webViewClient = ShellWebViewClient()
        view.webChromeClient = ShellChromeClient()
        return view
    }

    private inner class ShellWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Seule la page principale est limitée à Repas : les cadres restent libres de charger.
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            // Un lien du drive (« Finaliser sur Leclerc ») s'ouvre dans l'application, connecté, pas dans le navigateur du téléphone (DRV-625).
            DriveEntry.resolve(url, repasApp.storePath)?.let {
                openDrive(it.page, it.outcome)
                return true
            }
            return when (navigation.decide(url)) {
                Decision.ALLOW -> false
                Decision.OPEN_EXTERNALLY -> {
                    linkOpener.open(url)
                    true
                }
                Decision.BLOCK -> true
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            loadFailed = false
            startsSinceMessage++
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!loadFailed) problems.hide()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // Une navigation annulée (redirection, lien confié au navigateur) n'est pas une panne.
            if (!request.isForMainFrame || error.description?.contains("ERR_ABORTED") == true) return
            showProblem(LoadProblems.fromWebViewError(error.errorCode))
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
            if (!request.isForMainFrame) return
            LoadProblems.fromHttpStatus(errorResponse.statusCode)?.let(::showProblem)
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            // Un certificat refusé n'est jamais accepté.
            handler.cancel()
            if (view.url == null || error.url == view.url) showProblem(LoadProblem.CERTIFICATE)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            toast(R.string.render_process_gone)
            recreate()
            return true
        }
    }

    /** Aucune permission d'Android n'est demandée (ni fichiers, ni position, ni caméra) : le front n'envoie ni fichier ni photo. */
    private inner class ShellChromeClient : WebChromeClient() {
        // Rien de ce que dit la page n'est écrit dans le journal du téléphone.
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean = true
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le pont natif

    private fun onNativeMessage(text: String?, origin: String, isMainFrame: Boolean, proxy: JavaScriptReplyProxy) {
        val request = NativeBridge.screen(text, origin, isMainFrame, repasOrigin)
        if (request is NativeRequest.Ignored) {
            Log.w(TAG, "Message de la page ignoré : ${request.reason}")
            return
        }
        // Le message vient bien de la page de Repas : son canal de réponse est celui de la page courante, sûrement vivante.
        reply = proxy
        startsSinceMessage = 0
        when (request) {
            is NativeRequest.Ignored -> Unit
            is NativeRequest.Refused -> {
                Log.w(TAG, "Message de la page refusé : ${request.reason}")
                post(request.reply)
            }
            NativeRequest.AppInfo -> {
                val version = installedVersion()
                post(NativeBridge.appInfo(version.name, version.code, repasApp.agentLoad.status == AgentStatus.READY, google = true))
            }
            NativeRequest.AppMenu -> openMenu()
            is NativeRequest.DriveStart -> startPass(request.plan)
            is NativeRequest.DriveSetup -> startPass(request.setup)
            is NativeRequest.DriveCancel -> cancelPass(request.runId)
            // La réponse va à la page qui a demandé, par son propre canal : si elle a disparu entre-temps, le jeton est perdu, jamais gardé.
            is NativeRequest.GoogleSignIn -> signInRelay.value.request(request) { answer -> postTo(proxy, answer) }
        }
        // Après la réponse : la page a un écouteur (elle vient de nous écrire), un résultat en attente peut lui être livré.
        flushOutbox(pageIsAlive = true)
    }

    /**
     * `drive.start` et `drive.setup` : un seul passage à la fois ; sinon l'écran du drive s'ouvre, sur le magasin du plan ou sur l'accueil du
     * drive pour la lecture du magasin (le même passage renvoyé le rouvre).
     */
    private fun startPass(request: PassRequest) {
        if (repasApp.agentLoad.status != AgentStatus.READY) return post(NativeBridge.driveError(NativeBridge.UNAVAILABLE, request.runId))
        when (val outcome = repasApp.pass.start(request, PassSource.REPAS)) {
            is StartOutcome.Busy -> post(NativeBridge.driveError(NativeBridge.BUSY, outcome.runId))
            StartOutcome.Started, StartOutcome.Resumed -> openDrive()
        }
    }

    /** `drive.cancel` : le passage prend fin par un résultat `aborted` (livré par `drive.result`) . */
    private fun cancelPass(runId: String?) {
        if (repasApp.pass.abort(runId) == null) return post(NativeBridge.driveError(NativeBridge.NO_PASS, runId))
        resumeDialog?.dismiss()
    }

    /** Ouvre l'écran du drive ; sans passage en cours il s'ouvre sur [startUrl] (DRV-625 : la page de « Finaliser sur Leclerc », DRV-631 : sa forme), sinon sur l'accueil du drive. */
    private fun openDrive(startUrl: String? = null, finalize: FinalizeOutcome? = null) =
        startActivity(
            Intent(this, DriveActivity::class.java).apply {
                startUrl?.let { putExtra(DriveActivity.EXTRA_START_URL, it) }
                finalize?.let { putExtra(DriveActivity.EXTRA_FINALIZE, it.name) }
            },
        )

    /**
     * Livre à la page de Repas les `drive.result` en attente, si elle a un canal de réponse (sinon ils restent gardés pour la prochaine
     * fois). [pageIsAlive] : on vient de recevoir un message de la page, son canal est vivant et ce qu'on y poste arrive ; sinon (retour du
     * drive, abandon) le canal est celui du dernier message, et si une page a commencé depuis, le résultat est posté **et gardé** jusqu'au
     * prochain message de la page : mieux vaut un doublon, que le front ignore (résultat périmé), qu'un résultat perdu.
     */
    private fun flushOutbox(pageIsAlive: Boolean = false) {
        if (reply == null) return
        val pending = repasApp.pass.pendingMessages()
        if (pending.isEmpty()) return
        pending.forEach(::post)
        if (pageIsAlive || startsSinceMessage == 0) repasApp.pass.delivered(pending.size)
    }

    /** Charge une adresse de Repas à l'initiative de l'application : la page actuelle disparaît, son canal de réponse aussi. */
    private fun load(url: String) {
        reply = null
        webView.loadUrl(url)
    }

    /** L'application a été fermée ou tuée pendant un passage de moins de 24 h : on propose de le reprendre ou de l'abandonner. */
    private fun askResumeIfInterrupted() {
        val interrupted = repasApp.pass.current() ?: return
        // La coquille au premier plan avec un passage en cours : l'écran du drive n'est pas devant, donc le passage a été interrompu.
        if (interrupted.source != PassSource.REPAS || resumeDialog?.isShowing == true) return
        val setup = interrupted.request.isSetup
        resumeDialog = AlertDialog.Builder(this)
            .setTitle(if (setup) R.string.resume_setup_title else R.string.resume_title)
            .setMessage(if (setup) R.string.resume_setup_message else R.string.resume_message)
            .setCancelable(false)
            .setPositiveButton(R.string.resume_confirm) { _, _ -> openDrive() }
            .setNegativeButton(R.string.resume_abandon) { _, _ ->
                repasApp.pass.abort()
                flushOutbox()
            }
            .show()
    }

    private fun post(text: String) {
        reply?.let { postTo(it, text) }
    }

    private fun postTo(channel: JavaScriptReplyProxy, text: String) {
        try {
            channel.postMessage(text)
        } catch (_: RuntimeException) {
            // La page a disparu entre-temps : rien à faire.
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Les erreurs de chargement

    private fun problemMessage(problem: LoadProblem): Int = when (problem) {
        LoadProblem.OFFLINE -> R.string.problem_repas_offline
        LoadProblem.UNAVAILABLE -> R.string.problem_repas_unavailable
        LoadProblem.CERTIFICATE -> R.string.problem_repas_certificate
        LoadProblem.OTHER -> R.string.problem_repas_other
    }

    private fun showProblem(problem: LoadProblem) {
        loadFailed = true
        problems.show(problem)
    }

    private fun retry() {
        problems.hide()
        if (webView.url == null) {
            load("$repasOrigin/")
        } else {
            reply = null
            webView.reload()
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le menu

    private fun openMenu() = showMenu(
        listOf(
            R.string.menu_drive_settings to { load("$repasOrigin$DRIVE_SETTINGS_PATH") },
            R.string.menu_open_drive to { openDrive() },
            R.string.menu_about to { showAbout(repasApp.agentLoad.describe(this), repasApp.finalizeOutcome.last()) },
            R.string.menu_logout_drive to { confirmClearDriveData(::clearDriveData) },
        ),
    )

    /** Se déconnecter de Leclerc : le profil du drive est vidé. Sans profils, Repas aussi l'est, et la page se recharge. */
    private fun clearDriveData() {
        val shared = !DriveProfile.isolated
        DriveProfile.clear(if (shared) webView else null)
        repasApp.storePath.forget()
        if (shared) load("$repasOrigin/")
        toast(R.string.drive_data_cleared)
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    private companion object {
        const val TAG = "RepasDrive"

        /** La page des réglages du drive du front (DRV-403). */
        const val DRIVE_SETTINGS_PATH = "/drive/reglages"
    }
}
