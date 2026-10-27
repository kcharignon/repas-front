// Pose le thème enregistré et la saison sur <html> avant le premier affichage (pas d'éclair du mauvais thème). Même lecture que
// `applyStoredTheme()` (clé `repas.theme`) et `applySeason()` (clé `repas.season`, règle de dates `isHalloweenSeason`) de src/design ;
// un test garde les deux d'accord. Fichier à part : la CSP interdit les scripts en ligne.
;(function () {
  var root = document.documentElement
  var value = null
  try {
    value = localStorage.getItem('repas.theme')
  } catch {
    // Stockage indisponible : le thème suit le système.
  }
  if (value === 'light' || value === 'dark') root.dataset.theme = value
  else root.removeAttribute('data-theme')

  // Thème saisonnier : du 15 octobre au 1er novembre (jour local), sauf si l'utilisateur l'a coupé.
  var off = false
  try {
    off = localStorage.getItem('repas.season') === 'off'
  } catch {
    // Stockage indisponible : le décor reste activé.
  }
  var now = new Date()
  var month = now.getMonth()
  var day = now.getDate()
  var season = !off && ((month === 9 && day >= 15) || (month === 10 && day === 1))
  if (season) root.dataset.season = 'halloween'
  else root.removeAttribute('data-season')
  var color = document.querySelector('meta[name="theme-color"]')
  if (color) color.setAttribute('content', season ? '#43206b' : '#1E6B4C')
})()
