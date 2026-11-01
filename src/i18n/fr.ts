// Tous les textes de l'interface, en français (aucune chaîne en dur dans les composants).
export default {
  app: {
    name: 'Repas',
    tagline: 'Recettes, ingrédients et listes de courses.',
  },
  nav: {
    label: 'Navigation principale',
    shoppingList: 'Liste',
    recipes: 'Recettes',
    departments: 'Rayons',
    account: 'Moi',
    accountUpdate: 'Moi, une nouvelle version est prête',
  },
  common: {
    loading: 'Chargement…',
    close: 'Fermer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    clearSearch: 'Effacer la recherche',
  },
  // L'équation d'une conversion (ConversionEquation.vue) : « 8 tasses = 1 kilo », la phrase se lit en direct
  conversion: {
    legend: 'La conversion',
    startQuantity: 'Quantité de départ',
    startUnit: 'Unité de départ',
    endQuantity: "Quantité d'arrivée",
    endUnit: "Unité d'arrivée",
    equals: 'égale',
    swap: 'Inverser les deux côtés',
    waiting: 'Écris les deux nombres : la conversion se lit ici.',
    choose: 'Choisis une unité',
    sentence: '1 {start} = {end}, et 1 {reverseStart} = {reverseEnd}.',
    sentenceNamed: '{name} : {left} = {right}.',
    sentenceOwn: '{left} = {right}.',
    question: 'Dans {left}, combien {unit} ?',
    alreadyConvertible: 'Elles se convertissent déjà ; tu peux préciser.',
    errors: {
      number: 'Entre un nombre supérieur à zéro.',
      sameUnit: 'Choisis deux unités différentes.',
      noUnit: 'Choisis les deux unités.',
    },
  },
  notFound: {
    title: 'Page introuvable',
    help: 'Cette adresse n’existe pas ou plus.',
    back: 'Retour à la liste',
  },
  offline: {
    banner:
      'Hors connexion : tu vois la dernière version enregistrée. Les modifications sont impossibles tant que le réseau n’est pas revenu.',
    savedAt: 'Liste enregistrée le {date}.',
  },
  admin: {
    title: 'Administration',
    help: 'Les référentiels de l’application : unités, rayons, types de recette, conversions, utilisateurs.',
    units: 'Unités',
    departments: 'Rayons',
    recipeTypes: 'Types de recette',
    conversions: 'Conversions',
    users: 'Utilisateurs',
    none: 'Rien pour le moment.',
    formHelp: 'Renseigne les champs puis enregistre.',
    edit: 'Modifier',
    editNamed: 'Modifier {name}',
    name: 'Nom',
    symbol: 'Symbole',
    symbolHint: 'Peut rester vide (par exemple pour « unité »).',
    dimension: 'Ce que l’unité mesure',
    dimensionHint: 'Sert à calculer combien de produits acheter.',
    noDimension: 'Aucune (cuillère, tranche…)',
    dimensions: {
      WEIGHT: 'Poids',
      VOLUME: 'Volume',
      COUNT: 'Nombre de pièces',
      PACKAGE: 'Conditionnement',
    },
    baseFactor: 'Facteur de base',
    baseFactorHint:
      'Combien d’unités de base (gramme, millilitre, pièce) vaut cette unité : 1000 pour le kilo, 1 pour le gramme ou pour un conditionnement.',
    unitMeasure: '{dimension}, × {factor}',
    image: 'Image',
    imageHint: 'Adresse de l’image, par exemple images/department/fruits.png.',
    // L'icône d'un rayon (ING-016) : elle se pose devant les ingrédients du rayon pour les distinguer de ceux d'un autre rayon
    icon: 'Icône',
    iconHint: 'Elle s’affiche devant les ingrédients de ce rayon.',
    iconNone: 'Aucune',
    icons: {
      snowflake: 'Flocon',
      can: 'Boîte',
    },
    order: "Ordre d'affichage",
    orderHint: 'Les types sont affichés du plus petit au plus grand.',
    orderN: 'Ordre {n}',
    newUnit: 'Nouvelle unité',
    editUnit: "Modifier l'unité",
    newDepartment: 'Nouveau rayon',
    editDepartment: 'Modifier le rayon',
    newRecipeType: 'Nouveau type de recette',
    editRecipeType: 'Modifier le type de recette',
    deleteTypeNamed: 'Supprimer {name}',
    deleteTypeTitle: 'Supprimer ce type de recette ?',
    deleteTypeHelp:
      'Les recettes de « {name} » passent dans le type que tu choisis, pour tous les utilisateurs. Cette action est irréversible.',
    transferTo: 'Où vont ses recettes ?',
    transferPlaceholder: 'Choisis un type',
    transferNone: 'Il faut un autre type pour recevoir ses recettes.',
    typeDeleted: '« {name} » est supprimé. Ses recettes sont dans « {target} ».',
    newConversion: 'Nouvelle conversion',
    editConversion: 'Modifier la conversion',
    ingredient: 'Ingrédient',
    allIngredients: 'Tous les ingrédients',
    conversionLine: '1 {start} = {coefficient} {end}',
    administrator: 'Administrateur',
    status: {
      PENDING: 'En attente',
      ACTIVE: 'Actif',
      DISABLED: 'Désactivé',
    },
    statusChanged: 'Statut de {email} modifié.',
    userDeleted: '{email} supprimé.',
    deleteNamed: 'Supprimer {email}',
    deleteUserTitle: 'Supprimer ce compte ?',
    deleteUserHelp:
      'Le compte {email} disparaît avec ses listes de courses, ses recettes et ses ingrédients personnalisés, comme s’il n’avait jamais existé. Les recettes qu’un autre utilisateur en a copiées restent. Cette action est irréversible.',
    // Vue des utilisateurs : synthèse, filtres, colonnes, dernière connexion, actions
    summary: '{n} compte | {n} comptes',
    summaryPending: '{n} en attente',
    filtersLabel: 'Filtrer les comptes',
    filters: {
      ALL: 'Tous',
      PENDING: 'En attente ({n})',
      ACTIVE: 'Actifs ({n})',
      DISABLED: 'Désactivés ({n})',
    },
    noneInFilter: 'Aucun compte dans cette catégorie.',
    columns: {
      user: 'Utilisateur',
      lastLogin: 'Dernière connexion',
      activity: 'Activité',
      app: 'Application',
      status: 'Statut',
    },
    lastLoginLabel: 'Dernière connexion :',
    lastLogin: {
      never: 'Pas encore vu',
      now: 'à l’instant',
      minutes: 'il y a {n} min',
      hours: 'il y a {n} h',
      yesterday: 'hier',
      days: 'il y a {n} j',
    },
    registered: 'Inscrit le {date}',
    recipeCount: 'aucune recette | {n} recette | {n} recettes',
    ingredientCount: 'aucun ingrédient | {n} ingrédient | {n} ingrédients',
    listCount: 'aucune liste | {n} liste | {n} listes',
    appLabel: 'Application',
    appVersionUnknown: 'inconnue',
    moreActions: 'Plus d’actions pour {email}',
    activate: 'Activer',
    reactivate: 'Réactiver',
    setPending: 'Mettre en attente',
    disable: 'Désactiver',
    activateNamed: 'Activer {email}',
    reactivateNamed: 'Réactiver {email}',
    ownAccountHint: 'C’est ton compte',
    pendingHint:
      'Un compte activé ici peut être sans mot de passe. La personne en choisit un avec « Mot de passe oublié ? ».',
    appOutdated: 'À mettre à jour',
    errors: {
      name: 'Donne un nom.',
      image: 'Indique une image.',
      order: 'Indique un ordre.',
      baseFactor: 'Entre un nombre supérieur à zéro, ou laisse vide.',
      protectedAccount: 'Ce compte est protégé : il reste actif et ne se supprime pas.',
      ownAccount: 'Tu ne peux pas supprimer ton propre compte.',
    },
  },
  departments: {
    title: 'Rayons',
    help: 'Ajoute des ingrédients à ta liste de courses, rayon par rayon.',
    none: 'Aucun rayon pour le moment.',
    search: 'Rechercher un ingrédient',
    results: "Résultats de la recherche d'ingrédient",
    count: '{count} résultat | {count} résultats',
    noMatch: 'Aucun ingrédient ne ressemble à « {search} ».',
    goTo: 'Aller au rayon {name}',
  },
  ingredients: {
    new: 'Nouvel ingrédient',
    none: 'Aucun ingrédient dans ce rayon.',
    less: 'Un de moins : {name}',
    more: 'Un de plus : {name}',
    newTitle: 'Nouvel ingrédient',
    editTitle: "Modifier l'ingrédient",
    name: "Nom de l'ingrédient",
    department: 'Rayon',
    cookingUnit: 'Unité des recettes',
    cookingUnitHint: 'Celle dans laquelle tes recettes le comptent.',
    purchaseUnit: "Unité d'achat",
    purchaseUnitHint: 'Celle de la liste de courses.',
    conversionHint:
      'Par exemple : 1 bouteille = 75 centilitres. Laisse le nombre de droite vide si les deux unités se convertissent déjà.',
    deleteTitle: "Supprimer l'ingrédient ?",
    deleteHelp: '« {name} » sera supprimé avec ses conversions.',
    inUse: 'Impossible : cet ingrédient est utilisé dans une recette ou une liste de courses.',
    // Le même nom dans deux rayons (ING-016, ING-017) : permis ; dans le même rayon, refusé (409 INGREDIENT_NAME_ALREADY_USED)
    nameUsed: 'Tu as déjà « {name} » dans {department}. Choisis-le plutôt que d’en créer un autre.',
    nameElsewhere: 'Tu as déjà « {name} » dans {department}. Celui-ci sera dans {chosen}.',
    // Ingrédient de base (ING-015) : l'interrupteur de la fiche et la pastille du rayon, pour le seul propriétaire du catalogue
    baseSwitch: 'Ingrédient de base',
    baseHint: 'Copié dans les nouveaux comptes.',
    baseBadge: 'de base',
    // « Liste de courses » d'un produit (LST-007, ADR 0036) : visible seulement avec au moins un type de liste
    list: {
      label: 'Liste de courses',
      follow: 'Comme son rayon',
      theMain: 'la liste principale',
      helpFollow: 'Ce produit ira dans {list}, comme son rayon.',
      helpMain: 'Ce produit ira dans la liste principale, quel que soit son rayon.',
      helpType: 'Ce produit ira dans {list}, quel que soit son rayon.',
    },
    // Les conversions propres à un ingrédient (fiche de l'ingrédient) : « 1 tasse = 125 g », ajoutées, modifiées, retirées par son propriétaire
    conversions: {
      title: 'Conversions de {name}',
      none: 'Aucune conversion à toi pour l’instant.',
      line: '1 {start} = {end}',
      editNamed: 'Modifier : {line}',
      removeNamed: 'Supprimer : {line}',
      universal: 'Pour tout le monde : {line}',
      showAll: 'Voir tout',
      showLess: 'Voir moins',
      add: 'Ajouter une conversion',
      newTitle: 'Nouvelle conversion',
      editTitle: 'Modifier la conversion',
      deleteTitle: 'Supprimer cette conversion ?',
      deleteHelp: '« {line} » sera supprimée.',
      canConvert: 'La recette peut se convertir en {unit}.',
      missing: 'Il manque une conversion entre {cooking} et {purchase}.',
    },
    // Ingrédients à régler : pas de conversion entre l'unité des recettes et celle du magasin
    toFix: {
      title: 'Ingrédients à régler',
      help: 'Ces ingrédients n’ont pas de conversion entre l’unité de tes recettes et celle du magasin : Alexa et ta liste ne peuvent pas calculer leurs quantités.',
      link: '{count} ingrédient à régler | {count} ingrédients à régler',
      count: '{count} ingrédient à régler | {count} ingrédients à régler',
      units: 'Recettes : {cooking} · Magasin : {purchase}',
      fix: 'Régler',
      fixNamed: 'Régler la conversion de {name}',
      openNamed: 'Ouvrir la fiche de {name}',
      more: 'et {count} autre | et {count} autres',
      none: 'Tout est réglé.',
      failed: 'Les ingrédients à régler ne se sont pas affichés. Rien n’a changé.',
      retry: 'Réessayer',
    },
    // Doublons possibles et fusion de deux ingrédients (ING-007)
    duplicates: {
      title: 'Doublons possibles',
      help: 'Ces ingrédients se ressemblent dans le même rayon. Fusionne-les pour que tes recettes retombent sur un seul.',
      link: '{count} doublon possible | {count} doublons possibles',
      linkMany: 'Plus de {max} doublons possibles',
      none: 'Aucun doublon pour le moment.',
      failed: 'Les doublons ne se sont pas affichés. Rien n’a changé.',
      retry: 'Réessayer',
      keep: 'À garder',
      keepGroup: 'Ingrédient à garder',
      pair: '{first} = {second}',
      open: 'Voir et fusionner',
      openNamed: 'Voir et fusionner {first} et {second}',
      merge: 'Fusionner',
      mergeNamed: 'Fusionner {absorbed} dans {kept}',
      distinct: 'Pas le même',
      distinctNamed: 'Pas le même : {first} et {second}',
      distinctDone: 'Ces deux ingrédients restent séparés.',
      distinctFailed: 'Ce choix n’a pas été enregistré. Rien n’a changé. Réessaie.',
    },
    merge: {
      recipes: '{count} recette | {count} recettes',
      lists: '{count} liste | {count} listes',
      listsFull: '{count} liste de courses | {count} listes de courses',
      and: 'et',
      moves: '{what} passe sur « {name} ». | {what} passent sur « {name} ».',
      uses: '{what} utilisera « {name} ». | {what} utiliseront « {name} ».',
      total: '« {name} » sera utilisé dans {usage}.',
      replaced: '« {absorbed} » est remplacé par « {kept} » dans {usage}.',
      conversions:
        '{count} conversion de « {absorbed} » est ajoutée à « {kept} ». | {count} conversions de « {absorbed} » sont ajoutées à « {kept} ».',
      unused: '« {name} » n’est utilisé nulle part.',
      usedIn: 'Utilisé dans {usage}',
      usedNowhere: 'Utilisé nulle part',
      action: 'Fusionner avec un autre ingrédient',
      pickerTitle: 'Fusionner « {name} » avec…',
      pickerHelp:
        '« {name} » disparaît : ses recettes et ses listes passent sur l’ingrédient choisi.',
      search: 'Chercher un ingrédient',
      sameDepartment: 'Dans le même rayon · {department}',
      otherDepartments: 'Autres rayons',
      veryClose: 'Très proche',
      noMatch: 'Aucun ingrédient ne ressemble à « {search} ».',
      searchFailed: 'La recherche n’a pas abouti. Rien n’a changé.',
      title: 'Fusionner « {absorbed} » dans « {kept} » ?',
      unitMissingTitle: '« {name} » ne connaît pas toutes les unités.',
      unitMissing:
        'La quantité en {units} ne peut pas être convertie en « {unit} ». Rien n’a changé. | Les quantités en {units} ne peuvent pas être converties en « {unit} ». Rien n’a changé.',
      editKept: 'Modifier « {name} »',
      quantitiesSame: 'Tes quantités ne changent pas.',
      quantitiesConverted: 'Tes quantités en liste sont converties en « {unit} ».',
      departmentChanges: '« {name} » passe du rayon {from} au rayon {to}.',
      removed: '« {name} » est supprimé. Tu ne pourras pas le retrouver.',
      confirm: 'Fusionner',
      cancel: 'Annuler',
      understood: 'Compris',
      loading: 'Chargement de ce qui change…',
      previewFailed: 'Ce qui change ne s’est pas affiché. Rien n’a changé.',
      retry: 'Réessayer',
      done: 'Fusionné dans « {name} ».',
      conflict: 'Quelque chose a changé pendant la fusion. Réessaie.',
      failed: 'La fusion n’a pas eu lieu. Rien n’a changé. Réessaie.',
      gone: 'Cet ingrédient n’existe plus. La liste est à jour.',
      blocked: {
        SAME_INGREDIENT: 'Choisis deux ingrédients différents.',
        COMMON_INGREDIENT: 'Un ingrédient commun ne se fusionne pas. Rien n’a changé.',
        USED_BY_ANOTHER_USER: 'Quelqu’un d’autre utilise « {name} ». Rien n’a changé.',
        IN_SENT_LIST:
          'Une liste envoyée au drive utilise l’un des deux. Rouvre-la ou termine-la, puis fusionne.',
      },
      blockedOther: 'Ces deux ingrédients ne peuvent pas être fusionnés. Rien n’a changé.',
    },
    errors: {
      name: "Donne un nom à l'ingrédient.",
      protectedAccount: 'Ce compte est protégé : il reste actif et ne se supprime pas.',
      ownAccount: 'Tu ne peux pas supprimer ton propre compte.',
    },
  },
  recipes: {
    title: 'Recettes',
    others: 'Recettes des autres',
    secretBadge: 'Secrète',
    // Le type « Favoris » : il n'existe pas côté back, la liste l'ajoute en première position quand une recette est en favoris
    favorites: 'Favoris',
    favoriteAdd: 'Mettre {name} en favoris',
    favoriteRemove: 'Retirer {name} des favoris',
    search: 'Rechercher une recette',
    types: 'Types de recette',
    none: "Tu n'as pas encore de recette de ce type.",
    noMatch: 'Aucune recette ne correspond.',
    add: 'Ajouter',
    inList: 'Dans la liste',
    planNamed: 'Ajouter {name} à la liste de courses',
    inListNamed: 'Dans la liste, retirer {name}',
    unplanNamed: 'Retirer {name} de la liste de courses',
    ingredients: 'Ingrédients',
    // Un ingrédient qui ne se convertit pas dans l'unité du magasin : repéré sur sa ligne, réglé par l'auteur de la recette
    toFix: '{count} à régler',
    toFixHint: 'Va au premier ingrédient à régler',
    cannotConvert: 'Je ne sais pas convertir en {unit}',
    fix: 'Régler',
    fixNamed: 'Régler la conversion de {name}',
    blockedHint: 'Règle d’abord les ingrédients signalés.',
    forPeople: 'Pour {count} personne | Pour {count} personnes',
    new: 'Nouvelle recette',
    edit: 'Modifier',
    inUse:
      'Impossible : cette recette est dans une liste de courses. Retire-la de la liste d’abord.',
    deleteTitle: 'Supprimer la recette ?',
    deleteHelp:
      "« {name} » sera supprimée avec ses ingrédients. Impossible tant qu'elle est dans une liste de courses.",
    othersTitle: 'Recettes des autres',
    othersHelp: 'Copie une recette dans les tiennes pour la planifier et la modifier.',
    othersNone: 'Rien de nouveau à copier pour le moment.',
    othersSearch: 'Rechercher une recette des autres',
    othersResults: 'Résultats de la recherche',
    othersCount: '{count} recette | {count} recettes',
    othersNoMatch: 'Aucune recette ne ressemble à « {search} ».',
    othersMore: 'Voir plus',
    copy: 'Copier',
    copyNamed: 'Copier {name} dans mes recettes',
    copied: 'Copiée',
    copiedNamed: 'Copiée : {name} est dans tes recettes',
    copiedToast: '« {name} » est dans tes recettes.',
  },
  editor: {
    newTitle: 'Nouvelle recette',
    editTitle: 'Modifier la recette',
    backToRecipe: 'Retour à la recette',
    name: 'Nom de la recette',
    serving: 'Nombre de personnes',
    type: 'Type de recette',
    secret: 'Recette secrète',
    secretHint: 'Toi seul la vois. Les autres ne la trouvent pas dans « Recettes des autres ».',
    addRow: 'Ajouter un ingrédient',
    ingredientN: 'Ingrédient {n}',
    quantityN: "Quantité de l'ingrédient {n}",
    unitN: "Unité de l'ingrédient {n}",
    removeRow: "Retirer l'ingrédient {n}",
    ingredientPlaceholder: 'Choisir un ingrédient',
    noIngredient: 'Aucun ingrédient ne correspond.',
    // Créer l'ingrédient qu'on cherchait sans quitter la recette (ING-017)
    noIngredientNamed: 'Aucun ingrédient ne s’appelle « {name} ».',
    createIngredient: 'Créer « {name} »',
    unit: 'Unité',
    errors: {
      name: 'Donne un nom à la recette.',
      serving: 'Au moins une personne.',
      noRow: 'Ajoute au moins un ingrédient.',
      ingredient: 'Choisis un ingrédient.',
      quantity: 'Entre une quantité supérieure à zéro.',
      unit: 'Choisis une unité.',
    },
  },
  // La feuille « Nouvel ingrédient » du formulaire de recette (ING-017)
  newIngredient: {
    title: 'Nouvel ingrédient',
    name: 'Nom',
    department: 'Rayon',
    unit: 'Unité',
    otherUnit: 'Autre',
    otherUnitLabel: 'Autre unité',
    submit: 'Créer et l’ajouter à la recette',
    errors: {
      name: 'Donne un nom.',
      department: 'Choisis un rayon.',
      unit: 'Choisis une unité.',
    },
  },
  shoppingList: {
    status: {
      active: 'En cours',
      paused: 'En pause',
      sent: 'Envoyée au drive',
      completed: 'Terminée',
    },
    sentBadge: 'Envoyée',
    sentOn: 'Envoyée au drive le {date}',
    sentHelp: 'Cette liste est envoyée au drive : elle n’est plus modifiable.',
    // DRV-747 : plus aucun article non coché, l'envoi n'a plus rien à prendre
    allChecked: 'Tout est coché : il n’y a plus rien à envoyer au drive.',
    resumeSend: 'Reprendre l’envoi',
    send: 'Envoyer au drive',
    // Aucun drive configuré (DRV-737) : « Envoyer au drive » n'est pas proposé, cette entrée de « ⋮ » mène à son choix
    configureDrive: 'Configurer un drive',
    sendTitle: 'Envoyer la liste au drive ?',
    sendHelp: 'La liste ne sera plus modifiable. Tu pourras la rouvrir.',
    reopen: 'Rouvrir la liste',
    reopenTitle: 'Rouvrir la liste ?',
    reopenHelp: 'La liste redevient modifiable.',
    allLists: 'Mes listes',
    new: 'Nouvelle liste',
    noList: "Tu n'as encore aucune liste.",
    rename: 'Renommer',
    renameHelp: 'Laisse vide pour reprendre la date comme nom.',
    name: 'Nom de la liste',
    pause: 'Mettre en pause',
    complete: 'Terminer',
    activate: 'Reprendre cette liste',
    moreActions: 'Plus d’actions',
    deleteTitle: 'Supprimer la liste ?',
    deleteHelp:
      '« {name} » sera supprimée avec ses repas et ses articles. Cette action est définitive.',
    current: 'Liste en cours',
    dateLabel: 'Liste du {date}',
    noneTitle: 'Aucune liste en cours',
    noneHelp: 'Crée une liste pour y planifier des recettes et noter tes courses.',
    create: 'Créer ma liste',
    completedTitle: 'Courses terminées',
    completedHelp: 'Décoche un article pour reprendre la liste, ou commence une nouvelle liste.',
    startNew: 'Nouvelle liste',
    progress: '{done} sur {total} articles dans le panier',
    sections: 'Contenu de la liste',
    ingredientsTab: 'Articles · {count}',
    recipesTab: 'Recettes · {count}',
    emptyIngredients:
      "Rien à acheter pour l'instant : planifie une recette ou ajoute des articles.",
    emptyRecipes: 'Aucune recette planifiée : choisis-en une dans tes recettes.',
    serving: 'Nombre de personnes',
    fewer: 'Une personne de moins pour {name}',
    more: 'Une personne de plus pour {name}',
    unplan: 'Retirer {name} de la liste',
    // Plusieurs listes en cours, une par type (ADR 0036, LST-007) : on change de liste par « Mes listes » (LST-010)
    completeThis: 'Terminer cette liste',
    plannedIn: 'Ajouté à {lists}.',
    see: 'Voir',
  },
  account: {
    title: 'Moi',
    saved: 'Réglages enregistrés.',
    servingTitle: 'Nombre de personnes',
    serving: 'Nombre de personnes par défaut',
    servingHint: 'Proposé pour chaque recette que tu planifies.',
    passwordTitle: 'Mot de passe',
    actualPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le nouveau mot de passe',
    changePassword: 'Changer le mot de passe',
    passwordChanged: 'Mot de passe modifié : reconnecte-toi avec le nouveau.',
    errors: {
      serving: 'Au moins une personne.',
      actual: 'Entre ton mot de passe actuel.',
      wrongPassword: 'Le mot de passe actuel est incorrect.',
      short: '8 caractères au moins.',
      mismatch: 'Les deux mots de passe ne correspondent pas.',
    },
    logout: 'Se déconnecter',
    administration: 'Administration',
    credits: {
      title: 'Crédits',
      icons: 'Icônes des rayons et des ingrédients, créées par leurs auteurs :',
      site: 'Flaticon',
      license: 'Licence et auteurs',
    },
  },
  driveProducts: {
    title: 'Mes produits',
    drive: 'Drive',
    entry: 'Mes produits du drive',
    entryHelp: 'Les produits que Repas prend en priorité pour tes courses au drive.',
    intro: 'Les produits que Repas prend pour chaque article quand tu envoies une liste au drive.',
    back: 'Tous mes produits',
    unavailable: 'L’envoi au drive n’est pas disponible pour le moment.',
    noStore:
      'Tu n’as pas encore enregistré ton magasin : sans lui, Repas ne peut se souvenir d’aucun produit.',
    settings: 'Réglages du drive',
    none: 'Repas ne se souvient encore d’aucun produit. Ils apparaîtront ici après un envoi.',
    missing: 'Repas ne se souvient d’aucun produit pour cet article.',
    search: 'Rechercher un article',
    noMatch: 'Aucun article ne correspond à ta recherche.',
    haveAtHome: 'J’en ai toujours',
    preferred: 'Produit habituel : {label}',
    searchedAs: 'Recherche sur le drive : {query}',
    nothingAccepted: 'Aucun produit accepté',
    fallbacks: '{n} produit de remplacement | {n} produits de remplacement',
    rejectedCount: '{n} produit à ne plus proposer | {n} produits à ne plus proposer',
    pieces: '{n} pièce | {n} pièces',
    offline:
      'Hors connexion : les modifications sont impossibles tant que le réseau n’est pas revenu.',
    haveAtHomeSwitch: 'J’en ai toujours',
    haveAtHomeHelp: 'Rien au panier pour cet article. Ses produits seront oubliés.',
    accepted: 'Produits acceptés',
    acceptedHelp: 'Le premier produit disponible est pris ({max} au plus).',
    acceptedNone: 'Aucun produit accepté : choisis-en un pendant un envoi.',
    acceptedFull:
      'Tu as déjà {max} produits acceptés : retire un produit avant d’en accepter un autre.',
    preferredBadge: 'Habituel',
    fallbackBadge: 'Remplacement',
    position: 'Produit {position} sur {total}.',
    up: 'Monter',
    down: 'Descendre',
    remove: 'Retirer',
    never: 'Ne plus proposer',
    rejected: 'Produits à ne plus proposer',
    rejectedNone: 'Aucun produit à ne plus proposer.',
    rejectedFull:
      'Tu as déjà {max} produits à ne plus proposer : accepte d’abord un produit de nouveau.',
    acceptAgain: 'Accepter de nouveau',
    dirty: 'Modifications non enregistrées.',
    cancel: 'Annuler les modifications',
    saved: 'Produits enregistrés.',
    forget: 'Oublier cet article',
    forgetTitle: 'Oublier {name} ?',
    forgetDescription:
      'Repas oublie les produits de cet article : tu les choisiras de nouveau au prochain envoi.',
    forgetConfirm: 'Oublier',
    forgotten: '{name} : produits oubliés.',
    moved: '{name} : position {position} sur {total}.',
    removed: '{name} est retiré de la liste.',
    rejectedNow: '{name} ne sera plus proposé.',
    acceptedAgain: '{name} est de nouveau accepté, en dernier.',
    cancelled: 'Modifications annulées.',
    // La contenance d'un produit dans l'unité de la liste (DRV-652) : « Contenu : 20 tranches »
    packSize: 'Contenu : {size}',
    packSizeFix: 'Corriger',
    packSizeQuestion: 'Combien {units} y a-t-il dans ce produit ?',
    packSizeSave: 'Enregistrer',
    packSizeCancel: 'Annuler',
    packSizeInvalid: 'Entre un nombre, par exemple 20 ou 12,5.',
    packSizeSaved: 'Contenu enregistré.',
  },
  auth: {
    pitch: 'Tes recettes, tes courses, sans oublier le basilic.',
    pitchGalette: 'Tes recettes, tes courses, sans oublier la galette.',
    pitchValentin: 'Tes recettes, tes courses, sans oublier le dîner à deux.',
    pitchPaques: 'Tes recettes, tes courses, sans oublier le chocolat.',
    pitchEte: 'Tes recettes, tes courses, sans oublier le barbecue.',
    pitchAutomne: 'Tes recettes, tes courses, sans oublier la tarte aux pommes.',
    pitchHalloween: 'Tes recettes, tes courses, sans oublier la citrouille.',
    pitchNoel: 'Tes recettes, tes courses, sans oublier la bûche.',
  },
  login: {
    title: 'Se connecter',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    submit: 'Se connecter',
    invalid: 'Identifiants invalides.',
    tooMany:
      'Trop de tentatives. Réessaie dans {minutes} minute | Trop de tentatives. Réessaie dans {minutes} minutes',
    noAccount: 'Pas encore de compte ?',
    createAccount: 'Créer un compte',
    emailNotVerified:
      "Ton adresse e-mail n'est pas encore confirmée. Ouvre le lien reçu par e-mail pour activer ton compte.",
    resendLink: 'Renvoyer le lien de confirmation',
    // Mot de passe oublié (ADR 0026 du back) : le lien mène à la demande, et la connexion dit que le nouveau mot de passe est prêt
    forgotPassword: 'Mot de passe oublié ?',
    passwordChanged: 'Ton nouveau mot de passe est enregistré. Tu peux te connecter.',
    // Fin de l'inscription : le premier mot de passe vient d'être choisi (`/connexion?compte=pret`)
    accountReady: 'Ton compte est prêt. Connecte-toi avec ton mot de passe.',
  },
  // Demande du lien (`/mot-de-passe-oublie`) : le message d'envoi est le même que l'adresse ait un compte ou non (pas d'énumération)
  forgotPassword: {
    title: 'Mot de passe oublié',
    intro: 'Indique ton adresse e-mail. Tu recevras un lien pour choisir un nouveau mot de passe.',
    submit: 'Envoyer le lien',
    resend: 'Renvoyer le lien',
    resendIn: 'Renvoyer le lien dans {seconds} s',
    sent: 'Si un compte existe pour cette adresse, un lien vient de partir. Il est valable 30 minutes.',
    invalidEmail: 'Cette adresse e-mail n’est pas valide. Vérifie-la, puis réessaie.',
    tooMany:
      'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans {minutes} minute. | Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans {minutes} minutes.',
    tooManyLater: 'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie plus tard.',
    unreachable: 'Le serveur est injoignable. Aucun lien n’est parti. Réessaie dans un instant.',
    signIn: 'Retour à la connexion',
  },
  // Nouveau mot de passe (`/mot-de-passe-oublie/confirmation?token=…`) : le lien peut aussi poser un premier mot de passe
  resetPassword: {
    title: 'Choisis un nouveau mot de passe',
    password: 'Nouveau mot de passe',
    passwordHint: '8 caractères au moins.',
    confirmation: 'Confirme ton mot de passe',
    submit: 'Enregistrer mon mot de passe',
    tooShort: 'Ton mot de passe doit avoir 8 caractères au moins.',
    mismatch: 'Les deux mots de passe ne sont pas les mêmes.',
    rejected: 'Ce mot de passe n’est pas accepté. Choisis-en un autre, de 8 caractères au moins.',
    tooMany:
      'Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie dans {minutes} minute. | Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie dans {minutes} minutes.',
    tooManyLater:
      'Trop de demandes en peu de temps. Ton mot de passe n’a pas changé. Réessaie plus tard.',
    unreachable:
      'Le serveur est injoignable. Ton mot de passe n’a pas changé. Réessaie dans un instant.',
    invalidTitle: 'Ce lien ne marche plus',
    invalid: 'Il a déjà servi, ou il a expiré. Ton mot de passe n’a pas changé.',
    newLink: 'Demander un nouveau lien',
    signIn: 'Retour à la connexion',
  },
  checkEmail: {
    title: 'Vérifie ta boîte mail',
    // La réponse du back est la même pour toute adresse : aucun texte ne dit qu'un compte vient d'être créé
    sent: 'Un message vient de partir à {email}. Ouvre-le pour continuer.',
    askAddress: 'Indique ton adresse e-mail pour recevoir un nouveau lien.',
    spam: 'Rien reçu ? Regarde dans tes courriers indésirables, puis demande un nouveau lien.',
    resend: 'Renvoyer le lien',
    resendIn: 'Renvoyer le lien dans {seconds} s',
    resent: 'Un nouveau message vient de partir.',
    tooMany: 'Trop de demandes. Réessaie plus tard.',
    invalidEmail: "Cette adresse e-mail n'est pas valide.",
    signIn: 'Retour à la connexion',
  },
  confirmEmail: {
    title: "Confirmation de l'adresse",
    confirming: 'Confirmation en cours…',
    done: 'Ton adresse est confirmée. Il te reste à choisir ton mot de passe.',
    choosePassword: 'Choisir mon mot de passe',
    signIn: 'Se connecter',
    invalid: "Ce lien n'est plus valable : il a déjà servi ou il a expiré.",
    invalidHelp: 'Si ton adresse est déjà confirmée, connecte-toi. Sinon, demande un nouveau lien.',
    newLink: 'Recevoir un nouveau lien',
    retry: 'Réessayer',
  },
  // Inscription (`/inscription`) : l'adresse seule ; le mot de passe se choisit après le clic sur le lien reçu par e-mail (`welcome`)
  register: {
    title: 'Créer un compte',
    intro: 'Indique ton adresse e-mail. Tu recevras un lien pour choisir ton mot de passe.',
    submit: 'Créer mon compte',
    // Aussi l'aide du nouveau mot de passe de « Moi » (`account.newPassword`)
    passwordHint: '8 caractères au moins.',
    invalidEmail: 'Cette adresse e-mail n’est pas valide. Vérifie-la, puis réessaie.',
    tooMany:
      'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie dans {minutes} minute. | Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie dans {minutes} minutes.',
    tooManyLater:
      'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie plus tard.',
    haveAccount: 'Déjà un compte ?',
    signIn: 'Se connecter',
  },
  // Bienvenue (`/mot-de-passe-oublie/confirmation?token=…&bienvenue=1`) : le lien de l'e-mail d'inscription fait choisir le premier mot de passe
  welcome: {
    title: 'Choisis ton mot de passe',
    intro: 'Dernière étape pour ouvrir ton compte.',
    password: 'Mot de passe',
    invalid:
      'Il a déjà servi, ou il a expiré. Demande-en un nouveau pour choisir ton mot de passe.',
    tooMany:
      'Trop de demandes en peu de temps. Réessaie dans {minutes} minute. | Trop de demandes en peu de temps. Réessaie dans {minutes} minutes.',
    tooManyLater: 'Trop de demandes en peu de temps. Réessaie plus tard.',
  },
  errors: {
    unreachable: 'Le serveur est injoignable. Réessaie dans un instant.',
    generic: 'Une erreur est survenue. Réessaie.',
    sessionExpired: 'Ta session a expiré : reconnecte-toi.',
    forbidden: "Tu n'as pas le droit de faire cela.",
    notFound: "Cet élément n'existe plus.",
    conflict: 'Une autre modification est en cours. Réessaie dans un instant.',
    outdated: "Modifié ailleurs entre-temps : la page vient d'être rechargée, refais ton action.",
    tooMany:
      'Trop de requêtes. Réessaie dans {minutes} minute | Trop de requêtes. Réessaie dans {minutes} minutes',
    // `DRIVE_RATE_LIMITED` (429, DRV-615) : passager, distinct des plafonds de quantité ; `{wait}` vaut au moins une minute
    driveRateLimited:
      'Trop de demandes en peu de temps. Rien n’est perdu. Attends {wait}, puis réessaie.',
    driveWait: 'une minute | {minutes} minutes',
    driveDisabled:
      'L’envoi au drive n’est pas disponible pour le moment. Ta liste n’a pas changé. Réessaie plus tard.',
    listSent:
      'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable. Rien n’a été changé. Rouvre-la pour la modifier.',
    // Un repas réparti sur plusieurs listes (ADR 0036) : l'une d'elles est partie, rien n'est écrit
    mealListSent: 'Une des listes de ce repas est partie au drive. Rouvre-la, puis réessaie.',
    listNotSent:
      'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvre la liste pour voir où elle en est.',
    listNotSendable:
      'Seule une liste en cours peut être envoyée au drive. Rien n’a été changé. Ouvre une liste en cours.',
    listEmpty:
      'Il n’y a rien à envoyer au drive : la liste est vide, ou tout est coché. Ta liste n’a pas changé. Ajoute un article ou décoche-en un, puis réessaie.',
    driveNotConfigured: 'Choisis d’abord ton magasin dans les réglages du drive.',
    driveChoiceInvalid:
      'Ce choix n’est pas valable : 5 produits à garder et 20 à ne plus proposer au plus, sans doublon. Rien n’a été enregistré. Corrige-le, puis réessaie.',
    driveChoiceNotFound:
      'Repas ne se souvient plus de produit pour cet article. Rien n’a été changé. Recharge la page pour voir l’état actuel.',
    driveLimitReached:
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui. Tes choix déjà enregistrés sont gardés. Oublie des produits dans « Mes produits », ou réessaie demain.',
    driveStoreMismatch:
      'Ton magasin a changé : la page vient d’être rechargée. Rien n’a été enregistré. Refais ton action.',
    unitMeasureIncomplete:
      'La dimension et le facteur de base vont ensemble : renseigne les deux, ou laisse-les vides.',
    unitBaseFactorInvalid: 'Le facteur de base doit être un nombre supérieur à zéro.',
    // `INGREDIENT_BASE_FORBIDDEN` (403, ING-015) : un écran périmé insiste, rien n'est enregistré
    ingredientBaseForbidden: 'Ce réglage n’est pas pour ton compte. Rien n’a changé.',
    // `INGREDIENT_NAME_ALREADY_USED` (409, ING-016) quand l'écran ne sait pas dire le nom ni le rayon
    ingredientNameUsed:
      'Ce nom existe déjà dans ce rayon. Choisis-le plutôt que d’en créer un autre.',
    // Les types de liste (LIST_TYPE_NAME_ALREADY_USED en 409, LIST_TYPE_NAME_INVALID en 422) : trois phrases au plus, jamais le code
    listTypeNameUsed: 'Tu as déjà un type qui s’appelle comme ça. Choisis un autre nom.',
    listTypeNameInvalid: 'Ce nom n’est pas valable. Écris de 1 à 40 caractères, avec une lettre.',
    // Les conversions propres à un ingrédient (CONVERSION_ALREADY_EXISTS, CONVERSION_REQUIRED_BY_INGREDIENT)
    conversionExists: 'Cette conversion existe déjà : modifie-la.',
    conversionRequired:
      'Cette conversion relie l’unité de ta recette à celle du magasin : change d’abord l’unité.',
    // `DRIVE_INGREDIENT_NOT_FOUND` (404) : le choix portait sur un article qui n'est plus à l'utilisateur
    driveIngredientNotFound:
      'Repas ne retrouve pas cet article. Rien n’a été enregistré. Rouvre ta liste, puis réessaie.',
    // `WRITE_RATE_LIMITED` (429) : passager, l'action n'a pas été enregistrée ; `{wait}` vaut « un instant » ou un nombre de minutes
    writeRateLimited:
      'Trop d’actions en peu de temps. Cette action n’a pas été enregistrée. Attends {wait}, puis réessaie.',
    writeWaitShort: 'un instant',
    // `PASSWORD_RATE_LIMITED` (429) : trop de mots de passe actuels refusés, `{wait}` vaut au moins une minute
    passwordRateLimited:
      'Trop de mots de passe actuels incorrects. Rien n’a été changé. Patiente {wait}, puis réessaie.',
    driveStoreInvalid:
      'Cette adresse n’est pas celle d’un magasin {retailer} Drive : vérifie-la, elle ressemble à {storeExample}.',
  },
  // Les plafonds et les bornes de l'API (422) : chaque message dit la limite vraie et quoi faire. Groupe à part du glossaire du drive : « ingrédient » est le bon mot ici.
  limits: {
    recipeLimitReached:
      'Tu as atteint le nombre maximum de recettes. Supprime-en une, puis réessaie.',
    ingredientLimitReached:
      'Tu as déjà 2 000 ingrédients : c’est le maximum. Supprime ou fusionne-en, puis réessaie.',
    listLimitReached:
      'Tu as déjà 1 000 listes en cours : c’est le maximum. Termine ou supprime une liste, puis réessaie.',
    listMealLimitReached:
      'Cette liste a déjà 500 repas : c’est le maximum. Retire-en un, puis réessaie.',
    recipeRowsLimitReached: 'Une recette a 100 ingrédients au plus. Retire-en un, puis réessaie.',
    listTypeLimitReached: 'Tu as déjà 10 types. Supprime-en un pour en ajouter.',
    conversionLimitReached:
      'Cet ingrédient a déjà 50 conversions : c’est le maximum. Supprime-en une, puis réessaie.',
    quantityInvalid:
      'Cette quantité n’est pas valable : choisis un nombre plus grand que 0, jusqu’à 1 000 000.',
    servingInvalid: 'Le nombre de personnes doit être de 1 à 100.',
    coefficientInvalid: 'Ce nombre n’est pas valable : choisis un nombre de 0,000001 à 1 000 000.',
  },
  driveSend: {
    title: 'Ta liste est prête pour le drive',
    // Plan sans ligne : tout est coché (DRV-747), « prête pour le drive » serait faux
    titleNothing: 'Rien à envoyer au drive',
    back: 'Retour à la liste',
    store: 'Magasin : {label}',
    storeEnding: 'Magasin …{ending}',
    loading: 'Préparation de l’envoi…',
    retry: 'Réessayer',
    offHelp: 'Une liste envoyée au drive ne se modifie plus. Tu peux la rouvrir pour la modifier.',
    offHelpOffline: 'Hors connexion : la liste se rouvrira quand le réseau sera revenu.',
    // Une phrase de synthèse construite avec les comptes (DRV-622) : « 6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc. »
    summary: {
      sentence: '{total} : {parts}.',
      join: ', ',
      total: '{count} article | {count} articles',
      known: '{count} est déjà choisi | {count} sont déjà choisis',
      allKnown: 'il est déjà choisi | tous sont déjà choisis',
      new: '{count} est à choisir sur {retailer} | {count} sont à choisir sur {retailer}',
      allNew: 'il est à choisir sur {retailer} | tous sont à choisir sur {retailer}',
      other: '{count} ne sera pas mis au panier | {count} ne seront pas mis au panier',
      allOther: 'il ne sera pas mis au panier | aucun ne sera mis au panier',
    },
    articles: 'Tes articles',
    showArticles: 'Voir les articles',
    need: 'À acheter : {quantity}',
    statusNew: 'Nouveau : tu choisiras le produit sur {retailer}.',
    statusReplace: 'Tu choisiras un autre produit sur {retailer}, à la place de : {label}.',
    statusHaveAtHome: 'J’en ai toujours : rien à mettre au panier.',
    statusSkip: 'Pas cette fois : rien ne sera mis au panier.',
    // Lu par les lecteurs d'écran avant la liste : un seul produit, c'est le produit habituel ; plusieurs, ce sont les produits retenus
    products: 'Produit habituel : | Produits retenus :',
    fallback: 'remplacement',
    packs: '{count} produit | {count} produits',
    packsToCheck: 'à vérifier',
    packsUnknown: 'quantité à vérifier',
    rejected: 'Ne plus proposer : {labels}',
    replace: 'Choisir un autre produit',
    replaceFor: 'Choisir un autre produit : {name}',
    skip: 'Pas cette fois',
    skipFor: 'Pas cette fois : {name}',
    // Le bouton dit ce qu'il fait (DRV-744) : il remplit le panier, il n'« ouvre » rien. Avec un seul drive : « Remplir mon panier ».
    open: 'Remplir mon panier',
    // Plusieurs drives configurés (DRV-710) : le bouton nomme le drive.
    openNamed: 'Remplir le panier {retailer}',
    reopenDrive: 'Rouvrir le drive',
    opening: 'Je remplis ton panier…',
    offline:
      'Hors connexion : l’envoi au drive est impossible tant que le réseau n’est pas revenu.',
    // Un envoi ne prend que les articles non cochés (DRV-747) : un plan sans ligne, c'est une liste dont tout est coché (tout est déjà au panier)
    emptyPlan: 'Tous tes articles sont cochés.',
    retryOnly:
      'Reprise des articles en échec : {count} article | Reprise des articles en échec : {count} articles',
    showAll: 'Voir toute la liste',
    waiting: {
      title: 'En attente du récapitulatif…',
      help: 'Le drive est ouvert dans l’application. Garde l’application ouverte.',
      restart: 'Recommencer',
      restartHelp: 'Recommencer abandonne l’envoi en cours et reprend la liste depuis le début.',
      reopenList: 'Rouvrir la liste',
      reopenTitle: 'Rouvrir la liste ?',
      reopenHelp: 'L’envoi en cours est abandonné et la liste redevient modifiable.',
    },
    elsewhere: {
      title: 'Un autre envoi est en cours',
      help: 'Un envoi au drive est déjà en cours pour une autre liste. Termine-le, ou abandonne-le pour continuer ici.',
      see: 'Voir cet envoi',
      abandon: 'Abandonner cet envoi',
    },
    notInApp: {
      title: 'L’envoi automatique n’est pas disponible ici',
      help: 'L’envoi automatique fonctionne dans l’application Repas pour Android. Tu peux l’installer, ou chercher chaque produit sur {retailer} avec les liens ci-dessous.',
      install: 'Installer l’application',
      search: 'Chercher sur {retailer}',
      searchFor: 'Chercher sur {retailer} : {name} (s’ouvre dans un nouvel onglet)',
    },
    // Plusieurs drives configurés (DRV-710, DRV-737) : la question est toujours posée, une tuile par drive, le drive habituel (sinon le dernier utilisé) est coché
    where: {
      title: 'Où envoyer ta liste ?',
      store: 'Ton magasin : …{tail}',
    },
    // Une application trop ancienne pour le drive (DRV-640) : une phrase et un bouton, les liens de recherche restent sous l'écran
    appTooOld: {
      text: 'Mets à jour l’application pour envoyer ta liste.',
      // L'application est à jour pour le drive d'avant mais ne connaît pas celui-ci (DRV-710) ; les autres drives restent proposés
      textNamed: 'Mets à jour l’application pour envoyer ta liste à {retailer}.',
      update: 'Mettre à jour',
    },
    // Une erreur dit trois choses : ce qui s'est passé, ce qui est sauf, une action (principes-produit.md § 4)
    driveUnusable: {
      title: 'Le drive ne fonctionne pas sur ce téléphone',
      help: 'Ta liste n’a pas changé. Mets à jour l’application Repas et « Android System WebView », puis reviens ici.',
      aid: 'Voir l’aide',
    },
    failure: {
      invalidPlan:
        'Repas n’a pas pu préparer l’envoi. Rien n’a été mis au panier. Recharge la page, puis réessaie.',
      tooManyLines:
        'Cette liste a plus de {max} articles : c’est trop pour un seul envoi. Ta liste n’a pas changé. Retire des articles, puis renvoie-la.',
      tooLarge:
        'Cet envoi est trop gros pour l’application. Rien n’a été mis au panier. Mets « Pas cette fois » sur quelques articles, puis réessaie.',
      sendFailed:
        'L’application n’a pas pu remplir ton panier. Rien n’a été mis au panier. Réessaie dans un instant.',
      appRefused:
        'Le drive n’a pas répondu comme prévu. Rien n’a été perdu. Mets l’application à jour, puis réessaie.',
      update: 'Mettre à jour l’application',
    },
  },
  driveReturn: {
    backToList: 'Retour à la liste',
    allLists: 'Mes listes',
    none: {
      title: 'Aucun récapitulatif à afficher',
      help: 'Un récapitulatif ne se garde pas quand la page est rechargée. Ouvre la liste pour reprendre l’envoi.',
      open: 'Ouvrir mes listes',
    },
    stale: {
      title: 'Ce récapitulatif ne correspond pas à ton dernier envoi',
      help: 'Il n’a pas été pris en compte : rien n’a été enregistré.',
    },
    // Une erreur dit trois choses : ce qui s'est passé, ce qui est sauf, une action. Le code n'est lu que dans « Détails ».
    refused: {
      title: 'L’envoi n’a pas démarré',
      help: 'L’application n’a pas pu lancer l’envoi. Rien n’a été mis au panier. Réessaie depuis l’envoi, ou mets l’application à jour si cela se répète.',
      backToSend: 'Revenir à l’envoi',
    },
    invalid: {
      title: 'Le drive n’a pas répondu comme prévu',
      help: 'Rien n’a été perdu. Mets l’application à jour, puis réessaie.',
      detail: 'Détail : {detail}',
      update: 'Mettre à jour l’application',
    },
    // DRV-755 : la personne a ouvert un autre magasin que celui de Repas, à l'étape guidée ; Repas le retient et reprend l'envoi tout seul
    storeSwitch: {
      title: 'Je retiens ton magasin',
      help: 'Je reprends ton envoi dans un instant. Ta liste est gardée.',
      failed: 'Je n’ai pas pu retenir ce magasin. Ta liste est gardée. Tu peux réessayer.',
      retry: 'Réessayer',
      leave: 'Revenir à ma liste',
    },
    setup: {
      title: 'Lecture du magasin',
      help: 'Cette réponse est celle d’une lecture du magasin : elle se traite dans les réglages du drive.',
      settings: 'Réglages du drive',
    },
    // Le titre dit le résultat ; le reste, au plus trois phrases : ce qui s'est passé, ce qui est sauf, ce qu'il reste à faire
    safe: 'Ce qui est déjà au panier y reste.',
    // Le panier est fait : la suite (créneau, paiement) se passe dans l'appli officielle, Repas n'explique rien de plus (DRV-645)
    basketReady: 'Ton panier est rempli. Tu peux finaliser ta commande dans l’appli {appName}.',
    // DRV-747 : dite seulement quand les coches sont écrites dans la liste (jamais sur un échec, qui se tait)
    basketTicked: 'Les articles ajoutés au panier sont cochés dans ta liste.',
    outcome: {
      completed: {
        title: 'Le panier est rempli',
      },
      // DRV-750 : l'envoi est allé au bout mais un produit choisi n'est pas dans le panier ; le titre est celui de `partial` (comme l'écran de fin de l'agent)
      completedSome: {
        lead: 'Un produit que tu avais choisi n’est pas dans ton panier. | {count} produits que tu avais choisis ne sont pas dans ton panier.',
        safe: 'Tout le reste est dans ton panier.',
        action:
          'Finalise ta commande dans l’appli {appName}, sans lui. | Finalise ta commande dans l’appli {appName}, sans eux.',
      },
      // Un envoi arrêté avant que rien ne soit mis au panier ni choisi : « en partie » serait faux (même titre que l'écran de fin de l'agent)
      notFilled: {
        title: 'Le panier n’est pas rempli',
      },
      partial: {
        title: 'Le panier est rempli en partie',
        lead: 'L’envoi s’est arrêté avant la fin.',
        safe: 'Ce qui est déjà au panier y reste : il reste {count} article à ajouter. | Ce qui est déjà au panier y reste : il reste {count} articles à ajouter.',
        action: 'Reprends l’envoi pour finir.',
      },
      aborted: {
        title: 'Tu as arrêté l’envoi',
        action: 'Reprends l’envoi quand tu veux.',
      },
      error: {
        title: 'L’envoi s’est arrêté',
        lead: 'L’envoi n’a pas pu aller au bout.',
        action: 'Reprends l’envoi dans un moment.',
      },
    },
    errorCode: {
      NOT_LOGGED_IN: {
        happened: 'Tu n’es pas connecté à {retailer}.',
        action: 'Connecte-toi à {retailer}, puis reprends l’envoi.',
      },
      STORE_MISMATCH: {
        happened: 'Le magasin ouvert sur {retailer} n’est pas le tien.',
        action: 'Ouvre ton magasin sur {retailer}, puis reprends l’envoi.',
      },
      BLOCKED: {
        happened: '{retailer} a ralenti les demandes.',
        action: 'Attends quelques minutes, puis reprends l’envoi.',
      },
      CONTRACT_CHANGED: {
        happened: '{retailer} a changé son site, l’envoi automatique est arrêté.',
        action: 'Cherche tes produits à la main sur {retailer}.',
      },
      NETWORK: {
        happened: 'La connexion a été coupée pendant l’envoi.',
        action: 'Vérifie ta connexion, puis reprends l’envoi.',
      },
      CANCELLED: {
        happened: 'L’envoi a été annulé.',
        action: 'Reprends l’envoi quand tu veux.',
      },
      INVALID_MESSAGE: {
        happened: 'L’application n’a pas compris l’envoi.',
        action: 'Mets l’application à jour, puis reprends l’envoi.',
      },
      UNSUPPORTED_PAGE: {
        happened: 'Repas ne peut pas travailler sur cette page {retailerDe}.',
        action: 'Ouvre la page de ton magasin, puis reprends l’envoi.',
      },
    },
    details: 'Détails',
    errorDetails: 'Code : {code}',
    ignored:
      '{count} article ne figurait pas dans ta liste : Repas l’a laissé de côté. | {count} articles ne figuraient pas dans ta liste : Repas les a laissés de côté.',
    save: {
      saving: 'Enregistrement de tes choix…',
      saved: 'Tes choix sont enregistrés pour les prochains envois.',
      failed: 'Tes choix n’ont pas pu être enregistrés. Ils sont gardés sur cette page. {reason}',
      // Trop de demandes (429, DRV-615) : le résultat reste en mémoire sur cette page, rien n'est perdu
      rateLimited:
        'Tes choix ne sont pas encore enregistrés. Ils sont gardés sur cette page. {reason}',
      retry: 'Réessayer l’enregistrement',
    },
    counts: {
      label: 'Récapitulatif de l’envoi',
      added: 'Ajoutés au panier',
      chosen: 'Choisis par toi',
      haveAtHome: 'J’en ai toujours',
      skipped: 'Pas cette fois',
      unavailable: 'Indisponibles',
    },
    quantity: '× {count}',
    unknownProduct: 'Produit n° {id}',
    line: {
      fallback: 'Produit de remplacement utilisé : le produit habituel n’était pas disponible.',
      chosenPrimary: 'Choisi sur {retailer}, produit habituel : Repas s’en souvient.',
      chosenFallback: 'Choisi sur {retailer}, produit de remplacement : Repas s’en souvient.',
      chosenOnce: 'Choisi sur {retailer} pour cette fois seulement : Repas ne s’en souvient pas.',
      haveAtHome: 'J’en ai toujours : Repas s’en souvient.',
      skipped: 'Pas cette fois.',
      unavailable: 'Aucun produit disponible : rien n’a été mis au panier.',
      failed: 'Pas ajouté au panier. {reason}',
      rejected: 'Ne sera plus proposé : {labels}',
    },
    actions: {
      newTab: 'S’ouvre dans un nouvel onglet.',
      manual: 'Chercher à la main sur {retailer}',
      resume: 'Reprendre l’envoi',
      update: 'Mettre à jour l’application',
      complete: 'Terminer la liste',
      completeTitle: 'Terminer la liste ?',
      completeHelp: 'La liste sera terminée.',
      reopen: 'Rouvrir la liste',
      reopenTitle: 'Rouvrir la liste ?',
      reopenHelp: 'La liste redevient modifiable.',
      offline: 'Hors connexion : ces actions reviennent avec le réseau.',
    },
  },
  driveSettings: {
    title: 'Réglages du drive',
    back: 'Moi',
    entry: 'Réglages du drive',
    entryHelp: 'Ton magasin {retailer} Drive et l’application Repas.',
    // Plusieurs drives allumés (DRV-709)
    entryHelpSeveral: 'Tes drives, ton drive habituel et l’application Repas.',
    // Aucun drive configuré (DRV-737) : la liste ne propose pas d'envoi, c'est ici qu'on choisit son magasin
    entryHelpNone: 'Choisis ton magasin pour envoyer ta liste au drive.',
    disabled: 'L’envoi au drive n’est pas encore activé : il n’y a rien à régler pour le moment.',
    // Envoyé ici faute de magasin (DRV-622, DRV-623) : un titre, une phrase, un bouton qui fait le travail
    chooseTitle: 'Choisis ton magasin',
    chooseHelp: 'Pour envoyer ta liste, Repas doit connaître ton magasin {retailer}.',
    choose: 'Choisir mon magasin',
    store: 'Ton magasin',
    storeNamed: 'Magasin …{tail}',
    none: 'Aucun magasin enregistré.',
    read: 'Lire mon magasin dans l’application',
    // Avec un magasin déjà enregistré, le même geste s'appelle « Changer de magasin »
    change: 'Changer de magasin',
    readHelp: 'Choisis ton magasin, puis touche « Utiliser ce magasin ».',
    // Repas enregistre tout seul le magasin lu (un seul geste, dans l'application)
    readDone: 'Magasin …{tail} enregistré.',
    // Le magasin lu n'est pas celui qui est enregistré : la seule confirmation du parcours
    changeTitle: 'Utiliser le magasin …{tail} ?',
    changeConfirm: 'Changer de magasin',
    changeKeep: 'Garder l’ancien',
    // Le serveur a refusé le magasin lu (`DRIVE_STORE_INVALID`) : rien n'est enregistré
    readRefused:
      'Repas n’a pas pu utiliser ce magasin. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
    manual: 'Saisir l’adresse à la main',
    readErrors: {
      UNAVAILABLE:
        'L’application ne peut pas lire ton magasin pour le moment. Rien n’est enregistré. Saisis son adresse à la main.',
      BUSY: 'Un envoi au drive est déjà en cours dans l’application. Rien n’est enregistré. Termine-le ou abandonne-le, puis réessaie.',
      CANCELLED:
        'Aucun magasin choisi. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
      NOT_FOUND:
        'L’application n’a pas trouvé de magasin sur la page. Rien n’est enregistré. Choisis-en un sur le site du drive, puis réessaie.',
      FAILED:
        'La lecture a échoué. Rien n’est enregistré. Réessaie, ou saisis l’adresse à la main.',
    },
    address: 'Adresse de ton magasin',
    addressHint: 'Celle du site du drive une fois ton magasin choisi, par exemple {storeExample}.',
    name: 'Nom de ton magasin (facultatif)',
    nameHint: 'Pour le reconnaître : le nom de ta ville, par exemple.',
    changeWarning:
      'Ce n’est pas ton magasin actuel. Les produits habituels de l’ancien magasin ne seront plus proposés. Tu les choisiras de nouveau.',
    save: 'Enregistrer mon magasin',
    saved: 'Magasin enregistré.',
    errors: {
      address:
        'Cette adresse n’est pas celle d’un magasin {retailer} Drive : elle ressemble à {storeExample}.',
      mobile:
        'Cette adresse est celle du site mobile. Ouvre-la dans l’application Repas, ou colle l’adresse du site sur ordinateur.',
    },
    offline:
      'Hors connexion : l’enregistrement est impossible tant que le réseau n’est pas revenu.',
    products: 'Produits dont Repas se souvient',
    productsWith: 'Articles avec des produits',
    productsRejected: 'Articles avec des produits à ne plus proposer',
    productsHome: 'Articles « J’en ai toujours »',
    manage: 'Gérer mes produits',
    // « Mes drives » (DRV-709) : plusieurs drives allumés. Le nom du drive est toujours un paramètre (`{retailer}`).
    drives: {
      title: 'Mes drives',
      chooseHelp: 'Quel drive utilises-tu ?',
      storeNamed: 'Ton magasin : …{tail}',
      choose: 'Choisir mon magasin {retailer}',
      changeNamed: 'Changer de magasin {retailer}',
      remove: 'Retirer {retailer}',
      removeTitle: 'Retirer {retailer} ?',
      removeHelp:
        'Ton magasin {retailer} n’est plus enregistré. Tes produits habituels sont gardés, au cas où tu reviens.',
      keep: 'Garder {retailer}',
      removed: '{retailer} est retiré.',
      updateApp: 'Mets à jour l’application pour ajouter {retailer}.',
      inApp: 'Pour choisir ce magasin, ouvre Repas dans l’application.',
      default: 'Mon drive habituel',
      defaultHelp: 'Repas te le propose d’avance quand tu envoies ta liste.',
      defaultNone: 'Aucun',
    },
  },
  // Liaison d'Alexa (VOX-401) : la page que l'application Alexa ouvre (`/alexa/lier`), une phrase et deux boutons
  alexaLink: {
    title: 'Lier Alexa à ton compte ?',
    scope:
      'Alexa pourra lire ta liste, ajouter, créer et retirer des produits, et gérer tes repas.',
    account: 'Ton compte',
    returnTo: 'Retour sur',
    notYou: 'Ce n’est pas toi ?',
    titleFailed: 'Lier Alexa',
    authorize: 'Autoriser',
    invalid: 'Ce lien ne marche pas. Reprends depuis l’application Alexa.',
    refused: 'Alexa ne peut pas être liée avec ce lien. Reprends depuis l’application Alexa.',
    tooMany: 'Trop d’essais pour le moment. Réessaie dans quelques minutes.',
    disabled: 'Cette fonction n’est pas encore disponible.',
    home: 'Retour à l’accueil',
  },
  // L'assistant vocal dans « Moi » (VOX-402) : `{skill}` est le nom du skill (`ALEXA_SKILL_NAME`, un seul endroit)
  voice: {
    title: 'Assistant vocal',
    linked: 'Alexa est liée. Dis : « Alexa, demande à {skill} d’ajouter du pain ».',
    notLinked: 'Pour lier Alexa, ouvre l’application Alexa, Skills, {skill}.',
    unlink: 'Délier Alexa',
    unlinkTitle: 'Délier Alexa ?',
    unlinkDescription:
      'Alexa ne pourra plus ajouter de produits à ta liste. Tu pourras la lier de nouveau.',
    unlinkConfirm: 'Délier',
  },
  // Les types de liste de courses (ADR 0036, LST-006) : « Moi », l'écran des types et la fiche d'un type. Mots du glossaire : type de liste,
  // liste principale, produit à part. Jamais « catégorie », « destination », « routage » ni « tag ».
  listTypes: {
    entry: 'Types de liste',
    entryHelp: 'Sépare tes courses par magasin.',
    title: 'Types de liste',
    intro: 'Sépare tes courses par magasin. Chaque type a sa propre liste.',
    none: 'Tu n’as pas encore de type. Crée-en un, par exemple Boucherie.',
    noDepartments: 'Aucun rayon pour l’instant',
    standalone: '{count} produit à part | {count} produits à part',
    main: 'Liste principale',
    mainHelp: 'Tout le reste',
    add: 'Ajouter un type',
    addTitle: 'Nouveau type de liste',
    addHelp: 'Donne-lui le nom d’un magasin, par exemple Boucherie ou Marché.',
    name: 'Nom du type',
    nameRequired: 'Écris un nom.',
    nameTooLong: 'Le nom a 40 caractères au plus.',
    created: 'Le type « {name} » est créé.',
    departmentsTitle: 'Rayons dans cette liste',
    departmentsHelp: 'Les produits de ces rayons vont dans cette liste.',
    takenBy: 'Dans {type}',
    productsTitle: 'Produits à part',
    productsHelp: 'Pour ajouter un produit, ouvre-le et choisis sa liste.',
    productsNone: 'Aucun produit à part pour l’instant.',
    productRemove: 'Retirer {name} de ce type',
    productRemoved: '{name} n’est plus à part.',
    save: 'Enregistrer',
    saved: 'Type enregistré.',
    delete: 'Supprimer ce type',
    deleteTitle: 'Supprimer « {name} » ?',
    deleteBody: 'Sa liste en cours passe dans Mes listes. Rien n’est perdu.',
    deleteConfirm: 'Supprimer',
    deleted: 'Le type « {name} » est supprimé.',
    notFound: 'Ce type n’existe plus.',
  },
  // Les entrées de l’application dans « Moi » (DRV-320)
  driveAccount: {
    appMenu: 'Menu de l’application',
    appMenuHelp: 'Version, mode d’emploi et déconnexion {retailerDe}.',
    appMenuFailed: 'Le menu de l’application n’a pas pu s’ouvrir. Réessaie.',
  },
  season: {
    galette: 'Décor de la galette',
    valentin: 'Décor de la Saint-Valentin',
    paques: 'Décor de Pâques',
    ete: 'Décor d’été',
    automne: 'Décor d’automne',
    halloween: 'Décor d’Halloween',
    noel: 'Décor de Noël',
    // L'aperçu des thèmes de l'administrateur (ADR 0013) : une clé de nom par saison, ajoutée avec la saison
    preview: {
      title: 'Aperçu des thèmes',
      help: 'Seulement pour toi : le thème change ici et redevient normal dès que tu quittes l’onglet.',
      current: 'Thème du moment',
      none: 'Sans décor',
    },
    name: {
      galette: 'Galette & crêpes',
      valentin: 'Saint-Valentin',
      paques: 'Pâques',
      ete: 'Été',
      automne: 'Automne',
      halloween: 'Halloween',
      noel: 'Noël',
    },
  },
  theme: {
    label: 'Thème',
    system: 'Système',
    light: 'Clair',
    dark: 'Sombre',
  },
  design: {
    title: 'Catalogue de composants',
    intro: 'Les composants du design système « Basilic & safran », dans les deux thèmes.',
    buttons: 'Boutons',
    fields: 'Champs',
    choices: 'Choix',
    images: 'Images',
    imageOk: 'Présente',
    imageBroken: 'Introuvable',
    imageEmpty: 'Sans chemin',
    progress: 'Progression',
    save: 'Enregistrer',
    planButtons: 'Ajout d’une recette à la liste',
    sampleRecipe: 'Gratin de courgettes',
    newRecipe: 'Nouvelle recette',
    cancel: 'Annuler',
    remove: 'Supprimer',
    ingredient: 'Ingrédient',
    ingredientSample: 'Courgettes',
    quantity: 'Quantité',
    quantityError: 'Entre une quantité supérieure à zéro.',
    quantityHint: 'En grammes, kilos ou unités.',
    toTake: 'À prendre',
    inBasket: 'Dans le panier',
    dish: 'Plat',
    dessert: 'Dessert',
    starter: 'Entrée',
    tiles: 'Types de recette',
    progressLabel: '{done} sur {total} articles dans le panier',
  },
  // La page publique d'installation de l'application Android (DRV-639), `/installer` : un gros bouton et trois courtes étapes, sans connexion
  install: {
    title: 'Installer l’application Repas',
    download: 'Télécharger l’application',
    steps: {
      open: 'Ouvre le fichier quand Android le propose.',
      allow: 'Autorise l’installation (une seule fois).',
      install: 'Touche « Installer ».',
      protect:
        'Si Play Protect s’affiche, touche « Installer sans analyser », puis confirme avec ton empreinte ou ton code.',
    },
  },
  // La page de l'application Android (DRV-316), réduite à l'essentiel : la version installée et un bouton vers GitHub. Le reste du mode
  // d'emploi (installation détaillée, dépannage, désinstallation…) est dans `android/README.md`, section « Dépannage de l'installation ».
  driveHelp: {
    // Dans un navigateur : trois courtes étapes
    title: 'Installer l’application Repas',
    intro:
      'L’application Android « Repas » s’installe en quelques minutes, sans passer par Google Play.',
    // Dans l'application elle-même : elle est déjà installée, la page ne sert qu'à la mettre à jour
    titleInApp: 'Mettre à jour l’application',
    version: 'Version installée : {version}',
    entry: {
      title: 'Application',
      link: 'Installer l’application Android',
      help: 'Télécharger et installer l’application Repas.',
      // Dans l'application : on ne propose pas de l'installer, elle l'est déjà
      updateLink: 'Mettre à jour l’application',
      updateHelp: 'Ouvrir la dernière version.',
    },
    // En haut de « Moi », dans l'application seulement, quand une version plus récente est publiée (DRV-637)
    updateBanner: {
      text: 'Une nouvelle version de l’application est prête.',
      action: 'Mettre à jour',
    },
    // La mise à jour faite par l'application elle-même (DRV-639) : le bandeau de « Moi » et cette page disent la même chose, d'un seul bouton
    update: {
      checking: 'Recherche de la dernière version…',
      upToDate: 'Tu as la dernière version.',
      downloading: 'Téléchargement de la mise à jour… {percent} %',
      downloadingLabel: 'Avancement du téléchargement',
      ready: 'Touche « Installer » dans l’écran d’Android.',
      readyProtect:
        'Si Play Protect s’affiche, touche « Installer sans analyser », puis confirme avec ton empreinte ou ton code.',
      retry: 'Réessayer',
      // Une phrase par cas, jamais un code ni une adresse
      errors: {
        OFFLINE: 'Pas de connexion pour le moment.',
        DIGEST_MISMATCH: 'Le fichier téléchargé n’est pas le bon : rien n’a été installé.',
        INVALID_PACKAGE: 'Le fichier téléchargé n’est pas le bon : rien n’a été installé.',
        PERMISSION_DENIED: 'Android n’a pas autorisé l’installation.',
        generic: 'La mise à jour n’a pas pu se faire. Réessaie un peu plus tard.',
      },
    },
    download: 'Télécharger la dernière version',
    downloadFor: 'Télécharger la dernière version (s’ouvre dans un nouvel onglet)',
    steps: {
      download:
        'Touche « Télécharger la dernière version », puis, dans la version dont le nom commence par « android-v », le fichier « .apk » dont le nom se termine par le numéro de version : prends celui qui a le plus grand numéro.',
      open: 'Ouvre le fichier téléchargé.',
      install: 'Touche « Installer ».',
    },
  },
  // La politique de confidentialité PUBLIQUE de tout Repas, `/confidentialite` (STORE-010) : donnée à Google Play et à Amazon (skill Alexa). Chaque
  // phrase a sa source dans le code du back (tables `user`, `refresh_token`, `user_app_version`, `voice_*`, `spoken_phrase_choice`, `drive_*`) ;
  // la date de mise à jour change avec le texte. L'éditeur et l'adresse viennent du propriétaire (D2 de STORE-001) : nulle part ailleurs.
  // Le jargon (jeton, OAuth, identité) n'y figure pas (privacy.spec.ts).
  privacy: {
    title: 'Confidentialité',
    link: 'Confidentialité',
    back: 'Retour à Repas',
    updated: 'Dernière mise à jour : 26 octobre 2026.',
    address: "kantin.charignon{'@'}gmail.com",
    intro: 'Cette page dit ce que Repas retient sur toi, pourquoi, et comment tout effacer.',
    who: {
      title: 'Qui édite Repas',
      publisher: 'Repas est édité par Kantin.',
      contact: 'Pour toute question sur tes données, écris à cette adresse :',
    },
    keeps: {
      title: 'Ce que Repas retient de toi',
      email: 'Ton adresse e-mail, pour te connecter et t’envoyer les liens de confirmation.',
      password: 'Ton mot de passe, sous une forme que personne ne peut relire.',
      settings: 'Tes réglages, comme le nombre de personnes par défaut.',
      status: 'L’état de ton compte : en attente, actif ou désactivé.',
      counters: 'Deux compteurs : tes recettes créées et tes ingrédients créés.',
      login: 'La date de ta dernière connexion. Seule la personne qui gère Repas peut la voir.',
      session: 'Pour rester connecté, un cookie réservé à Repas garde ta session ouverte.',
      content: 'Tes recettes, tes ingrédients, tes repas planifiés et tes listes de courses.',
      others:
        'Les autres comptes peuvent voir le nom de tes recettes et en copier une. Ton adresse e-mail ne leur est jamais montrée.',
      app: 'Dans l’application Android : sa version, et la date à laquelle Repas l’a vue. Rien d’autre sur ton téléphone.',
    },
    drive: {
      title: 'Si tu utilises l’envoi au drive',
      store: 'Ton magasin {retailer} : son numéro, son adresse et le nom que tu lui donnes.',
      products: 'Les produits que tu choisis, avec leur prix vu et la date.',
      search: 'Les mots que tu as tapés pour trouver un produit.',
      lists: 'Pour chaque liste : si elle est envoyée, et la date d’envoi.',
      never: 'Repas ne voit ni ton identifiant {retailer}, ni ton mot de passe, ni ton panier.',
      own: 'L’envoi se fait dans l’application, avec ta propre connexion à {retailer}.',
      terms: 'Le détail est dans les conditions d’utilisation du drive, depuis « Moi ».',
    },
    voice: {
      title: 'La commande vocale avec Alexa',
      intro:
        'Une fois liée, Alexa ajoute, retire et lit les produits de ta liste. Elle planifie et retire aussi tes repas.',
      link: 'Repas retient la liaison avec ton compte Alexa et son identifiant. Il retient aussi sa date de création et celle du dernier usage.',
      access:
        'Repas donne à Alexa un droit de lire et de modifier ta liste. Repas ne le garde que sous une forme illisible.',
      items:
        'Les produits que tu dictes sont ajoutés ou retirés de ta liste. Les repas que tu dictes y sont planifiés ou retirés.',
      phrases:
        'Si tu choisis une proposition d’Alexa, Repas retient ta phrase, simplifiée. Elle sert pour ce produit ou cette recette.',
      create: 'Si tu demandes un nouveau produit, il est créé dans tes ingrédients.',
      not: 'Repas ne garde aucun enregistrement de ta voix. Il ne garde pas non plus le texte complet de ce que tu dis. Ni l’identifiant de ton appareil Alexa.',
      amazon: 'Ta voix est traitée par Amazon, selon sa propre politique de confidentialité.',
      amazonLink: 'Lire la politique d’Amazon',
      unlink: 'Tu retires la liaison quand tu veux, dans « Moi », rubrique « Assistant vocal ».',
    },
    never: {
      title: 'Ce que Repas ne fait pas',
      ads: 'Repas ne montre aucune publicité et ne mesure pas l’audience de ses pages.',
      sell: 'Repas ne vend pas tes données.',
      sensors: 'Il ne lit ni ta position, ni tes contacts, ni tes photos.',
    },
    share: {
      title: 'Qui reçoit des données',
      host: 'Le serveur de Repas est hébergé chez DigitalOcean.',
      mail: 'Les e-mails de confirmation et de mot de passe oublié passent par Brevo.',
      amazon: 'Amazon reçoit ce que tu dis à Alexa, comme pour toute demande.',
      logs: 'Comme tout serveur, Repas note l’heure, l’adresse Internet et la page de chaque demande. Ce journal sert à réparer les pannes.',
      nobody: 'Personne d’autre ne reçoit tes données.',
    },
    duration: {
      title: 'Combien de temps',
      while: 'Tes données restent tant que ton compte existe.',
      erase:
        'Quand ton compte est supprimé, tout part avec lui : recettes, listes, produits, liaisons Alexa.',
      copies: 'Une recette que quelqu’un a copiée reste chez lui, sans lien avec toi.',
      shared:
        'Les descriptions de produits {retailer}, communes à tous, restent sans aucun lien avec toi.',
      backups:
        'Une sauvegarde est faite chaque nuit, et les 14 dernières sont gardées. Une donnée effacée peut y rester environ deux semaines.',
    },
    rights: {
      title: 'Tes droits',
      ask: 'Tu peux demander à voir, corriger ou effacer tes données.',
      delete: 'Pour supprimer ton compte et tout ce qu’il contient, écris à Kantin.',
      self: 'Tu peux déjà retirer toi-même une liaison Alexa, une recette ou une liste.',
    },
    children: {
      title: 'Les enfants',
      text: 'Repas ne s’adresse pas aux enfants de moins de 13 ans.',
    },
    changes: {
      title: 'Quand ce texte change',
      date: 'La date de la dernière mise à jour est en haut de cette page.',
      why: 'Ce texte change quand Repas retient de nouvelles données.',
    },
  },
  // Les conditions d'utilisation du drive (DRV-504 puis DRV-628) : la SEULE page qui parle des risques et des engagements du drive (la politique de confidentialité de tout Repas, `privacy`, est une autre page, publique).
  // Les écrans du parcours n'en disent rien (voice-and-glossary.spec.ts échoue sinon) ; on l'ouvre si on le veut, depuis « Moi » et l'aide.
  // À garder identique au fond à `docs/drive/note-vie-privee.md` du dépôt back.
  driveTerms: {
    title: 'Conditions d’utilisation du drive',
    link: 'Conditions d’utilisation',
    back: 'Moi',
    privacyLink: 'Confidentialité de tout Repas',
    intro:
      'Envoyer ta liste au drive, c’est Repas qui prépare la liste et l’application qui la met dans ton panier {retailer}, avec ta connexion à toi. Voici comment cela se passe, ce que Repas garde, ce qu’il ne voit pas, les risques, et comment tout effacer.',
    how: {
      title: 'Comment ça se passe',
      start:
        'Quand tu touches « Envoyer au drive », Repas prépare ta liste et la donne à l’application, sur ton téléphone. Rien n’est mis au panier tant que tu n’as pas touché « Commencer ».',
      session:
        'L’application ouvre {retailer} dans sa propre fenêtre. C’est toi qui te connectes à {retailer}, comme sur le site. Ensuite elle cherche les produits et les met dans ton panier depuis ta session {retailer}, comme si tu le faisais toi-même : un produit à la fois, avec des pauses, pour ne pas gêner {retailer}.',
      local:
        'Tout cela se passe entre ton téléphone et {retailer}. Rien de cela ne passe par les serveurs de Repas. Comme dans un navigateur, les pages {retailerDe} font appel à leurs propres services (protection contre les robots, mesure d’audience) : Repas n’y a pas accès et ne les choisit pas. À la fin, l’application ne rend à Repas que ce qu’il doit retenir : les produits que tu as choisis, et ton magasin quand tu le lui fais lire. Rien d’autre de ton compte {retailer} ne quitte la page.',
      resume:
        'Si l’envoi s’arrête, tu le reprends là où il en était : l’avancement est gardé et les articles déjà faits ne sont pas refaits.',
      order:
        'Tu finalises ta commande toi-même sur {retailer}. Repas ne valide jamais de commande, ne choisit pas de créneau, ne paie rien et ne vide jamais ton panier. Il ne réduit jamais une quantité déjà au panier : un article déjà présent en plus grande quantité reste tel quel.',
    },
    saves: {
      title: 'Ce que Repas enregistre',
      store:
        'Ton magasin {retailer} : son numéro, son adresse sur le site {retailerDe}, et le nom que tu lui as donné si tu en as mis un.',
      choices:
        'Les produits dont Repas se souvient, article par article : ton produit habituel, tes produits de remplacement (5 au plus), les produits à ne plus proposer (20 au plus) et les articles « J’en ai toujours ». Ces produits sont propres à ton magasin.',
      products:
        'Pour chaque produit : son numéro chez {retailer}, son nom, son contenu (par exemple 1 kg), et son prix avec la date où il a été vu.',
      searches:
        'La recherche qui t’a fait trouver un produit : le texte que tu as tapé pour le trouver sur le site (par exemple « céréales coussins »), pour chercher un remplaçant avec ce texte quand le produit n’est plus disponible. Elle est gardée avec l’article, pour ton magasin {retailer} seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit. Elle est gardée aussi quand tu prends un produit « Pas mon habituel » : le produit n’est pas retenu, mais le texte qui l’a fait trouver l’est.',
      packSizes:
        'Combien il y en a dans un produit, quand ta liste compte autrement qu’en poids ou en volume : si ta liste dit « 15 tranches », Repas ne sait pas combien de tranches tient dans un produit. Il te le demande une fois, et retient ta réponse (par exemple « 20 tranches ») pour calculer le nombre de produits la fois suivante, sans te le redemander. Elle est gardée avec ce produit-là, dans ton article, pour ton magasin {retailer} seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit.',
      estimate:
        'Les prix servent à estimer le coût d’une liste. L’estimation est indicative : elle est faite d’après les derniers prix vus, avec leur date, et le vrai prix est toujours celui {retailerDe}. Elle ne compte que les articles dont le prix est connu, elle est peu fiable quand moins de la moitié en ont un, et Repas ne devine jamais un prix.',
      lists:
        'Pour chaque liste : le fait qu’elle a été « envoyée au drive » et la date de l’envoi.',
      appVersion:
        'Le numéro de version de l’application Repas de ton téléphone, avec la date où il a été vu, pour te dire quand une nouvelle version est prête. Seule la version est retenue : aucun identifiant de ton téléphone, aucun modèle de téléphone.',
    },
    never: {
      title: 'Ce que Repas ne voit et n’enregistre jamais',
      credentials:
        'Ton identifiant et ton mot de passe {retailer}, et le code que {retailer} t’envoie par e-mail.',
      cookies: 'Tes cookies et tes jetons de connexion à {retailer}.',
      address: 'Ton adresse, ton créneau de retrait, ton moyen de paiement.',
      basket: 'Le contenu réel de ton panier {retailer}, tes commandes, tes achats passés.',
      photos: 'Les photos des produits.',
    },
    where: {
      title: 'Où, et combien de temps',
      server:
        'Les données sont dans la base de Repas, sur le serveur de Repas (hébergé chez DigitalOcean). Repas ne les donne à personne, ne les vend pas, ne fait pas de publicité et n’envoie pas de statistiques à des tiers.',
      duration:
        'Elles restent tant que ton compte existe, ou jusqu’à ce que tu les oublies (voir plus bas).',
      backups:
        'Le serveur fait une copie de sauvegarde chaque nuit et garde les 14 dernières : une donnée effacée peut rester dans ces copies environ deux semaines au plus, puis elles sont remplacées.',
      phone:
        'Sur ton téléphone, l’application garde ta connexion à {retailer}, comme le ferait un navigateur. Elle ne la partage ni avec Repas ni avec personne d’autre que {retailer} et ses propres services. Tu peux l’effacer à tout moment : menu de l’application, « Se déconnecter {retailerDe} ».',
      sheets:
        'Les descriptions de produits (nom, contenu, prix vu, magasin) sont communes à tous les utilisateurs de Repas et ne disent pas qui les a vues. Chacun ne retrouve que les produits dont Repas se souvient pour lui. La première personne qui décrit un produit fixe sa description (nom, contenu, code-barres) : les suivantes ne la réécrivent pas, elles ne font que la compléter si elle est incomplète ; le prix vu, lui, est rafraîchi par celles qui choisissent ce produit. Ces descriptions restent quand un compte est supprimé, mais sans aucun lien avec la personne.',
    },
    erase: {
      title: 'Comment tout effacer',
      product:
        'Un produit, ou un article : dans « Moi », « Mes produits du drive » : retire un produit, choisis « Ne plus proposer » pour un autre, ou touche « Oublier cet article » pour effacer tout ce que Repas retient sur lui.',
      store:
        'Un changement de magasin : si tu changes de magasin, les produits dont Repas se souvient pour l’ancien magasin ne sont plus utilisés, mais ils restent enregistrés jusqu’à la suppression de ton compte.',
      all: 'Tout, d’un coup : demande la suppression de ton compte à la personne qui administre Repas. Elle efface tes données du drive (magasin, produits dont Repas se souvient), tes listes de courses avec leur statut d’envoi, et le reste de ton compte.',
      rights:
        'Pour exercer tes droits (savoir ce que Repas a de toi, corriger, effacer), écris à la personne qui t’a donné accès à Repas.',
    },
    before: {
      title: 'Avant d’utiliser l’envoi : ce que tu dois savoir',
      account:
        'L’envoi agit dans ton propre compte {retailer}, avec ta propre connexion, comme si tu faisais les recherches et les ajouts toi-même. Repas ne voit jamais tes identifiants.',
      stop: 'Si {retailer} ralentit les requêtes, l’application s’arrête d’elle-même. Attends plusieurs heures avant de reprendre l’envoi, sans le relancer en boucle. Si ton compte {retailer} pose un problème, contacte le service client {retailerDe} : Repas n’a aucun accès à ton compte et ne contacte jamais {retailer}.',
      manual:
        'Tu peux t’en passer à tout moment : la liste de Repas reste utilisable pour faire tes courses à la main sur {retailer}.',
    },
    // Ce qui est propre à chaque enseigne (ADR 0027, DRV-708) : une section par identifiant du registre, jamais le nom d'une enseigne ailleurs.
    // `specific` : la phrase de l'enseigne dans « Avant d'utiliser l'envoi », entre « ton compte » et « si l'enseigne ralentit ».
    retailers: {
      leclerc: {
        specific:
          'Les conditions d’utilisation de Leclerc permettent de suspendre un compte E.Leclerc (et la cagnotte de Tickets E.Leclerc qui va avec) si l’usage est jugé abusif. Repas limite ce risque : une requête à la fois, avec des pauses, seulement quand tu le demandes, et seulement pour ta liste. Mais le risque existe et il est pour ton compte.',
      },
      auchan: {
        // DRV-727, TEXTE À VALIDER par le propriétaire : il ne dit que ce que Repas fait, rien des conditions d’Auchan (le sujet est clos, et leur contenu n’a pas été relevé).
        specific:
          'Repas remplit ton panier dans la page Auchan de ton téléphone. Il ne valide jamais ta commande et ne paie jamais : c’est toi qui finis, sur Auchan. Il va doucement : une demande à la fois, avec des pauses, seulement quand tu le demandes, et seulement pour ta liste.',
      },
    },
  },
  // L'estimation du coût d'une liste (DRV-612)
  driveEstimate: {
    title: 'Estimation du coût',
    loading: 'Calcul de l’estimation…',
    unavailable: 'L’estimation n’est pas disponible pour le moment.',
    retry: 'Réessayer',
    settings: 'Réglages du drive',
    total: 'Total estimé',
    coverage: '{count} article sur {total} estimé | {count} articles sur {total} estimés',
    // Aucun article n'a de prix : une seule phrase, ni compteur, ni avertissement, ni détail (DRV-626). Le total et le nombre d'articles estimés,
    // rien d'autre (DRV-628) : les réserves sur l'estimation sont dans les conditions d'utilisation du drive.
    noPrice: 'Pas encore de prix connu.',
    nothingToBuy: 'Rien à estimer : aucun article n’est à acheter au drive.',
    detail: 'Voir le détail ({count} article) | Voir le détail ({count} articles)',
    groups: {
      unestimated: 'Non estimées ({count})',
      estimated: 'Estimées ({count})',
      haveAtHome: 'J’en ai toujours ({count})',
    },
    packsAt: '{count} × {price}',
    seenOn: 'prix vu le {date}',
    status: {
      ESTIMATED: 'estimée',
      NO_PRODUCT: 'pas de produit choisi',
      NO_PRICE: 'pas de prix connu',
      TO_CHECK: 'à vérifier',
      HAVE_AT_HOME: 'j’en ai toujours',
    },
  },
}
