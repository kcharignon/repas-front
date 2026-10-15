import { reactive, ref } from 'vue'

/** L'état d'une fenêtre de création ou de modification : valeurs du formulaire, clé de l'élément modifié, erreur du back. */
export function useResourceDialog<T extends object>(blank: () => T) {
  const open = ref(false)
  const editing = ref<string | null>(null)
  const submitted = ref(false)
  const error = ref<string | null>(null)
  const form = reactive(blank()) as T

  function reset(key: string | null, values: T) {
    Object.assign(form, values)
    editing.value = key
    submitted.value = false
    error.value = null
    open.value = true
  }

  return {
    open,
    editing,
    submitted,
    error,
    form,
    create: () => reset(null, blank()),
    edit: (key: string, values: T) => reset(key, values),
  }
}
