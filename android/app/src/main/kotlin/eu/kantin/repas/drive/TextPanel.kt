package eu.kantin.repas.drive

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Un écran plein écran de texte sélectionnable, avec « Copier » et « Fermer » (le résultat de l'essai de débogage, DRV-313). */
internal class TextPanel(context: Context) : ScrollView(context) {
    private val body = TextView(context).apply {
        setTextIsSelectable(true)
        typeface = Typeface.MONOSPACE
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(INK)
        setPadding(context.dp(8), context.dp(12), context.dp(8), context.dp(12))
        setBackgroundColor(0xFFF1F1EC.toInt())
    }

    val isShowing: Boolean get() = visibility == View.VISIBLE

    init {
        setBackgroundColor(Color.WHITE)
        isClickable = true
        visibility = GONE
        val column = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(16), context.dp(16), context.dp(16), context.dp(24))
            addView(context.label(context.getString(R.string.result_title), sizeSp = 22f, bold = true))
            addView(body, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(12) })
            addView(button(context, R.string.copy, filled = true) { copy(context) })
            addView(button(context, R.string.close, filled = false) { hide() })
        }
        addView(column, LayoutParams(MATCH, WRAP))
    }

    fun show(text: String) {
        body.text = text
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

    private fun copy(context: Context) {
        context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("resultat", body.text))
        Toast.makeText(context, R.string.copied, Toast.LENGTH_SHORT).show()
    }
}
