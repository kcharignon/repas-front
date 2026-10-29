// @vitest-environment node
// L'adresse de la photo d'un produit (DRV-633) : du texte venu de la page de l'enseigne, donc non fiable. Une adresse n'est montrée que si elle est en
// https, d'un hôte de `leclercdrive.fr`, sans identifiant ni port, d'au plus 2 000 caractères ; sinon `null` (la fiche reste en texte, sans erreur).
import { describe, expect, it } from 'vitest'

import { MAX_PHOTO_URL, photoUrl } from '../src/photo-url'

const PAGE = {
  hostname: 'fd9-courses.leclercdrive.fr',
  pathname: '/magasin-000001-000001-Ville-Test/recherche.aspx',
}
const GOOD = 'https://fd9-photos.leclercdrive.fr/image.ashx?id=11&use=l&cat=p'

describe('une adresse de photo acceptée', () => {
  it.each([
    [GOOD, GOOD],
    ['https://leclercdrive.fr/a.jpg', 'https://leclercdrive.fr/a.jpg'],
    [
      'https://photos-test.leclercdrive.fr/image.ashx?id=1',
      'https://photos-test.leclercdrive.fr/image.ashx?id=1',
    ],
    ['https://FD9-Photos.LeclercDrive.FR/a.jpg', 'https://fd9-photos.leclercdrive.fr/a.jpg'],
    ['https://a.b.c.leclercdrive.fr/a.jpg', 'https://a.b.c.leclercdrive.fr/a.jpg'],
    ['https://fd9-photos.leclercdrive.fr:443/a.jpg', 'https://fd9-photos.leclercdrive.fr/a.jpg'],
  ])('%s', (raw, expected) => {
    expect(photoUrl(raw)).toBe(expected)
  })

  it('une adresse relative se résout par rapport à la page', () => {
    expect(photoUrl('/images/b.jpg', PAGE)).toBe('https://fd9-courses.leclercdrive.fr/images/b.jpg')
    expect(photoUrl('//fd9-photos.leclercdrive.fr/b.jpg', PAGE)).toBe(
      'https://fd9-photos.leclercdrive.fr/b.jpg',
    )
  })
})

