// L'interface superposée de l'agent (DRV-304). Les phases suivantes (DRV-306 : choix de produit) s'y appuient par `ui.show('chooser', …)`
// et construisent leur contenu avec `h` et `text`.
export { append, clear, h, text, type Child, type Props } from './dom'
export {
  renderPicker,
  type AisleChip,
  type AisleRow,
  type AisleId,
  type AisleLoad,
  type Picker,
  type PickerHooks,
  type PickerItem,
  type PickerProps,
} from './picker'
export {
  causeTexts,
  errorTexts,
  errorParts,
  S,
  count,
  formatContent,
  formatMeasure,
  formatNeeded,
  formatNumber,
  formatPrice,
  pluralOf,
  summarySentence,
  unitFor,
  type SummaryCounts,
} from './strings'
export { createUi, type UiHandle, type UiOptions } from './ui'
export type * from './types'
