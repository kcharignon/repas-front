/** Le nom d'un type de liste : 40 caractères au plus (le back le refuse au-delà, `LIST_TYPE_NAME_INVALID`). */
export const NAME_MAX_LENGTH = 40

/** Les refus du back qui parlent du NOM : ils se disent sous le champ, pas dans l'écran. */
export const NAME_CODES: readonly string[] = [
  'LIST_TYPE_NAME_ALREADY_USED',
  'LIST_TYPE_NAME_INVALID',
]
