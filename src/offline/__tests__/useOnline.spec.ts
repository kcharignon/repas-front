import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { i18n } from '@/i18n'
import OfflineBanner from '@/app/OfflineBanner.vue'
import { useOnline } from '@/offline/useOnline'

describe('connexion', () => {
  it('suit les événements du navigateur', async () => {
    const online = useOnline()

    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(online.value).toBe(true)
  })

  it("le bandeau n'apparaît que hors connexion", async () => {
    const wrapper = mount(OfflineBanner, { global: { plugins: [i18n] } })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(wrapper.find('[role="status"]').text()).toContain('Hors connexion')

    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
