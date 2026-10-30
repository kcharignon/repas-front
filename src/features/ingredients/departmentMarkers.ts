import { computed } from 'vue'

import { useDepartments } from './queries'

/** Les icônes que ce front dessine : une autre (valeur future du back) est lue comme « aucune icône », sans erreur. */
const knownIcon = (icon: string | null | undefined): string | null =>
  icon === 'snowflake' || icon === 'can' ? icon : null

/**
 * Les repères de rayon (ING-017). L'icône d'un rayon vient de la liste des rayons, DÉJÀ chargée par l'application (une seule lecture
 * partagée, `useDepartments`) et jointe par `departmentSlug` : aucune requête de plus par ligne. Un ancien back (pas d'`icon`, pas de
 * `departmentSlug`) ou une lecture qui échoue : aucun repère, rien ne casse.
 */
export function useDepartmentIcons() {
  const departments = useDepartments()
  const icons = computed(
    () =>
      new Map(
        (departments.data.value?.member ?? []).map((department) => [
          department.slug,
          knownIcon(department.icon),
        ]),
      ),
  )

  return {
    /** L'icône du rayon (`null` : aucune, ou rayon inconnu). */
    iconOf: (departmentSlug: string | null | undefined): string | null =>
      departmentSlug == null ? null : (icons.value.get(departmentSlug) ?? null),
    /** Au moins un de ces rayons a une icône reconnue : les lignes sans icône gardent alors la place du repère. */
    anyIcon: (departmentSlugs: Iterable<string | null | undefined>): boolean => {
      for (const slug of departmentSlugs) {
        if (slug != null && icons.value.get(slug) != null) return true
      }

      return false
    },
  }
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase('fr')

/**
 * Les noms (clés) portés par des ingrédients de rayons DIFFÉRENTS dans cette liste : « Petits pois » en surgelés et en fruits et
 * légumes. Seuls ces ingrédients disent leur rayon sous leur nom ; les autres ne le répètent pas. Sans `departmentSlug` (ancien
 * back), personne n'est signalé.
 */
export function namesInSeveralDepartments<T>(
  items: Iterable<T>,
  read: (item: T) => { name: string; departmentSlug?: string | null },
): Set<string> {
  const seen = new Map<string, Set<string>>()
  for (const item of items) {
    const { name, departmentSlug } = read(item)
    if (departmentSlug == null || departmentSlug === '') continue
    const departments = seen.get(nameKey(name)) ?? new Set<string>()
    departments.add(departmentSlug)
    seen.set(nameKey(name), departments)
  }

  return new Set([...seen].filter(([, departments]) => departments.size > 1).map(([key]) => key))
}

/** Ce nom est-il porté par des ingrédients de plusieurs rayons de la liste (voir `namesInSeveralDepartments`) ? */
export const isAmbiguousName = (ambiguous: Set<string>, name: string): boolean =>
  ambiguous.has(nameKey(name))
