// Page de présentation, `/presentation` : fait apparaître les blocs en douceur quand on arrive dessus.
// La page se lit entière sans ce script (le contenu est dans le HTML) ; la classe `js` n'est posée que s'il tourne.
document.documentElement.classList.add('js')

document.addEventListener('DOMContentLoaded', () => {
  const blocks = document.querySelectorAll('.reveal')
  const show = (block) => block.classList.add('is-in')
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (calm || !('IntersectionObserver' in window)) {
    blocks.forEach(show)
    return
  }
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        show(entry.target)
        watcher.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  blocks.forEach((block) => watcher.observe(block))
})
