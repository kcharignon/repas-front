/**
 * La valeur de `key` dans `record` si l'objet la porte lui-même, sinon `undefined`. Une clé venue de la page de l'enseigne ou d'un plan
 * (un nom d'unité, une entité, un identifiant d'ingrédient) peut s'appeler `constructor` ou `__proto__` : `record[key]` rendrait alors
 * un attribut hérité de `Object.prototype` (une fonction, un objet) au lieu de « rien ».
 */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
}
