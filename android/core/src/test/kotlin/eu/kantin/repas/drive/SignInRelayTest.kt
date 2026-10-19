package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le relais de la connexion avec Google (AUTH-011), joué de bout en bout sans téléphone : le texte que la page envoie, [NativeBridge.screen], le
 * relais, un fournisseur de test qui répond à la demande, et ce que la page reçoit. Valeurs SYNTHÉTIQUES ; aucun appel à Google.
 */
class SignInRelayTest {
    /** Un fournisseur de test : il retient chaque demande et répond quand le test le décide (la feuille de choix du compte se ferme). */
    private class ScriptedProvider : IdentityProvider {
        val requests = mutableListOf<Pair<String, String>>()
        val callbacks = mutableListOf<(IdentityResult) -> Unit>()
        var cancelled = 0
        var answerAtOnce: IdentityResult? = null
        var throwOnSignIn = false

        override fun signIn(clientId: String, nonce: String, callback: (IdentityResult) -> Unit): Cancellation {
            if (throwOnSignIn) throw IllegalStateException("panne du fournisseur de test")
            requests += clientId to nonce
            callbacks += callback
            answerAtOnce?.let(callback)
            return Cancellation { cancelled++ }
        }

        /** La plateforme répond à la dernière demande (même si le contrat le lui interdit : le relais doit tenir quand même). */
        fun respond(result: IdentityResult) = callbacks.last()(result)
    }

    private val origin = "https://repas.exemple.test"
    private val clientId = "123456789-exemple0synthetique.apps.googleusercontent.com"
    private val nonce = "nonce_synthetique-0123456789"
    private val provider = ScriptedProvider()
    private val relay = SignInRelay(provider)
    private val page = mutableListOf<JSONObject>()

    /** La page envoie ce texte ; ce que l'application lui rend arrive dans [page]. Comme `MainActivity` : un refus est rendu tel quel. */
    private fun send(text: String) {
        when (val request = NativeBridge.screen(text, origin, isMainFrame = true, repasOrigin = origin)) {
            is NativeRequest.GoogleSignIn -> relay.request(request) { page += JSONObject(it) }
            is NativeRequest.Refused -> page += JSONObject(request.reply)
            else -> throw AssertionError("message inattendu : $request")
        }
    }

    private fun signIn(nonce: String = this.nonce, clientId: String = this.clientId) =
        send("""{"v":1,"type":"google.signIn","clientId":"$clientId","nonce":"$nonce"}""")

    private fun codes() = page.map { if (it.getString("type") == "google.result") "result:${it.getString("idToken")}" else it.getString("code") }

    @Test
    fun `une demande valide rend le jeton du fournisseur a la page`() {
        signIn()
        assertTrue(relay.isBusy)
        provider.respond(IdentityResult.Token("jeton.synthetique.signature"))

        assertEquals(listOf(clientId to nonce), provider.requests)
        assertEquals(listOf("result:jeton.synthetique.signature"), codes())
        assertEquals("google.result", page.single().getString("type"))
        assertFalse(relay.isBusy)
    }

    @Test
    fun `une demande mal formee recoit INVALID_REQUEST sans aucun appel au fournisseur`() {
        signIn(clientId = "pas-un-id-client")
        signIn(nonce = "court")
        send("""{"v":1,"type":"google.signIn"}""")

        assertEquals(listOf("INVALID_REQUEST", "INVALID_REQUEST", "INVALID_REQUEST"), codes())
        assertTrue(provider.requests.isEmpty())
        assertFalse(relay.isBusy)
    }

    @Test
    fun `une deuxieme demande pendant la premiere recoit BUSY, sans appel au fournisseur`() {
        signIn()
        signIn(nonce = "nonce_synthetique-autre-0123")

        assertEquals(listOf("BUSY"), codes())
        assertEquals(1, provider.requests.size)

        provider.respond(IdentityResult.Token("jeton"))
        assertEquals(listOf("BUSY", "result:jeton"), codes())
    }

