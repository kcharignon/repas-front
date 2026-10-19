// L'interface superposée de l'agent (DRV-304). Les phases suivantes (DRV-306 : choix de produit) s'y appuient par `ui.show('chooser', …)`
// et construisent leur contenu avec `h` et `text`.
export { append, clear, h, text, type Child, type Props } from './dom'
export {
  renderPicker,
  type Picker,
  type PickerHooks,
  type PickerItem,
  type PickerProps,
} from './picker'
export {
  CAUSE_TEXTS,
  ERROR_TEXTS,
  errorParts,
  S,
  count,
  formatContent,
  formatMeasure,
  formatNeeded,
  formatNumber,
  formatPrice,
  summarySentence,
  type SummaryCounts,
} from './strings'
export { createUi, type UiHandle, type UiOptions } from './ui'
export type * from './types'
