import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiImage from '@/design/UiImage.vue'

describe('UiImage', () => {
  it("montre l'image, décorative, à la taille demandée", () => {
    const wrapper = mount(UiImage, {
      props: { src: 'images/plat.png' },
      attrs: { class: 'size-8' },
    })

    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe('/images/plat.png')
    expect(image.attributes('alt')).toBe('')
    expect(image.classes()).toContain('size-8')
    expect(wrapper.find('[data-testid="image-fallback"]').exists()).toBe(false)
  })

  it("remplace l'image introuvable par l'icône par défaut, de même taille", async () => {
    const wrapper = mount(UiImage, {
      props: { src: 'images/absente.png' },
      attrs: { class: 'size-8' },
    })

    await wrapper.get('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    const fallback = wrapper.get('[data-testid="image-fallback"]')
    expect(fallback.classes()).toContain('size-8')
    expect(fallback.classes()).toContain('text-muted')
    expect(fallback.attributes('aria-hidden')).toBe('true')
  })

  it("montre l'icône par défaut quand le chemin est vide, sans rien charger", () => {
    const wrapper = mount(UiImage, { props: { src: '' } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="image-fallback"]').exists()).toBe(true)
  })

  it("ne bascule qu'une fois : l'icône reste, sans recharger l'image", async () => {
    const wrapper = mount(UiImage, { props: { src: 'images/absente.png' } })
    await wrapper.get('img').trigger('error')

    await wrapper.vm.$forceUpdate()

    expect(wrapper.findAll('[data-testid="image-fallback"]')).toHaveLength(1)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('retente avec une nouvelle adresse', async () => {
    const wrapper = mount(UiImage, { props: { src: 'images/absente.png' } })
    await wrapper.get('img').trigger('error')

    await wrapper.setProps({ src: 'images/presente.png' })

    expect(wrapper.get('img').attributes('src')).toBe('/images/presente.png')
  })
})
