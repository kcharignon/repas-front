import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    'drive-agent/lab/published/**',
  ]),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: [
      'src/**/__tests__/*',
      'drive-agent/lab/src/__tests__/*',
      'drive-agent/android-lab/__tests__/*',
      'android/__tests__/*',
      'drive-agent/test/**/*',
    ],
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // L'agent du drive (DRV-301) tourne dans la page d'une enseigne, avec les droits de l'utilisateur : aucun code distant, aucun HTML
  // injecté, aucune requête vers un autre site que celui de la page, aucune dépendance d'exécution. `drive-agent/test/rules.spec.ts`
  // éprouve chacune de ces règles sur un code qui les enfreint. Placé après le bloc d'oxlint pour qu'il ne les désactive pas.
  {
    name: 'drive-agent/src',
    files: ['drive-agent/src/**/*.ts', 'drive-agent/protocol/**/*.ts'],
    // Le code de l'agent tourne dans une page web : ces globales sont connues, donc `window.eval` et `setTimeout("code")` sont vus.
    languageOptions: {
      globals: { window: 'readonly', setTimeout: 'readonly', setInterval: 'readonly' },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-globals': [
        'error',
        ...['XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts'].map(
          (name) => ({ name, message: "L'agent ne parle qu'à la page qui l'héberge (fetch vers le même hôte)." }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.\\.?/)',
              message: "Pas de dépendance d'exécution dans l'agent : seuls les fichiers de drive-agent/src et de drive-agent/protocol s'importent (chemin relatif).",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
          message: "Pas de innerHTML ni outerHTML : afficher avec textContent ou createElement.",
        },
        {
          selector: 'MemberExpression[computed=true][property.value=/^(innerHTML|outerHTML)$/]',
          message: "Pas de innerHTML ni outerHTML : afficher avec textContent ou createElement.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Pas de insertAdjacentHTML : afficher avec textContent ou createElement.',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
          message: 'Pas de document.write : afficher avec textContent ou createElement.',
        },
        {
          selector: "CallExpression[callee.property.name='createElement'][arguments.0.value=/^script$/i]",
          message: "Pas de balise script : l'agent ne charge aucun code.",
        },
        {
          selector: "CallExpression[callee.property.name='sendBeacon']",
          message: "Pas de sendBeacon : l'agent ne parle qu'à la page qui l'héberge.",
        },
        {
          selector: 'ImportExpression',
          message: "Pas d'import dynamique : l'agent ne charge aucun code.",
        },
        {
          // Une adresse absolue (`https://…`, `//hôte/…`) donnée à fetch : le seul hôte permis est celui de la page (chemin relatif).
          // Le `/` d'une expression régulière ne peut pas s'écrire dans un sélecteur : `\\x2f`.
          selector:
            ":matches(CallExpression[callee.name='fetch'], CallExpression[callee.property.name='fetch'])[arguments.0.value=/^(https?:|\\x2f\\x2f)/i]",
          message: "fetch vers un autre hôte que celui de la page : donner un chemin relatif.",
        },
        {
          selector:
            ":matches(CallExpression[callee.name='fetch'], CallExpression[callee.property.name='fetch'])[arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^(https?:|\\x2f\\x2f)/i]",
          message: "fetch vers un autre hôte que celui de la page : donner un chemin relatif.",
        },
      ],
    },
  },

  skipFormatting,
)
