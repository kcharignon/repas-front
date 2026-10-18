// La feuille de style de l'interface, dans le Shadow DOM : rien ne dépend de la page de l'enseigne, rien ne fuit vers elle.
// Contrastes AA (clair et sombre selon `prefers-color-scheme`), cibles d'au moins 48 px (`--target`, un peu plus que les 44 px exigés : la
// mesure d'un écran n'est jamais exacte au pixel), rien ne dépend de la couleur seule. Les tailles sont en pixels CSS : `ui.ts` agrandit tout le
// cadre (`.overlay`) d'un facteur quand la page est affichée à l'échelle d'un site de bureau (`scale.ts`), ce qui garde la proportion des
// tailles, des cibles et des marges sans rien changer ici. `--clear` : marge basse des écrans qui défilent, pour que le contenu puisse remonter au-dessus
// du bouton de menu (⋮, 48 dp et 24 dp de marge) que l'application pose sur le coin bas droit de la page.

export const STYLES = `
:host{all:initial;color-scheme:light dark;--target:48px;--clear:88px;--bg:#f7f8f6;--fg:#1d2a24;--muted:#4a5850;--card:#fff;--line:#7b8780;--accent:#1e6b4c;--on:#fff;--warn:#fff3d6;--warnfg:#5b3b00;--danger:#a12a2a}
@media (prefers-color-scheme:dark){:host{--bg:#121a16;--fg:#e8f0eb;--muted:#b4c2b9;--card:#1b2621;--line:#8c9a92;--accent:#7fd6a8;--on:#0b1510;--warn:#3a2f12;--warnfg:#ffe3a3;--danger:#ff9b9b}}
*{box-sizing:border-box}
[hidden]{display:none!important}
.backdrop{position:absolute;inset:0;background:var(--bg)}
.overlay{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;touch-action:pan-y;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
.screen{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px var(--clear);overflow-wrap:anywhere}
.screen.fill{display:flex;flex-direction:column;padding:0;overflow:hidden}
h1{margin:0 0 12px;font-size:1.35rem;line-height:1.25}
h1:focus-visible{outline:0}
p{margin:8px 0}
ul{margin:8px 0;padding-left:1.2em}
.hint{color:var(--muted);font-size:.95rem}
.notice{margin:12px 0;padding:10px 12px;border:1px solid var(--warnfg);border-radius:10px;background:var(--warn);color:var(--warnfg)}
.error{color:var(--danger);font-weight:600}
.counts{margin:12px 0;padding:0;list-style:none}
.counts li{padding:6px 0;border-bottom:1px solid var(--line)}
details{margin:12px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)}
summary{display:flex;align-items:center;min-height:var(--target);padding:0 12px;cursor:pointer;font-weight:600}
details ul{margin:0;padding:0 12px 8px 28px}
details li{padding:4px 0}
button,input{font:inherit;color:inherit;min-width:var(--target);min-height:var(--target);border-radius:10px}
button{padding:8px 16px;border:2px solid var(--accent);background:var(--card);cursor:pointer}
button.primary{background:var(--accent);color:var(--on);font-weight:600}
button.danger{border-color:var(--danger);color:var(--danger)}
button:disabled{opacity:.6;cursor:default}
input{width:8em;padding:8px 10px;border:2px solid var(--line);background:var(--card)}
label{display:block;margin:12px 0 4px;font-weight:600}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:12px 0 0}
.actions>button{flex:1 1 9em}
progress{width:100%;height:16px;accent-color:var(--accent)}
.live ul{list-style:none;padding:0}
.live li{padding:4px 0;color:var(--muted)}
.bar{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--card)}
.bar p{margin:0}
.bar .actions{margin:0;padding:0}
.bar .actions>button{flex:1 1 7em;padding:6px 10px;font-size:.95rem}
.zone{flex:1;min-height:0;overflow:auto}
.checks{margin:12px 0;padding:0;list-style:none}
.check-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:8px 0;border-bottom:1px solid var(--line)}
.check-row .badge{flex:none;min-width:6.5em;padding:2px 8px;border:2px solid var(--line);border-radius:8px;font-weight:700;font-size:.9rem;text-align:center}
.check-row.ok .badge{border-color:var(--accent)}
.check-row.ko .badge{border-color:var(--danger);color:var(--danger)}
.check-row .what{flex:1 1 12em;font-weight:600}
.check-row .hint{flex:1 0 100%;margin:0}
textarea{width:100%;margin:8px 0;padding:8px 10px;font:.9rem/1.4 ui-monospace,monospace;color:inherit;border:2px solid var(--line);border-radius:10px;background:var(--card);resize:vertical}
.choice{margin:12px 0}
.choice>button{display:block;width:100%;text-align:left}
.choice .hint{margin:4px 0 0}
.picker{padding:12px 12px var(--clear);overflow-wrap:anywhere}
.picker form{margin:12px 0}
.search{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.search label{flex:1 0 100%;margin:0}
.search input{flex:1 1 10em;width:auto}
.gone{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.gone p{margin:0 0 4px}
.check{display:flex;align-items:center;gap:10px;min-height:var(--target);margin:0;font-weight:400}
.check input{flex:none;width:var(--target);height:var(--target);accent-color:var(--accent)}
.candidates{margin:8px 0;padding:0;list-style:none}
.candidate{margin:8px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.candidate p{margin:2px 0}
.candidate .name{font-weight:600}
.candidate.off .name{color:var(--muted)}
.candidate>button{width:100%;margin-top:8px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`
