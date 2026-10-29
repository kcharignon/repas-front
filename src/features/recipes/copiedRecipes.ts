import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * Les recettes des autres que l'utilisateur vient de copier pendant cette visite : le bouton de la liste et celui de la fiche
 * disent « Copiée » au lieu de proposer une seconde copie par erreur. En mémoire de la page seulement (rien n'est gardé dans le
 * navigateur) ; l'écran « Recettes des autres » l'efface à son ouverture, et il part avec la session (`forgetAccountData`).
 */
export const useCopiedRecipesStore = defineStore('copiedRecipes', () => {
  const ids = ref<string[]>([])

  const has = (id: string) => ids.value.includes(id)

  function add(id: string) {
    if (!has(id)) ids.value = [...ids.value, id]
  }

  function clear() {
    ids.value = []
  }

  return { ids, has, add, clear }
})
