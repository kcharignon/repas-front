// Le compte de l'enseigne : une seule définition, lue par l'adaptateur (où est-on) et par la lecture de la page (que dit la carte).

/** Les pages du COMPTE de l'enseigne : `fd<N>-espace-client` (connexion, création de compte, compte). Ancré : un autre site qui ressemble n'en est pas un. */
export const ACCOUNT_HOST = /^fd\d{1,3}-espace-client\.leclercdrive\.fr$/

/** Le compte de la personne connectée (`home-espace-client-ccc.aspx`) n'est pas une page de connexion. */
export const ACCOUNT_HOME = /home-espace-client/i

/** Une page du compte de l'enseigne qui n'est pas le compte connecté : une page de connexion, même d'un chemin que la liste ne connaît pas. */
export function isAccountLoginPage(hostname: string, pathname: string): boolean {
  return ACCOUNT_HOST.test(hostname.toLowerCase()) && !ACCOUNT_HOME.test(pathname)
}
