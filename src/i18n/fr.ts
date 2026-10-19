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
      'Hors connexion : vous voyez la dernière version enregistrée. Les modifications sont impossibles tant que le réseau n’est pas revenu.',
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
    formHelp: 'Renseignez les champs puis enregistrez.',
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
    errors: {
      name: 'Donnez un nom.',
      image: 'Indiquez une image.',
      order: 'Indiquez un ordre.',
      sameUnit: 'Choisissez deux unités différentes.',
      coefficient: 'Entrez un nombre supérieur à zéro.',
      baseFactor: 'Entrez un nombre supérieur à zéro, ou laissez vide.',
      protectedAccount: 'Ce compte est protégé : il reste actif et ne se supprime pas.',
      ownAccount: 'Vous ne pouvez pas supprimer votre propre compte.',
    },
  },
  departments: {
    title: 'Rayons',
    help: 'Ajoutez des ingrédients à votre liste de courses, rayon par rayon.',
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
    cookingUnitHint: 'Celle dans laquelle vos recettes le comptent.',
    purchaseUnit: "Unité d'achat",
    purchaseUnitHint: 'Celle de la liste de courses.',
    coefficient: 'Une unité d’achat vaut combien d’unités de recette ?',
    coefficientHint:
      'Par exemple 1000 pour un kilo en grammes. Laissez vide si la conversion existe déjà.',
    deleteTitle: "Supprimer l'ingrédient ?",
    deleteHelp: '« {name} » sera supprimé avec ses conversions.',
    inUse: 'Impossible : cet ingrédient est utilisé dans une recette ou une liste de courses.',
    errors: {
      name: "Donnez un nom à l'ingrédient.",
      coefficient: 'Entrez un nombre supérieur à zéro.',
      protectedAccount: 'Ce compte est protégé : il reste actif et ne se supprime pas.',
      ownAccount: 'Vous ne pouvez pas supprimer votre propre compte.',
    },
  },
  recipes: {
    title: 'Recettes',
    others: 'Recettes des autres',
    search: 'Rechercher une recette',
    types: 'Types de recette',
    none: "Vous n'avez pas encore de recette de ce type.",
    noMatch: 'Aucune recette ne correspond.',
    addToList: 'Ajouter à la liste',
    inList: 'Dans la liste',
    planNamed: 'Ajouter {name} à la liste de courses',
    unplanNamed: 'Retirer {name} de la liste de courses',
    ingredients: 'Ingrédients',
    forPeople: 'Pour {count} personne | Pour {count} personnes',
    new: 'Nouvelle recette',
    edit: 'Modifier',
    inUse:
      'Impossible : cette recette est dans une liste de courses. Retirez-la de la liste d’abord.',
    deleteTitle: 'Supprimer la recette ?',
    deleteHelp:
      "« {name} » sera supprimée avec ses ingrédients. Impossible tant qu'elle est dans une liste de courses.",
    othersTitle: 'Recettes des autres',
    othersHelp: 'Copiez une recette dans les vôtres pour la planifier et la modifier.',
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
      name: 'Donnez un nom à la recette.',
      serving: 'Au moins une personne.',
      noRow: 'Ajoutez au moins un ingrédient.',
      ingredient: 'Choisissez un ingrédient.',
      quantity: 'Entrez une quantité supérieure à zéro.',
      unit: 'Choisissez une unité.',
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
    sendHelp: 'La liste ne sera plus modifiable. Vous pourrez la rouvrir.',
    reopen: 'Rouvrir la liste',
    reopenTitle: 'Rouvrir la liste ?',
    reopenHelp: 'La liste redevient modifiable.',
    allLists: 'Mes listes',
    new: 'Nouvelle liste',
    noList: "Vous n'avez encore aucune liste.",
    rename: 'Renommer',
    renameHelp: 'Laissez vide pour reprendre la date comme nom.',
    name: 'Nom de la liste',
    pause: 'Mettre en pause',
    complete: 'Terminer',
    activate: 'Reprendre cette liste',
    deleteTitle: 'Supprimer la liste ?',
    deleteHelp:
      '« {name} » sera supprimée avec ses repas et ses articles. Cette action est définitive.',
    current: 'Liste en cours',
    dateLabel: 'Liste du {date}',
    noneTitle: 'Aucune liste en cours',
    noneHelp: 'Créez une liste pour y planifier des recettes et noter vos courses.',
    create: 'Créer ma liste',
    completedTitle: 'Courses terminées',
    completedHelp: 'Décochez un article pour reprendre la liste, ou commencez-en une nouvelle.',
    startNew: 'Nouvelle liste',
    progress: '{done} sur {total} articles dans le panier',
    sections: 'Contenu de la liste',
    ingredientsTab: 'Articles · {count}',
    recipesTab: 'Recettes · {count}',
    emptyIngredients:
      "Rien à acheter pour l'instant : planifiez une recette ou ajoutez des articles.",
    emptyRecipes: 'Aucune recette planifiée : choisissez-en une dans vos recettes.',
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
    servingHint: 'Proposé pour chaque recette que vous planifiez.',
    passwordTitle: 'Mot de passe',
    actualPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le nouveau mot de passe',
    changePassword: 'Changer le mot de passe',
    passwordChanged: 'Mot de passe modifié : reconnectez-vous avec le nouveau.',
    errors: {
      serving: 'Au moins une personne.',
      actual: 'Entrez votre mot de passe actuel.',
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
    entryHelp: 'Les produits que Repas prend en priorité pour vos courses au drive.',
    intro:
      'Les produits que Repas prend pour chaque article quand vous envoyez une liste au drive.',
    back: 'Tous mes produits',
    unavailable: 'L’envoi au drive n’est pas disponible pour le moment.',
    noStore:
      'Vous n’avez pas encore enregistré votre magasin : sans lui, Repas ne peut se souvenir d’aucun produit.',
    settings: 'Réglages du drive',
    none: 'Repas ne se souvient encore d’aucun produit. Ils apparaîtront ici après un envoi.',
    missing: 'Repas ne se souvient d’aucun produit pour cet article.',
    search: 'Rechercher un article',
    noMatch: 'Aucun article ne correspond à votre recherche.',
    haveAtHome: 'J’en ai toujours',
    preferred: 'Produit habituel : {label}',
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
    acceptedNone: 'Aucun produit accepté : choisissez-en un pendant un envoi.',
    acceptedFull:
      'Vous avez déjà {max} produits acceptés : retirez-en un avant d’en accepter un autre.',
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
      'Vous avez déjà {max} produits à ne plus proposer : acceptez-en un de nouveau d’abord.',
    acceptAgain: 'Accepter de nouveau',
    dirty: 'Modifications non enregistrées.',
    cancel: 'Annuler les modifications',
    saved: 'Produits enregistrés.',
    forget: 'Oublier cet article',
    forgetTitle: 'Oublier {name} ?',
    forgetDescription:
      'Repas oublie les produits de cet article : vous les choisirez de nouveau au prochain envoi.',
    forgetConfirm: 'Oublier',
    forgotten: '{name} : produits oubliés.',
    moved: '{name} : position {position} sur {total}.',
    removed: '{name} est retiré de la liste.',
    rejectedNow: '{name} ne sera plus proposé.',
    acceptedAgain: '{name} est de nouveau accepté, en dernier.',
    cancelled: 'Modifications annulées.',
  },
  auth: {
    pitch: 'Vos recettes, vos courses, sans oublier le basilic.',
  },
  login: {
    title: 'Se connecter',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    submit: 'Se connecter',
    invalid: 'Identifiants invalides.',
    tooMany:
      'Trop de tentatives. Réessayez dans {minutes} minute | Trop de tentatives. Réessayez dans {minutes} minutes',
    noAccount: 'Pas encore de compte ?',
    createAccount: 'Créer un compte',
    emailNotVerified:
      "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le lien reçu par e-mail pour activer votre compte.",
    resendLink: 'Renvoyer le lien de confirmation',
  },
  checkEmail: {
    title: 'Vérifiez votre boîte mail',
    sent: 'Un lien de confirmation a été envoyé à {email}. Ouvrez-le pour activer votre compte.',
    askAddress:
      "Saisissez l'adresse de votre compte pour recevoir un nouveau lien de confirmation.",
    spam: 'Rien reçu ? Regardez dans vos courriers indésirables, puis demandez un nouveau lien.',
    resend: 'Renvoyer le lien',
    resendIn: 'Renvoyer le lien dans {seconds} s',
    resent: "Si un compte attend cette adresse, un nouveau lien vient d'être envoyé.",
    tooMany: 'Trop de demandes. Réessayez plus tard.',
    invalidEmail: "Cette adresse e-mail n'est pas valide.",
    signIn: 'Retour à la connexion',
  },
  confirmEmail: {
    title: "Confirmation de l'adresse",
    confirming: 'Confirmation en cours…',
    done: 'Votre adresse est confirmée : votre compte est activé.',
    signIn: 'Se connecter',
    invalid: "Ce lien n'est plus valable : il a déjà servi ou il a expiré.",
    invalidHelp:
      'Si votre adresse est déjà confirmée, connectez-vous. Sinon, demandez un nouveau lien.',
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
    tooMany: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard.",
    haveAccount: 'Déjà un compte ?',
    signIn: 'Se connecter',
  },
  errors: {
    unreachable: 'Le serveur est injoignable. Réessayez dans un instant.',
    generic: 'Une erreur est survenue. Réessayez.',
    sessionExpired: 'Votre session a expiré : reconnectez-vous.',
    forbidden: "Vous n'avez pas le droit de faire cela.",
    notFound: "Cet élément n'existe plus.",
    conflict: 'Une autre modification est en cours. Réessayez dans un instant.',
    outdated:
      "Modifié ailleurs entre-temps : la page vient d'être rechargée, refaites votre action.",
    tooMany:
      'Trop de requêtes. Réessayez dans {minutes} minute | Trop de requêtes. Réessayez dans {minutes} minutes',
    // `DRIVE_RATE_LIMITED` (429, DRV-615) : passager, distinct des plafonds de quantité ; `{wait}` vaut au moins une minute
    driveRateLimited:
      'Trop de demandes en peu de temps. Rien n’est perdu. Attendez {wait}, puis réessayez.',
    driveWait: 'une minute | {minutes} minutes',
    driveDisabled:
      'L’envoi au drive n’est pas disponible pour le moment. Votre liste n’a pas changé. Réessayez plus tard.',
    listSent:
      'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable. Rien n’a été changé. Rouvrez-la pour la modifier.',
    listNotSent:
      'Cette liste n’est plus envoyée au drive. Rien n’a été changé. Ouvrez la liste pour voir où elle en est.',
    listNotSendable:
      'Seule une liste en cours peut être envoyée au drive. Rien n’a été changé. Ouvrez une liste en cours.',
    listEmpty:
      'La liste est vide : il n’y a rien à envoyer au drive. Votre liste n’a pas changé. Ajoutez des articles, puis envoyez-la.',
    driveNotConfigured: 'Choisissez d’abord votre magasin dans les réglages du drive.',
    driveChoiceInvalid:
      'Ce choix n’est pas valable : 5 produits à garder et 20 à ne plus proposer au plus, sans doublon. Rien n’a été enregistré. Corrigez-le, puis réessayez.',
    driveChoiceNotFound:
      'Repas ne se souvient plus de produit pour cet article. Rien n’a été changé. Rechargez la page pour voir l’état actuel.',
    driveLimitReached:
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui. Vos choix déjà enregistrés sont gardés. Oubliez des produits dans « Mes produits », ou réessayez demain.',
    driveStoreMismatch:
      'Votre magasin a changé : la page vient d’être rechargée. Rien n’a été enregistré. Refaites votre action.',
    unitMeasureIncomplete:
      'La dimension et le facteur de base vont ensemble : renseignez les deux, ou laissez-les vides.',
    unitBaseFactorInvalid: 'Le facteur de base doit être un nombre supérieur à zéro.',
    driveStoreInvalid:
      'Cette adresse n’est pas celle d’un magasin Leclerc Drive : vérifiez-la, elle ressemble à https://exemple.leclercdrive.fr/magasin-123456-123456.',
  },
  driveSend: {
    title: 'Votre liste est prête pour le drive',
    back: 'Retour à la liste',
    store: 'Magasin : {label}',
    storeEnding: 'Magasin …{ending}',
    loading: 'Préparation de l’envoi…',
    retry: 'Réessayer',
    offHelp:
      'Une liste envoyée au drive ne se modifie plus. Vous pouvez la rouvrir pour la modifier.',
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
    articles: 'Vos articles',
    showArticles: 'Voir les articles',
    need: 'À acheter : {quantity}',
    statusNew: 'Nouveau : vous choisirez le produit sur Leclerc.',
    statusReplace: 'Vous choisirez un autre produit sur Leclerc, à la place de : {label}.',
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
    opening: 'Ouverture…',
    offline:
      'Hors connexion : l’envoi au drive est impossible tant que le réseau n’est pas revenu.',
    emptyPlan: 'Cette liste n’a aucun article à envoyer.',
    retryOnly:
      'Reprise des articles en échec : {count} article | Reprise des articles en échec : {count} articles',
    showAll: 'Voir toute la liste',
    waiting: {
      title: 'En attente du récapitulatif…',
      help: 'Le drive est ouvert dans l’application. Gardez l’application ouverte.',
      restart: 'Recommencer',
      restartHelp: 'Recommencer abandonne l’envoi en cours et reprend la liste depuis le début.',
      reopenList: 'Rouvrir la liste',
      reopenTitle: 'Rouvrir la liste ?',
      reopenHelp: 'L’envoi en cours est abandonné et la liste redevient modifiable.',
    },
    elsewhere: {
      title: 'Un autre envoi est en cours',
      help: 'Un envoi au drive est déjà en cours pour une autre liste. Terminez-le, ou abandonnez-le pour continuer ici.',
      see: 'Voir cet envoi',
      abandon: 'Abandonner cet envoi',
    },
    notInApp: {
      title: 'L’envoi automatique n’est pas disponible ici',
      help: 'L’envoi automatique fonctionne dans l’application Repas pour Android. Vous pouvez l’installer, ou chercher vous-même chaque produit sur le site de Leclerc avec les liens ci-dessous.',
      install: 'Installer l’application',
      search: 'Chercher sur Leclerc',
      searchFor: 'Chercher sur Leclerc : {name} (s’ouvre dans un nouvel onglet)',
    },
    // Une erreur dit trois choses : ce qui s'est passé, ce qui est sauf, une action (principes-produit.md § 4)
    driveUnusable: {
      title: 'Le drive ne fonctionne pas sur ce téléphone',
      help: 'Votre liste n’a pas changé. Mettez à jour l’application Repas et « Android System WebView », puis revenez ici.',
      aid: 'Voir l’aide',
    },
    failure: {
      invalidPlan:
        'Repas n’a pas pu préparer l’envoi. Rien n’a été mis au panier. Rechargez la page, puis réessayez.',
      tooManyLines:
        'Cette liste a plus de {max} articles : c’est trop pour un seul envoi. Votre liste n’a pas changé. Retirez des articles, puis renvoyez-la.',
      tooLarge:
        'Cet envoi est trop gros pour l’application. Rien n’a été mis au panier. Mettez « Pas cette fois » sur quelques articles, puis réessayez.',
      sendFailed:
        'L’application n’a pas pu ouvrir le drive. Rien n’a été mis au panier. Réessayez dans un instant.',
      appRefused:
        'Le drive n’a pas répondu comme prévu. Rien n’a été perdu. Mettez l’application à jour, puis réessayez.',
      update: 'Mettre à jour l’application',
    },
  },
  driveReturn: {
    backToList: 'Retour à la liste',
    allLists: 'Mes listes',
    none: {
      title: 'Aucun récapitulatif à afficher',
      help: 'Un récapitulatif ne se garde pas quand la page est rechargée. Ouvrez la liste pour reprendre l’envoi.',
      open: 'Ouvrir mes listes',
    },
    stale: {
      title: 'Ce récapitulatif ne correspond pas à votre dernier envoi',
      help: 'Il n’a pas été pris en compte : rien n’a été enregistré.',
    },
    // Une erreur dit trois choses : ce qui s'est passé, ce qui est sauf, une action. Le code n'est lu que dans « Détails ».
    refused: {
      title: 'L’envoi n’a pas démarré',
      help: 'L’application n’a pas pu lancer l’envoi. Rien n’a été mis au panier. Réessayez depuis l’envoi, ou mettez l’application à jour si cela se répète.',
      backToSend: 'Revenir à l’envoi',
    },
    invalid: {
      title: 'Le drive n’a pas répondu comme prévu',
      help: 'Rien n’a été perdu. Mettez l’application à jour, puis réessayez.',
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
    outcome: {
      completed: {
        title: 'Le panier est rempli',
        help: 'Vos produits sont dans le panier Leclerc : il reste à le finaliser.',
      },
      // Un envoi arrêté avant que rien ne soit mis au panier ni choisi : « en partie » serait faux (même titre que l'écran de fin de l'agent)
      notFilled: {
        title: 'Le panier n’est pas rempli',
      },
      partial: {
        title: 'Le panier est rempli en partie',
        lead: 'L’envoi s’est arrêté avant la fin.',
        safe: 'Ce qui est déjà au panier y reste : il reste {count} article à ajouter. | Ce qui est déjà au panier y reste : il reste {count} articles à ajouter.',
        action: 'Reprenez l’envoi pour finir.',
      },
      aborted: {
        title: 'Vous avez arrêté l’envoi',
        action: 'Reprenez l’envoi quand vous voulez.',
      },
      error: {
        title: 'L’envoi s’est arrêté',
        lead: 'L’envoi n’a pas pu aller au bout.',
        action: 'Reprenez l’envoi dans un moment.',
      },
    },
    errorCode: {
      NOT_LOGGED_IN: {
        happened: 'Vous n’êtes pas connecté à Leclerc.',
        action: 'Connectez-vous à Leclerc, puis reprenez l’envoi.',
      },
      STORE_MISMATCH: {
        happened: 'Le magasin ouvert sur Leclerc n’est pas le vôtre.',
        action: 'Ouvrez votre magasin sur Leclerc, puis reprenez l’envoi.',
      },
      BLOCKED: {
        happened: 'Leclerc a ralenti les demandes.',
        action: 'Attendez quelques minutes, puis reprenez l’envoi.',
      },
      CONTRACT_CHANGED: {
        happened: 'Leclerc a changé son site, l’envoi automatique est arrêté.',
        action: 'Cherchez vos produits à la main sur Leclerc.',
      },
      NETWORK: {
        happened: 'La connexion a été coupée pendant l’envoi.',
        action: 'Vérifiez votre connexion, puis reprenez l’envoi.',
      },
      CANCELLED: {
        happened: 'L’envoi a été annulé.',
        action: 'Reprenez l’envoi quand vous voulez.',
      },
      INVALID_MESSAGE: {
        happened: 'L’application n’a pas compris l’envoi.',
        action: 'Mettez l’application à jour, puis reprenez l’envoi.',
      },
      UNSUPPORTED_PAGE: {
        happened: 'Repas ne peut pas travailler sur cette page de Leclerc.',
        action: 'Ouvrez la page de votre magasin, puis reprenez l’envoi.',
      },
    },
    details: 'Détails',
    errorDetails: 'Code : {code}',
    ignored:
      '{count} article ne figurait pas dans votre liste : Repas l’a laissé de côté. | {count} articles ne figuraient pas dans votre liste : Repas les a laissés de côté.',
    save: {
      saving: 'Enregistrement de vos choix…',
      saved: 'Vos choix sont enregistrés pour les prochains envois.',
      failed: 'Vos choix n’ont pas pu être enregistrés. Ils sont gardés sur cette page. {reason}',
      // Trop de demandes (429, DRV-615) : le résultat reste en mémoire sur cette page, rien n'est perdu
      rateLimited:
        'Vos choix ne sont pas encore enregistrés. Ils sont gardés sur cette page. {reason}',
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
      chosenOnce: 'Choisi sur Leclerc pour cette fois seulement.',
      haveAtHome: 'J’en ai toujours : Repas s’en souvient.',
      skipped: 'Pas cette fois.',
      unavailable: 'Aucun produit disponible : rien n’a été mis au panier.',
      failed: 'Pas ajouté au panier. {reason}',
      rejected: 'Ne sera plus proposé : {labels}',
    },
    actions: {
      finalize: 'Finaliser sur Leclerc',
      finalizeHelp: 'S’ouvre dans le navigateur.',
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
    entryHelp: 'Votre magasin Leclerc Drive et l’application Repas.',
    disabled: 'L’envoi au drive n’est pas encore activé : il n’y a rien à régler pour le moment.',
    // Envoyé ici faute de magasin (DRV-622, DRV-623) : un titre, une phrase, un bouton qui fait le travail
    chooseTitle: 'Choisissez votre magasin',
    chooseHelp: 'Pour envoyer votre liste, Repas doit connaître votre magasin Leclerc.',
    choose: 'Choisir mon magasin',
    store: 'Votre magasin',
    storeNamed: 'Magasin …{tail}',
    none: 'Aucun magasin enregistré.',
    read: 'Lire mon magasin dans l’application',
    // Avec un magasin déjà enregistré, le même geste s'appelle « Changer de magasin »
    change: 'Changer de magasin',
    readHelp: 'Choisissez votre magasin, puis touchez « Utiliser ce magasin ».',
    // Repas enregistre tout seul le magasin lu (un seul geste, dans l'application)
    readDone: 'Magasin …{tail} enregistré.',
    // Le magasin lu n'est pas celui qui est enregistré : la seule confirmation du parcours
    changeTitle: 'Utiliser le magasin …{tail} ?',
    changeConfirm: 'Changer de magasin',
    changeKeep: 'Garder l’ancien',
    // Le serveur a refusé le magasin lu (`DRIVE_STORE_INVALID`) : rien n'est enregistré
    readRefused:
      'Repas n’a pas pu utiliser ce magasin. Rien n’est enregistré. Réessayez, ou saisissez l’adresse à la main.',
    manual: 'Saisir l’adresse à la main',
    readErrors: {
      UNAVAILABLE:
        'L’application ne peut pas lire votre magasin pour le moment. Rien n’est enregistré. Saisissez son adresse à la main.',
      BUSY: 'Un envoi au drive est déjà en cours dans l’application. Rien n’est enregistré. Terminez-le ou abandonnez-le, puis réessayez.',
      CANCELLED:
        'Aucun magasin choisi. Rien n’est enregistré. Réessayez, ou saisissez l’adresse à la main.',
      NOT_FOUND:
        'L’application n’a pas trouvé de magasin sur la page. Rien n’est enregistré. Choisissez-en un sur le site du drive, puis réessayez.',
      FAILED:
        'La lecture a échoué. Rien n’est enregistré. Réessayez, ou saisissez l’adresse à la main.',
    },
    address: 'Adresse de votre magasin',
    addressHint:
      'Celle du site du drive une fois votre magasin choisi, par exemple https://exemple.leclercdrive.fr/magasin-123456-123456.',
    name: 'Nom de votre magasin (facultatif)',
    nameHint: 'Pour le reconnaître : le nom de votre ville, par exemple.',
    changeWarning:
      'Ce n’est pas votre magasin actuel. Les produits habituels de l’ancien magasin ne seront plus proposés. Vous les choisirez de nouveau.',
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
    appNoAnswer: 'L’application ne répond pas : fermez-la, puis rouvrez-la.',
    appDriveOff:
      'Le drive ne peut pas fonctionner dans cette version de l’application : mettez-la à jour.',
    appMissing:
      'Vous utilisez Repas dans un navigateur. Pour envoyer une liste au drive, installez l’application Repas sur votre téléphone.',
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
    appMenuFailed: 'Le menu de l’application n’a pas pu s’ouvrir. Réessayez.',
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
    progress: 'Progression',
    save: 'Enregistrer',
    addToList: 'Ajouter à la liste',
    newRecipe: 'Nouvelle recette',
    cancel: 'Annuler',
    remove: 'Supprimer',
    ingredient: 'Ingrédient',
    ingredientSample: 'Courgettes',
    quantity: 'Quantité',
    quantityError: 'Entrez une quantité supérieure à zéro.',
    quantityHint: 'En grammes, kilos ou unités.',
    toTake: 'À prendre',
    inBasket: 'Dans le panier',
    dish: 'Plat',
    dessert: 'Dessert',
    starter: 'Entrée',
    tiles: 'Types de recette',
    progressLabel: '{done} sur {total} articles dans le panier',
  },
  // Aide et installation de l'application Android (DRV-316)
  driveHelp: {
    title: 'Installer l’application Repas',
    intro:
      'L’application Android « Repas » contient tout Repas : vos recettes, vos listes de courses et l’envoi de la liste au drive Leclerc. Elle s’installe en quelques minutes, sans passer par Google Play.',
    // Dans l'application elle-même : elle est déjà installée, la page sert à la mettre à jour et à la dépanner
    titleInApp: 'L’application Repas',
    introInApp:
      'Vous utilisez déjà l’application Android « Repas ». Cette page explique comment la mettre à jour, lancer un envoi au drive Leclerc, et que faire en cas de problème.',
    back: 'Retour à la liste',
    entry: {
      title: 'Application',
      link: 'Installer l’application Android',
      help: 'Le mode d’emploi pour installer et mettre à jour l’application Repas.',
      // Dans l'application : on ne propose pas de l'installer, elle l'est déjà
      updateLink: 'Mettre à jour l’application',
      updateHelp: 'Mode d’emploi pour mettre à jour l’application.',
    },
    contents: 'Sur cette page',
    state: {
      inApp: 'Vous êtes dans l’application Repas.',
      inAppVersion: 'Vous êtes dans l’application Repas, version {version}.',
      browser:
        'Vous êtes dans un navigateur. Pour envoyer votre liste au drive automatiquement, il faut l’application Repas sur un téléphone Android.',
    },
    download: 'Télécharger la dernière version',
    downloadFor: 'Télécharger la dernière version (s’ouvre dans un nouvel onglet)',
    sections: {
      install: 'Installer l’application',
      pwa: 'Retirer l’ancienne icône',
      firstLogin: 'Se connecter à Leclerc la première fois',
      send: 'Lancer un envoi',
      update: 'Mettre à jour l’application',
      uninstall: 'Désinstaller l’application',
      troubleshooting: 'En cas de problème',
      assisted: 'Sans l’application : chercher à la main',
    },
    install: {
      chrome: 'Sur votre téléphone Android, ouvrez cette page dans Chrome.',
      download:
        'Touchez « Télécharger la dernière version ». Sur la page GitHub, repérez la version la plus récente dont le nom commence par « android-v » (par exemple « android-v0.1.0 »), puis touchez le fichier qui se termine par « .apk » (dans la rubrique « Assets »). Ignorez les versions dont le nom contient « dev » ou qui portent la mention « Pre-release » : ce sont des essais réservés aux développeurs.',
      allow:
        'Android affiche peut-être « Pour votre sécurité, votre téléphone n’est pas autorisé à installer des applications inconnues depuis cette source ». Touchez « Paramètres », activez « Autoriser depuis cette source », puis revenez en arrière.',
      open: 'Quand le téléchargement est terminé, touchez « Ouvrir » (ou ouvrez le fichier depuis les notifications ou le dossier « Téléchargements »), puis « Installer ».',
      protect:
        'Si Play Protect affiche un avertissement, voyez « En cas de problème » plus bas : il suffit de choisir « Installer quand même ».',
      launch:
        'Touchez « Ouvrir », puis connectez-vous à Repas avec votre adresse e-mail et votre mot de passe habituels. Vos recettes et vos listes sont déjà là : tout est sur votre compte.',
    },
    pwa: {
      text: 'Si vous aviez ajouté Repas à votre écran d’accueil depuis Chrome, vous pouvez retirer cette ancienne icône une fois l’application installée : touchez-la sans la relâcher, puis « Désinstaller » (ou « Supprimer »).',
      careful:
        'Les deux icônes portent le même nom. L’ancienne est en général celle qui porte un petit logo de Chrome dans un coin : en cas de doute, gardez les deux.',
    },
    firstLogin: {
      store:
        'La première fois, Repas vous demande de choisir votre magasin dans les réglages du drive : suivez les indications de cet écran.',
      open: 'Ouvrez une liste, touchez « Envoyer au drive » puis « Ouvrir le drive ». Le site de Leclerc s’affiche dans l’application.',
      login:
        'Connectez-vous à votre compte E.Leclerc, comme sur le site. Si Leclerc vous envoie un code par e-mail, saisissez-le.',
      kept: 'Si Leclerc vous redemande un jour de vous connecter, faites-le de la même façon.',
      settings: 'Réglages du drive',
    },
    send: {
      open: 'Ouvrez la liste de courses et touchez « Envoyer au drive ».',
      check:
        'Vérifiez les articles, puis touchez « Ouvrir le drive ». Le site de Leclerc s’ouvre dans l’application.',
      wait: 'Gardez l’application ouverte.',
      back: 'À la fin, vous revenez dans Repas avec un récapitulatif. Terminez ensuite votre commande vous-même sur le site de Leclerc : choix du créneau et paiement.',
    },
    update: {
      site: 'Le site se met à jour tout seul. L’application, elle, ne change que de temps en temps (par exemple quand Leclerc modifie son site).',
      how: 'Pour la mettre à jour, téléchargez la dernière version comme pour l’installation, puis installez-la par-dessus.',
      version:
        'Pour connaître votre version : dans l’écran du drive, touchez « Menu » puis « Version et mode d’emploi », et comparez avec le nom de la dernière version sur GitHub.',
    },
    uninstall: {
      text: 'Touchez l’icône Repas sans la relâcher, puis « Désinstaller » (ou : Paramètres, Applications, Repas, Désinstaller). La connexion à Leclerc gardée par l’application est effacée avec elle.',
      clear:
        'Pour seulement vous déconnecter de Leclerc, sans désinstaller : dans l’écran du drive, « Menu », puis « Se déconnecter de Leclerc ». Les cookies, les données du site et l’historique du drive sont alors effacés.',
    },
    problems: {
      blocked: {
        q: 'L’installation est bloquée',
        a: 'Android demande d’autoriser l’installation pour l’application qui a téléchargé le fichier (en général Chrome). Allez dans Paramètres, Applications, Chrome, « Installer des applications inconnues », puis activez « Autoriser depuis cette source ». Revenez au fichier téléchargé et relancez l’installation. Sur un téléphone prêté par une entreprise ou une école, cette option peut être interdite.',
      },
      protect: {
        q: 'Play Protect affiche un avertissement',
        a: 'Google Play Protect ne connaît pas l’application, car elle ne vient pas de Google Play. Si vous avez bien téléchargé le fichier depuis la page GitHub de Repas, touchez « Plus de détails », puis « Installer quand même ».',
      },
      conflict: {
        q: '« Application non installée » ou conflit avec une application existante',
        a: 'Une version d’essai, ou signée autrement, est déjà sur le téléphone. Désinstallez l’ancienne application Repas, puis installez la nouvelle. Vous devrez vous reconnecter à Leclerc.',
      },
      login: {
        q: 'Je n’arrive pas à me connecter à Leclerc',
        a: 'Vérifiez d’abord que vous pouvez vous connecter au site de Leclerc dans un navigateur. Si l’application ne vous reconnaît plus : dans l’écran du drive, « Menu », puis « Se déconnecter de Leclerc », et reconnectez-vous.',
      },
      changed: {
        q: '« Le site a changé » ou « Leclerc a changé »',
        a: 'Leclerc a modifié son site et l’envoi automatique s’est arrêté. En attendant une mise à jour de l’application, passez à « Chercher à la main » (voir plus bas) : les liens de la liste vous mènent aux produits sur Leclerc. Installez la nouvelle version de l’application dès qu’elle est annoncée.',
      },
      mobile: {
        q: 'Leclerc s’affiche en version mobile, ou « Page non prise en charge »',
        a: 'L’application doit afficher le site de Leclerc en version ordinateur. Dans l’écran du drive, « Menu », puis « Se déconnecter de Leclerc », puis rouvrez le drive.',
      },
      webview: {
        q: '« Le drive n’est pas utilisable sur cet appareil »',
        a: 'Mettez à jour l’application Repas et le composant « Android System WebView » (dans Google Play), puis réessayez.',
      },
    },
    assisted: {
      text: 'Vous pouvez préparer vos courses sans l’application. Sur la liste, touchez « Envoyer au drive » : Repas montre chaque article avec un lien « Chercher sur Leclerc » qui ouvre le site de Leclerc sur le produit, et vous ajoutez les produits au panier vous-même. Si le bouton n’apparaît pas, l’envoi au drive n’est pas activé pour le moment.',
      action: 'Aller à ma liste',
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
      'Envoyer votre liste au drive, c’est Repas qui prépare la liste et l’application qui la met dans votre panier Leclerc, avec votre connexion à vous. Voici comment cela se passe, ce que Repas garde, ce qu’il ne voit pas, les risques, et comment tout effacer.',
    how: {
      title: 'Comment ça se passe',
      start:
        'Quand vous touchez « Envoyer au drive », Repas prépare votre liste et la donne à l’application, sur votre téléphone. Rien n’est mis au panier tant que vous n’avez pas touché « Commencer ».',
      session:
        'L’application ouvre Leclerc dans sa propre fenêtre. C’est vous qui vous connectez à Leclerc, comme sur le site. Ensuite elle cherche les produits et les met dans votre panier depuis votre session Leclerc, comme si vous le faisiez vous-même : un produit à la fois, avec des pauses, pour ne pas gêner Leclerc.',
      local:
        'Tout cela se passe entre votre téléphone et Leclerc. Rien de cela ne passe par les serveurs de Repas. Comme dans un navigateur, les pages de Leclerc font appel à leurs propres services (protection contre les robots, mesure d’audience) : Repas n’y a pas accès et ne les choisit pas. À la fin, l’application ne rend à Repas que ce qu’il doit retenir : les produits que vous avez choisis, et votre magasin quand vous le lui faites lire. Rien d’autre de votre compte Leclerc ne quitte la page.',
      resume:
        'Si l’envoi s’arrête, vous le reprenez là où il en était : l’avancement est gardé et les articles déjà faits ne sont pas refaits.',
      order:
        'Vous finalisez votre commande vous-même sur Leclerc. Repas ne valide jamais de commande, ne choisit pas de créneau, ne paie rien et ne vide jamais votre panier. Il ne réduit jamais une quantité déjà au panier : un article déjà présent en plus grande quantité reste tel quel.',
    },
    saves: {
      title: 'Ce que Repas enregistre',
      store:
        'Votre magasin Leclerc : son numéro, son adresse sur le site de Leclerc, et le nom que vous lui avez donné si vous en avez mis un.',
      choices:
        'Les produits dont Repas se souvient, article par article : votre produit habituel, vos produits de remplacement (5 au plus), les produits à ne plus proposer (20 au plus) et les articles « J’en ai toujours ». Ces produits sont propres à votre magasin.',
      products:
        'Pour chaque produit : son numéro chez Leclerc, son nom, son contenu (par exemple 1 kg), et son prix avec la date où il a été vu.',
      estimate:
        'Les prix servent à estimer le coût d’une liste. L’estimation est indicative : elle est faite d’après les derniers prix vus, avec leur date, et le vrai prix est toujours celui de Leclerc. Elle ne compte que les articles dont le prix est connu, elle est peu fiable quand moins de la moitié en ont un, et Repas ne devine jamais un prix.',
      lists:
        'Pour chaque liste : le fait qu’elle a été « envoyée au drive » et la date de l’envoi.',
    },
    never: {
      title: 'Ce que Repas ne voit et n’enregistre jamais',
      credentials:
        'Votre identifiant et votre mot de passe Leclerc, et le code que Leclerc vous envoie par e-mail.',
      cookies: 'Vos cookies et vos jetons de connexion à Leclerc.',
      address: 'Votre adresse, votre créneau de retrait, votre moyen de paiement.',
      basket: 'Le contenu réel de votre panier Leclerc, vos commandes, vos achats passés.',
      photos: 'Les photos des produits.',
    },
    where: {
      title: 'Où, et combien de temps',
      server:
        'Les données sont dans la base de Repas, sur le serveur de Repas (hébergé chez DigitalOcean). Repas ne les donne à personne, ne les vend pas, ne fait pas de publicité et n’envoie pas de statistiques à des tiers.',
      duration:
        'Elles restent tant que votre compte existe, ou jusqu’à ce que vous les oubliez (voir plus bas).',
      backups:
        'Le serveur fait une copie de sauvegarde chaque nuit et garde les 14 dernières : une donnée effacée peut rester dans ces copies environ deux semaines au plus, puis elles sont remplacées.',
      phone:
        'Sur votre téléphone, l’application garde votre connexion à Leclerc, comme le ferait un navigateur. Elle ne la partage ni avec Repas ni avec personne d’autre que Leclerc et ses propres services. Vous pouvez l’effacer à tout moment : menu de l’application, « Se déconnecter de Leclerc ».',
      sheets:
        'Les descriptions de produits (nom, contenu, prix vu, magasin) sont communes à tous les utilisateurs de Repas et ne disent pas qui les a vues. Chacun ne retrouve que les produits dont Repas se souvient pour lui. La première personne qui décrit un produit fixe sa description (nom, contenu, code-barres) : les suivantes ne la réécrivent pas, elles ne font que la compléter si elle est incomplète ; le prix vu, lui, est rafraîchi par celles qui choisissent ce produit. Ces descriptions restent quand un compte est supprimé, mais sans aucun lien avec la personne.',
    },
    erase: {
      title: 'Comment tout effacer',
      product:
        'Un produit, ou un article : dans « Moi », « Mes produits du drive » : retirez un produit, choisissez « Ne plus proposer » pour un autre, ou touchez « Oublier cet article » pour effacer tout ce que Repas retient sur lui.',
      store:
        'Un changement de magasin : si vous changez de magasin, les produits dont Repas se souvient pour l’ancien magasin ne sont plus utilisés, mais ils restent enregistrés jusqu’à la suppression de votre compte.',
      all: 'Tout, d’un coup : demandez la suppression de votre compte à la personne qui administre Repas. Elle efface vos données du drive (magasin, produits dont Repas se souvient), vos listes de courses avec leur statut d’envoi, et le reste de votre compte.',
      rights:
        'Pour exercer vos droits (savoir ce que Repas a de vous, corriger, effacer), écrivez à la personne qui vous a donné accès à Repas.',
    },
    before: {
      title: 'Avant d’utiliser l’envoi : ce que vous devez savoir',
      account:
        'L’envoi agit dans votre propre compte Leclerc, avec votre propre connexion, comme si vous faisiez les recherches et les ajouts vous-même. Repas ne voit jamais vos identifiants.',
      suspension:
        'Les conditions d’utilisation de Leclerc permettent à l’enseigne de suspendre un compte E.Leclerc (et la cagnotte de Tickets E.Leclerc qui va avec) si elle juge l’usage abusif. Repas limite ce risque : une requête à la fois, avec des pauses, seulement quand vous le demandez, et seulement pour votre liste. Mais le risque existe et il est pour votre compte.',
      stop: 'Si Leclerc ralentit les requêtes, l’application s’arrête d’elle-même. Attendez plusieurs heures avant de reprendre l’envoi, sans le relancer en boucle. Si votre compte Leclerc pose un problème, contactez le service client de Leclerc : Repas n’a aucun accès à votre compte et ne contacte jamais Leclerc.',
      manual:
        'Vous pouvez vous en passer à tout moment : la liste de Repas reste utilisable pour faire vos courses à la main sur Leclerc.',
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
