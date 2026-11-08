package eu.kantin.repas.drive

/**
 * Ce que la coquille montre quand la page de Repas touche un champ de fichier (`onShowFileChooser` de la WebView), décidé sans téléphone.
 *
 * Le seul champ de fichier du front est le bloc d'image de l'administrateur (`ImageField.vue` : PNG, WebP, SVG). L'application n'ouvre donc
 * qu'un sélecteur d'IMAGES de ces trois formats, jamais un sélecteur de fichiers quelconque, et ne rend à la page qu'UNE adresse `content://`
 * que l'utilisateur a choisie. Aucune permission : c'est le sélecteur du système qui lit le fichier et en accorde la lecture.
 */
sealed interface FileChooserPlan {
    /** Ouvrir le sélecteur du système, limité à ces types MIME (au moins un, dans l'ordre de [FileChooserRules.ALLOWED_TYPES]). */
    data class Pick(val mimeTypes: List<String>) : FileChooserPlan

    /** Ne rien ouvrir : la page reçoit « aucun fichier » tout de suite. */
    data object Refuse : FileChooserPlan
}

object FileChooserRules {
    /** Les formats que le serveur accepte pour une image de rayon ou de type de recette (le JPEG ne gère pas la transparence). */
    val ALLOWED_TYPES: List<String> = listOf("image/png", "image/webp", "image/svg+xml")

    /** `FileChooserParams.MODE_OPEN` : choisir UN fichier (les modes « plusieurs » et « enregistrer » sont refusés). */
    const val MODE_OPEN = 0

    private val EXTENSIONS = mapOf(".png" to "image/png", ".webp" to "image/webp", ".svg" to "image/svg+xml")

    /**
     * Le plan pour une demande de la page : [acceptTypes] (l'attribut `accept` : types MIME, jokers « image barre étoile » et extensions `.png`, avec ou sans
     * virgules) et [mode] (`FileChooserParams.getMode()`). On ne garde que ce que le serveur accepte ; une demande sans `accept`, d'autres formats
     * seulement, ou un mode autre que « choisir un fichier » est refusée.
     */
    fun plan(acceptTypes: List<String>?, mode: Int): FileChooserPlan {
        if (mode != MODE_OPEN) return FileChooserPlan.Refuse
        val wanted = acceptTypes.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .flatMap(::allowedFor)
            .toSet()
        val types = ALLOWED_TYPES.filter { it in wanted }
        return if (types.isEmpty()) FileChooserPlan.Refuse else FileChooserPlan.Pick(types)
    }

    private fun allowedFor(token: String): List<String> = when {
        token == "image/*" -> ALLOWED_TYPES
        token in ALLOWED_TYPES -> listOf(token)
        else -> listOfNotNull(EXTENSIONS[token])
    }

    /**
     * Ce que le sélecteur du système a rendu ([uris], les adresses en texte) : UNE adresse `content://` à donner à la page, ou `null` (annulation,
     * rien de reçu, ou un résultat qu'on ne croit pas). Le résultat vient d'une autre application : une adresse `file://` donnerait à la page
     * n'importe quel fichier de l'application, une adresse de nos propres fournisseurs ([ownPackage] : le fichier de mise à jour) aussi, et on
     * n'a demandé qu'un fichier.
     */
    fun choice(uris: List<String>?, ownPackage: String): String? {
        val single = uris?.singleOrNull()?.trim() ?: return null
        if (!single.startsWith(CONTENT_SCHEME, ignoreCase = true)) return null
        val authority = single.substring(CONTENT_SCHEME.length).substringBefore('/').substringBefore('?').substringBefore('#').lowercase()
        if (authority.isEmpty() || '@' in authority || ':' in authority) return null
        val own = ownPackage.lowercase()
        if (authority == own || authority.startsWith("$own.")) return null
        return single
    }

    private const val CONTENT_SCHEME = "content://"
}

/**
 * La demande de fichier en cours : au plus UNE à la fois, et chacune est toujours rendue à la page (un fichier, ou `null`), sinon le champ reste
 * bloqué. Générique pour ne pas nommer la classe d'Android qui porte la réponse (`ValueCallback`).
 *
 * Chaque demande a son numéro ([begin]) : le résultat du sélecteur d'une demande remplacée ou abandonnée, qui arrive après, ne répond jamais à la
 * demande suivante ([take] ne rend la réponse que pour le numéro courant).
 */
class PendingFileChoice<T : Any> {
    /**
     * Une nouvelle demande : son [requestCode] (pour le sélecteur) et la demande [replaced] qu'elle remplace, à fermer par « aucun fichier » (son sélecteur,
     * s'il est encore ouvert, est celui de [replacedRequestCode]).
     */
    class Started<T : Any>(val requestCode: Int, val replaced: T?, val replacedRequestCode: Int?)

    private var pending: T? = null
    private var generation = 0

    val isWaiting: Boolean get() = pending != null

    fun begin(callback: T): Started<T> {
        val replaced = pending
        val replacedRequestCode = FIRST_REQUEST_CODE + generation
        pending = callback
        generation = (generation + 1) % WINDOW
        return Started(FIRST_REQUEST_CODE + generation, replaced, replacedRequestCode.takeIf { replaced != null })
    }

    /** La réponse à rendre pour ce [requestCode], une seule fois ; `null` si ce n'est pas la demande courante (résultat périmé) ou si rien n'attend. */
    fun take(requestCode: Int): T? {
        if (requestCode != FIRST_REQUEST_CODE + generation) return null
        return abandon()
    }

    /** La demande en cours, à fermer par « aucun fichier » (l'écran se ferme, une panne d'ouverture) ; `null` si rien n'attend. */
    fun abandon(): T? {
        val callback = pending
        pending = null
        return callback
    }

    /** Vrai si ce numéro appartient à une demande de fichier, courante ou périmée (à ne pas confondre avec la mise à jour de l'application, `0x7e01`). */
    fun owns(requestCode: Int): Boolean = requestCode in FIRST_REQUEST_CODE until FIRST_REQUEST_CODE + WINDOW

    companion object {
        const val FIRST_REQUEST_CODE = 0x7e20
        const val WINDOW = 16
    }
}
