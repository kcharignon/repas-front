package eu.kantin.repas.drive

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView

/** De petits outils pour construire les écrans sans AndroidX : les couleurs sont celles de `res/values/colors.xml`. */
internal val BASIL = 0xFF2F5D3A.toInt()
internal val INK = 0xFF1B1B1B.toInt()

internal const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
internal const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

internal fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

internal fun Context.label(text: CharSequence, sizeSp: Float = 17f, bold: Boolean = false): TextView = TextView(this).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(INK)
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
