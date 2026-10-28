// Pose le thème enregistré et la saison sur <html> avant le premier affichage (pas d'éclair du mauvais thème). Même lecture que
// `applyStoredTheme()` (clé `repas.theme`) et `applySeason()` (clé `repas.season`, registre `DEFINITIONS` et règles de dates) de src/design ; un test garde les deux d'accord. Fichier à part : la CSP interdit les scripts en ligne.
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
    disabled = (localStorage.getItem('repas.season') || '').split(',').map(function (name) {
      return name === 'off' ? 'halloween' : name
    })
  } catch {
    // Stockage indisponible : le décor reste activé.
  }
  // LES SAISONS, dans l'ordre de l'année, comme `DEFINITIONS` de src/design/season.ts (même clé, même couleur de barre, même règle) :
  // la galette du 6 janvier au 2 février, Pâques du dimanche de Pâques moins 21 jours au lundi de
  // Pâques inclus (date calculée), Halloween du 15 octobre au 1er novembre, Noël du 15 novembre au 5 janvier. Jour local de l'appareil,
  // l'année ne compte que pour Pâques. Une saison nouvelle s'ajoute ici.
  // Le dimanche de Pâques (calendrier grégorien : Meeus, Jones et Butcher), à minuit, heure locale.
  function easterSunday(year) {
    var a = year % 19
    var b = Math.floor(year / 100)
    var c = year % 100
    var d = Math.floor(b / 4)
    var e = b % 4
    var f = Math.floor((b + 8) / 25)
    var g = Math.floor((b - f + 1) / 3)
    var h = (19 * a + b - d - g + 15) % 30
    var i = Math.floor(c / 4)
    var k = c % 4
    var l = (32 + 2 * e + 2 * i - h - k) % 7
    var m = Math.floor((a + 11 * h + 22 * l) / 451)
    var month = Math.floor((h + l - 7 * m + 114) / 31)
    return new Date(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1)
  }
  var seasons = [
    {
      key: 'galette',
      color: '#223b86',
      includes: function (date) {
        var month = date.getMonth()
        var day = date.getDate()
        return (month === 0 && day >= 6) || (month === 1 && day <= 2)
      },
    },
    {
      key: 'paques',
      color: '#6a50b0',
      includes: function (date) {
        var year = date.getFullYear()
        var sunday = easterSunday(year)
        var day = new Date(year, date.getMonth(), date.getDate()).getTime()
        var from = new Date(year, sunday.getMonth(), sunday.getDate() - 21).getTime()
        var to = new Date(year, sunday.getMonth(), sunday.getDate() + 1).getTime()
        return day >= from && day <= to
      },
    },
    {
      key: 'halloween',
      color: '#43206b',
      includes: function (date) {
        var month = date.getMonth()
        var day = date.getDate()
        return (month === 9 && day >= 15) || (month === 10 && day === 1)
      },
    },
    {
      key: 'noel',
      color: '#7a1530',
      includes: function (date) {
        var month = date.getMonth()
        var day = date.getDate()
        return (month === 10 && day >= 15) || month === 11 || (month === 0 && day <= 5)
      },
    },
  ]
  var now = new Date()
  var current = null
  for (var index = 0; index < seasons.length && current === null; index++) {
    if (seasons[index].includes(now)) current = seasons[index]
  }
  if (current !== null && disabled.indexOf(current.key) !== -1) current = null
  if (current) root.dataset.season = current.key
  else root.removeAttribute('data-season')
  var color = document.querySelector('meta[name="theme-color"]')
  if (color) color.setAttribute('content', current ? current.color : '#1E6B4C')
})()
