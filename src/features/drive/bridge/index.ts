// Le module `driveBridge` (DRV-402) : le pont entre Repas et le drive. Les écrans importent d'ici et de nulle part ailleurs.
export { createDriveBridge, driveBridge } from './driveBridge'
export type { DriveBridge, DriveBridgeOptions, DriveEvent } from './driveBridge'
export { DRAFT_KEY, DRAFT_TTL_MS } from './draft'
export type { DriveResult, RunDraft, SentLine } from './draft'
export { DriveBridgeError } from './errors'
export type { DriveBridgeErrorCode } from './errors'
export type { AppInfo } from './native'
