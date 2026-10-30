// Ce que le passage (`flow/`), le diagnostic et le test automatique demandent à une enseigne : l'interface `RetailerAdapter` et les faits qu'elle
// rend (produits, magasin, connexion, cadence, sondes). Elle est aujourd'hui réalisée par le seul dossier `leclerc/`, qui est donc, avec l'entrée
// du registre (`index.ts`), le seul endroit à nommer l'enseigne : ni `flow/`, ni `diagnostic/`, ni `selftest/`, ni `ui/` n'importent `leclerc/`
// (`test/retailers-architecture.spec.ts`). Une deuxième enseigne réalisera la même interface dans son dossier ; ses faits de sonde propres
// viendront se ranger ici avec elle (DRV-717).
export * from '../leclerc'