    @Test
    fun `apres la reponse, une nouvelle demande passe`() {
        signIn()
        provider.respond(IdentityResult.Failure(IdentityError.NO_ACCOUNT))
        signIn()
        provider.respond(IdentityResult.Token("jeton"))

        assertEquals(listOf("NO_ACCOUNT", "result:jeton"), codes())
        assertEquals(2, provider.requests.size)
    }

    @Test
    fun `chaque echec du fournisseur devient son code, sans relance`() {
        IdentityError.entries.forEach { error ->
            signIn()
            provider.respond(IdentityResult.Failure(error))
        }

        assertEquals(listOf("CANCELLED", "NO_ACCOUNT", "UNAVAILABLE", "FAILED"), codes())
        // Une annulation de l'utilisateur ne relance rien : une demande par demande de la page.
        assertEquals(IdentityError.entries.size, provider.requests.size)
    }

    @Test
    fun `une annulation de l'utilisateur est rendue telle quelle, une seule fois`() {
        signIn()
        provider.respond(IdentityResult.Failure(IdentityError.CANCELLED))

        assertEquals(listOf("CANCELLED"), codes())
        assertEquals(1, provider.requests.size)
        assertEquals(0, provider.cancelled)
    }

    @Test
    fun `une seule reponse par demande, meme si le fournisseur repond deux fois`() {
        signIn()
        provider.respond(IdentityResult.Token("premier"))
        provider.respond(IdentityResult.Token("second"))

        assertEquals(listOf("result:premier"), codes())
    }

    @Test
    fun `quand l'ecran se ferme, la demande est abandonnee et sa reponse n'arrive plus`() {
        signIn()
        relay.cancel()

        assertEquals(1, provider.cancelled)
        assertFalse(relay.isBusy)
        provider.respond(IdentityResult.Token("trop tard"))
        assertTrue(page.isEmpty())
    }

    @Test
    fun `abandonner sans demande en cours ne fait rien`() {
        relay.cancel()
        signIn()
        provider.respond(IdentityResult.Token("jeton"))
        relay.cancel()

        assertEquals(0, provider.cancelled)
        assertEquals(listOf("result:jeton"), codes())
    }

    @Test
    fun `apres un abandon, la reponse tardive de l'ancienne demande ne va pas a la nouvelle`() {
        signIn()
        val stale = provider.callbacks.single()
        relay.cancel()
        signIn()
        stale(IdentityResult.Token("ancien"))
        assertTrue(relay.isBusy)
        provider.respond(IdentityResult.Token("nouveau"))

        assertEquals(listOf("result:nouveau"), codes())
    }

    @Test
    fun `un fournisseur qui repond tout de suite laisse le relais libre`() {
        provider.answerAtOnce = IdentityResult.Failure(IdentityError.UNAVAILABLE)
        signIn()

        assertEquals(listOf("UNAVAILABLE"), codes())
        assertFalse(relay.isBusy)
    }

    @Test
    fun `un fournisseur qui leve une exception rend FAILED et la demande suivante passe`() {
        provider.throwOnSignIn = true
        signIn()
        provider.throwOnSignIn = false
        signIn()

        assertEquals(listOf("FAILED"), codes())
        assertTrue(relay.isBusy)
    }

    @Test
    fun `un jeton vide n'est pas rendu a la page`() {
        signIn()
        provider.respond(IdentityResult.Token(""))

        assertEquals(listOf("FAILED"), codes())
    }

    @Test
    fun `chaque reponse va a la page qui a fait la demande`() {
        val first = mutableListOf<String>()
        val second = mutableListOf<String>()
        val request = NativeBridge.screen(
            """{"v":1,"type":"google.signIn","clientId":"$clientId","nonce":"$nonce"}""",
            origin,
            isMainFrame = true,
            repasOrigin = origin,
        ) as NativeRequest.GoogleSignIn

        relay.request(request) { first += it }
        relay.request(request) { second += it }
        provider.respond(IdentityResult.Token("jeton"))

        assertEquals(listOf("google.result"), first.map { JSONObject(it).getString("type") })
        assertEquals(listOf("BUSY"), second.map { JSONObject(it).getString("code") })
    }
}
