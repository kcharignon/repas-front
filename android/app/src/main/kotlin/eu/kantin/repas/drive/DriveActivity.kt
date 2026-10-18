package eu.kantin.repas.drive

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.View
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
import android.widget.LinearLayout
import android.widget.TextView
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
 *
 * **Passage du plan (DRV-314).** Quand un passage est en cours ([DrivePass]), l'écran s'ouvre sur l'accueil du magasin du plan, envoie le plan
 * à l'agent une fois la page chargée et annoncée, reste allumé tant que le passage dure, et rend la main à la coquille avec le résultat de
 * l'agent (ou un résultat `aborted` si l'utilisateur abandonne). Sans passage, c'est le drive à parcourir à la main.
 *
 * **Lecture du magasin (DRV-320).** Pour `drive.setup`, l'écran s'ouvre sur l'accueil du drive avec un message en français simple (se connecter,
 * choisir son magasin). Le message `setup` n'est envoyé à l'agent que lorsque la page est celle d'un magasin ([NavigationPolicy.isStorePage]) :
 * l'agent lit alors le magasin, demande confirmation, et son `setup-result` est livré à Repas comme un résultat de passage.
 */
class DriveActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var problems: ProblemPanel
    private lateinit var resultPanel: TextPanel
    private lateinit var setupBanner: TextView
    private lateinit var agent: AgentHost
    private lateinit var debugRun: DebugRun
    private lateinit var selftestRun: SelftestRun
    private val delivery = PlanDelivery()
    private var abandonDialog: AlertDialog? = null

    /** La fenêtre vide qui reçoit un `window.open` avant que son adresse soit confiée à la WebView principale. */
    private var popup: WebView? = null
    private var loadFailed = false

    private val repasApp get() = application as RepasApp
    private val pass get() = repasApp.pass

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
            startPass = ::startDebugPass,
            show = { resultPanel.show(it) },
            newRunId = { UUID.randomUUID().toString() },
        )
        selftestRun = SelftestRun(
            send = { agent.openSelftest() },
            show = { resultPanel.show(it, R.string.selftest_title, autoCopy = true) },
        )
        agent = AgentHost.create(repasApp.agentLoad, BuildConfig.DEBUG, onHello = { if (delivery.hello()) sendPlan() }) { message ->
            if ((message.type == "result" || message.type == "setup-result") && onAgentResult(message.text)) return@create
            // La variante de débogage montre le résultat de l'essai et le rapport du test automatique.
            if (BuildConfig.DEBUG && !selftestRun.onAgentMessage(message.type, message.text)) {
                debugRun.onAgentMessage(message.type, message.text)
            }
        }
        webView = createWebView()
        problems = ProblemPanel(this, ::problemMessage) { retry() }
        setupBanner = label(getString(R.string.setup_banner), sizeSp = 16f, color = Color.WHITE).apply {
            setBackgroundColor(BASIL)
            setPadding(dp(16), dp(12), dp(16), dp(12))
            visibility = View.GONE
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(setupBanner, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(webView, LinearLayout.LayoutParams(MATCH, 0, 1f))
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            addView(page, FrameLayout.LayoutParams(MATCH, MATCH))
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

        webView.loadUrl(pass.current()?.request?.startUrl ?: NavigationPolicy.START_URL)
        updateSetupBanner(null)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        updateKeepScreenOn()
    }

    override fun onPause() {
        // L'écran ne reste allumé que pendant un passage, et seulement quand l'écran du drive est au premier plan.
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Les cookies de la WebView sont écrits sur le disque ici, pour qu'ils survivent à la fermeture de l'application.
        DriveProfile.cookieManager().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        abandonDialog?.dismiss()
        popup?.destroy()
        popup = null
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Retour arrière

    /**
     * Retour arrière : ferme l'écran de résultat, puis revient en arrière dans la WebView ; au bout de l'historique, pendant un passage il
     * demande s'il faut abandonner l'envoi, sinon il rend la main à la coquille Repas.
     */
    private fun goBackOrExit() {
        when {
            resultPanel.isShowing -> resultPanel.hide()
            webView.canGoBack() -> webView.goBack()
            pass.current() != null -> askAbandon()
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
            delivery.pageStarted()
            updateSetupBanner(url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!loadFailed) problems.hide()
            agent.onPageFinished(view, url)
            updateSetupBanner(url)
            if (delivery.pageFinished()) sendPlan()
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
        if (webView.url == null) webView.loadUrl(pass.current()?.request?.startUrl ?: NavigationPolicy.START_URL) else webView.reload()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le passage du plan (DRV-314)

    /**
     * Le message du passage en cours part vers l'agent (le plan, ou `setup` pour la lecture du magasin) : la page a annoncé son agent et fini de
     * charger (une fois par page). La lecture du magasin attend une page de magasin : sur l'accueil ou la connexion, l'agent n'aurait rien à lire.
     */
    private fun sendPlan() {
        val request = pass.current()?.request ?: return
        if (request.isSetup && !NavigationPolicy.isStorePage(webView.url)) return delivery.failed()
        if (!agent.send(request.text)) delivery.failed()
    }

    /** Le message « connecte-toi, choisis ton magasin » reste affiché pendant une lecture du magasin, tant que la page n'est pas celle d'un magasin. */
    private fun updateSetupBanner(url: String?) {
        val waiting = pass.current()?.request?.isSetup == true && !NavigationPolicy.isStorePage(url)
        setupBanner.visibility = if (waiting) View.VISIBLE else View.GONE
    }

    /** Le résultat de l'agent. Vrai si c'est celui du passage en cours : il est clos, et l'écran se referme ou montre l'essai. */
    private fun onAgentResult(text: String): Boolean {
        val ended = pass.finish(text) ?: return false
        endOfPass(ended, text)
        return true
    }

    /** Le passage de débogage (menu « Plan d'essai ») passe par le même chemin qu'un plan de Repas ; `false` si un autre passage est en cours. */
    private fun startDebugPass(planText: String): Boolean {
        val plan = DrivePlan.parseText(planText) ?: return false
        if (pass.start(plan, PassSource.DEBUG) is StartOutcome.Busy) return false
        updateKeepScreenOn()
        return agent.send(plan.text)
    }

    private fun askAbandon() {
        if (abandonDialog?.isShowing == true) return
        val setup = pass.current()?.request?.isSetup == true
        abandonDialog = AlertDialog.Builder(this)
            .setTitle(if (setup) R.string.abandon_setup_title else R.string.abandon_title)
            .setMessage(if (setup) R.string.abandon_setup_message else R.string.abandon_message)
            .setPositiveButton(R.string.abandon_confirm) { _, _ -> abandonPass() }
            .setNegativeButton(R.string.abandon_continue, null)
            .show()
    }

    /** L'utilisateur abandonne : le passage prend fin par un résultat `aborted` (pour Repas), et l'écran se referme. */
    private fun abandonPass() {
        val ended = pass.abort() ?: return finish()
        endOfPass(ended, null)
    }

    /** Un passage de Repas rend la main à la coquille, qui livre le résultat ; un passage de débogage montre le résultat de l'agent. */
    private fun endOfPass(ended: ActivePass, resultText: String?) {
        updateKeepScreenOn()
        if (ended.source == PassSource.DEBUG) {
            if (resultText != null) debugRun.onAgentMessage("result", resultText) else finish()
            return
        }
        // La coquille est dessous : elle revient au premier plan (et la crée si le système l'avait fermée), et livre le résultat à Repas.
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }

    /** L'écran reste allumé tant qu'un passage dure (l'agent demande aussi un verrou d'écran à la page), jamais au-delà. */
    private fun updateKeepScreenOn() {
        if (pass.current() != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le menu

    private fun menuEntries(): List<Pair<Int, () -> Unit>> = buildList {
        if (BuildConfig.DEBUG) add(R.string.menu_selftest to ::startSelftest)
        pass.current()?.let { add((if (it.request.isSetup) R.string.menu_abandon_setup else R.string.menu_abandon) to ::askAbandon) }
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
        if (pass.current() != null) return toast(R.string.pass_busy)
        if (!debugRun.start()) toast(agent.unavailableMessage())
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
