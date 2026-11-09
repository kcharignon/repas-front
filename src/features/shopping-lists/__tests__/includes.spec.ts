// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { includesText } from '../includes'

const part = (name: string, quantity: number, unitSymbol = '') => ({ name, quantity, unitSymbol })

describe('ce que la ligne d’un ingrédient découpé contient', () => {
  it('dit les parties au pluriel, reliées par « et »', () => {
    expect(includesText([part("Jaune d'œuf", 2), part("Blanc d'œuf", 2)])).toBe(
      "2 jaunes d'œuf et 2 blancs d'œuf",
    )
  })

  it('met des virgules à partir de trois parties', () => {
    expect(includesText([part('Zeste', 1), part('Jus', 2), part('Pépin', 3)])).toBe(
      '1 zeste, 2 jus et 3 pépins',
    )
  })

  it('garde le singulier pour un, et les décimales à la française', () => {
    expect(includesText([part("Jaune d'œuf", 1)])).toBe("1 jaune d'œuf")
    expect(includesText([part("Jaune d'œuf", 1.5)])).toBe("1,5 jaune d'œuf")
  })

  it('lit une unité à symbole : « 200 g de crème »', () => {
    expect(includesText([part('Crème', 200, 'g')])).toBe('200 g de crème')
    expect(includesText([part('Orange', 200, 'g')])).toBe("200 g d'orange")
  })

  it('met au pluriel le premier mot d’un nom à complément, le dernier sinon', () => {
    expect(includesText([part("Jaune d'œuf", 3)])).toBe("3 jaunes d'œuf")
    expect(includesText([part("Blanc d'œuf", 2)])).toBe("2 blancs d'œuf")
    expect(includesText([part("Gousse d'ail", 2)])).toBe("2 gousses d'ail")
    expect(includesText([part('Pomme', 2)])).toBe('2 pommes')
    expect(includesText([part('Pomme de terre', 2)])).toBe('2 pommes de terre')
    expect(includesText([part('Crème fraîche', 2)])).toBe('2 crème fraîches')
    expect(includesText([part('Jaune d œuf', 2)])).toBe('2 jaunes d œuf')
  })

  it('ne met rien au pluriel sous deux, même à 0,5', () => {
    expect(includesText([part("Jaune d'œuf", 0.5)])).toBe("0,5 jaune d'œuf")
    expect(includesText([part('Pomme de terre', 1)])).toBe('1 pomme de terre')
  })

  it('ne dit rien sans partie, ni pour un back qui n’envoie pas la clé', () => {
    expect(includesText([])).toBe('')
    expect(includesText(undefined)).toBe('')
  })
})
