package eu.kantin.repas.drive

import android.app.Application

/**
 * L'application : ce que la coquille Repas ([MainActivity]) et l'écran du drive ([DriveActivity]) partagent pendant que le processus vit.
 */
class RepasApp : Application() {
    /** L'agent embarqué, lu et vérifié une seule fois (empreinte, WebView assez récente). */
    internal val agentLoad: AgentLoad by lazy { AgentHost.load(this, BuildConfig.DEBUG) }
}
