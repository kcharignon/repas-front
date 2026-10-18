/**
 * La version de l'agent (semver). Elle est reprise dans l'en-tête de `dist/agent.js`, dans `dist/manifest.json` et, plus tard, dans
 * le résultat de chaque passage (`agentVersion`, DRV-302). Monter ce numéro à chaque changement de l'agent : l'application qui
 * l'embarque (DRV-313) se publie avec lui.
 */
export const AGENT_VERSION = '0.7.0'
