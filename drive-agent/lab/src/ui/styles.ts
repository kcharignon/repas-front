// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Feuille de style du banc, dans le Shadow DOM : rien ne dépend de la page de Leclerc, rien ne fuit vers elle.
// Écrite serrée (une règle par ligne, sans espaces superflus) : chaque octet compte dans la taille du favori.

export const STYLES = `
:host{all:initial;display:block;--bg:#f7f8f6;--fg:#1d2a24;--muted:#4d5b53;--card:#fff;--line:#c9d2cc;--accent:#1e6b4c;--on:#fff;--warn:#fff3d6;--warnfg:#5b3b00;--danger:#a12a2a}
*{box-sizing:border-box}
.overlay{position:fixed;inset:0;z-index:2147483647;overflow-y:auto;overscroll-behavior:contain;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif;padding:0 14px 40px}
[hidden]{display:none!important}
header{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:10px 0;background:var(--bg);border-bottom:1px solid var(--line)}
h1{flex:1;margin:0;font-size:1.1rem}
h2{margin:16px 0 6px;font-size:1.1rem}
p{margin:8px 0}
.notice{padding:8px 10px;border-radius:8px;background:var(--warn);color:var(--warnfg);font-size:.9rem}
.hint{color:var(--muted);font-size:.92rem}
button,input,select,textarea{font:inherit;color:inherit;min-height:44px;border-radius:10px}
button{padding:8px 14px;border:1px solid var(--accent);background:var(--card)}
button.primary{background:var(--accent);color:var(--on);font-weight:600}
button.danger{border-color:var(--danger);color:var(--danger)}
button:disabled{opacity:.5}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
h1:focus-visible{outline:0}
input,select,textarea{width:100%;padding:8px 10px;border:1px solid var(--line);background:var(--card)}
textarea{min-height:160px;font-family:monospace;font-size:.9rem}
label{display:block;margin:10px 0 4px;font-weight:600}
label.inline{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:400}
label.inline input{width:24px;min-height:24px;height:24px}
.menu{display:grid;gap:8px;margin:12px 0;padding:0;list-style:none}
.menu button{width:100%;text-align:left}
.num{display:inline-block;min-width:1.8em;font-weight:700;color:var(--accent)}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.card{margin:12px 0;padding:10px 12px;border:1px solid var(--danger);border-radius:10px;background:var(--card)}
pre.out{margin:8px 0;padding:10px;max-height:55vh;overflow:auto;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;border:1px solid var(--line);border-radius:10px;background:var(--card);font:.85rem/1.4 monospace}
.status{min-height:1.4em;color:var(--muted);font-size:.92rem}
.framebar{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start;height:100px;padding:6px 10px;background:#14201a;color:#eaf1ec;font:.8rem/1.3 system-ui,sans-serif}
.framebar button{background:#fff;color:#14201a;border-color:#fff}
.framebar .danger{color:var(--danger)}
.live{grid-column:1/-1;margin:0;overflow:hidden;max-height:2.7em}
iframe{position:fixed;z-index:2147483646;left:0;right:0;bottom:0;top:100px;width:100%;height:calc(100% - 100px);border:0;background:#fff}
`
