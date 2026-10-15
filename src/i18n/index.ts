import { createI18n } from 'vue-i18n'

import fr from './fr'

export const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr },
  datetimeFormats: { fr: { long: { day: 'numeric', month: 'long', year: 'numeric' } } },
  // Un texte manquant doit se voir en test : on ne le tait pas.
  missingWarn: true,
  fallbackWarn: true,
})
