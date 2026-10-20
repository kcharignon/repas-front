package eu.kantin.repas.drive

/**
 * Les seules adresses que la mise à jour de l'application contacte (DRV-639), écrites ICI, en dur, et nulle part ailleurs. Aucune ne vient
 * de la page de Repas, d'un message du pont ou du contenu de `version.json`.
 *
 * - [VERSION_JSON_URL] : le `version.json` de la dernière version publiée, à une adresse fixe. C'est celui de la release « roulante »
 *   d'étiquette `android-latest`, que le workflow de publication remplace à chaque version de l'application (les releases `android-vX.Y.Z`
 *   sont publiées sans l'étiquette « Latest » de GitHub, qui reste aux versions du site : `releases/latest/download/` ne mène donc pas à
 *   l'application).
 * - [INSTALL_APK_URL] : l'APK de la dernière version, à adresse fixe aussi ; c'est le bouton de la page publique `/installer` du site. La
 *   mise à jour dans l'application, elle, télécharge l'APK de la release de la version annoncée ([apkUrl]), qui ne change plus jamais : pas
 *   de fenêtre pendant laquelle `version.json` et l'APK de la release roulante seraient de deux versions différentes.
 *
 * Un téléchargement de pièce jointe de GitHub est une redirection HTTPS vers un autre hôte de GitHub : seuls ceux de [DOWNLOAD_HOSTS]
 * sont suivis, un par un, à chaque redirection ([isTrustedRedirect]). Kotlin pur : se teste sans téléphone.
 */
object UpdateSource {
    /** Le dépôt qui publie l'application. */
    private const val RELEASES = "https://github.com/kcharignon/repas-front/releases/download/"

    /** L'étiquette de la release roulante : toujours la dernière version publiée. */
    const val ROLLING_TAG = "android-latest"

    /** Le nom de l'APK dans chaque release. */
    const val APK_FILE_NAME = "repas-drive.apk"

    /** Le `version.json` de la dernière version. L'application ne lit que celui-là. */
    const val VERSION_JSON_URL = RELEASES + ROLLING_TAG + "/version.json"

    /** L'APK de la dernière version, pour l'installation initiale (page `/installer` du site). L'adresse du site est dans `src/features/drive/appInstall.ts`. */
    const val INSTALL_APK_URL = RELEASES + ROLLING_TAG + "/" + APK_FILE_NAME

    /**
     * Les hôtes vers lesquels GitHub redirige le téléchargement d'une pièce jointe de release : noms exacts, en minuscules, sans port.
     * `release-assets.githubusercontent.com` est celui observé le 2026-10-20 ; les deux autres sont les anciens noms du même service.
     * Si GitHub en change, la mise à jour s'arrête avec `UNTRUSTED_ADDRESS` (rien n'est installé) : on l'ajoute ici, en le sachant.
     */
    val DOWNLOAD_HOSTS: Set<String> = setOf(
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
        "github-releases.githubusercontent.com",
    )

    /** Au plus ce nombre de redirections suivies pour une demande. */
    const val MAX_REDIRECTS = 4

    /** `version.json` tient en quelques centaines d'octets. */
    const val MAX_VERSION_JSON_BYTES = 16 * 1024

    /** L'APK pèse environ 2 Mo ; au-delà de cette taille le téléchargement est abandonné et le fichier effacé. */
    const val MAX_APK_BYTES: Long = 25L * 1024 * 1024

    /** Une adresse de redirection plus longue est refusée (les adresses signées de GitHub font environ 1 200 caractères). */
    private const val MAX_URL_LENGTH = 4096

    // Le caractère « @ » (identifiant avant l'hôte), la barre oblique inverse, l'espace et tout caractère hors ASCII n'y sont pas : l'hôte
    // est lu en entier par l'expression, et seul un « / », un « ? » ou la fin peut le suivre.
    private val CDN_URL = Regex("""^https://([a-z0-9.-]+)(/[A-Za-z0-9._~%/+=&:,;-]*)?(\?[A-Za-z0-9._~%/+=&:,;?-]*)?$""")
    private val RELEASE_FILE_URL =
        Regex("""^https://github\.com/kcharignon/repas-front/releases/download/(android-latest|android-v(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2}))/(version\.json|repas-drive\.apk)$""")

    /** L'adresse de l'APK de la release de la version [versionName] (`X.Y.Z`, déjà validée par [ReleaseInfo]), ou `null`. */
    fun apkUrl(versionName: String): String? =
        if (ReleaseInfo.isVersionName(versionName)) "${RELEASES}android-v$versionName/$APK_FILE_NAME" else null

    /**
     * Une adresse à laquelle l'application accepte d'ADRESSER une première demande : `version.json` ou l'APK d'une release du dépôt, sur
     * `github.com`, en `https`, sans port, sans identifiant, sans paramètre.
     */
    fun isReleaseFile(url: String): Boolean = url.length <= MAX_URL_LENGTH && RELEASE_FILE_URL.matches(url)

    /**
     * Une adresse de redirection (l'en-tête `Location` reçu) que l'application accepte de suivre : un fichier de release de `github.com`
     * (même forme que [isReleaseFile]) ou une adresse en `https` dont l'hôte est exactement l'un de [DOWNLOAD_HOSTS] (aucun port, aucun
     * identifiant, aucun caractère inattendu). Une adresse relative, `http`, d'un autre hôte, ou mal formée est refusée.
     */
    fun isTrustedRedirect(location: String?): Boolean {
        if (location == null || location.length > MAX_URL_LENGTH) return false
        if (isReleaseFile(location)) return true
        val host = CDN_URL.matchEntire(location)?.groupValues?.get(1) ?: return false
        return host in DOWNLOAD_HOSTS
    }
}
