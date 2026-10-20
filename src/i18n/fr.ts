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
  },
  common: {
    loading: 'Chargement…',
    close: 'Fermer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
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
    order: "Ordre d'affichage",
    orderHint: 'Les types sont affichés du plus petit au plus grand.',
    orderN: 'Ordre {n}',
    newUnit: 'Nouvelle unité',
    editUnit: "Modifier l'unité",
    newDepartment: 'Nouveau rayon',
    editDepartment: 'Modifier le rayon',
    newRecipeType: 'Nouveau type de recette',
    editRecipeType: 'Modifier le type de recette',
    newConversion: 'Nouvelle conversion',
    editConversion: 'Modifier la conversion',
    startUnit: 'Unité de départ',
    endUnit: "Unité d'arrivée",
    coefficient: 'Coefficient',
    coefficientHint: 'Une unité de départ vaut ce nombre d’unités d’arrivée.',
    ingredient: 'Ingrédient',
    allIngredients: 'Tous les ingrédients',
    conversionLine: '1 {start} = {coefficient} {end}',
    administrator: 'Administrateur',
    status: {
      PENDING: 'En attente',
      ACTIVE: 'Actif',
      DISABLED: 'Désactivé',
    },
    statusOf: 'Statut de {email}',
    statusChanged: 'Statut de {email} modifié.',
    userDeleted: '{email} supprimé.',
    deleteNamed: 'Supprimer {email}',
    deleteUserTitle: 'Supprimer ce compte ?',
    deleteUserHelp:
      'Le compte {email} disparaît avec ses listes de courses, ses recettes et ses ingrédients personnalisés, comme s’il n’avait jamais existé. Les recettes qu’un autre utilisateur en a copiées restent. Cette action est irréversible.',
    userStats: '{recipes} recettes, {ingredients} ingrédients, {lists} listes',
    since: 'inscrit le {date}',
    // La version de l'application Android vue pour ce compte (DRV-637)
    appVersion: 'Application : {version}',
    appVersionUnknown: '—',
    appOutdated: 'À mettre à jour',
    errors: {
      name: 'Donne un nom.',
      image: 'Indique une image.',
      order: 'Indique un ordre.',
      sameUnit: 'Choisis deux unités différentes.',
      coefficient: 'Entre un nombre supérieur à zéro.',
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
    edit: 'Modifier',
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
    coefficient: 'Une unité d’achat vaut combien d’unités de recette ?',
    coefficientHint:
      'Par exemple 1000 pour un kilo en grammes. Laisse vide si la conversion existe déjà.',
    deleteTitle: "Supprimer l'ingrédient ?",
    deleteHelp: '« {name} » sera supprimé avec ses conversions.',
    inUse: 'Impossible : cet ingrédient est utilisé dans une recette ou une liste de courses.',
    errors: {
      name: "Donne un nom à l'ingrédient.",
      coefficient: 'Entre un nombre supérieur à zéro.',
      protectedAccount: 'Ce compte est protégé : il reste actif et ne se supprime pas.',
      ownAccount: 'Tu ne peux pas supprimer ton propre compte.',
    },
  },
  recipes: {
    title: 'Recettes',
    others: 'Recettes des autres',
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
    copy: 'Copier',
    copyNamed: 'Copier {name} dans mes recettes',
  },
  editor: {
    newTitle: 'Nouvelle recette',
    editTitle: 'Modifier la recette',
    backToRecipe: 'Retour à la recette',
    name: 'Nom de la recette',
    serving: 'Nombre de personnes',
    type: 'Type de recette',
    addRow: 'Ajouter un ingrédient',
    ingredientN: 'Ingrédient {n}',
    quantityN: "Quantité de l'ingrédient {n}",
    unitN: "Unité de l'ingrédient {n}",
    removeRow: "Retirer l'ingrédient {n}",
    ingredientPlaceholder: 'Choisir un ingrédient',
    noIngredient: 'Aucun ingrédient ne correspond.',
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
    resumeSend: 'Reprendre l’envoi',
    send: 'Envoyer au drive',
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
    packSizeQuestion: 'Combien de {units} y a-t-il dans ce produit ?',
    packSizeSave: 'Enregistrer',
    packSizeCancel: 'Annuler',
    packSizeInvalid: 'Entre un nombre, par exemple 20 ou 12,5.',
    packSizeSaved: 'Contenu enregistré.',
  },
  auth: {
    pitch: 'Tes recettes, tes courses, sans oublier le basilic.',
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
    sent: 'Un lien de confirmation a été envoyé à {email}. Ouvre-le pour activer ton compte.',
    askAddress: "Saisis l'adresse de ton compte pour recevoir un nouveau lien de confirmation.",
    spam: 'Rien reçu ? Regarde dans tes courriers indésirables, puis demande un nouveau lien.',
    resend: 'Renvoyer le lien',
    resendIn: 'Renvoyer le lien dans {seconds} s',
    resent: "Si un compte attend cette adresse, un nouveau lien vient d'être envoyé.",
    tooMany: 'Trop de demandes. Réessaie plus tard.',
    invalidEmail: "Cette adresse e-mail n'est pas valide.",
    signIn: 'Retour à la connexion',
  },
  confirmEmail: {
    title: "Confirmation de l'adresse",
    confirming: 'Confirmation en cours…',
    done: 'Ton adresse est confirmée : ton compte est activé.',
    signIn: 'Se connecter',
    invalid: "Ce lien n'est plus valable : il a déjà servi ou il a expiré.",
    invalidHelp: 'Si ton adresse est déjà confirmée, connecte-toi. Sinon, demande un nouveau lien.',
    newLink: 'Recevoir un nouveau lien',
    retry: 'Réessayer',
  },
  register: {
    title: 'Créer un compte',
    submit: 'Créer mon compte',
    passwordHint: '8 caractères au moins.',
    serving: 'Nombre de personnes par défaut',
    servingHint: 'Proposé pour chaque recette, modifiable ensuite.',
    emailTaken: 'Cette adresse e-mail est déjà utilisée.',
    tooMany: "Trop d'inscriptions depuis cette adresse. Réessaie plus tard.",
    haveAccount: 'Déjà un compte ?',
    signIn: 'Se connecter',
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
    listNotSent:
      'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvre la liste pour voir où elle en est.',
    listNotSendable:
      'Seule une liste en cours peut être envoyée au drive. Rien n’a été changé. Ouvre une liste en cours.',
    listEmpty:
      'La liste est vide : il n’y a rien à envoyer au drive. Ta liste n’a pas changé. Ajoute des articles, puis envoie-la.',
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
    driveStoreInvalid:
      'Cette adresse n’est pas celle d’un magasin Leclerc Drive : vérifie-la, elle ressemble à https://exemple.leclercdrive.fr/magasin-123456-123456.',
  },
  driveSend: {
    title: 'Ta liste est prête pour le drive',
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
      new: '{count} est à choisir sur Leclerc | {count} sont à choisir sur Leclerc',
      allNew: 'il est à choisir sur Leclerc | tous sont à choisir sur Leclerc',
      other: '{count} ne sera pas mis au panier | {count} ne seront pas mis au panier',
      allOther: 'il ne sera pas mis au panier | aucun ne sera mis au panier',
    },
    articles: 'Tes articles',
    showArticles: 'Voir les articles',
    need: 'À acheter : {quantity}',
    statusNew: 'Nouveau : tu choisiras le produit sur Leclerc.',
    statusReplace: 'Tu choisiras un autre produit sur Leclerc, à la place de : {label}.',
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
    open: 'Ouvrir le drive',
    reopenDrive: 'Rouvrir le drive',
    opening: 'Ouverture du drive…',
    offline:
      'Hors connexion : l’envoi au drive est impossible tant que le réseau n’est pas revenu.',
    emptyPlan: 'Cette liste n’a aucun article à envoyer.',
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
      help: 'L’envoi automatique fonctionne dans l’application Repas pour Android. Tu peux l’installer, ou chercher chaque produit sur Leclerc avec les liens ci-dessous.',
      install: 'Installer l’application',
      search: 'Chercher sur Leclerc',
      searchFor: 'Chercher sur Leclerc : {name} (s’ouvre dans un nouvel onglet)',
    },
    // Une application trop ancienne pour le drive (DRV-640) : une phrase et un bouton, les liens de recherche restent sous l'écran
    appTooOld: {
      text: 'Mets à jour l’application pour envoyer ta liste.',
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
        'L’application n’a pas pu ouvrir le drive. Rien n’a été mis au panier. Réessaie dans un instant.',
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
    setup: {
      title: 'Lecture du magasin',
      help: 'Cette réponse est celle d’une lecture du magasin : elle se traite dans les réglages du drive.',
      settings: 'Réglages du drive',
    },
    // Le titre dit le résultat ; le reste, au plus trois phrases : ce qui s'est passé, ce qui est sauf, ce qu'il reste à faire
    safe: 'Ce qui est déjà au panier y reste.',
    // Le panier est fait : la suite (créneau, paiement) se passe dans l'appli officielle, Repas n'explique rien de plus (DRV-645)
    basketReady: 'Ton panier est prêt. Retrouve-le dans l’appli {retailer}.',
    outcome: {
      completed: {
        title: 'Le panier est rempli',
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
        happened: 'Tu n’es pas connecté à Leclerc.',
        action: 'Connecte-toi à Leclerc, puis reprends l’envoi.',
      },
      STORE_MISMATCH: {
        happened: 'Le magasin ouvert sur Leclerc n’est pas le tien.',
        action: 'Ouvre ton magasin sur Leclerc, puis reprends l’envoi.',
      },
      BLOCKED: {
        happened: 'Leclerc a ralenti les demandes.',
        action: 'Attends quelques minutes, puis reprends l’envoi.',
      },
      CONTRACT_CHANGED: {
        happened: 'Leclerc a changé son site, l’envoi automatique est arrêté.',
        action: 'Cherche tes produits à la main sur Leclerc.',
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
        happened: 'Repas ne peut pas travailler sur cette page de Leclerc.',
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
      chosen: 'Choisis sur Leclerc',
      haveAtHome: 'J’en ai toujours',
      skipped: 'Pas cette fois',
      unavailable: 'Indisponibles',
    },
    quantity: '× {count}',
    unknownProduct: 'Produit n° {id}',
    line: {
      fallback: 'Produit de remplacement utilisé : le produit habituel n’était pas disponible.',
      chosenPrimary: 'Choisi sur Leclerc, produit habituel : Repas s’en souvient.',
      chosenFallback: 'Choisi sur Leclerc, produit de remplacement : Repas s’en souvient.',
      chosenOnce: 'Choisi sur Leclerc pour cette fois seulement : Repas ne s’en souvient pas.',
      haveAtHome: 'J’en ai toujours : Repas s’en souvient.',
      skipped: 'Pas cette fois.',
      unavailable: 'Aucun produit disponible : rien n’a été mis au panier.',
      failed: 'Pas ajouté au panier. {reason}',
      rejected: 'Ne sera plus proposé : {labels}',
    },
    actions: {
      newTab: 'S’ouvre dans un nouvel onglet.',
      manual: 'Chercher à la main sur Leclerc',
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
    entryHelp: 'Ton magasin Leclerc Drive et l’application Repas.',
    disabled: 'L’envoi au drive n’est pas encore activé : il n’y a rien à régler pour le moment.',
    // Envoyé ici faute de magasin (DRV-622, DRV-623) : un titre, une phrase, un bouton qui fait le travail
    chooseTitle: 'Choisis ton magasin',
    chooseHelp: 'Pour envoyer ta liste, Repas doit connaître ton magasin Leclerc.',
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
    addressHint:
      'Celle du site du drive une fois ton magasin choisi, par exemple https://exemple.leclercdrive.fr/magasin-123456-123456.',
    name: 'Nom de ton magasin (facultatif)',
    nameHint: 'Pour le reconnaître : le nom de ta ville, par exemple.',
    changeWarning:
      'Ce n’est pas ton magasin actuel. Les produits habituels de l’ancien magasin ne seront plus proposés. Tu les choisiras de nouveau.',
    save: 'Enregistrer mon magasin',
    saved: 'Magasin enregistré.',
    errors: {
      address:
        'Cette adresse n’est pas celle d’un magasin Leclerc Drive : elle ressemble à https://exemple.leclercdrive.fr/magasin-123456-123456.',
    },
    offline:
      'Hors connexion : l’enregistrement est impossible tant que le réseau n’est pas revenu.',
    app: 'Application Repas',
    appVersion: 'Version {version}',
    appChecking: 'Vérification de l’application…',
    appNoAnswer: 'L’application ne répond pas : ferme-la, puis rouvre-la.',
    appDriveOff:
      'Le drive ne peut pas fonctionner dans cette version de l’application : mets-la à jour.',
    appMissing:
      'Tu utilises Repas dans un navigateur. Pour envoyer une liste au drive, installe l’application Repas sur ton téléphone.',
    help: 'Aide d’installation',
    // Dans l'application elle-même : elle est installée, l'aide sert à la mettre à jour
    helpInApp: 'Mettre à jour l’application',
    products: 'Produits dont Repas se souvient',
    productsWith: 'Articles avec des produits',
    productsRejected: 'Articles avec des produits à ne plus proposer',
    productsHome: 'Articles « J’en ai toujours »',
    manage: 'Gérer mes produits',
  },
  // Les entrées de l’application dans « Moi » (DRV-320)
  driveAccount: {
    appMenu: 'Menu de l’application',
    appMenuHelp: 'Version, mode d’emploi et déconnexion de Leclerc.',
    appMenuFailed: 'Le menu de l’application n’a pas pu s’ouvrir. Réessaie.',
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
    download: 'Télécharger la dernière version',
    downloadFor: 'Télécharger la dernière version (s’ouvre dans un nouvel onglet)',
    steps: {
      download:
        'Touche « Télécharger la dernière version », puis le fichier « .apk » de la version dont le nom commence par « android-v ».',
      open: 'Ouvre le fichier téléchargé.',
      install: 'Touche « Installer ».',
    },
  },
  // Les conditions d'utilisation du drive (DRV-504 puis DRV-628) : la SEULE page qui parle des risques, de la vie privée et des engagements.
  // Les écrans du parcours n'en disent rien (voice-and-glossary.spec.ts échoue sinon) ; on l'ouvre si on le veut, depuis « Moi » et l'aide.
  // À garder identique au fond à `docs/drive/note-vie-privee.md` du dépôt back.
  driveTerms: {
    title: 'Conditions d’utilisation du drive',
    link: 'Conditions d’utilisation',
    back: 'Moi',
    intro:
      'Envoyer ta liste au drive, c’est Repas qui prépare la liste et l’application qui la met dans ton panier Leclerc, avec ta connexion à toi. Voici comment cela se passe, ce que Repas garde, ce qu’il ne voit pas, les risques, et comment tout effacer.',
    how: {
      title: 'Comment ça se passe',
      start:
        'Quand tu touches « Envoyer au drive », Repas prépare ta liste et la donne à l’application, sur ton téléphone. Rien n’est mis au panier tant que tu n’as pas touché « Commencer ».',
      session:
        'L’application ouvre Leclerc dans sa propre fenêtre. C’est toi qui te connectes à Leclerc, comme sur le site. Ensuite elle cherche les produits et les met dans ton panier depuis ta session Leclerc, comme si tu le faisais toi-même : un produit à la fois, avec des pauses, pour ne pas gêner Leclerc.',
      local:
        'Tout cela se passe entre ton téléphone et Leclerc. Rien de cela ne passe par les serveurs de Repas. Comme dans un navigateur, les pages de Leclerc font appel à leurs propres services (protection contre les robots, mesure d’audience) : Repas n’y a pas accès et ne les choisit pas. À la fin, l’application ne rend à Repas que ce qu’il doit retenir : les produits que tu as choisis, et ton magasin quand tu le lui fais lire. Rien d’autre de ton compte Leclerc ne quitte la page.',
      resume:
        'Si l’envoi s’arrête, tu le reprends là où il en était : l’avancement est gardé et les articles déjà faits ne sont pas refaits.',
      order:
        'Tu finalises ta commande toi-même sur Leclerc. Repas ne valide jamais de commande, ne choisit pas de créneau, ne paie rien et ne vide jamais ton panier. Il ne réduit jamais une quantité déjà au panier : un article déjà présent en plus grande quantité reste tel quel.',
    },
    saves: {
      title: 'Ce que Repas enregistre',
      store:
        'Ton magasin Leclerc : son numéro, son adresse sur le site de Leclerc, et le nom que tu lui as donné si tu en as mis un.',
      choices:
        'Les produits dont Repas se souvient, article par article : ton produit habituel, tes produits de remplacement (5 au plus), les produits à ne plus proposer (20 au plus) et les articles « J’en ai toujours ». Ces produits sont propres à ton magasin.',
      products:
        'Pour chaque produit : son numéro chez Leclerc, son nom, son contenu (par exemple 1 kg), et son prix avec la date où il a été vu.',
      searches:
        'La recherche qui t’a fait trouver un produit : le texte que tu as tapé pour le trouver sur le site (par exemple « céréales coussins »), pour chercher un remplaçant avec ce texte quand le produit n’est plus disponible. Elle est gardée avec l’article, pour ton magasin Leclerc seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit. Elle est gardée aussi quand tu prends un produit « Pas mon habituel » : le produit n’est pas retenu, mais le texte qui l’a fait trouver l’est.',
      packSizes:
        'Combien il y en a dans un produit, quand ta liste compte autrement qu’en poids ou en volume : si ta liste dit « 15 tranches », Repas ne sait pas combien de tranches tient dans un produit. Il te le demande une fois, et retient ta réponse (par exemple « 20 tranches ») pour calculer le nombre de produits la fois suivante, sans te le redemander. Elle est gardée avec ce produit-là, dans ton article, pour ton magasin Leclerc seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit.',
      estimate:
        'Les prix servent à estimer le coût d’une liste. L’estimation est indicative : elle est faite d’après les derniers prix vus, avec leur date, et le vrai prix est toujours celui de Leclerc. Elle ne compte que les articles dont le prix est connu, elle est peu fiable quand moins de la moitié en ont un, et Repas ne devine jamais un prix.',
      lists:
        'Pour chaque liste : le fait qu’elle a été « envoyée au drive » et la date de l’envoi.',
      appVersion:
        'Le numéro de version de l’application Repas de ton téléphone, avec la date où il a été vu, pour te dire quand une nouvelle version est prête. Seule la version est retenue : aucun identifiant de ton téléphone, aucun modèle de téléphone.',
    },
    never: {
      title: 'Ce que Repas ne voit et n’enregistre jamais',
      credentials:
        'Ton identifiant et ton mot de passe Leclerc, et le code que Leclerc t’envoie par e-mail.',
      cookies: 'Tes cookies et tes jetons de connexion à Leclerc.',
      address: 'Ton adresse, ton créneau de retrait, ton moyen de paiement.',
      basket: 'Le contenu réel de ton panier Leclerc, tes commandes, tes achats passés.',
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
        'Sur ton téléphone, l’application garde ta connexion à Leclerc, comme le ferait un navigateur. Elle ne la partage ni avec Repas ni avec personne d’autre que Leclerc et ses propres services. Tu peux l’effacer à tout moment : menu de l’application, « Se déconnecter de Leclerc ».',
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
        'L’envoi agit dans ton propre compte Leclerc, avec ta propre connexion, comme si tu faisais les recherches et les ajouts toi-même. Repas ne voit jamais tes identifiants.',
      suspension:
        'Les conditions d’utilisation de Leclerc permettent à l’enseigne de suspendre un compte E.Leclerc (et la cagnotte de Tickets E.Leclerc qui va avec) si elle juge l’usage abusif. Repas limite ce risque : une requête à la fois, avec des pauses, seulement quand tu le demandes, et seulement pour ta liste. Mais le risque existe et il est pour ton compte.',
      stop: 'Si Leclerc ralentit les requêtes, l’application s’arrête d’elle-même. Attends plusieurs heures avant de reprendre l’envoi, sans le relancer en boucle. Si ton compte Leclerc pose un problème, contacte le service client de Leclerc : Repas n’a aucun accès à ton compte et ne contacte jamais Leclerc.',
      manual:
        'Tu peux t’en passer à tout moment : la liste de Repas reste utilisable pour faire tes courses à la main sur Leclerc.',
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
