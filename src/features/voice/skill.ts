/**
 * Le nom sous lequel le skill se dit à voix haute et se cherche dans l'application Alexa : « Alexa, demande à mes courses d'ajouter du pain ».
 * Le seul endroit où il est écrit (décision D1 de l'ADR 0029 du back) ; il doit rester celui du nom d'invocation déclaré dans la console
 * Amazon (`docs/voice/alexa.md` du back, VOX-205).
 */
export const ALEXA_SKILL_NAME = 'mes courses'
