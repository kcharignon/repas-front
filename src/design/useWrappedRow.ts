import { onBeforeUnmount, onMounted, onUpdated, ref, type Ref } from 'vue'

/**
 * Une rangée d'actions `flex-wrap` dont seule la première ligne se voit (hauteur fixe, `overflow-hidden`) : vrai quand un de ses
 * enfants est passé à la ligne, donc caché. L'écran range alors cette action ailleurs (dans « ⋮ »). La mesure suit la largeur de la
 * rangée, celle de ses enfants (chargement de la police, grands caractères du téléphone) et chaque rendu ; elle ne change pas la mise
 * en page, donc ne boucle pas.
 */
export function useWrappedRow(row: Readonly<Ref<HTMLElement | null>>) {
  const wrapped = ref(false)
  let observer: ResizeObserver | undefined

  function measure() {
    const children = [...(row.value?.children ?? [])] as HTMLElement[]
    const first = children[0]
    wrapped.value =
      first !== undefined && children.some((child) => child.offsetTop > first.offsetTop)
  }

  function observe() {
    if (observer === undefined || row.value === null) return
    observer.disconnect()
    observer.observe(row.value)
    for (const child of row.value.children) observer.observe(child)
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(measure)
    observe()
    measure()
  })
  onUpdated(() => {
    observe()
    measure()
  })
  onBeforeUnmount(() => observer?.disconnect())

  return wrapped
}
