import type { WakeLockLike } from './types'

/** Garde l'écran allumé pendant le passage. Rend de quoi libérer le verrou ; un refus ou une absence sont tolérés (rien à libérer). */
export async function keepAwake(wakeLock: WakeLockLike | null): Promise<() => Promise<void>> {
  if (!wakeLock) return () => Promise.resolve()
  try {
    const sentinel = await wakeLock.request('screen')
    return () => sentinel.release().catch(() => undefined)
  } catch {
    return () => Promise.resolve()
  }
}
