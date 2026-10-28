// Pose le thème enregistré et la saison sur <html> avant le premier affichage (pas d'éclair du mauvais thème). Même lecture que
// `applyStoredTheme()` (clé `repas.theme`) et `applySeason()` (clé `repas.season`, règles de dates `isHalloweenSeason` et
// `isNoelSeason`) de src/design ; un test garde les deux d'accord. Fichier à part : la CSP interdit les scripts en ligne.
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

  // Les saisons que l'utilisateur a coupées : une liste séparée par des virgules (`noel`, `halloween,noel`) ; `off`, l'ancienne
  // valeur de la version d'Halloween seule, vaut `halloween`.
  var disabled = []
  try {
    disabled = (localStorage.getItem('repas.season') || '')
      .split(',')
      .map(function (name) {
        return name === 'off' ? 'halloween' : name
      })
  } catch {
    // Stockage indisponible : le décor reste activé.
  }
  // Halloween : du 15 octobre au 1er novembre. Noël : du 15 novembre au 5 janvier. Jour local de l'appareil, l'année ne compte pas.
  var now = new Date()
  var month = now.getMonth()
  var day = now.getDate()
  var name = null
  if ((month === 9 && day >= 15) || (month === 10 && day === 1)) name = 'halloween'
  else if ((month === 10 && day >= 15) || month === 11 || (month === 0 && day <= 5)) name = 'noel'
  if (name !== null && disabled.indexOf(name) !== -1) name = null
  if (name) root.dataset.season = name
  else root.removeAttribute('data-season')
  var color = document.querySelector('meta[name="theme-color"]')
  if (color) color.setAttribute('content', name === 'halloween' ? '#43206b' : name === 'noel' ? '#7a1530' : '#1E6B4C')
})()
