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
import android.os.Handler
import android.os.Looper
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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import java.util.UUID

/** Un cran de zoom de la page de Leclerc (menu « Agrandir la page » et « Réduire la page »). */
private const val PAGE_ZOOM_STEP = 1.5f

/**
 * L'écran du drive (DRV-312, DRV-313) : le drive Leclerc en plein écran, en mode ordinateur permanent. C'était l'hôte WebView de
 * « Repas Drive » ; c'est maintenant le second écran de l'application, que la coquille Repas ([MainActivity]) ouvre.
 *
 * L'utilisateur se connecte lui-même ; ses cookies restent dans le profil « drive » de la WebView ([DriveProfile]), que l'application ne lit
 * ni ne journalise jamais (ni cookie, ni contenu de page, ni adresse complète). Navigation limitée à `https` et `*.leclercdrive.fr`
 * ([NavigationPolicy]) : tout autre lien s'ouvre dans le navigateur du téléphone. Aucun objet natif n'est exposé aux pages ; l'agent y est
 * injecté par [AgentHost] (DRV-313).
 *
 * **Passage du plan (DRV-314).** Quand un passage est en cours ([DrivePass]), l'écran s'ouvre sur l'accueil de l'enseigne ([DrivePlan.startUrl],
 * `https://www.leclercdrive.fr/`, qui affiche l'accueil du magasin de l'utilisateur : la racine de l'hôte du magasin et `/magasin-<id>-<id>/` sont des
 * pages 404 du vrai site), où l'utilisateur touche lui-même « Commencer mes courses » ; il envoie
 * le plan à l'agent une fois la page chargée, annoncée **et** celle d'un magasin (en attendant, un message dit d'ouvrir son magasin, ou si le site
 * refuse la page, tarde ou n'a pas d'agent, de recommencer : [StoreBanner], [OpeningWatch], ticket E), reste allumé tant que le passage dure, et
 * rend la main à la coquille avec le résultat de l'agent (ou un résultat `aborted` si l'utilisateur abandonne). Sans passage, c'est le drive à
 * parcourir à la main.
 *
 * **Lecture du magasin (DRV-320).** Pour `drive.setup`, l'écran s'ouvre sur l'accueil du drive avec un message en français simple (se connecter,
 * choisir son magasin). Le message `setup` n'est envoyé à l'agent que lorsque la page est celle d'un magasin ([NavigationPolicy.isStorePage]) :
 * l'agent lit alors le magasin, demande confirmation, et son `setup-result` est livré à Repas comme un résultat de passage.
 */
class DriveActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var problems: ProblemPanel
    private lateinit var resultPanel: TextPanel
    private lateinit var bannerBox: LinearLayout
    private lateinit var storeBanner: TextView
    private lateinit var bannerAction: Button
    private lateinit var agent: AgentHost
    private lateinit var debugRun: DebugRun
    private lateinit var selftestRun: SelftestRun
    private val delivery = PlanDelivery()

    /** Ce qui cloche avec la page où l'envoi attend la page du magasin (ticket E) : le site la refuse, la détourne, tarde, ou son agent manque. */
    private val watch = OpeningWatch()
    private val timers = Handler(Looper.getMainLooper())
    private val onLoadTimeout = Runnable {
        watch.loadTimedOut()
        updateStoreBanner(webView.url)
    }
    private val onAgentTimeout = Runnable {
        watch.agentTimedOut()
        updateStoreBanner(webView.url)
    }
    private var abandonDialog: AlertDialog? = null

    /** La fenêtre vide qui reçoit un `window.open` avant que son adresse soit confiée à la WebView principale. */
    private var popup: WebView? = null
    private var loadFailed = false

    /**
     * La page du panier ouverte par « Finaliser sur Leclerc » (DRV-629), tant que le site n'a pas répondu : si il la refuse (404, erreur), l'écran se
     * replie sur l'accueil du drive ([DriveEntry.fallsBack]). `null` sinon.
     */
    private var basketTarget: String? = null

    /** Le repli sur l'accueil vient d'avoir lieu : une fois l'accueil chargé, la page du panier refusée sort de l'historique (le retour ne la montre pas). */
    private var clearHistoryWhenLoaded = false

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
        basketTarget = firstUrl().takeIf { pass.current() == null && DriveEntry.isBasketPage(it) }
        problems = ProblemPanel(this, ::problemMessage) { retry() }
        // Le message d'en-tête (se connecter, choisir ou ouvrir son magasin) et, pour un plan, son issue : ouvrir l'accueil du drive.
        storeBanner = label("", sizeSp = 16f, color = Color.WHITE)
        bannerAction = roundedButton(getString(R.string.plan_banner_action), filled = false) { openHome() }.apply {
            visibility = View.GONE
            // Le texte du bouton est long : de la marge de chaque côté, pour qu'il ne soit jamais rogné.
            setPadding(dp(24), paddingTop, dp(24), paddingBottom)
        }
        bannerBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BASIL)
            setPadding(dp(16), dp(12), dp(16), dp(12))
            visibility = View.GONE
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            addView(storeBanner, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(bannerAction, LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(8) })
        }
        // Le panneau d'incident ne recouvre que la page : le message d'en-tête reste visible au-dessus (et son bouton touchable).
        val content = FrameLayout(this).apply {
            addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(problems, FrameLayout.LayoutParams(MATCH, MATCH))
        }
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bannerBox, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(content, LinearLayout.LayoutParams(MATCH, 0, 1f))
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            addView(page, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(
                menuButton { showMenu(menuEntries()) },
                FrameLayout.LayoutParams(dp(48), dp(48), Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(12), dp(24)) },
            )
            addView(resultPanel, FrameLayout.LayoutParams(MATCH, MATCH))
        }
        keepClearOfSystemBars(root)
        setContentView(root)
        registerBackAction()

        navigationBegins()
        webView.loadUrl(firstUrl())
        updateStoreBanner(pass.current()?.request?.startUrl)
    }

    /**
     * La première page : celle du passage en cours ; sinon, pour un lien du drive ouvert depuis Repas (« Finaliser sur Leclerc », DRV-625), la page
     * demandée, revérifiée ([DriveEntry.startPage]) ; sinon l'accueil du drive.
     */
    private fun firstUrl(): String =
        pass.current()?.request?.startUrl
            ?: DriveEntry.startPage(intent?.getStringExtra(EXTRA_START_URL))

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
        timers.removeCallbacksAndMessages(null)
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
     * Retour arrière : ferme l'écran de résultat, puis (pendant un passage dont le plan est parti vers l'agent de la page) demande s'il faut
     * abandonner l'envoi, sinon revient en arrière dans la WebView ; au bout de l'historique, pendant un passage il demande s'il faut abandonner
     * l'envoi, sinon il rend la main à la coquille Repas.
     */
    private fun goBackOrExit() {
        when {
            resultPanel.isShowing -> resultPanel.hide()
            // L'agent travaille sur cette page : revenir à l'accueil le tuerait en plein passage, on demande d'abandonner l'envoi.
            pass.current() != null && watch.hasDeliveredPlan() -> askAbandon()
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
            if (NavigationPolicy.decide(url) == Decision.ALLOW) {
                // Une nouvelle page (lien touché, redirection) : ce qu'on savait de la précédente est oublié, avant même sa réponse.
                navigationBegins()
                return false
            }
            route(url)
            return true
        }

        override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
            val anchor = zoomAnchor ?: return
            zoomAnchor = null
            if (oldScale > 0f) view.scrollTo((anchor[0] * newScale / oldScale).toInt(), (anchor[1] * newScale / oldScale).toInt())
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            loadFailed = false
            delivery.pageStarted()
            watch.pageStarted()
            timers.removeCallbacks(onAgentTimeout)
            armLoadTimer()
            updateStoreBanner(url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!loadFailed) problems.hide()
            watch.pageFinished()
            if (clearHistoryWhenLoaded && url == NavigationPolicy.START_URL) {
                clearHistoryWhenLoaded = false
                view.clearHistory()
            }
            // Une page de magasin avec sa ville, que le site n'a pas refusée : « Finaliser sur Leclerc » en bâtira la page du panier (DRV-629).
            if (!loadFailed && !watch.refused()) {
                repasApp.storePath.remember(url)
                if (url == basketTarget) basketTarget = null
            }
            timers.removeCallbacks(onLoadTimeout)
            agent.onPageFinished(view, url)
            updateStoreBanner(url)
            if (delivery.pageFinished()) sendPlan()
            armAgentTimer(url)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // Une navigation annulée (redirection, lien confié au navigateur) n'est pas une panne.
            if (!request.isForMainFrame || error.description?.contains("ERR_ABORTED") == true) return
            watch.loadFailed()
            showProblem(LoadProblems.fromWebViewError(error.errorCode))
            updateStoreBanner(view.url)
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
            if (!request.isForMainFrame) return
            // La page du panier refusée par le site : l'accueil du drive, où le panier est à une touche (DRV-629).
            if (DriveEntry.fallsBack(basketTarget, request.url.toString(), errorResponse.statusCode)) {
                basketTarget = null
                clearHistoryWhenLoaded = true
                problems.hide()
                navigationBegins()
                webView.loadUrl(NavigationPolicy.START_URL)
                return
            }
            // Le statut de la page principale (404, 5xx…) : une page d'erreur du site n'est jamais celle du magasin, et ne reçoit pas le plan.
            watch.httpError(errorResponse.statusCode)
            LoadProblems.fromHttpStatus(errorResponse.statusCode)?.let(::showProblem)
            updateStoreBanner(view.url)
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
        navigationBegins()
        if (webView.url == null) webView.loadUrl(firstUrl()) else webView.reload()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le passage du plan (DRV-314)

    /**
     * Le message du passage en cours part vers l'agent (le plan, ou `setup` pour la lecture du magasin) : la page a annoncé son agent et fini de
     * charger (une fois par page). Il attend une page de magasin : sur l'accueil du magasin, de l'enseigne ou la connexion, l'agent n'aurait rien à
     * faire (le message d'en-tête dit à l'utilisateur d'ouvrir son magasin) ; et jamais vers une page que le site a refusée ([OpeningWatch.canDeliver]).
     */
    private fun sendPlan() {
        val request = pass.current()?.request ?: return
        // Pas de message vers une page que le site a refusée ou détournée (ticket E) : le bandeau dit quoi faire à l'utilisateur.
        if (!watch.canDeliver(webView.url, entersStore = !request.isSetup)) return delivery.failed()
        if (agent.send(request.text)) {
            watch.planSent()
            updateStoreBanner(webView.url)
        } else {
            delivery.failed()
        }
    }

    /** Une page principale va être demandée : la surveillance repart de zéro et son délai de chargement est armé. */
    private fun navigationBegins() {
        watch.restart()
        timers.removeCallbacks(onAgentTimeout)
        armLoadTimer()
    }

    /** Le délai de chargement d'un plan (ticket E) : au-delà, la page est trop lente et le bandeau le dit. Pas pour la lecture du magasin. */
    private fun armLoadTimer() {
        timers.removeCallbacks(onLoadTimeout)
        if (pass.current()?.request?.isSetup == false) timers.postDelayed(onLoadTimeout, OpeningWatch.LOAD_TIMEOUT_MS)
    }

    /** Une page de magasin a fini de charger : si son agent ne s'est pas annoncé (et n'a pas reçu le plan) dans le délai, le bandeau le dit. */
    private fun armAgentTimer(url: String?) {
        timers.removeCallbacks(onAgentTimeout)
        if (pass.current()?.request?.isSetup == false && watch.canDeliver(url, entersStore = true)) timers.postDelayed(onAgentTimeout, OpeningWatch.AGENT_TIMEOUT_MS)
    }

    /**
     * Le message d'en-tête pendant un passage (ticket E) : tant que la page n'est pas celle d'un magasin (ou que le site l'a refusée, détournée,
     * qu'il tarde ou que l'agent manque), il dit quoi faire ; pour un plan il porte « Ouvrir l'accueil du drive ». Jamais un écran muet.
     */
    private fun updateStoreBanner(url: String?) {
        val banner = StoreBanner.of(pass.current()?.request, url, watch.trouble(url))
        val text = when (banner) {
            StoreBanner.NONE -> null
            StoreBanner.SETUP -> R.string.setup_banner
            StoreBanner.PLAN -> R.string.plan_banner
            StoreBanner.OPEN -> R.string.plan_banner_open
            StoreBanner.VERIFICATION -> R.string.plan_banner_verification
            StoreBanner.MOBILE -> R.string.plan_banner_mobile
        }
        if (text != null) storeBanner.setText(text)
        bannerAction.visibility = if (banner.hasAction) View.VISIBLE else View.GONE
        bannerBox.visibility = if (text != null) View.VISIBLE else View.GONE
    }

    /**
     * « Ouvrir l'accueil du drive » : recharge la page de départ du passage (l'accueil de l'enseigne, [NavigationPolicy.START_URL], où
     * l'utilisateur est déjà connecté). Elle affiche l'accueil du magasin : il touche lui-même « Commencer mes courses » (l'application ne
     * clique jamais à sa place), et dès qu'il est sur une page de magasin le message du passage part tout seul vers l'agent ([sendPlan]) ; si
     * ce n'est pas le magasin du plan, l'agent le dit (`STORE_MISMATCH`).
     */
    private fun openHome() {
        val request = pass.current()?.request ?: return
        problems.hide()
        navigationBegins()
        updateStoreBanner(request.startUrl)
        webView.loadUrl(request.startUrl)
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
        // Les outils de débogage n'existent que dans la variante de débogage, jamais dans l'APK signé (DRV-621).
        if (BuildConfig.DEBUG) add(R.string.menu_selftest to ::startSelftest)
        if (BuildConfig.DEBUG) add(R.string.menu_debug_plan to ::startDebugPlan)
        pass.current()?.let { add((if (it.request.isSetup) R.string.menu_abandon_setup else R.string.menu_abandon) to ::askAbandon) }
        add(R.string.menu_zoom_in to { zoomPage(PAGE_ZOOM_STEP) })
        add(R.string.menu_zoom_out to { zoomPage(1 / PAGE_ZOOM_STEP) })
        add(R.string.menu_about to { showAbout(repasApp.agentLoad.describe(this@DriveActivity)) })
        add(R.string.menu_logout_drive to { confirmClearDriveData(::clearDriveData) })
        add(R.string.menu_diagnostic to ::openAgentDiagnostic)
        // Utile au dépannage, rare pour un proche : toujours en dernier.
        add(R.string.menu_browser to ::openCurrentPageInBrowser)
    }

    /**
     * Agrandir ou réduire la page de Leclerc d'un cran, d'un geste : le site s'affiche en mode ordinateur (fenêtre de 980 px CSS affichée sur
     * ~411 dp), son texte y est petit. Le pincement et le double toucher le font déjà ; ce menu est la voie sans geste, et sans risque pour
     * l'agent : son interface lit le zoom de la page à chaque instant et s'y adapte (`drive-agent/src/ui/scale.ts`). La WebView borne le zoom.
     */
    private fun zoomPage(factor: Float) {
        zoomAnchor = intArrayOf(webView.scrollX, webView.scrollY)
        webView.zoomBy(factor)
    }

    /**
     * Le défilement avant un zoom du menu : la WebView zoome autour du centre de l'écran, et le haut de la page sortirait du cadre. Une fois
     * l'échelle changée ([DriveWebViewClient.onScaleChanged]), le coin haut gauche de ce que l'on voyait est remis en place (le défilement
     * suit l'échelle).
     */
    private var zoomAnchor: IntArray? = null

    /** Se déconnecter de Leclerc : cookies, stockage du site, cache et historique du drive, puis retour à l'accueil du drive. */
    private fun clearDriveData() {
        DriveProfile.clear(webView)
        repasApp.storePath.forget()
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

    companion object {
        /** La page où ouvrir le drive quand aucun passage n'est en cours (DRV-625), vérifiée par [DriveEntry.startPage]. */
        const val EXTRA_START_URL = "eu.kantin.repas.drive.START_URL"
    }
}
