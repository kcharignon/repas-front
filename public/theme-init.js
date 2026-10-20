// Pose le thème enregistré sur <html> avant le premier affichage (pas d'éclair du mauvais thème). Même lecture que
// `applyStoredTheme()` de src/design/theme.ts (clé `repas.theme`) ; un test garde les deux d'accord. Fichier à part : la CSP interdit les scripts en ligne.
;(function () {
  var value = null
  try {
    value = localStorage.getItem('repas.theme')
  } catch {
    // Stockage indisponible : le thème suit le système.
  }
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value
  else document.documentElement.removeAttribute('data-theme')
})()