// Le tableau des cas hostiles : chacun doit donner `null`, jamais une erreur.
const HOSTILE: [string, unknown][] = [
  ['javascript:', 'javascript:alert(1)'],
  ['javascript: en majuscules', 'JaVaScRiPt:alert(1)'],
  ['javascript: avec l’hôte en commentaire', 'javascript://fd9-photos.leclercdrive.fr/%0aalert(1)'],
  ['data: image', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
  ['data: html', 'data:text/html,<script>alert(1)</script>'],
  ['blob:', 'blob:https://fd9-photos.leclercdrive.fr/uuid'],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['file:', 'file:///etc/passwd'],
  ['http (pas https)', 'http://fd9-photos.leclercdrive.fr/a.jpg'],
  ['ftp', 'ftp://fd9-photos.leclercdrive.fr/a.jpg'],
  ['un autre hôte', 'https://images.autre-site.invalid/a.jpg'],
  ['un autre hôte réel', 'https://example.com/a.jpg'],
  [
    'l’hôte de l’enseigne en préfixe d’un autre',
    'https://leclercdrive.fr.autre-site.invalid/a.jpg',
  ],
  ['l’hôte de l’enseigne comme chemin', 'https://example.com/leclercdrive.fr/a.jpg'],
  ['l’hôte de l’enseigne en requête', 'https://example.com/a.jpg?h=fd9-photos.leclercdrive.fr'],
  ['l’hôte de l’enseigne en fragment', 'https://example.com/#fd9-photos.leclercdrive.fr'],
  ['un nom qui finit pareil sans point', 'https://evilleclercdrive.fr/a.jpg'],
  ['un tiret devant', 'https://-leclercdrive.fr/a.jpg'],
  ['un identifiant (utilisateur)', 'https://fd9-photos.leclercdrive.fr@example.com/a.jpg'],
  ['un identifiant devant l’hôte permis', 'https://user@fd9-photos.leclercdrive.fr/a.jpg'],
  ['un identifiant et un mot de passe', 'https://user:secret@fd9-photos.leclercdrive.fr/a.jpg'],
  [
    'un identifiant qui imite l’hôte permis',
    'https://fd9-photos.leclercdrive.fr:80@example.com/a.jpg',
  ],
  ['un port inattendu', 'https://fd9-photos.leclercdrive.fr:8443/a.jpg'],
  ['un port 80', 'https://fd9-photos.leclercdrive.fr:80/a.jpg'],
  ['un point final', 'https://fd9-photos.leclercdrive.fr./a.jpg'],
  ['deux points de suite', 'https://a..leclercdrive.fr/a.jpg'],
  ['un point au début', 'https://.leclercdrive.fr/a.jpg'],
  ['un point au début du sous-domaine', 'https://.fd9-photos.leclercdrive.fr/a.jpg'],
  ['une adresse IP', 'https://127.0.0.1/a.jpg'],
  ['une adresse IP décimale', 'https://2130706433/a.jpg'],
  ['localhost', 'https://localhost/a.jpg'],
  ['un hôte vide', 'https:///a.jpg'],
  ['https: sans rien', 'https:'],
  ['la barre oblique inverse (lue comme /)', 'https:\\\\example.com\\a.jpg'],
  [
    'une barre oblique inverse dans l’hôte',
    'https://example.com\\@fd9-photos.leclercdrive.fr/a.jpg',
  ],
  [
    'des barres obliques inverses derrière l’hôte',
    'https://fd9-photos.leclercdrive.fr\\@example.com/a.jpg',
  ],
  ['une tabulation cachée dans le schéma', 'ht\ttps://example.com/a.jpg'],
  ['un retour à la ligne caché', 'https://example.com/\na.jpg'],
  ['un retour chariot', 'https://fd9-photos.leclercdrive.fr/a.jpg\r'],
  ['un espace dans l’adresse', 'https://fd9-photos.leclercdrive.fr/a b.jpg'],
  ['un espace devant', ' https://fd9-photos.leclercdrive.fr/a.jpg'],
  ['un espace derrière', 'https://fd9-photos.leclercdrive.fr/a.jpg '],
  ['un caractère nul', 'https://fd9-photos.leclercdrive.fr/a.jpg\0'],
  ['un caractère de contrôle', 'https://fd9-photos.leclercdrive.fr/\u0001a.jpg'],
  ['un point pleine chasse (IDNA) qui se lirait comme un point', 'https://leclercdrive。fr/a.jpg'],
  ['une lettre hors ASCII qui se lirait comme un autre', 'https://ｌeclercdrive.fr/a.jpg'],
  ['un nom internationalisé', 'https://é.leclercdrive.fr/a.jpg'],
  ['un caractère de largeur nulle', 'https://fd9-photos.leclercdrive.fr/a​.jpg'],
  ['un sens de lecture', 'https://fd9-photos.leclercdrive.fr/‮a.jpg'],
  ['une adresse relative au protocole vers un autre hôte', '//example.com/a.jpg'],
  ['une adresse relative au protocole en majuscules', '//EXAMPLE.com/a.jpg'],
  ['une adresse vide', ''],
  ['des espaces seuls', '   '],
  ['un mot', 'image'],
  ['un chemin relatif au dossier de la page', 'a.jpg'],
  ['https: sans barres, lu comme relatif', 'https:a.jpg'],
  ['trop longue', `https://fd9-photos.leclercdrive.fr/${'a'.repeat(MAX_PHOTO_URL)}`],
  ['un nombre', 42],
  ['un objet', { toString: () => GOOD }],
  ['un tableau', [GOOD]],
  ['null', null],
  ['indéfini', undefined],
  ['vrai', true],
]

describe('les adresses hostiles : jamais affichées, jamais une erreur', () => {
  it.each(HOSTILE)('%s', (_name, raw) => {
    expect(photoUrl(raw)).toBeNull()
    expect(photoUrl(raw, PAGE)).toBeNull()
  })

  it('une adresse de 2 000 caractères passe, une de 2 001 non', () => {
    const base = 'https://fd9-photos.leclercdrive.fr/'
    expect(photoUrl(base + 'a'.repeat(MAX_PHOTO_URL - base.length))).not.toBeNull()
    expect(photoUrl(base + 'a'.repeat(MAX_PHOTO_URL - base.length + 1))).toBeNull()
  })
})

describe('une adresse relative d’une page qui ne convient pas', () => {
  it.each([
    ['une page en http', { ...PAGE, protocol: 'http:' }],
    ['une page avec un port', { ...PAGE, port: '8099' }],
    ['une page d’un autre hôte', { ...PAGE, hostname: 'www.example.com' }],
  ])('%s : pas de photo', (_name, page) => {
    expect(photoUrl('/images/b.jpg', page)).toBeNull()
  })

  it('sans page, une adresse relative est refusée', () => {
    expect(photoUrl('/images/b.jpg')).toBeNull()
    expect(photoUrl('//fd9-photos.leclercdrive.fr/b.jpg')).toBeNull()
  })
})
