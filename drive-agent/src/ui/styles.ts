// La feuille de style de l'interface, dans le Shadow DOM : rien ne dépend de la page de l'enseigne, rien ne fuit vers elle.
// Contrastes AA (clair et sombre selon `prefers-color-scheme`), cibles d'au moins 48 px (`--target`, un peu plus que les 44 px exigés : la
// mesure d'un écran n'est jamais exacte au pixel), rien ne dépend de la couleur seule. Les tailles sont en pixels CSS : `ui.ts` agrandit tout le
// cadre (`.overlay`) d'un facteur quand la page est affichée à l'échelle d'un site de bureau (`scale.ts`), ce qui garde la proportion des
// tailles, des cibles et des marges sans rien changer ici. `--clear` : marge basse des écrans qui défilent, pour que le contenu puisse remonter au-dessus
// du bouton de menu (⋮, 48 dp et 24 dp de marge) que l'application pose sur le coin bas droit de la page.

export const STYLES = `
:host{all:initial;color-scheme:light dark;--target:48px;--clear:88px;--bg:#f7f8f6;--fg:#1d2a24;--muted:#4a5850;--card:#fff;--line:#7b8780;--accent:#1e6b4c;--on:#fff;--warn:#fff3d6;--warnfg:#5b3b00;--danger:#a12a2a;--photo:#fff;--g-card:#fff;--g-fg:#16221c;--g-muted:#55645c;--g-line:#c9d3cc;--g-primary:#1e6b4c;--g-soft:#e6f2ec;--g-meter:#e6ece7;--g-shadow:rgba(22,34,28,.18)}
@media (prefers-color-scheme:dark){:host{--bg:#121a16;--fg:#e8f0eb;--muted:#b4c2b9;--card:#1b2621;--line:#8c9a92;--accent:#7fd6a8;--on:#0b1510;--warn:#3a2f12;--warnfg:#ffe3a3;--danger:#ff9b9b;--photo:#fff;--g-card:#17221c;--g-fg:#eaf1ec;--g-muted:#9db0a5;--g-line:#34443a;--g-primary:#4fb58a;--g-soft:#1b2a22;--g-meter:#1f2d25;--g-shadow:rgba(0,0,0,.5)}}
*{box-sizing:border-box}
[hidden]{display:none!important}
.backdrop{position:absolute;inset:0;background:var(--bg)}
.overlay{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;touch-action:pan-y;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
.overlay.sheet{background:transparent;pointer-events:none;overflow:visible}
.overlay.sheet>.screen{flex:none;max-height:70%;margin-top:auto;border-top:3px solid var(--accent);background:var(--bg);pointer-events:auto}
.overlay.sheet>.screen.guide{flex:none;max-height:calc(100% - 24px);margin:auto 8px var(--clear);padding:16px 18px 14px;display:flex;flex-direction:column;gap:10px;border:1.5px solid var(--g-line);border-radius:22px;background:var(--g-card);color:var(--g-fg);box-shadow:0 8px 24px var(--g-shadow)}
.guide h1{margin:0;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:24px;line-height:1.15;font-weight:700}
.guide .g-text{margin:0;font-size:17px;line-height:1.4}
.guide .g-head{display:flex;align-items:center;gap:10px}
.guide .g-segments{display:inline-flex;gap:4px}
.guide .g-seg{width:28px;height:6px;border-radius:999px;background:var(--g-line)}
.guide .g-seg.on{background:var(--g-primary)}
.guide .g-step{font-size:14px;font-weight:700;color:var(--g-muted)}
.guide .g-tick{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border-radius:999px;background:var(--g-soft);color:var(--g-primary)}
.guide .g-status{margin:0;display:flex;align-items:center;gap:8px;font-size:15px;color:var(--g-muted)}
.guide .g-dot{flex:none;width:10px;height:10px;border-radius:999px;background:var(--g-primary)}
.guide .g-meter{height:8px;border-radius:999px;background:var(--g-meter);overflow:hidden}
.guide .g-fill{width:100%;height:8px;border-radius:999px;background:var(--g-primary);transform-origin:0 50%;animation:g-fill 1.5s linear both}
@keyframes g-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.guide>button{width:100%;min-height:56px;border-radius:14px}
.guide>button.primary{border-color:var(--g-primary);background:var(--g-primary)}
.guide .g-stop{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 12px;border:1.5px solid var(--g-line);background:var(--g-card);color:var(--g-fg)}
.guide .g-stop-title{font-size:16px;font-weight:700}
.guide .g-stop-note{font-size:14px;color:var(--g-muted)}
.screen{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px var(--clear);overflow-wrap:anywhere}
.screen.fill{display:flex;flex-direction:column;padding:0;overflow:hidden}
h1{margin:0 0 12px;font-size:1.35rem;line-height:1.25}
h1:focus-visible{outline:0}
p{margin:8px 0}
ul{margin:8px 0;padding-left:1.2em}
.hint{color:var(--muted);font-size:.95rem}
.shop{font-size:1.15rem;font-weight:600}
.notice{margin:12px 0;padding:10px 12px;border:1px solid var(--warnfg);border-radius:10px;background:var(--warn);color:var(--warnfg)}
.error{color:var(--danger);font-weight:600}
.lead{font-weight:600}
.counts{margin:12px 0;padding:0;list-style:none}
.counts li{padding:6px 0;border-bottom:1px solid var(--line)}
details{margin:12px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)}
summary{display:flex;align-items:center;min-height:var(--target);padding:0 12px;cursor:pointer;font-weight:600}
details ul{margin:0;padding:0 12px 8px 28px}
details li{padding:4px 0}
button,input{font:inherit;color:inherit;min-width:var(--target);min-height:var(--target);border-radius:10px}
button{padding:8px 16px;border:2px solid var(--accent);background:var(--card);cursor:pointer}
button.primary{background:var(--accent);color:var(--on);font-weight:600}
button.secondary{border-color:var(--line)}
button.quiet{border-color:transparent;background:transparent;color:var(--muted);text-decoration:underline}
button:disabled{opacity:.6;cursor:default}
input{width:8em;padding:8px 10px;border:2px solid var(--line);background:var(--card)}
label{display:block;margin:12px 0 4px;font-weight:600}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:12px 0 0}
.actions>button{flex:1 1 9em}
.dark{--bg:#0f1713;--fg:#eaf1ec;--muted:#9db0a5;--card:#17221c;--line:#34443a;--accent:#4fb58a;--on:#0b1a13;--warn:#33270a;--warnfg:#f6d98f;--soft:#1b2a22;--stroke:#6b8575;--rule:#1f2d25}
.screen.progress{display:flex;flex-direction:column;gap:14px;background:var(--bg);color:var(--fg);padding-bottom:var(--clear)}
.progress h1{margin:0;font-size:1.9rem;line-height:1.12;letter-spacing:-.01em}
.progress p{margin:0}
.progress .lead{color:var(--muted);font-weight:500}
.progress .brand{display:flex;align-items:center;gap:10px;color:var(--muted);font-weight:600;font-size:.95rem}
.progress .brand-icon{display:flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;border-radius:12px;background:var(--soft);color:var(--accent)}
.progress .card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:20px;background:var(--card)}
.progress .count{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.progress .big{font-size:2.1rem;font-weight:700;line-height:1}
.progress .of{font-size:1.25rem;font-weight:600;color:var(--muted)}
.progress .what{color:var(--muted);font-size:.95rem}
.progress .meter{height:12px;border-radius:6px;background:var(--line);overflow:hidden}
.progress .fill{height:100%;border-radius:6px;background:var(--accent)}
.progress .now{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1.5px solid var(--accent);border-radius:18px;background:var(--soft)}
.progress .now-text{display:flex;flex-direction:column;min-width:0}
.progress .now-text .hint{font-size:.9rem}
.progress .name{font-size:1.25rem;line-height:1.25}
.spin{flex:none;width:28px;height:28px;box-sizing:border-box;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.progress .done-list{flex:1 1 auto;min-height:104px;margin:0;padding:0;list-style:none;overflow-y:auto;overscroll-behavior:contain}
.progress .entry{display:flex;align-items:center;gap:12px;min-height:52px;border-bottom:1px solid var(--rule)}
.progress .dot{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border-radius:50%;background:var(--soft);color:var(--muted)}
.progress .dot.ok{background:var(--accent);color:var(--on)}
.progress .dot.attention{background:var(--warn);color:#f4b73f}
.progress .label{flex:1;min-width:0;font-weight:600;font-size:1.05rem}
.progress .state{flex:0 1 45%;text-align:right;color:var(--muted);font-size:.95rem}
.progress .entry.attention .state{color:var(--warnfg)}
.progress .foot{display:flex;flex-direction:column;gap:12px}
.progress .keep{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.95rem}
.progress .keep svg{flex:none}
.progress .actions{margin:0;padding:0}
.progress .actions>button{min-height:52px;border:1.5px solid var(--stroke);background:transparent;color:var(--fg);font-weight:600}
.bar{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--card)}
.bar p{margin:0}
.bar .head{font-size:1.1rem}
.bar .head strong{font-weight:700}
.bar .head:focus-visible,.bar .sure:focus-visible{outline:0}
.bar .sure{font-weight:600}
.bar .confirm .actions{margin-top:8px}
.bar .confirm .actions>button{flex-basis:12em}
.bar .actions{margin:0;padding:0}
.bar .actions>button{flex:1 1 9em;padding:6px 10px;font-size:.95rem}
.scroll{flex:1;min-height:0;overflow:auto;padding-bottom:var(--clear)}
.checks{margin:12px 0;padding:0;list-style:none}
.check-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:8px 0;border-bottom:1px solid var(--line)}
.check-row .badge{flex:none;min-width:6.5em;padding:2px 8px;border:2px solid var(--line);border-radius:8px;font-weight:700;font-size:.9rem;text-align:center}
.check-row.ok .badge{border-color:var(--accent)}
.check-row.ko .badge{border-color:var(--danger);color:var(--danger)}
.check-row .what{flex:1 1 12em;font-weight:600}
.check-row .hint{flex:1 0 100%;margin:0}
textarea{width:100%;margin:8px 0;padding:8px 10px;font:.9rem/1.4 ui-monospace,monospace;color:inherit;border:2px solid var(--line);border-radius:10px;background:var(--card);resize:vertical}
.stack{display:flex;flex-direction:column;gap:8px;margin:16px 0}
.stack>button{width:100%}
.foot{margin:8px 0;text-align:center}
.picker{padding:12px 12px 0;overflow-wrap:anywhere}
.picker form{margin:12px 0}
.search{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.search label{flex:1 0 100%;margin:0}
.search input{flex:1 1 10em;width:auto}
.gone{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.gone p{margin:0 0 4px}
.check{display:flex;align-items:center;gap:10px;min-height:var(--target);margin:0;font-weight:400}
.check input{flex:none;width:var(--target);height:var(--target);accent-color:var(--accent)}
.aisles{position:relative;display:flex;gap:8px;margin:4px 0 8px;padding:2px 2px 6px;overflow-x:auto;overscroll-behavior-x:contain;touch-action:pan-x pan-y}
.aisles>.chip{flex:none;padding:6px 14px;border-color:var(--line);border-radius:24px;white-space:nowrap}
.aisles>.chip[aria-pressed=true]{border-color:var(--accent);background:var(--accent);color:var(--on);font-weight:600}
.sorting{margin:12px 0 4px}
.sorting .title{margin:0 0 4px;font-weight:600}
.sorting .chips{display:flex;flex-wrap:wrap;gap:8px}
.sorting .chips>.chip{padding:6px 14px;border-color:var(--line);border-radius:24px;white-space:nowrap}
.sorting .chips>.chip[aria-pressed=true]{border-color:var(--accent);background:var(--accent);color:var(--on);font-weight:600}
.sorting .hint{margin:6px 0 0}
.candidates{margin:8px 0;padding:0;list-style:none}
.candidate{margin:8px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.candidate p{margin:2px 0}
.candidate .name{font-weight:600}
.candidate.off .name{color:var(--muted)}
.pick{display:flex;gap:8px;margin-top:8px}
.pick>button{flex:1 1 0;min-width:0;overflow-wrap:anywhere}
.more{height:1px}
.media{display:flex;align-items:flex-start;gap:12px}
.media .text{flex:1 1 0;min-width:0}
.photo{flex:none;display:flex;align-items:center;justify-content:center;width:80px;height:80px;padding:4px;border:1px solid var(--line);border-radius:8px;background:var(--photo)}
.photo img{display:block;width:100%;height:100%;object-fit:contain}
.photo.small{width:64px;height:64px;padding:3px}
.product{margin:8px 0 12px}
.product p{margin:2px 0}
.product .name{font-weight:600}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}.spin{border:0;background:radial-gradient(circle,var(--accent) 0 6px,transparent 6.5px)}}
`
