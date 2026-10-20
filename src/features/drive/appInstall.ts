/**
 * La page des versions de l'application Android « Repas » (DRV-315 y publie les APK signés, étiquettes `android-vX.Y.Z`). Une seule
 * constante : l'aide d'installation (DRV-316) et les réglages du drive (DRV-403) y mènent.
 */
export const APP_RELEASES_URL = 'https://github.com/kcharignon/repas-front/releases'

/**
 * L'APK de la dernière version, à une adresse FIXE (DRV-639) : le bouton de la page publique `/installer`. C'est celui de la release « roulante »
 * d'étiquette `android-latest`, que le workflow de publication remplace à chaque version (les releases `android-vX.Y.Z` n'ont pas l'étiquette
 * « Latest » de GitHub, qui reste aux versions du site : `releases/latest/download/` ne mène donc pas à l'application). GitHub redirige le
 * téléchargement vers un autre de ses hôtes : le navigateur le suit. Doit rester identique à `UpdateSource.INSTALL_APK_URL` de l'application
 * (`android/core`) ; `src/features/drive/__tests__/appInstall.spec.ts` le vérifie.
 */
export const APP_APK_URL =
  'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk'
