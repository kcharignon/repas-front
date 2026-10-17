package eu.kantin.repas.lab

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.IOException
import java.security.MessageDigest
import java.util.Base64

/**
 * Outil de test jetable, à supprimer après la décision G1 (DRV-005).
 *
 * Une WebView plein écran sur Leclerc Drive, un bouton « Banc » qui lance dans la page le banc d'essai embarqué, un écran
 * « Diagnostic ». L'application ne lit, ne stocke et ne journalise aucun identifiant, cookie ou jeton : l'utilisateur se connecte
 * lui-même dans la WebView. Aucune passerelle native n'est exposée aux pages (pas de `addJavascriptInterface`).
 */
class MainActivity : Activity() {
    private lateinit var prefs: SharedPreferences
    private lateinit var webView: WebView
    private lateinit var diagnosticPanel: View
    private lateinit var diagnosticText: TextView
    private lateinit var userAgentGroup: RadioGroup
    private val choiceByRadioId = mutableMapOf<Int, UserAgentChoice>()

    /** La fenêtre vide qui reçoit un `window.open` avant que son adresse soit confiée à la WebView principale. */
    private var popup: WebView? = null
    private var labBytes: ByteArray? = null
    private val externalSites = ArrayDeque<String>()

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        // Le débogage à distance de la WebView n'existe que dans la version de débogage.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = createWebView()
        val root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
        root.addView(
            floatingButtons(),
            FrameLayout.LayoutParams(WRAP, WRAP, Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(12), dp(24)) },
        )
        diagnosticPanel = diagnosticPanel()
        root.addView(diagnosticPanel, FrameLayout.LayoutParams(MATCH, MATCH))
        setContentView(root)

        webView.loadUrl(NavigationPolicy.START_URL)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        // Les cookies de la WebView sont écrits sur le disque ici, pour qu'ils survivent à la fermeture de l'application.
        CookieManager.getInstance().flush()
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

    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onBackPressed() {
        when {
            diagnosticPanel.visibility == View.VISIBLE -> diagnosticPanel.visibility = View.GONE
            webView.canGoBack() -> webView.goBack()
            else -> super.onBackPressed()
        }
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
            // `window.open` et les liens `target=_blank` passent par `onCreateWindow` : ils s'ouvrent dans cette WebView.
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
        }
        applyUserAgent(view)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            // Leclerc charge des éléments d'autres sites (anti-robot, mesure) qui posent leurs propres cookies.
            setAcceptThirdPartyCookies(view, true)
        }
        view.webViewClient = LabWebViewClient()
        view.webChromeClient = LabChromeClient()
        return view
    }

    private fun currentChoice(): UserAgentChoice = UserAgentChoice.fromKey(prefs.getString(KEY_USER_AGENT, null))

    private fun applyUserAgent(view: WebView = webView) {
        view.settings.userAgentString = UserAgents.resolve(currentChoice(), WebSettings.getDefaultUserAgent(this))
    }

    /** Applique la règle de navigation à une adresse demandée hors de la page (fenêtre `window.open`). */
    private fun route(url: String?) {
        when (NavigationPolicy.decide(url)) {
            Decision.ALLOW -> webView.loadUrl(url!!)
            Decision.OPEN_EXTERNALLY -> openInPhoneBrowser(url!!)
            Decision.BLOCK -> Unit
        }
    }

    private fun openInPhoneBrowser(url: String) {
        rememberExternalSite(NavigationPolicy.describe(url))
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            // Pas de navigateur installé : rien à faire.
        }
    }

    private fun rememberExternalSite(site: String) {
        externalSites.remove(site)
        externalSites.addLast(site)
        while (externalSites.size > MAX_EXTERNAL_SITES) externalSites.removeFirst()
    }

    private inner class LabWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Seule la page principale est limitée à Leclerc : les cadres (par exemple le défi anti-robot) restent libres de charger.
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            if (NavigationPolicy.decide(url) == Decision.ALLOW) return false
            route(url)
            return true
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            toast(R.string.render_process_gone)
            recreate()
            return true
        }
    }

    private inner class LabChromeClient : WebChromeClient() {
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            popup?.destroy()
            val holder = WebView(this@MainActivity)
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

        override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            if (isFinishing) {
                result.cancel()
                return true
            }
            AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton(R.string.ok) { _, _ -> result.confirm() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            if (isFinishing) {
                result.cancel()
                return true
            }
            AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton(R.string.ok) { _, _ -> result.confirm() }
                .setNegativeButton(R.string.cancel) { _, _ -> result.cancel() }
                .setOnCancelListener { result.cancel() }
                .show()
            return true
        }

        // Rien de ce que dit la page n'est écrit dans le journal du téléphone.
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean = true
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le banc d'essai

    private fun runBench() {
        if (!NavigationPolicy.isAllowed(webView.url)) {
            toast(R.string.bench_needs_leclerc_page)
            return
        }
        val script = labBytes()?.toString(Charsets.UTF_8)
        if (script == null) {
            toast(R.string.bench_missing)
            return
        }
        // Exécuté dans la page courante, comme le faisait le favori. Aucun résultat n'est lu par l'application.
        webView.evaluateJavascript(script, null)
    }

    private fun labBytes(): ByteArray? {
        labBytes?.let { return it }
        return try {
            assets.open(LAB_ASSET).use { it.readBytes() }.also { labBytes = it }
        } catch (_: IOException) {
            null
        }
    }

    private fun labDigest(): String? = labBytes()?.let {
        "sha384-" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-384").digest(it))
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Les boutons et l'écran Diagnostic

    private fun floatingButtons(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.END
        addView(roundedButton(R.string.bench_button, filled = true) { runBench() })
        addView(
            roundedButton(R.string.diagnostic_button, filled = false) { showDiagnostic() },
            LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(8) },
        )
    }

    private fun roundedButton(label: Int, filled: Boolean, onClick: () -> Unit): Button = Button(this).apply {
        setText(label)
        isAllCaps = false
        minWidth = dp(96)
        minHeight = dp(48)
        minimumWidth = dp(96)
        minimumHeight = dp(48)
        setTextColor(if (filled) Color.WHITE else BASIL)
        background = GradientDrawable().apply {
            cornerRadius = dp(24).toFloat()
            setColor(if (filled) BASIL else Color.WHITE)
            setStroke(dp(2), BASIL)
        }
        elevation = dp(6).toFloat()
        setOnClickListener { onClick() }
    }

    private fun diagnosticPanel(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(24))
        }
        column.addView(text(R.string.diagnostic_title, sizeSp = 22f, bold = true))
        column.addView(text(R.string.user_agent_title, sizeSp = 15f, bold = true).apply { setPadding(0, dp(16), 0, dp(4)) })

        userAgentGroup = RadioGroup(this)
        addChoice(R.string.user_agent_webview, UserAgentChoice.WEBVIEW_DEFAULT)
        addChoice(R.string.user_agent_without_wv, UserAgentChoice.WITHOUT_WV)
        userAgentGroup.check(choiceByRadioId.entries.first { it.value == currentChoice() }.key)
        userAgentGroup.setOnCheckedChangeListener { _, id ->
            val choice = choiceByRadioId[id] ?: return@setOnCheckedChangeListener
            if (choice == currentChoice()) return@setOnCheckedChangeListener
            prefs.edit().putString(KEY_USER_AGENT, choice.key).apply()
            applyUserAgent()
            webView.reload()
            refreshDiagnostic()
        }
        column.addView(userAgentGroup)

        diagnosticText = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(INK)
            setPadding(dp(8), dp(12), dp(8), dp(12))
            setBackgroundColor(0xFFF1F1EC.toInt())
        }
        column.addView(diagnosticText, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(12) })

        column.addView(panelButton(R.string.copy, filled = true) { copyDiagnostic() })
        column.addView(panelButton(R.string.reload, filled = false) { webView.reload(); hideDiagnostic() })
        column.addView(panelButton(R.string.home, filled = false) { webView.loadUrl(NavigationPolicy.START_URL); hideDiagnostic() })
        column.addView(panelButton(R.string.clear_data, filled = false) { confirmClearData() })
        column.addView(panelButton(R.string.close, filled = false) { hideDiagnostic() })

        return ScrollView(this).apply {
            setBackgroundColor(Color.WHITE)
            isClickable = true
            visibility = View.GONE
            addView(column, ViewGroup.LayoutParams(MATCH, WRAP))
        }
    }

    private fun addChoice(label: Int, choice: UserAgentChoice) {
        val radio = RadioButton(this).apply {
            id = View.generateViewId()
            setText(label)
            setTextColor(INK)
            minHeight = dp(48)
        }
        choiceByRadioId[radio.id] = choice
        userAgentGroup.addView(radio)
    }

    private fun text(label: Int, sizeSp: Float, bold: Boolean): TextView = TextView(this).apply {
        setText(label)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(INK)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun panelButton(label: Int, filled: Boolean, onClick: () -> Unit): Button =
        roundedButton(label, filled, onClick).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(10) }
        }

    private fun showDiagnostic() {
        refreshDiagnostic()
        diagnosticPanel.visibility = View.VISIBLE
    }

    private fun hideDiagnostic() {
        diagnosticPanel.visibility = View.GONE
    }

    private fun refreshDiagnostic() {
        diagnosticText.text = DiagnosticReport.render(collectInfo())
    }

    @Suppress("DEPRECATION")
    private fun collectInfo(): DiagnosticInfo {
        val app = packageManager.getPackageInfo(packageName, 0)
        val webViewPackage = WebView.getCurrentWebViewPackage()
        return DiagnosticInfo(
            appVersionName = app.versionName ?: "?",
            appVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) app.longVersionCode else app.versionCode.toLong(),
            buildCommit = getString(R.string.build_commit),
            debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0,
            androidRelease = Build.VERSION.RELEASE,
            androidSdk = Build.VERSION.SDK_INT,
            webViewPackage = webViewPackage?.packageName,
            webViewVersion = webViewPackage?.versionName,
            choice = currentChoice(),
            userAgent = webView.settings.userAgentString,
            labDigest = labDigest(),
            externalSites = externalSites.toList(),
        )
    }

    private fun copyDiagnostic() {
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard.setPrimaryClip(ClipData.newPlainText("diagnostic", diagnosticText.text))
        toast(R.string.copied)
    }

    private fun confirmClearData() {
        AlertDialog.Builder(this)
            .setMessage(R.string.clear_data_message)
            .setPositiveButton(R.string.clear_data_confirm) { _, _ -> clearBrowserData() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun clearBrowserData() {
        val cookies = CookieManager.getInstance()
        cookies.removeAllCookies(null)
        cookies.flush()
        WebStorage.getInstance().deleteAllData()
        webView.clearCache(true)
        webView.clearHistory()
        webView.loadUrl(NavigationPolicy.START_URL)
        hideDiagnostic()
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

    private companion object {
        const val PREFS = "lab"
        const val KEY_USER_AGENT = "user_agent"
        const val LAB_ASSET = "lab.js"
        const val MAX_EXTERNAL_SITES = 5
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
        val BASIL = 0xFF2F5D3A.toInt()
        val INK = 0xFF1B1B1B.toInt()
    }
}
