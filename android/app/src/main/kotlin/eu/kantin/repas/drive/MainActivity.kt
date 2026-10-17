package eu.kantin.repas.drive

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Le squelette de « Repas Drive » (DRV-311) : un écran qui nomme l'application et montre sa version.
 *
 * L'hôte WebView en mode ordinateur (DRV-312), l'agent (DRV-313) et le passage du plan (DRV-314) viennent ensuite. L'application ne
 * demande aucune permission pour l'instant, ne lit ni ne journalise aucune donnée.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(screen())
    }

    private fun screen(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(getColor(R.color.background))
        // Depuis Android 15, l'écran passe sous les barres du système : cette marge les évite.
        fitsSystemWindows = true
        setPadding(dp(24), dp(48), dp(24), dp(24))
        addView(text(R.string.app_name, sizeSp = 28f, bold = true, color = R.color.basil))
        addView(text(R.string.skeleton_message, sizeSp = 17f, bold = false, color = R.color.ink).apply { setPadding(0, dp(16), 0, 0) })
        addView(text(versionLine(), sizeSp = 14f, bold = false, color = R.color.ink).apply { setPadding(0, dp(24), 0, 0) })
    }

    private fun versionLine(): String {
        val info = packageManager.getPackageInfo(packageName, 0)
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        return VersionLabel.render(info.versionName ?: "?", code, getString(R.string.build_commit), debuggable)
    }

    private fun text(label: Int, sizeSp: Float, bold: Boolean, color: Int): TextView = text(getString(label), sizeSp, bold, color)

    private fun text(label: String, sizeSp: Float, bold: Boolean, color: Int): TextView = TextView(this).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(getColor(color))
        if (bold) setTypeface(typeface, Typeface.BOLD)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()
}
