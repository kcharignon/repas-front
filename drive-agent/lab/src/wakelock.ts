// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 9 : garder l'écran allumé 60 secondes avec l'API Wake Lock.

export interface SentinelLike {
  addEventListener(type: 'release', listener: () => void): void
  release(): Promise<void>
}

export interface WakeLockLike {
  request(type: 'screen'): Promise<SentinelLike>
}

export interface WakeResult {
  available: boolean
  obtained: boolean
  /** Nom de l'erreur si le verrou a été refusé (`NotAllowedError`…). */
  error: string | null
  heldMs: number
  /** Le navigateur a rendu le verrou avant la fin (page cachée, économie d'énergie…). */
  releasedEarly: boolean
}

export interface WakeDeps {
  sleep: (ms: number) => Promise<void>
  now: () => number
  cancelled: () => boolean
  onTick?: (remainingMs: number) => void
}

export async function holdWakeLock(
  wakeLock: WakeLockLike | undefined,
  durationMs: number,
  deps: WakeDeps,
): Promise<WakeResult> {
  if (!wakeLock)
    return { available: false, obtained: false, error: null, heldMs: 0, releasedEarly: false }

  let sentinel: SentinelLike
  try {
    sentinel = await wakeLock.request('screen')
  } catch (error) {
    const name = error instanceof Error ? error.name : String(error)
    return { available: true, obtained: false, error: name, heldMs: 0, releasedEarly: false }
  }

  const started = deps.now()
  const state: { releasedAt: number | null } = { releasedAt: null }
  sentinel.addEventListener('release', () => {
    state.releasedAt ??= deps.now()
  })

  while (state.releasedAt === null && !deps.cancelled()) {
    const remaining = durationMs - (deps.now() - started)
    if (remaining <= 0) break
    deps.onTick?.(remaining)
    await deps.sleep(Math.min(1000, remaining))
  }

  const releasedEarly = state.releasedAt !== null
  const end = state.releasedAt ?? deps.now()
  if (!releasedEarly) {
    try {
      await sentinel.release()
    } catch {
      // Déjà rendu : sans importance pour le résultat.
    }
  }
  return { available: true, obtained: true, error: null, heldMs: end - started, releasedEarly }
}
