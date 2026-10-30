// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isAmbiguousName, namesInSeveralDepartments } from '../departmentMarkers'

const item = (name: string, departmentSlug?: string | null) => ({ name, departmentSlug })
const read = (value: { name: string; departmentSlug?: string | null }) => value

describe('namesInSeveralDepartments (ING-017)', () => {
  it('repère le nom porté par deux rayons, sans tenir compte de la casse ni des espaces autour', () => {
    const ambiguous = namesInSeveralDepartments(
      [
        item('Petits pois', 'surgele'),
        item(' petits pois ', 'legumes'),
        item('Maïs', 'conserve'),
        item('Oignon', 'legumes'),
      ],
      read,
    )

    expect(isAmbiguousName(ambiguous, 'Petits pois')).toBe(true)
    expect(isAmbiguousName(ambiguous, 'PETITS POIS')).toBe(true)
    expect(isAmbiguousName(ambiguous, 'Maïs')).toBe(false)
    expect(isAmbiguousName(ambiguous, 'Oignon')).toBe(false)
  })

  it('ne signale pas un nom répété dans le même rayon : le rayon n’y distinguerait rien', () => {
    const ambiguous = namesInSeveralDepartments(
      [item('Petits pois', 'legumes'), item('Petits pois', 'legumes')],
      read,
    )

    expect(ambiguous.size).toBe(0)
  })

  it('ne signale personne quand le back ne dit pas le rayon (ancien back)', () => {
    const ambiguous = namesInSeveralDepartments(
      [item('Petits pois'), item('Petits pois', null), item('Petits pois', '')],
      read,
    )

    expect(ambiguous.size).toBe(0)
  })
})
