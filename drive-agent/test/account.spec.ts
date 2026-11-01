// Le compte de l'enseigne : une seule définition, ancrée (DRV-757). Un site qui lui ressemble n'en est pas un.
import { describe, expect, it } from 'vitest'

import { isAccountLoginPage } from '../src/leclerc/account'

const LOGIN = '/drive/magasin-000001-000001-Ville-Test/authentification.aspx'

describe('isAccountLoginPage', () => {
  it.each([
    ['fd8-espace-client.leclercdrive.fr', LOGIN, true],
    ['FD8-Espace-Client.LeclercDrive.fr', LOGIN, true],
    ['fd123-espace-client.leclercdrive.fr', '/drive/x/page-inconnue.aspx', true],
    ['fd8-espace-client.leclercdrive.fr', '/drive/x/home-espace-client-ccc.aspx', false],
    ['fd8-espace-client.leclercdrive.fr.evil.com', LOGIN, false],
    ['www.fd8-espace-client.leclercdrive.fr', LOGIN, false],
    ['fd1234-espace-client.leclercdrive.fr', LOGIN, false],
    ['evil.com', LOGIN, false],
    ['fd8-espace-client.leclercdrive.fr.', LOGIN, false],
  ])('%s %s : %s', (hostname, pathname, expected) => {
    expect(isAccountLoginPage(hostname, pathname)).toBe(expected)
  })
})
