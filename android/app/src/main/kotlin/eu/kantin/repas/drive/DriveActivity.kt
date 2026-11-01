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

/** Un cran de zoom de la page du drive (menu « Agrandir la page » et « Réduire la page »). */
private const val PAGE_ZOOM_STEP = 1.5f

/**
 * L'écran du drive (DRV-312, DRV-313, DRV-707) : le drive d'UNE enseigne en plein écran, dans l'identité de la WebView, ou en mode ordinateur seulement quand le site d'une enseigne (fictive) le demande ([SiteMode.DESKTOP] ; ni Leclerc ni Auchan : DRV-754). C'était l'hôte WebView de
 * « Repas Drive » ; c'est maintenant le second écran de l'application, que la coquille Repas ([MainActivity]) ouvre. **Il s'ouvre sur une enseigne**
 * ([site] : le passage en cours, sinon l'extra [EXTRA_RETAILER], sinon l'enseigne d'avant le multi-enseignes) et tout ce qu'il fait est de cette
 * enseigne seulement : navigation, accueil, mode du site, injection, origines du pont, profil de WebView, mémoires, textes.
 *
 * L'utilisateur se connecte lui-même ; ses cookies restent dans le profil de WebView de cette enseigne ([DriveProfile]), que l'application ne lit
 * ni ne journalise jamais (ni cookie, ni contenu de page, ni adresse complète). Navigation limitée à `https` et aux pages de l'enseigne
 * ([NavigationPolicy.decide]) : tout autre lien s'ouvre dans le navigateur du téléphone. Aucun objet natif n'est exposé aux pages ; l'agent y est
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
 * choisir son magasin). Le message `setup` n'est envoyé à l'agent que lorsque la page est celle d'un magasin ([RetailerSite.isStorePage]) :
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

    /**
     * L'enseigne de cet écran, fixée à la création (DRV-707) : tout ce que l'écran fait est de cette enseigne. Le passage en cours passe avant l'extra : l'écran
     * suit le passage (un plan n'est jamais livré à l'agent d'une autre enseigne).
     */
    private lateinit var site: RetailerSite

    /** Les pages qui sortent de l'application s'ouvrent dans le navigateur du téléphone (le service de plateforme du cœur, `LinkOpener`). */
    private val linkOpener: LinkOpener = AndroidLinkOpener(this)

    /** Ce qui cloche avec la page où l'envoi attend la page du magasin (ticket E) : le site la refuse, la détourne, tarde, ou son agent manque. */
    private lateinit var watch: OpeningWatch
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

    /** La boîte de diagnostic native (DRV-759) : ce que l'application sait, puis ce que l'agent a dit ; les annonces de l'agent et les pages chargées sont comptées pour elle. */
    private var diagnosticBody: TextView? = null
    private var diagnosticAgentLines: List<String> = emptyList()
    private var agentHellos = 0
    private var pagesStarted = 0

    /** La fenêtre vide qui reçoit un `window.open` avant que son adresse soit confiée à la WebView principale. */
    private var popup: WebView? = null
    private var loadFailed = false

    /**
     * L'accueil du magasin (avec la ville) ouvert par « Finaliser » (DRV-631), tant que le site n'a pas répondu : s'il le refuse (4xx, 5xx)
     * ou le sert avec un titre « introuvable », l'écran se replie sur l'accueil du drive ([DriveEntry.fallsBack], [DriveEntry.isNotFoundTitle]).
     * `null` sinon.
     */
    private var homeTarget: String? = null

    /** Le titre de la page est surveillé (page d'arrivée de « Finaliser », avant la première navigation) : seul le titre est lu, jamais le contenu. */
    private var watchTitle = false

    /** Le bandeau « Ton panier est dans l'icône en haut à droite. » : de l'arrivée de « Finaliser » à la première navigation. */
    private var basketHint = false

    /** Le repli sur l'accueil vient d'avoir lieu : une fois l'accueil chargé, la page refusée sort de l'historique (le retour ne la montre pas). */
    private var clearHistoryWhenLoaded = false

    private val repasApp get() = application as RepasApp
    private val pass get() = repasApp.pass

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        site = pass.current()?.request?.site ?: repasApp.sites.forScreen(intent?.getStringExtra(EXTRA_RETAILER))
        watch = OpeningWatch(site)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        // Le compte de l'utilisateur chez l'enseigne est à l'écran : l'aperçu des applications récentes et les captures d'écran ne montrent pas ce drive.
        // Pas dans l'APK de débogage : les essais de l'émulateur et la recette sur téléphone s'appuient sur ses captures d'écran.
        if (!BuildConfig.DEBUG) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        // Le débogage à distance de la WebView n'existe que dans la version de débogage.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        resultPanel = TextPanel(this)
        debugRun = DebugRun(
            site = site,
            template = { AgentHost.readAsset(this, site.debugPlanFile)?.toString(Charsets.UTF_8) },
            send = { agent.send(it) },
            startPass = ::startDebugPass,
            show = { resultPanel.show(it) },
            newRunId = { UUID.randomUUID().toString() },
        )
        selftestRun = SelftestRun(
            send = { agent.openSelftest() },
            show = { resultPanel.show(it, R.string.selftest_title, autoCopy = true) },
        )
        agent = AgentHost.create(repasApp.agentLoad, BuildConfig.DEBUG, site, onHello = { agentHellos++; if (delivery.hello()) sendPlan() }) { message ->
            // Les deux lignes que l'agent dit à la boîte de diagnostic (DRV-759) : du texte seul, jamais une décision
            if (message.type == "log") return@create onAgentDiagnosticLines(message.text)
            if ((message.type == "result" || message.type == "setup-result") && onAgentResult(message.text)) return@create
            // La variante de débogage montre le résultat de l'essai et le rapport du test automatique.
            if (BuildConfig.DEBUG && !selftestRun.onAgentMessage(message.type, message.text)) {
                debugRun.onAgentMessage(message.type, message.text)
            }
        }
        webView = createWebView()
        beginFinalize()
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
        // DRV-757 : une seule fois, AVANT tout chargement, l'ancien site ordinateur d'une version d'avant ne reste pas dans la WebView. L'effacement des cookies est asynchrone :
        // la page se charge à sa fin. La personne n'apprend qu'elle a été déconnectée que s'il y avait quelque chose à effacer.
        val started = repasApp.siteModeMigration.runFor(site) { outcome ->
            if (isDestroyed) return@runFor
            // Abandonnée faute de réponse de la WebView (3 s) : la page se charge quand même, aucun message, la migration sera retentée au lancement suivant
            if (outcome != MigrationOutcome.GAVE_UP) {
                webView.clearCache(true)
                webView.clearHistory()
            }
            if (outcome == MigrationOutcome.ERASED) {
                Toast.makeText(this, getString(R.string.site_mode_migrated, site.nameDe), Toast.LENGTH_LONG).show()
            }
            openFirstPage()
        }
        if (!started) openFirstPage()
    }

    private fun openFirstPage() {
        val first = firstUrl()
        webView.loadUrl(first)
        updateStoreBanner(first)
    }

    /**
     * La première page : celle du passage en cours ; sinon, pour un lien du drive ouvert depuis Repas (« Finaliser », DRV-625), la page
     * demandée, revérifiée ([DriveEntry.startPage]) ; sinon l'accueil du drive.
     */
    private fun beginFinalize() {
        // Seulement l'arrivée de « Finaliser » hors passage : la forme est retenue, le bandeau posé (DRV-631).
        val outcome = FinalizeOutcome.parse(intent?.getStringExtra(EXTRA_FINALIZE))?.takeIf { pass.current() == null } ?: return
        repasApp.finalizeOutcomes.record(outcome, site)
        basketHint = true
        if (DriveEntry.isStoreHome(firstUrl(), site)) {
            homeTarget = firstUrl()
            watchTitle = true
        }
    }

    private fun firstUrl(): String {
        val request = pass.current()?.request
        // Un plan dont le magasin vient d'être ouvert ici (DRV-759, « Utiliser ce magasin ») s'ouvre sur sa page, pas sur l'accueil où il faudrait choisir son magasin une seconde fois ; la page refusée par le site ramène à l'accueil
        if (request is DrivePlan) {
            val opening = request.openingPage(repasApp.storePaths.of(site))
            if (opening != request.startUrl) homeTarget = opening
            return opening
        }
        return request?.startUrl ?: DriveEntry.startPage(intent?.getStringExtra(EXTRA_START_URL), site)
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
        DriveProfile.cookieManager(site, repasApp.sites).flush()
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
        // Le profil de WebView de l'enseigne : avant tout chargement et tout réglage de cookies.
        DriveProfile.attach(view, site, repasApp.sites)
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
        DesktopMode.apply(this, view.settings, site.siteMode)
        // Le canal et l'injection de l'agent (DRV-313) : avant le premier chargement, réservés aux pages de l'enseigne où le pont existe.
        agent.attach(view)
        DriveProfile.cookieManager(site, repasApp.sites).apply {
            setAcceptCookie(true)
            // Un drive charge des éléments d'autres sites (anti-robot, mesure) qui posent leurs propres cookies.
            setAcceptThirdPartyCookies(view, true)
        }
        view.webViewClient = DriveWebViewClient()
        view.webChromeClient = DriveChromeClient()
        return view
    }

    /** Applique la règle de navigation de l'enseigne à une adresse demandée hors de la page (fenêtre `window.open`). */
    private fun route(url: String?) {
        when (NavigationPolicy.decide(site, url)) {
            Decision.ALLOW -> webView.loadUrl(url!!)
            Decision.OPEN_EXTERNALLY -> linkOpener.open(url!!)
            Decision.BLOCK -> Unit
        }
    }

    private inner class DriveWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Seule la page principale est limitée à l'enseigne : les cadres (par exemple le défi anti-robot) restent libres de charger.
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            if (NavigationPolicy.decide(site, url) == Decision.ALLOW) {
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
            pagesStarted++
            delivery.pageStarted()
            watch.pageStarted()
            timers.removeCallbacks(onAgentTimeout)
            armLoadTimer()
            updateStoreBanner(url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!loadFailed) problems.hide()
            watch.pageFinished()
            if (clearHistoryWhenLoaded && url == site.startUrl) {
                clearHistoryWhenLoaded = false
                view.clearHistory()
            }
            // Une page de magasin de l'enseigne avec sa ville, que le site n'a pas refusée : « Finaliser » l'ouvrira (DRV-629, DRV-631).
            if (!loadFailed && !watch.refused()) {
                repasApp.storePaths.of(site).remember(url)
                if (url == homeTarget) homeTarget = null
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
            // L'accueil du magasin refusé par le site : l'accueil du drive, où le panier est dans la même icône (DRV-631).
            if (DriveEntry.fallsBack(homeTarget, request.url.toString(), errorResponse.statusCode)) {
                fallBackToDriveHome(FinalizeOutcome.ofHttp(errorResponse.statusCode))
                return
            }
            // Le statut de la page principale (404, 5xx…) : une page d'erreur du site n'est jamais celle du magasin, et ne reçoit pas le plan.
            watch.httpError(errorResponse.statusCode)
            LoadProblems.fromHttpStatus(errorResponse.statusCode)?.let(::showProblem)
            updateStoreBanner(view.url)
        }

        // Tout changement de page, y compris par le site lui-même (sans rechargement), est vu ici : le bandeau suit la page où l'on est vraiment.
        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            if (basketHint && !DriveEntry.isArrivalPage(url, site)) endBasketHint()
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
        // Une page « introuvable » du site servie avec un statut 200 (DRV-631) : seul le TITRE est lu, jamais le contenu de la page, et seulement
        // sur la page d'arrivée de « Finaliser » (avant la première navigation).
        override fun onReceivedTitle(view: WebView, title: String?) {
            if (watchTitle && DriveEntry.isStoreHome(view.url, site) && DriveEntry.isNotFoundTitle(title)) fallBackToDriveHome(FinalizeOutcome.TITRE_INTROUVABLE)
        }

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
        // Le plan d'une autre enseigne que celle de l'écran n'est jamais livré à son agent (DRV-707).
        if (request.site !== site) return delivery.failed()
        // Pas de message vers une page que le site a refusée ou détournée (ticket E) : le bandeau dit quoi faire à l'utilisateur.
        if (!watch.canDeliver(request, webView.url, storeKnown = repasApp.storePaths.of(site).hasPath())) return delivery.failed()
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
        val banner = StoreBanner.of(pass.current()?.request, url, watch.trouble(url), basketHint, watch.isLoading(), storeKnown = repasApp.storePaths.of(site).hasPath())
        val text = when (banner) {
            StoreBanner.NONE -> null
            StoreBanner.SETUP -> R.string.setup_banner
            StoreBanner.PLAN -> R.string.plan_banner
            StoreBanner.OPEN -> R.string.plan_banner_open
            StoreBanner.STORE_FIRST -> R.string.store_first_banner
            StoreBanner.VERIFICATION -> R.string.plan_banner_verification
            StoreBanner.MOBILE -> R.string.plan_banner_mobile
            StoreBanner.BASKET -> R.string.basket_banner
            StoreBanner.LOGIN -> R.string.login_page_banner
        }
        if (text != null) storeBanner.text = getString(text, site.name, site.nameDe)
        bannerAction.visibility = if (banner.hasAction) View.VISIBLE else View.GONE
        bannerBox.visibility = if (text != null) View.VISIBLE else View.GONE
    }

    /** La première navigation après l'arrivée de « Finaliser » : le bandeau disparaît et l'on ne surveille plus rien (DRV-631). */
    private fun endBasketHint() {
        basketHint = false
        watchTitle = false
        homeTarget = null
        updateStoreBanner(webView.url)
    }

    /**
     * L'accueil du magasin ouvert par « Finaliser » est refusé ou « introuvable » (DRV-631) : la forme est retenue pour le diagnostic, puis l'accueil
     * du drive s'ouvre à la place, une seule fois (jamais de boucle). Le bandeau reste : le panier y est dans la même icône.
     */
    private fun fallBackToDriveHome(outcome: FinalizeOutcome) {
        repasApp.finalizeOutcomes.record(outcome, site)
        homeTarget = null
        watchTitle = false
        clearHistoryWhenLoaded = true
        problems.hide()
        navigationBegins()
        webView.loadUrl(site.startUrl)
    }

    /**
     * « Ouvrir l'accueil du drive » : recharge la page de départ du passage (l'accueil de l'enseigne, [RetailerSite.startUrl], où
     * l'utilisateur est déjà connecté). Elle affiche l'accueil du magasin : il touche lui-même « Commencer mes courses » (l'application ne
     * clique jamais à sa place), et dès qu'il est sur une page de magasin le message du passage part tout seul vers l'agent ([sendPlan]) ; si
     * ce n'est pas le magasin du plan, l'agent le dit (`STORE_MISMATCH`). Toujours l'accueil de l'enseigne, jamais l'adresse de magasin qu'une lecture
     * du magasin a pu ouvrir (DRV-741) : si elle n'a pas mené au magasin, la recharger ne ferait que recommencer.
     */
    private fun openHome() {
        val request = pass.current()?.request ?: return
        problems.hide()
        navigationBegins()
        updateStoreBanner(request.site.startUrl)
        webView.loadUrl(request.site.startUrl)
    }

    /** Le résultat de l'agent. Vrai si c'est celui du passage en cours : il est clos, et l'écran se referme ou montre l'essai. */
    private fun onAgentResult(text: String): Boolean {
        val ended = pass.finish(text) ?: return false
        endOfPass(ended, text)
        return true
    }

    /** Le passage de débogage (menu « Plan d'essai ») passe par le même chemin qu'un plan de Repas ; `false` si un autre passage est en cours. */
    private fun startDebugPass(planText: String): Boolean {
        val plan = DrivePlan.parseText(planText, repasApp.sites) ?: return false
        // Le plan d'essai d'une autre enseigne que celle de l'écran n'est jamais envoyé à l'agent de cette page.
        if (plan.site !== site) return false
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

    /** Le texte d'une entrée de menu ou de bandeau : il nomme l'enseigne de l'écran quand il a des trous (`%1$s` son nom, `%2$s` sa forme avec « de »). */
    private fun text(resource: Int): String = getString(resource, site.name, site.nameDe)

    private fun menuEntries(): List<Pair<String, () -> Unit>> = buildList {
        // Les outils de débogage n'existent que dans la variante de débogage, jamais dans l'APK signé (DRV-621).
        if (BuildConfig.DEBUG) add(text(R.string.menu_selftest) to ::startSelftest)
        if (BuildConfig.DEBUG) add(text(R.string.menu_debug_plan) to ::startDebugPlan)
        pass.current()?.let { add(text(if (it.request.isSetup) R.string.menu_abandon_setup else R.string.menu_abandon) to ::askAbandon) }
        add(text(R.string.menu_zoom_in) to { zoomPage(PAGE_ZOOM_STEP) })
        add(text(R.string.menu_zoom_out) to { zoomPage(1 / PAGE_ZOOM_STEP) })
        add(text(R.string.menu_about) to { showAbout(repasApp.agentLoad.describe(this@DriveActivity), site, repasApp.finalizeOutcomes.last(site)) })
        add(text(R.string.menu_logout_drive) to { confirmClearDriveData(site, ::clearDriveData) })
        add(text(R.string.menu_diagnostic) to ::openAgentDiagnostic)
        // Utile au dépannage, rare pour un proche : toujours en dernier.
        add(text(R.string.menu_browser) to ::openCurrentPageInBrowser)
    }

    /**
     * Agrandir ou réduire la page du drive d'un cran, d'un geste : utile à qui lit mal un texte du site (le mode ordinateur, à la fenêtre de 980 px CSS,
     * n'est plus celui de Leclerc depuis DRV-754 : sa version mobile est faite pour le téléphone). Le pincement et le double toucher le font déjà ; ce menu est la voie sans geste, et sans risque pour
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

    /** Se déconnecter de l'enseigne : cookies, stockage du site, cache et historique de SON drive seulement, puis retour à l'accueil du drive. */
    private fun clearDriveData() {
        DriveProfile.clear(webView, site, repasApp.sites)
        repasApp.storePaths.forget(site)
        repasApp.finalizeOutcomes.forget(site)
        problems.hide()
        webView.loadUrl(site.startUrl)
    }

    /** La page courante dans le navigateur du téléphone (l'accueil du drive si la page n'est pas une page du drive). */
    private fun openCurrentPageInBrowser() {
        linkOpener.open(webView.url?.takeIf { site.isNavigable(it) } ?: site.startUrl)
    }

    /** Le diagnostic de l'agent : une commande sur le pont, jamais un fragment d'adresse (un fragment trop long fait échouer le site). */
    private fun openAgentDiagnostic() {
        // La boîte native s'ouvre toujours (DRV-759) : une page sans agent est justement ce qu'elle doit dire ; l'écran de l'agent, s'il y en a un, s'ouvre derrière
        diagnosticAgentLines = emptyList()
        val body = label("", sizeSp = 14f).apply { setTextIsSelectable(true) }
        diagnosticBody = body
        val box = LinearLayout(this).apply {
            setPadding(dp(20), dp(12), dp(20), dp(4))
            addView(body, LinearLayout.LayoutParams(MATCH, WRAP))
        }
        refreshDiagnostic()
        AlertDialog.Builder(this)
            .setTitle(R.string.menu_diagnostic)
            .setView(android.widget.ScrollView(this).apply { addView(box) })
            .setPositiveButton(R.string.ok, null)
            .setOnDismissListener { diagnosticBody = null }
            .show()
        agent.openDiagnostic()
    }

    private fun onAgentDiagnosticLines(text: String) {
        diagnosticAgentLines = AgentDiagnostic.agentLines(text)
        refreshDiagnostic()
    }

    private fun refreshDiagnostic() {
        val body = diagnosticBody ?: return
        val request = pass.current()?.request
        val url = webView.url
        body.text = AgentDiagnostic.report(
            page = AgentDiagnostic.pageCategory(site, url),
            agentHellos = agentHellos,
            pagesStarted = pagesStarted,
            pass = when {
                request == null -> "aucun"
                request.isSetup -> "lecture du magasin"
                else -> "plan"
            },
            banner = StoreBanner.of(request, url, watch.trouble(url), basketHint, watch.isLoading(), storeKnown = repasApp.storePaths.of(site).hasPath()).name,
            agentLines = diagnosticAgentLines,
        ).joinToString("\n\n")
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

        /**
         * L'enseigne sur laquelle l'écran s'ouvre (DRV-707) : un identifiant du registre ([RetailerSites.forScreen]). Absent ou inconnu : l'enseigne d'avant le
         * multi-enseignes, comme avant. Un passage en cours passe avant : l'écran suit l'enseigne du passage.
         */
        const val EXTRA_RETAILER = "eu.kantin.repas.drive.RETAILER"

        /** La forme de « Finaliser » ([FinalizeOutcome]) : présente seulement quand l'écran s'ouvre pour finaliser (DRV-631), elle pose le bandeau du panier. */
        const val EXTRA_FINALIZE = "eu.kantin.repas.drive.FINALIZE"
    }
}
