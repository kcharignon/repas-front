import { ref } from 'vue'

/**
 * Le coin de saison est posé une fois à la racine, au-dessus de tout. Sur le bandeau de connexion (de couleur de marque, sombre) un trait
 * `ink` disparaîtrait : l'écran de connexion le déclare ici pendant qu'il est ouvert, le coin passe alors au clair sur téléphone,
 * où le bandeau est en haut de l'écran (sur le bureau, le coin tombe sur la moitié droite, de la couleur de la page).
 */
export const cornerOnBanner = ref(false)
