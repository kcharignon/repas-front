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
    reopenHelp: 'Le panier Leclerc ne sera pas vidé.',
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
    completedHelp:
      'Tout est dans le panier. Décochez un article pour reprendre la liste, ou commencez-en une nouvelle.',
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
    rule: 'Repas prend le premier produit disponible de la liste. Les produits à ne plus proposer ne sont jamais pris.',
    back: 'Tous mes produits',
    unavailable: 'L’envoi au drive n’est pas disponible pour le moment.',
    noStore:
      'Vous n’avez pas encore enregistré votre magasin : sans lui, Repas ne peut se souvenir d’aucun produit.',
    settings: 'Réglages du drive',
    none: 'Repas ne se souvient encore d’aucun produit. Les produits se choisissent sur le site du drive pendant un envoi : ils apparaîtront ici, et vous pourrez les classer.',
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
    haveAtHomeHelp:
      'Repas ne met rien au panier pour cet article. À l’enregistrement, ses produits sont oubliés.',
    accepted: 'Produits acceptés',
    acceptedHelp:
      'Du produit habituel aux produits de remplacement ({max} au plus). Le produit habituel est pris s’il est disponible, sinon le suivant.',
    acceptedNone:
      'Aucun produit accepté. Un produit se choisit sur le site du drive, pendant un envoi.',
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
      'Repas oublie les produits acceptés et ceux à ne plus proposer pour cet article. Au prochain envoi, vous choisirez de nouveau.',
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
    driveRateLimited: 'Trop de demandes en peu de temps. Attendez {wait}, puis réessayez.',
    driveWait: 'une minute | {minutes} minutes',
    driveDisabled: 'L’envoi au drive n’est pas disponible pour le moment.',
    listSent: 'Cette liste vient d’être envoyée au drive : elle n’est plus modifiable.',
    listNotSent: 'Cette liste n’est plus envoyée au drive.',
    listNotSendable: 'Seule une liste en cours peut être envoyée au drive.',
    listEmpty: 'La liste est vide : ajoutez des articles avant de l’envoyer au drive.',
    driveNotConfigured: 'Choisissez d’abord votre magasin dans les réglages du drive.',
    driveChoiceInvalid:
      'Ce choix n’est pas valable : 5 produits acceptés et 20 à ne plus proposer au plus, et un produit ne peut pas être les deux à la fois.',
    driveChoiceNotFound: 'Repas ne se souvient plus de produit pour cet article.',
    driveLimitReached:
      'Repas se souvient déjà de trop de produits, ou il y a eu trop d’écritures aujourd’hui : oubliez des produits dans « Mes produits », ou réessayez demain.',
    driveStoreMismatch:
      'Votre magasin a changé : la page vient d’être rechargée, refaites votre action.',
    unitMeasureIncomplete:
      'La dimension et le facteur de base vont ensemble : renseignez les deux, ou laissez-les vides.',
    unitBaseFactorInvalid: 'Le facteur de base doit être un nombre supérieur à zéro.',
    driveStoreInvalid:
      'Cette adresse n’est pas celle d’un magasin Leclerc Drive : vérifiez-la, elle ressemble à https://exemple.leclercdrive.fr/magasin-123456-123456.',
  },
  driveSend: {
    title: 'Envoi au drive',
    back: 'Retour à la liste',
    store: 'Magasin : {label}',
    storeEnding: 'Magasin …{ending}',
    loading: 'Préparation de l’envoi…',
    retry: 'Réessayer',
    offHelp:
      'Une liste envoyée au drive ne se modifie plus. Vous pouvez la rouvrir pour la modifier.',
    offHelpOffline: 'Hors connexion : la liste se rouvrira quand le réseau sera revenu.',
    intro:
      'Vérifiez la liste, puis ouvrez le drive : le panier de Leclerc se remplit avec les produits retenus, puis vous revenez ici avec un récapitulatif. Connectez-vous à Leclerc si besoin.',
    counts: {
      label: 'Contenu de l’envoi',
      known: 'Produits connus',
      new: 'À choisir',
      haveAtHome: 'J’en ai toujours',
      skipped: 'Pas cette fois',
    },
    lines: 'Votre liste ({count})',
    need: 'À acheter : {quantity}',
    statusNew: 'Nouveau : vous choisirez le produit sur Leclerc.',
    statusReplace: 'Vous choisirez un autre produit sur Leclerc, à la place de : {label}.',
    statusHaveAtHome: 'J’en ai toujours : rien à mettre au panier.',
    statusSkip: 'Pas cette fois : rien ne sera mis au panier.',
    products: 'Produits retenus, par ordre de préférence',
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
      help: 'Le drive est ouvert dans l’application. Quand l’envoi est terminé, vous revenez ici avec un récapitulatif.',
      restart: 'Recommencer',
      restartHelp: 'Recommencer abandonne l’envoi en cours et reprend la liste depuis le début.',
      reopenList: 'Rouvrir la liste',
      reopenTitle: 'Rouvrir la liste ?',
      reopenHelp:
        'L’envoi en cours est abandonné et la liste redevient modifiable. Le panier Leclerc ne sera pas vidé.',
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
    driveUnusable: {
      title: 'Le drive n’est pas utilisable sur cet appareil',
      help: 'Mettez à jour l’application Repas et le composant « Android System WebView », puis revenez ici.',
      aid: 'Voir l’aide',
    },
    failure: {
      invalidPlan: 'Cet envoi n’est pas valide. Rechargez la page et réessayez.',
      tooManyLines:
        'La liste a plus de {max} articles : ce n’est pas possible en un seul envoi. Retirez des articles de la liste, puis renvoyez-la.',
      tooLarge:
        'L’envoi est trop gros pour être transmis à l’application. Choisissez « Pas cette fois » pour quelques articles, ou retirez-en de la liste.',
      sendFailed: 'L’application n’a pas pu ouvrir le drive. Réessayez.',
      appRefused: 'L’application ne répond pas comme prévu. Fermez-la, rouvrez-la, puis réessayez.',
    },
  },
  driveReturn: {
    title: 'Récapitulatif',
    backToList: 'Retour à la liste',
    allLists: 'Mes listes',
    none: {
      title: 'Aucun récapitulatif à afficher',
      help: 'Le récapitulatif d’un envoi n’est gardé que pendant la visite : si la page a été rechargée, ouvrez la liste pour reprendre l’envoi.',
    },
    stale: {
      title: 'Ce récapitulatif ne correspond pas à votre dernier envoi',
      help: 'Il n’a pas été pris en compte : rien n’a été enregistré.',
    },
    refused: {
      title: 'Le drive n’a pas démarré',
      help: 'L’application n’a pas lancé l’envoi : rien n’a été mis au panier. Mettez l’application à jour si cela se répète.',
      code: 'Code : {code}',
      backToSend: 'Revenir à l’envoi',
    },
    invalid: {
      title: 'Réponse incomprise',
      help: 'L’application a renvoyé une réponse que Repas ne comprend pas. Mettez l’application à jour, puis recommencez.',
    },
    setup: {
      title: 'Lecture du magasin',
      help: 'Cette réponse est celle d’une lecture du magasin : elle se traite dans les réglages du drive.',
      settings: 'Réglages du drive',
    },
    outcome: {
      completed: {
        title: 'Le panier est rempli',
        help: 'Les produits retenus sont dans votre panier Leclerc. Il reste à le finaliser sur le site de Leclerc.',
      },
      partial: {
        title: 'L’envoi s’est arrêté avant la fin',
        help: 'Ce qui a été fait reste dans le panier. Vous pouvez réessayer le reste.',
      },
      aborted: {
        title: 'Envoi arrêté',
        help: 'Vous avez arrêté l’envoi : ce qui était déjà dans le panier y reste.',
      },
      error: {
        title: 'L’envoi a échoué',
        help: 'L’envoi n’a pas pu aller au bout. Ce qui était déjà dans le panier y reste.',
      },
    },
    errorCode: {
      NOT_LOGGED_IN: 'Vous n’êtes pas connecté à Leclerc : connectez-vous, puis recommencez.',
      STORE_MISMATCH: 'Le magasin choisi sur Leclerc n’est pas celui des réglages de Repas.',
      BLOCKED:
        'Leclerc a bloqué les demandes (trop de demandes ou contrôle anti-robot). Attendez un moment, puis réessayez.',
      CONTRACT_CHANGED:
        'Le site de Leclerc a changé : l’envoi automatique ne fonctionne plus pour l’instant.',
      NETWORK: 'La connexion a été coupée pendant l’envoi.',
      CANCELLED: 'L’envoi a été annulé.',
      INVALID_MESSAGE: 'L’application n’a pas compris l’envoi.',
      UNSUPPORTED_PAGE: 'Cette page de Leclerc n’est pas prise en charge.',
    },
    ignored:
      '{count} article inattendu n’a pas été pris en compte : il ne figure pas dans l’envoi, Repas ne s’en souvient pas. | {count} articles inattendus n’ont pas été pris en compte : ils ne figurent pas dans l’envoi, Repas ne s’en souvient pas.',
    save: {
      saving: 'Enregistrement de vos choix…',
      saved: 'Vos choix sont enregistrés pour les prochains envois.',
      failed: 'Vos choix n’ont pas pu être enregistrés. {reason}',
      // Trop de demandes (429, DRV-615) : le résultat reste en mémoire sur cette page, rien n'est perdu
      rateLimited:
        'Vos choix ne sont pas encore enregistrés, mais ils sont gardés sur cette page : rien n’est perdu. {reason}',
      retry: 'Réessayer l’enregistrement',
    },
    counts: {
      label: 'Récapitulatif de l’envoi',
      added: 'Ajoutés au panier',
      chosen: 'Choisis sur Leclerc',
      haveAtHome: 'J’en ai toujours',
      skipped: 'Pas cette fois',
      unavailable: 'Indisponibles',
      failed: 'Échecs',
      priced: 'Prix lus',
    },
    lines: 'Détail ({count})',
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
      failed: 'Échec : {reason}',
      rejected: 'Ne sera plus proposé : {labels}',
    },
    actions: {
      finalize: 'Finaliser sur Leclerc',
      finalizeHelp: 'S’ouvre dans le navigateur.',
      retryFailed: 'Réessayer les échecs',
      resume: 'Reprendre l’envoi',
      complete: 'Terminer la liste',
      completeTitle: 'Terminer la liste ?',
      completeHelp: 'La liste sera terminée. Le panier Leclerc ne sera pas vidé.',
      reopen: 'Rouvrir la liste',
      reopenTitle: 'Rouvrir la liste ?',
      reopenHelp: 'La liste redevient modifiable. Le panier Leclerc ne sera pas vidé.',
      offline: 'Hors connexion : ces actions reviennent avec le réseau.',
    },
    basketKept: 'Le panier Leclerc n’est pas vidé par Repas.',
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
    storeHelp:
      'Repas remplit le panier de ce magasin. Les produits dont Repas se souvient sont propres à ce magasin.',
    read: 'Lire mon magasin dans l’application',
    // Avec un magasin déjà enregistré, le même geste s'appelle « Changer de magasin »
    change: 'Changer de magasin',
    readHelp:
      'L’application ouvre Leclerc. Choisissez votre magasin, puis touchez « Utiliser ce magasin ».',
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
    appReady: 'Le drive est prêt dans cette application.',
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
        'Touchez « Télécharger la dernière version ». Sur la page GitHub, repérez la version la plus récente dont le nom commence par « android-v » (par exemple « android-v0.1.0 »), puis touchez le fichier qui se termine par « .apk » (dans la rubrique « Assets »). Ignorez les versions dont le nom contient « dev » ou qui portent la mention « Pre-release » : ce sont des essais réservés aux développeurs, jamais à installer pour de vrai.',
      allow:
        'Android affiche peut-être « Pour votre sécurité, votre téléphone n’est pas autorisé à installer des applications inconnues depuis cette source ». Touchez « Paramètres », activez « Autoriser depuis cette source », puis revenez en arrière.',
      open: 'Quand le téléchargement est terminé, touchez « Ouvrir » (ou ouvrez le fichier depuis les notifications ou le dossier « Téléchargements »), puis « Installer ».',
      protect:
        'Si Play Protect affiche un avertissement, voyez « En cas de problème » plus bas : il suffit de choisir « Installer quand même ».',
      launch:
        'Touchez « Ouvrir », puis connectez-vous à Repas avec votre adresse e-mail et votre mot de passe habituels. Vos recettes et vos listes sont déjà là : tout est sur votre compte.',
    },
    pwa: {
      text: 'Si vous aviez ajouté Repas à votre écran d’accueil depuis Chrome, vous pouvez retirer cette ancienne icône une fois l’application installée : touchez-la sans la relâcher, puis « Désinstaller » (ou « Supprimer »). Rien n’est perdu : vos recettes et vos listes restent sur votre compte.',
      careful:
        'Les deux icônes portent le même nom. L’ancienne est en général celle qui porte un petit logo de Chrome dans un coin : en cas de doute, gardez les deux.',
    },
    firstLogin: {
      store:
        'La première fois, Repas vous demande de choisir votre magasin dans les réglages du drive : suivez les indications de cet écran.',
      open: 'Ouvrez une liste, touchez « Envoyer au drive » puis « Ouvrir le drive ». Le site de Leclerc s’affiche dans l’application.',
      login:
        'Connectez-vous à votre compte E.Leclerc, comme sur le site : c’est vous qui tapez votre identifiant et votre mot de passe, Repas ne les voit jamais. Si Leclerc vous envoie un code par e-mail, saisissez-le.',
      kept: 'L’application garde votre connexion à Leclerc, comme le ferait un navigateur. Si Leclerc vous la redemande un jour, reconnectez-vous de la même façon.',
      settings: 'Réglages du drive',
    },
    send: {
      open: 'Ouvrez la liste de courses et touchez « Envoyer au drive ».',
      check:
        'Vérifiez les articles, puis touchez « Ouvrir le drive ». Le site de Leclerc s’ouvre dans l’application.',
      wait: 'Laissez faire : l’application cherche les produits un par un, avec des pauses. C’est voulu, pour ne pas gêner Leclerc. Ne quittez pas l’application pendant ce temps.',
      back: 'À la fin, vous revenez dans Repas avec un récapitulatif. Terminez ensuite votre commande vous-même sur le site de Leclerc : choix du créneau et paiement. Repas ne valide jamais une commande.',
    },
    update: {
      site: 'Le site se met à jour tout seul. L’application, elle, ne change que de temps en temps (par exemple quand Leclerc modifie son site).',
      how: 'Pour la mettre à jour, téléchargez la dernière version comme pour l’installation, puis installez-la par-dessus : vos données sont conservées.',
      version:
        'Pour connaître votre version : dans l’écran du drive, touchez « Menu » puis « Version et mode d’emploi », et comparez avec le nom de la dernière version sur GitHub.',
    },
    uninstall: {
      text: 'Touchez l’icône Repas sans la relâcher, puis « Désinstaller » (ou : Paramètres, Applications, Repas, Désinstaller). Votre compte, vos recettes et vos listes ne sont pas touchés. La connexion à Leclerc gardée par l’application est effacée avec elle.',
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
        a: 'Google Play Protect ne connaît pas l’application, car elle ne vient pas de Google Play. Si vous avez bien téléchargé le fichier depuis la page GitHub de Repas, touchez « Plus de détails », puis « Installer quand même ». Dans le doute, n’installez pas et demandez à la personne qui gère Repas.',
      },
      conflict: {
        q: '« Application non installée » ou conflit avec une application existante',
        a: 'Une version d’essai, ou signée autrement, est déjà sur le téléphone. Désinstallez l’ancienne application Repas, puis installez la nouvelle. Vos recettes et vos listes restent sur votre compte ; seule la connexion à Leclerc dans l’application est à refaire.',
      },
      login: {
        q: 'Je n’arrive pas à me connecter à Leclerc',
        a: 'Vérifiez d’abord que vous pouvez vous connecter au site de Leclerc dans un navigateur. Si l’application ne vous reconnaît plus : dans l’écran du drive, « Menu », puis « Se déconnecter de Leclerc », et reconnectez-vous. Si Leclerc ralentit ou refuse les requêtes, attendez plusieurs heures sans insister. Votre compte Leclerc dépend de Leclerc : en cas de blocage, contactez son service client.',
      },
      changed: {
        q: '« Le site a changé » ou « Leclerc a changé »',
        a: 'Leclerc a modifié son site et l’envoi automatique s’est arrêté pour ne rien abîmer. Cela ne vient pas de votre téléphone. En attendant une mise à jour de l’application, passez à « Chercher à la main » (voir plus bas) : les liens de la liste vous mènent aux produits sur Leclerc. Installez la nouvelle version de l’application dès qu’elle est annoncée.',
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
  // La note de vie privée du drive (DRV-504) : à garder identique au fond à `docs/drive/note-vie-privee.md` du dépôt back
  drivePrivacy: {
    short: {
      title: 'Votre vie privée',
      text: 'Repas retient votre magasin, les produits que vous choisissez (avec leur prix vu) et la date d’envoi de vos listes. Il ne voit jamais votre identifiant, votre mot de passe, vos cookies, votre panier Leclerc ni vos commandes : l’envoi se fait dans l’application, avec votre propre connexion à Leclerc. Attention : Leclerc peut suspendre un compte qu’il juge utilisé de façon abusive.',
      link: 'Lisez la note complète',
    },
    full: {
      title: 'Votre vie privée avec le drive',
      intro:
        'Envoyer votre liste au drive, c’est Repas qui prépare la liste et l’application qui la met dans votre panier Leclerc, avec votre connexion à vous. Voici ce que Repas garde, ce qu’il ne voit jamais, et comment tout effacer.',
      how: {
        title: 'Comment ça se passe',
        start:
          'Quand vous touchez « Envoyer au drive », Repas prépare votre liste et la donne à l’application, sur votre téléphone.',
        session:
          'L’application ouvre Leclerc dans sa propre fenêtre. C’est vous qui vous connectez à Leclerc, comme sur le site. Ensuite elle cherche les produits et les met dans votre panier depuis votre session Leclerc, comme si vous le faisiez vous-même.',
        local:
          'Tout cela se passe entre votre téléphone et Leclerc. Rien de cela ne passe par les serveurs de Repas. Comme dans un navigateur, les pages de Leclerc font appel à leurs propres services (protection contre les robots, mesure d’audience) : Repas n’y a pas accès et ne les choisit pas. À la fin, l’application ne rend à Repas que ce qu’il doit retenir : les produits que vous avez choisis.',
        order:
          'Vous finalisez votre commande vous-même sur Leclerc. Repas ne valide jamais de commande, ne choisit pas de créneau, ne paie rien et ne vide jamais votre panier.',
      },
      saves: {
        title: 'Ce que Repas enregistre',
        store:
          'Votre magasin Leclerc : son numéro, son adresse sur le site de Leclerc, et le nom que vous lui avez donné si vous en avez mis un.',
        choices:
          'Les produits dont Repas se souvient, article par article : votre produit habituel, vos produits de remplacement (5 au plus), les produits à ne plus proposer (20 au plus) et les articles « J’en ai toujours ».',
        products:
          'Pour chaque produit : son numéro chez Leclerc, son nom, son contenu (par exemple 1 kg), et son prix avec la date où il a été vu. Les prix servent à estimer le coût d’une liste ; l’estimation est datée et le vrai prix est toujours celui de Leclerc.',
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
        stop: 'Si Leclerc ralentit les requêtes, l’application s’arrête d’elle-même. Si votre compte Leclerc pose un problème, contactez le service client de Leclerc : Repas n’a aucun accès à votre compte et ne contacte jamais Leclerc.',
        manual:
          'Vous pouvez vous en passer à tout moment : la liste de Repas reste utilisable pour faire vos courses à la main sur Leclerc.',
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
    notIncluded:
      '{count} article n’est pas dans le total. | {count} articles ne sont pas dans le total.',
    periodOne: 'D’après les prix vus le {date}.',
    periodRange: 'D’après les prix vus entre le {from} et le {to}.',
    lowCoverage:
      'Estimation peu fiable : moins de la moitié des articles ont un prix connu, le total ne couvre qu’une partie de la liste.',
    noPrice: 'Aucun prix connu pour le moment : Repas retient les prix à chaque envoi au drive.',
    nothingToBuy: 'Rien à estimer : aucun article de cette liste n’est à acheter au drive.',
    detail: 'Voir le détail ({count} article) | Voir le détail ({count} articles)',
    groups: {
      unestimated: 'Non estimées ({count})',
      estimated: 'Estimées ({count})',
      haveAtHome: 'J’en ai toujours ({count})',
    },
    neverGuessed: 'Ces articles ne sont pas dans le total : Repas ne devine jamais un prix.',
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
