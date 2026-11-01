package eu.kantin.repas.drive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La lecture du magasin à une adresse donnée (DRV-741) : l'utilisateur a collé l'adresse d'un magasin du site de l'enseigne ; Repas la transmet à l'application
 * (`drive.setup` avec `address`), qui l'ouvre à la place de l'accueil. Pour Leclerc (DRV-754), l'adresse `m-courses…/magasin-N-N-ville` de la version mobile est
 * une page directe de magasin : plus de mode ordinateur ni de redirection attendue. L'adresse est revérifiée ici comme côté web, et ne va jamais à
 * l'agent. Le bandeau « site mobile » d'une enseigne qui le refuse se prouve avec une enseigne fictive. Adresses et passages SYNTHÉTIQUES.
 */
class SetupAddressTest {
    private val runId = "8f14e45f-ceea-467a-9575-8e6b8c0a1b2c"
    private val site = RetailerSites.DEFAULT.legacy
    private val mobile = "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test"
    private val sameStore = "https://fd9-courses.leclercdrive.fr/magasin-123456-123456-ville-test.aspx"

    // Une enseigne fictive qui refuse son site mobile (mode ordinateur) : le mécanisme générique, que Leclerc n'utilise plus
    private val refusing = FictionalSites.A
    private val refusingMobile = "https://m-courses.exemple-a.test/depot-123456-123456-ville-test"
    private val refusingDesktop = "https://fd9-courses.exemple-a.test/depot-123456-123456-ville-test.aspx"
    private val refusingSites = FictionalSites.ALL

    private fun parseRefusing(address: String?): SetupRequest? = SetupRequest.of(runId, refusing, address)

    private fun parse(address: String?): SetupRequest? {
        val json = JSONObject().put("v", 1).put("type", "drive.setup").put("runId", runId)
        if (address != null) json.put("address", address)
        return SetupRequest.parse(json)
    }

