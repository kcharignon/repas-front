package eu.kantin.repas.drive

import org.junit.Assert.assertEquals
import org.junit.Test

/** La ligne de version montrée à l'utilisateur. Valeurs SYNTHÉTIQUES. */
class VersionLabelTest {
    @Test
    fun `une version publiee montre le nom, le numero et la construction`() {
        assertEquals(
            "Version 1.2.3 (numéro 42), construction 0123abc",
            VersionLabel.render("1.2.3", 42, "0123abc", debuggable = false),
        )
    }

    @Test
    fun `une version de debogage le dit`() {
        assertEquals(
            "Version 0.0.0-dev (numéro 1), construction local, débogage",
            VersionLabel.render("0.0.0-dev", 1, "local", debuggable = true),
        )
    }

    @Test
    fun `le numero peut depasser la taille d'un entier de 32 bits signe`() {
        assertEquals(
            "Version 9.9.9 (numéro 4294967296), construction local",
            VersionLabel.render("9.9.9", 4_294_967_296L, "local", debuggable = false),
        )
    }
}
