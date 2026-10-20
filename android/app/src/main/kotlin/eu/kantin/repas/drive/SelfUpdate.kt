package eu.kantin.repas.drive

/**
 * Ce que la coquille attend de la mise à jour dans l'application (DRV-639) : l'application cherche une version plus récente, la télécharge,
 * la vérifie et ouvre l'installateur d'Android, sans passer par GitHub ni par le dossier de téléchargements.
 *
 * Cette interface est tout ce que le code commun en sait. Elle a DEUX réalisations, une par variante de distribution
 * (`flavorDimensions` de `app/build.gradle.kts`) :
 * - `direct` (`app/src/direct`) : l'APK de la release GitHub, installé à la main ; elle fait tout, et c'est la seule qui déclare la permission
 *   « installer des applications » ;
 * - `play` (`app/src/play`) : la version de Google Play (à venir) ; Google interdit à une application distribuée par Play de s'installer
 *   ailleurs, elle ne contient donc ni la permission ni le code de mise à jour, seulement un remplaçant (`NoSelfUpdate`) qui répond « non » à tout.
 *
 * Chaque variante définit `createSelfUpdate` ; le code commun l'appelle sans savoir laquelle est là.
 */
internal interface SelfUpdate {
    /** Cette construction sait se mettre à jour elle-même (dit par `app.info`, clé `selfUpdate`). Faux : la page garde l'ancien comportement. */
    val supported: Boolean

    /** `update.status` : poste à la page l'état actuel. */
    fun status()

    /** `update.check` : cherche une version plus récente. */
    fun check()

    /** `update.start` : télécharge, vérifie et ouvre l'installateur d'Android. */
    fun start()

    /** `update.cancel` : arrête le téléchargement et efface le fichier. */
    fun cancel()

    /** La coquille revient au premier plan (retour des réglages d'Android où l'installation est autorisée). */
    fun onResume()

    /** L'écran d'installation d'Android s'est refermé. */
    fun onInstallerResult(requestCode: Int, resultCode: Int)

    /** La coquille est détruite : rien ne doit rester en cours. */
    fun close()
}

// Définie dans chaque variante : `createSelfUpdate(activity, post)` rend la mise à jour de la coquille (`post` envoie un message JSON à la page de
// Repas, sur le fil principal). La variante `direct` y efface aussi ce qu'une mise à jour précédente a laissé : au démarrage de la coquille
// (jamais au démarrage du processus, que le fournisseur de fichiers peut provoquer pendant qu'Android installe).
