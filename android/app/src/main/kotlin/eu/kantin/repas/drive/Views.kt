package eu.kantin.repas.drive

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** De petits outils pour construire les écrans sans AndroidX : les couleurs sont celles de `res/values/colors.xml`. */
internal val BASIL = 0xFF1E6B4C.toInt()
internal val INK = 0xFF16221C.toInt()

internal const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
internal const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

internal fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

internal fun Context.label(text: CharSequence, sizeSp: Float = 17f, bold: Boolean = false, color: Int = INK): TextView = TextView(this).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    if (bold) setTypeface(typeface, Typeface.BOLD)
}

/** Un bouton arrondi d'au moins 48 dp, plein (action principale) ou cerné de vert. */
internal fun Context.roundedButton(text: CharSequence, filled: Boolean, onClick: () -> Unit): Button = Button(this).apply {
    this.text = text
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

/** Le bouton « ⋮ » rond qui ouvre le menu. */
internal fun Context.menuButton(onClick: () -> Unit): View = TextView(this).apply {
    text = "⋮"
    textSize = 24f
    gravity = Gravity.CENTER
    setTextColor(Color.WHITE)
    contentDescription = getString(R.string.menu_button)
    background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(BASIL)
    }
    elevation = dp(6).toFloat()
    setOnClickListener { onClick() }
}

/** Depuis Android 15 l'écran passe sous les barres du système et le clavier : la racine garde ses marges. */
internal fun keepClearOfSystemBars(root: View) {
    root.setOnApplyWindowInsetsListener { view, insets ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val types = WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime()
            val margins = insets.getInsets(types)
            view.setPadding(margins.left, margins.top, margins.right, margins.bottom)
            WindowInsets.CONSUMED
        } else {
            insets
        }
    }
}

/** Une page web dans le navigateur du téléphone. */
internal fun Activity.openInPhoneBrowser(url: String) {
    try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show()
    }
}

/**
 * Le panneau qui recouvre la page quand elle ne s'affiche pas : une phrase en français et « Réessayer ». [message] donne la phrase de
 * chaque incident (celle de Repas et celle du drive ne sont pas les mêmes).
 */
internal class ProblemPanel(context: Context, private val message: (LoadProblem) -> Int, onRetry: () -> Unit) : LinearLayout(context) {
    private val text = context.label("", sizeSp = 17f, color = context.getColor(R.color.ink))

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(context.getColor(R.color.background))
        setPadding(context.dp(32), context.dp(32), context.dp(32), context.dp(32))
        // Le panneau recouvre la page : il avale les touches.
        isClickable = true
        visibility = GONE
        addView(text, LayoutParams(MATCH, WRAP))
        addView(
            context.roundedButton(context.getString(R.string.retry), filled = true, onClick = onRetry),
            LayoutParams(WRAP, WRAP).apply { topMargin = context.dp(24) },
        )
    }

    fun show(problem: LoadProblem) {
        text.setText(message(problem))
        visibility = VISIBLE
    }

    fun hide() {
        visibility = GONE
    }
}
