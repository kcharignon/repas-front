package eu.kantin.repas.drive

import android.content.ClipData
import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * Un écran plein écran de texte sélectionnable, avec « Copier », « Partager » (la feuille de partage d'Android) et « Fermer » : le résultat
 * de l'essai de débogage (DRV-313) et le rapport du test automatique (DRV-318), qui se copie tout seul à l'ouverture.
 */
internal class TextPanel(context: Context) : ScrollView(context) {
    private val body = TextView(context).apply {
        setTextIsSelectable(true)
        typeface = Typeface.MONOSPACE
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(INK)
        setPadding(context.dp(8), context.dp(12), context.dp(8), context.dp(12))
        setBackgroundColor(0xFFF1F1EC.toInt())
    }

    private val title = context.label(context.getString(R.string.result_title), sizeSp = 22f, bold = true)

    val isShowing: Boolean get() = visibility == View.VISIBLE

    init {
        setBackgroundColor(Color.WHITE)
        isClickable = true
        visibility = GONE
        val column = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(16), context.dp(16), context.dp(16), context.dp(24))
            addView(title)
            addView(body, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(12) })
            addView(button(context, R.string.copy, filled = true) { copy(context) })
            addView(button(context, R.string.share, filled = false) { share(context) })
            addView(button(context, R.string.close, filled = false) { hide() })
        }
        addView(column, LayoutParams(MATCH, WRAP))
    }

    /** Montre le texte ; `autoCopy` le met aussitôt dans le presse-papiers (le rapport du test automatique : un seul geste de moins). */
    fun show(text: String, titleRes: Int = R.string.result_title, autoCopy: Boolean = false) {
        title.text = context.getString(titleRes)
        body.text = text
        if (autoCopy) copy(context, R.string.report_copied)
        scrollTo(0, 0)
        visibility = VISIBLE
    }

    fun hide() {
        visibility = GONE
    }

    private fun button(context: Context, label: Int, filled: Boolean, onClick: () -> Unit) =
        context.roundedButton(context.getString(label), filled, onClick).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(10) }
        }

    private fun copy(context: Context, message: Int = R.string.copied) {
        context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("resultat", body.text))
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    /** La feuille de partage d'Android : le texte, rien d'autre (aucune permission). */
    private fun share(context: Context) {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, body.text.toString())
        try {
            context.startActivity(Intent.createChooser(send, context.getString(R.string.share)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, R.string.share_failed, Toast.LENGTH_SHORT).show()
        }
    }
}
