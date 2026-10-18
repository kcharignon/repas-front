package eu.kantin.repas.drive

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build

/** La version de l'application installée : son nom, son numéro et la ligne que l'on montre à l'utilisateur (`app.info` en reprend le nom et le numéro). */
internal class InstalledVersion(val name: String, val code: Long, val line: String)

internal fun Context.installedVersion(): InstalledVersion {
    val info = packageManager.getPackageInfo(packageName, 0)
    @Suppress("DEPRECATION")
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
    val name = info.versionName ?: "?"
    val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    return InstalledVersion(name, code, VersionLabel.render(name, code, getString(R.string.build_commit), debuggable))
}
