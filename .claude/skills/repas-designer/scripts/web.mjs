// Toile d'araignée d'un coin (haut droit) : fils rayonnants et arcs affaissés, en SVG au trait (currentColor). Usage : node web.mjs > cobweb.svg
const O=[160,0], E=[[0,0],[8,40],[34,92],[82,142],[160,160]]
const pt=(i,f)=>[O[0]+f*(E[i][0]-O[0]), O[1]+f*(E[i][1]-O[1])]
let d=''
for(const e of E) d+=`M${O[0]} ${O[1]}L${e[0]} ${e[1]}`
let arcs=''
for(const f of [.26,.48,.7,.92]){
  for(let i=0;i<E.length-1;i++){
    const a=pt(i,f), b=pt(i+1,f)
    const m=[(E[i][0]+E[i+1][0])/2-O[0],(E[i][1]+E[i+1][1])/2-O[1]]
    const c=[O[0]+f*.84*m[0], O[1]+f*.84*m[1]]
    arcs+=`M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
  }
}
console.log(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/><path d="${arcs}"/></svg>`)
