package eu.kantin.repas.drive

/**
 * Comment s'est passé le dernier « Finaliser sur Leclerc » (DRV-631) : une FORME seulement, jamais une adresse, un numéro de magasin ni une ville.
 * Gardée dans l'application pour le diagnostic (« Version et mode d'emploi ») : sur le téléphone d'une utilisatrice, c'est la seule trace de ce qui
 * s'est passé, puisque l'application ne journalise rien.
 */
enum class FinalizeOutcome {
    /** La page d'accueil du magasin (avec la ville) a été demandée : le site ne l'a pas refusée. */
    OUVERTE,

    /** L'application ne connaît pas encore le chemin du magasin (aucune page de magasin vue, ou données effacées) : l'accueil du drive s'ouvre. */
    CHEMIN_INCONNU,

    /** Le lien du front n'est pas celui du magasin retenu (autre hôte, autres numéros) ou n'a pas la forme attendue : l'accueil du drive s'ouvre. */
    ADRESSE_REFUSEE,

    /** Le site a répondu une erreur 4xx pour la page d'accueil du magasin (hors défi de l'anti-robot) : repli sur l'accueil du drive. */
    ERREUR_HTTP_4XX,

    /** Le site a répondu une erreur 5xx : repli sur l'accueil du drive. */
    ERREUR_HTTP_5XX,

    /** Le site a répondu 200, mais le titre de la page dit « introuvable » : repli sur l'accueil du drive. */
    TITRE_INTROUVABLE,
    ;

    companion object {
        /** Le repli qui correspond à ce code HTTP. */
        fun ofHttp(status: Int): FinalizeOutcome = if (status >= 500) ERREUR_HTTP_5XX else ERREUR_HTTP_4XX

        fun parse(name: String?): FinalizeOutcome? = entries.firstOrNull { it.name == name }
    }
}

/** Où va la forme du dernier « Finaliser » : une seule valeur texte, gardée par le téléphone. */
interface FinalizeOutcomeStore {
    fun load(): String?
    fun save(value: String?)
}

/**
 * La mémoire privée du dernier « Finaliser sur Leclerc » : le [FinalizeOutcome] seulement, effacé avec les données du drive. Kotlin pur, pour se
 * tester sans téléphone.
 */
class FinalizeOutcomeMemory(private val store: FinalizeOutcomeStore) {
    fun record(outcome: FinalizeOutcome) {
        if (outcome.name != store.load()) store.save(outcome.name)
    }

    fun last(): FinalizeOutcome? = FinalizeOutcome.parse(store.load())

    fun forget() = store.save(null)
}