    // —— la règle de l'enseigne ——————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `l'adresse d'un magasin de la version mobile de Leclerc, avec ou sans ville, avec ou sans aspx, est acceptable telle quelle (page directe, DRV-754)`() {
        listOf(
            mobile,
            "$mobile.aspx",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville%20test",
            // la page finale du site ordinateur l'est aussi : c'est la même forme
            sameStore,
        ).forEach { assertEquals(it, it, site.openableStoreAddress(it)) }
    }

    @Test
    fun `une adresse qui n'est pas celle d'un magasin d'un hote de l'enseigne est refusee`() {
        listOf(
            "",
            "pas une adresse",
            "http://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "HTTPS://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://M-Courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr:443/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr:8443/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr",
            "https://m-courses.leclercdrive.fr/",
            "https://m-courses.leclercdrive.fr/connexion.aspx",
            "https://m-courses.leclercdrive.fr/magasin-123456",
            "https://m-courses.leclercdrive.fr/magasin-abc-123456",
            "https://m-courses.leclercdrive.fr/magasin-1234567890123-1-ville",
            "https://m-courses.leclercdrive.fr/autre/magasin-123456-123456-ville",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-ville/accueil.aspx",
            "$mobile?a=1",
            "$mobile#haut",
            "$mobile ",
            " $mobile",
            "$mobile\n",
            "$mobile\\",
            "https://nom@m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr@evil.test/magasin-123456-123456-ville-test",
            "https://evil.test\\@m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr.evil.test/magasin-123456-123456-ville-test",
            "https://evil.test/m-courses.leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://leclercdrive.fr/magasin-123456-123456-ville-test",
            "https://www.exemple.test/magasin-123456-123456-ville-test",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-viélle",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-<script>",
            "javascript:alert(1)",
            "https://m-courses.leclercdrive.fr/magasin-123456-123456-" + "a".repeat(400),
        ).forEach { assertNull(it, site.openableStoreAddress(it)) }
        listOf(null, 12, true, JSONObject()).forEach { assertNull(it.toString(), site.openableStoreAddress(it)) }
    }

    @Test
    fun `une enseigne dont le magasin n'est pas dans l'adresse n'en accepte aucune`() {
        val auchan = RetailerSites.DEFAULT.byId("auchan")!!

        listOf("https://www.auchan.fr/", "https://www.auchan.fr/courses", mobile, sameStore).forEach { assertNull(it, auchan.openableStoreAddress(it)) }
    }

    // —— la demande de lecture ——————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `sans adresse, la lecture s'ouvre sur l'accueil de l'enseigne comme avant`() {
        val setup = parse(null)!!

        assertNull(setup.address)
        assertFalse(setup.opensAddress)
        assertEquals(site.startUrl, setup.startUrl)
        // Un message `null` est une absence d'adresse
        val explicitNull = SetupRequest.parse(JSONObject("""{"v":1,"type":"drive.setup","runId":"$runId","address":null}"""))!!
        assertNull(explicitNull.address)
        assertEquals(site.startUrl, explicitNull.startUrl)
    }

    @Test
    fun `avec une adresse de magasin, la lecture s'ouvre sur elle, et le message de l'agent n'en dit rien`() {
        val setup = parse(mobile)!!

        assertEquals(mobile, setup.address)
        assertEquals(mobile, setup.startUrl)
        assertTrue(setup.isSetup)
        assertTrue(setup.opensAddress)
        // Le protocole de l'agent est inchangé : même message, aucune adresse
        assertEquals(parse(null)!!.text, setup.text)
        assertFalse(setup.text.contains("address"))
        assertFalse(setup.text.contains("m-courses"))
        // Abandonnée, la lecture rend le même résultat que sans adresse
        assertEquals(parse(null)!!.abortedResult("1.0.0"), setup.abortedResult("1.0.0"))
    }

    @Test
    fun `une adresse refusee fait refuser tout le message avec INVALID_SETUP`() {
        listOf("http://m-courses.leclercdrive.fr/magasin-123456-123456", "https://evil.test/magasin-123456-123456-ville", "$mobile?x=1", "").forEach {
            assertNull(it, parse(it))
            val refused = NativeBridge.screen(
                """{"v":1,"type":"drive.setup","runId":"$runId","address":${JSONObject.quote(it)}}""",
                "https://repas.exemple.test",
                true,
                "https://repas.exemple.test",
            ) as NativeRequest.Refused
            assertEquals(it, "INVALID_SETUP", JSONObject(refused.reply).getString("code"))
        }
        listOf("12", "true", "{}", "[]").forEach {
            assertNull(it, SetupRequest.parse(JSONObject("""{"v":1,"type":"drive.setup","runId":"$runId","address":$it}""")))
        }
    }

    @Test
    fun `le pont livre la lecture avec son adresse`() {
        val request = NativeBridge.screen(
            """{"v":1,"type":"drive.setup","runId":"$runId","retailer":"leclerc","address":"$mobile"}""",
            "https://repas.exemple.test",
            true,
            "https://repas.exemple.test",
        )

        assertEquals(mobile, (request as NativeRequest.DriveSetup).setup.address)
    }

    @Test
    fun `une enseigne sans pages de magasin refuse l'adresse`() {
        val refused = NativeBridge.screen(
            """{"v":1,"type":"drive.setup","runId":"$runId","retailer":"auchan","address":"$mobile"}""",
            "https://repas.exemple.test",
            true,
            "https://repas.exemple.test",
        )

        assertTrue(refused is NativeRequest.Refused)
    }

    // —— la reprise ———————————————————————————————————————————————————————————————————————————————————————————————————————

    private class MemoryStore(var value: String? = null) : PassStore {
        override fun load() = value

        override fun save(value: String?) {
            this.value = value
        }
    }

    private fun pass(store: PassStore) = DrivePass(store, clock = { 1_000_000L }, agentVersion = { "0.6.0" })

    @Test
    fun `l'adresse d'une lecture non terminee survit a la fin du processus, a cote du message`() {
        val store = MemoryStore()
        pass(store).start(parse(mobile)!!, PassSource.REPAS)

        val saved = JSONObject(store.value!!).getJSONObject("pass")
        assertEquals(setOf("plan", "startedAt", "address"), saved.keys().asSequence().toSet())
        assertFalse(saved.getString("plan").contains("address"))

        val restored = pass(store).current()!!.request
        assertTrue(restored.isSetup)
        assertEquals(mobile, restored.startUrl)
        assertEquals(parse(null)!!.text, restored.text)
    }

    @Test
    fun `une adresse gardee qui ne passe plus la verification est oubliee, la lecture reprend a l'accueil`() {
        val store = MemoryStore()
        pass(store).start(parse(mobile)!!, PassSource.REPAS)
        val tampered = JSONObject(store.value!!)
        tampered.getJSONObject("pass").put("address", "https://evil.test/magasin-123456-123456-ville")
        store.value = tampered.toString()

        val restored = pass(store).current()!!.request

        assertNotNull(restored)
        assertEquals(site.startUrl, restored.startUrl)
        assertFalse(restored.opensAddress)
    }

    @Test
    fun `une lecture sans adresse n'ecrit pas de cle address`() {
        val store = MemoryStore()
        pass(store).start(parse(null)!!, PassSource.REPAS)

        assertEquals(setOf("plan", "startedAt"), JSONObject(store.value!!).getJSONObject("pass").keys().asSequence().toSet())
    }

    // —— le bandeau —————————————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `pour Leclerc, la page m-courses donnee est une page de magasin, aucun bandeau, l'agent recoit la demande (DRV-754)`() {
        val setup = parse(mobile)!!

        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, mobile, loading = true))
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, mobile, loading = false))
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, sameStore, loading = false))
        assertTrue(OpeningWatch().canDeliver(setup, mobile))
    }

    @Test
    fun `pendant que l'adresse donnee charge, le site mobile d'une enseigne qui le refuse n'alarme pas, une fois fini il le dit`() {
        val setup = parseRefusing(refusingMobile)!!

        assertEquals(StoreBanner.SETUP, StoreBanner.of(setup, refusingMobile, loading = true))
        // Fini et toujours sur le site mobile : l'enseigne n'a pas redirigé, le bandeau le dit et propose l'accueil
        assertEquals(StoreBanner.MOBILE, StoreBanner.of(setup, refusingMobile, loading = false))
        // La page finale du site ordinateur est une page de magasin : l'agent reçoit la demande
        assertEquals(StoreBanner.NONE, StoreBanner.of(setup, refusingDesktop, loading = false))
    }

    @Test
    fun `sans adresse donnee, le site mobile d'une enseigne qui le refuse alarme aussitot, comme avant`() {
        assertEquals(StoreBanner.MOBILE, StoreBanner.of(parseRefusing(null)!!, refusingMobile, loading = true))
        assertEquals(StoreBanner.MOBILE, StoreBanner.of(parseRefusing(null)!!, refusingMobile))
    }

    @Test
    fun `l'adresse donnee ne change rien pour un plan`() {
        val plan = DrivePlan.parse(FictionalSites.plan(refusing, "123456", "fd9-courses.exemple-a.test"), refusingSites)!!

        assertEquals(StoreBanner.MOBILE, StoreBanner.of(plan, refusingMobile, loading = true))
    }

    @Test
    fun `la surveillance dit si une page charge`() {
        val watch = OpeningWatch()

        assertFalse(watch.isLoading())
        watch.restart()
        assertTrue(watch.isLoading())
        watch.pageFinished()
        assertFalse(watch.isLoading())
    }

    // —— la livraison ———————————————————————————————————————————————————————————————————————————————————————————————————

    @Test
    fun `le message n'est livre qu'a la page de magasin, jamais au site mobile d'une enseigne qui le refuse`() {
        val watch = OpeningWatch()
        val setup = parseRefusing(refusingMobile)!!

        assertFalse(watch.canDeliver(setup, refusingMobile))
        assertFalse(watch.canDeliver(setup, setup.startUrl))
        assertTrue(watch.canDeliver(setup, refusingDesktop))
        // Leclerc : la page m-courses donnée est elle-même une page de magasin (DRV-754)
        val leclerc = parse(mobile)!!
        assertTrue(watch.canDeliver(leclerc, mobile))
        assertTrue(watch.canDeliver(leclerc, sameStore))
    }
}
