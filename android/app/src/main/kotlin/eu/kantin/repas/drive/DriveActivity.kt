package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JsResult
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
import java.util.UUID

/**
 * L'écran du drive (DRV-312, DRV-313) : le drive Leclerc en plein écran, en mode ordinateur permanent. C'était l'hôte WebView de
 * « Repas Drive » ; c'est maintenant le second écran de l'application, que la coquille Repas ([MainActivity]) ouvre.
 *
 * L'utilisateur se connecte lui-même ; ses cookies restent dans le profil « drive » de la WebView ([DriveProfile]), que l'application ne lit
 * ni ne journalise jamais (ni cookie, ni contenu de page, ni adresse complète). Navigation limitée à `https` et `*.leclercdrive.fr`
 * ([NavigationPolicy]) : tout autre lien s'ouvre dans le navigateur du téléphone. Aucun objet natif n'est exposé aux pages ; l'agent y est
 * injecté par [AgentHost] (DRV-313).
 */
class DriveActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var problems: ProblemPanel
    private lateinit var resultPanel: TextPanel
    private lateinit var agent: AgentHost
    private lateinit var debugRun: DebugRun
    private lateinit var selftestRun: SelftestRun

    /** La fenêtre vide qui reçoit un `window.open` avant que son adresse soit confiée à la WebView principale. */
    private var popup: WebView? = null
    private var loadFailed = false

    private val repasApp get() = application as RepasApp

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        // Le débogage à distance de la WebView n'existe que dans la version de débogage.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        resultPanel = TextPanel(this)
        debugRun = DebugRun(
            template = { AgentHost.readAsset(this, DebugPlan.TEMPLATE_FILE)?.toString(Charsets.UTF_8) },
            send = { agent.send(it) },
            show = { resultPanel.show(it) },
            newRunId = { UUID.randomUUID().toString() },
        )
        selftestRun = SelftestRun(
            send = { agent.openSelftest() },
            show = { resultPanel.show(it, R.string.selftest_title, autoCopy = true) },
        )
        agent = AgentHost.create(repasApp.agentLoad, BuildConfig.DEBUG) { message ->
            // La variante de débogage montre le résultat de l'essai et le rapport du test automatique ; le passage du plan et son retour
            // vers Repas arrivent avec DRV-314.
            if (BuildConfig.DEBUG && !selftestRun.onAgentMessage(message.type, message.text)) {
                debugRun.onAgentMessage(message.type, message.text)
            }
        }
        webView = createWebView()
        problems = ProblemPanel(this, ::problemMessage) { retry() }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(problems, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(
                menuButton { showMenu(menuEntries()) },
                FrameLayout.LayoutParams(dp(48), dp(48), Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(12), dp(24)) },
            )
            addView(resultPanel, FrameLayout.LayoutParams(MATCH, MATCH))
        }
        keepClearOfSystemBars(root)
        setContentView(root)
        registerBackAction()

        webView.loadUrl(NavigationPolicy.START_URL)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        // Les cookies de la WebView sont écrits sur le disque ici, pour qu'ils survivent à la fermeture de l'application.
        DriveProfile.cookieManager().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        popup?.destroy()
        popup = null
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Retour arrière

    /** Retour arrière : ferme l'écran de résultat, puis revient en arrière dans la WebView, puis rend la main à la coquille Repas. */
    private fun goBackOrExit() {
        when {
            resultPanel.isShowing -> resultPanel.hide()
            webView.canGoBack() -> webView.goBack()
            else -> finish()
        }
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
        // Le profil « drive » : avant tout chargement et tout réglage de cookies.
        DriveProfile.attach(view)
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            setGeolocationEnabled(false)
            // `window.open` et les liens `target=_blank` passent par `onCreateWindow` : ils s'ouvrent dans cette WebView.
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
        }
        DesktopMode.apply(this, view.settings)
        // Le canal et l'injection de l'agent (DRV-313) : avant le premier chargement, réservés aux pages *.leclercdrive.fr.
        agent.attach(view)
        DriveProfile.cookieManager().apply {
            setAcceptCookie(true)
            // Leclerc charge des éléments d'autres sites (anti-robot, mesure) qui posent leurs propres cookies.
            setAcceptThirdPartyCookies(view, true)
        }
        view.webViewClient = DriveWebViewClient()
        view.webChromeClient = DriveChromeClient()
        return view
    }

    /** Applique la règle de navigation à une adresse demandée hors de la page (fenêtre `window.open`). */
    private fun route(url: String?) {
        when (NavigationPolicy.decide(url)) {
            Decision.ALLOW -> webView.loadUrl(url!!)
            Decision.OPEN_EXTERNALLY -> openInPhoneBrowser(url!!)
            Decision.BLOCK -> Unit
        }
    }

    private inner class DriveWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Seule la page principale est limitée à Leclerc : les cadres (par exemple le défi anti-robot) restent libres de charger.
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            if (NavigationPolicy.decide(url) == Decision.ALLOW) return false
            route(url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            loadFailed = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!loadFailed) problems.hide()
            agent.onPageFinished(view, url)
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

    private inner class DriveChromeClient : WebChromeClient() {
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            popup?.destroy()
            val holder = WebView(this@DriveActivity)
            holder.settings.allowFileAccess = false
            holder.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                    route(request.url.toString())
                    return true
                }

                override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) {
                    v.stopLoading()
                    route(url)
                }
            }
            popup = holder
            (resultMsg.obj as WebView.WebViewTransport).webView = holder
            resultMsg.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView) {
            if (window === popup) popup = null
            window.destroy()
        }

        override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean =
            askJs(message, result, withCancel = false)

        override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean =
            askJs(message, result, withCancel = true)

        // Rien de ce que dit la page n'est écrit dans le journal du téléphone.
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean = true
    }

    private fun askJs(message: String?, result: JsResult, withCancel: Boolean): Boolean {
        if (isFinishing) {
            result.cancel()
            return true
        }
        AlertDialog.Builder(this)
            .setMessage(message)
            .setPositiveButton(R.string.ok) { _, _ -> result.confirm() }
            .apply { if (withCancel) setNegativeButton(R.string.cancel) { _, _ -> result.cancel() } }
            .setOnCancelListener { result.cancel() }
            .show()
        return true
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Les erreurs de chargement

    private fun problemMessage(problem: LoadProblem): Int = when (problem) {
        LoadProblem.OFFLINE -> R.string.problem_offline
        LoadProblem.UNAVAILABLE -> R.string.problem_unavailable
        LoadProblem.CERTIFICATE -> R.string.problem_certificate
        LoadProblem.OTHER -> R.string.problem_other
    }

    private fun showProblem(problem: LoadProblem) {
        loadFailed = true
        problems.show(problem)
    }

    private fun retry() {
        problems.hide()
        if (webView.url == null) webView.loadUrl(NavigationPolicy.START_URL) else webView.reload()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le menu

    private fun menuEntries(): List<Pair<Int, () -> Unit>> = buildList {
        if (BuildConfig.DEBUG) add(R.string.menu_selftest to ::startSelftest)
        add(R.string.menu_about to { showAbout(repasApp.agentLoad.describe(this@DriveActivity)) })
        add(R.string.menu_logout_drive to { confirmClearDriveData(::clearDriveData) })
        add(R.string.menu_browser to ::openCurrentPageInBrowser)
        add(R.string.menu_diagnostic to ::openAgentDiagnostic)
        if (BuildConfig.DEBUG) add(R.string.menu_debug_plan to ::startDebugPlan)
    }

    /** Se déconnecter de Leclerc : cookies, stockage du site, cache et historique du drive, puis retour à l'accueil du drive. */
    private fun clearDriveData() {
        DriveProfile.clear(webView)
        problems.hide()
        webView.loadUrl(NavigationPolicy.START_URL)
    }

    /** La page courante dans le navigateur du téléphone (l'accueil du drive si la page n'est pas une page du drive). */
    private fun openCurrentPageInBrowser() {
        openInPhoneBrowser(webView.url?.takeIf { NavigationPolicy.isAllowed(it) } ?: NavigationPolicy.START_URL)
    }

    /** Le diagnostic de l'agent : une commande sur le pont, jamais un fragment d'adresse (un fragment trop long fait échouer le site). */
    private fun openAgentDiagnostic() {
        if (!agent.openDiagnostic()) toast(agent.unavailableMessage())
    }

    /**
     * Variante de débogage seulement (DRV-318) : le test automatique en un geste. L'agent enchaîne diagnostic, lecture du magasin, douze
     * recherches et un essai de trois produits au panier (retirés ensuite), puis rend un seul rapport, copié et proposé au partage.
     */
    private fun startSelftest() {
        if (NavigationPolicy.httpsHostOf(webView.url) == null) return toast(R.string.selftest_no_store)
        if (!selftestRun.start()) return toast(agent.unavailableMessage())
        toast(R.string.selftest_started)
    }

    /** Variante de débogage seulement : l'agent lit le magasin de la page, puis reçoit un plan synthétique de quatre ingrédients. */
    private fun startDebugPlan() {
        if (!debugRun.start(NavigationPolicy.httpsHostOf(webView.url))) toast(agent.unavailableMessage())
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
