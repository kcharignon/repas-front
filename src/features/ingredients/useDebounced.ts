import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** Une copie de `source` qui ne change qu'après `delay` ms sans nouvelle frappe : pas un appel d'API par lettre tapée. */
export function useDebounced<T>(source: Ref<T>, delay = 250): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = value
    }, delay)
  })
  onScopeDispose(() => clearTimeout(timer))

  return debounced
}
