import{l as H,g as K}from"./index-CIqs7KLE.js";const a=t=>String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),S=t=>{const i=new Date(t);return Number.isFinite(i.getTime())?i.toISOString().replace(/\.\d+Z$/,"Z"):""};function _(t){return Number.isFinite(t)?t>=.8?"high":t>=.55?"moderate":t>=.3?"low":"very low":"not stated"}const q=t=>t&&Number.isFinite(t.lat)?`${t.label?`${a(t.label)} · `:""}${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`:a((t==null?void 0:t.label)||"—");function u(t,i){return i.length?`<table><thead><tr>${t.map(r=>`<th>${a(r)}</th>`).join("")}</tr></thead><tbody>${i.map(r=>`<tr>${r.map(s=>`<td>${s}</td>`).join("")}</tr>`).join("")}</tbody></table>`:'<p class="none">None recorded.</p>'}function Y(t={}){const i=a(t.marking||"UNCLASSIFIED"),r=S(t.at??Date.now()),s=a(t.title||"ADAM situation product"),c=e=>String(e||"").split(/\n{2,}/).filter(Boolean).map(p=>`<p>${a(p).replace(/\n/g,"<br>")}</p>`).join(""),d=(t.findings||[]).map((e,p)=>[a(e.id||`F-${p+1}`),`<strong>${a(e.subject)}</strong>`,q(e.location),a(e.time),`${a(_(e.confidence))}${Number.isFinite(e.confidence)?` (${e.confidence.toFixed(2)})`:""}`,a(e.source),`${a(e.assessment)}${e.alternative?`<div class="alt">Alternative: ${a(e.alternative)}</div>`:""}`]),y=(t.watch||[]).map(e=>[a(e.score),a(e.title),a(e.label),Number.isFinite(e.lat)?`${e.lat.toFixed(3)}, ${e.lon.toFixed(3)}`:"—",a(e.why)]),l=(t.contacts||[]).map(e=>[a(e.kind),a(e.label),Number.isFinite(e.lat)?`${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`:"—",a(e.note||"")]),o=(t.events||[]).map(e=>[a(S(e.at)),a(e.severity),a(e.title),a(e.detail)]),m=(t.actions||[]).map(e=>[a(S(e.at)),a(e.tool),`<code>${a(e.args)}</code>`,e.ok?"ok":"failed"]),b=(t.sources||[]).map(e=>[a(e.name||e.id),a(e.source||""),a(e.feedState||""),a(e.count??""),a(e.ageLabel||"")]);return`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${s}</title>
<style>
:root{--ink:#0d1517;--dim:#455a64;--line:#cfd8dc;--accent:#00838f}
*{box-sizing:border-box}body{margin:0;font:13px/1.5 system-ui,"Segoe UI",Arial,sans-serif;color:var(--ink);background:#fff}
.mark{position:sticky;top:0;text-align:center;font:600 12px ui-monospace,Menlo,monospace;letter-spacing:2px;padding:4px;background:#fff;border-bottom:2px solid var(--ink)}
.mark.bottom{position:static;border-top:2px solid var(--ink);border-bottom:0;margin-top:32px}
main{max-width:980px;margin:0 auto;padding:24px}
.cover{border:2px solid var(--ink);padding:28px;margin:12px 0 28px}
.cover h1{margin:6px 0 10px;font-size:26px}
.meta{font:12px ui-monospace,Menlo,monospace;color:var(--dim)}
h2{font-size:15px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--line);padding-bottom:4px;margin-top:28px}
.bluf{border-left:4px solid var(--accent);padding:8px 14px;background:#f1f8f9;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid var(--line);padding:5px 7px;vertical-align:top;text-align:left}
th{background:#eceff1;font-weight:600}code{font-size:11px;word-break:break-all}.alt{color:var(--dim);margin-top:4px;font-style:italic}
figure{margin:0}figure img{width:100%;border:1px solid var(--line)}figcaption{font:11px ui-monospace,Menlo,monospace;color:var(--dim);margin-top:4px}
.none{color:var(--dim);font-style:italic}.key td:first-child{font-weight:600;width:110px}
@media print{.mark{position:static}h2{break-after:avoid}table,figure{break-inside:avoid}}
</style></head><body>
<div class="mark">${i}</div>
<main>
<section class="cover">
<div class="meta">ADAM · #HOUSEOFASHER · INTELLIGENCE PRODUCT</div>
<h1>${s}</h1>
<div class="meta">DTG ${a(r)}${t.preparedBy?` · PREPARED BY ${a(t.preparedBy)}`:""}${t.period?` · PERIOD ${a(t.period)}`:""}</div>
${t.mission?`<p><strong>Mission:</strong> ${a(t.mission)}</p>`:""}
</section>
<h2>Bottom line up front</h2>
<div class="bluf">${c(t.bluf||"Not stated.")}</div>
<h2>Situation and assessment</h2>
${c(t.assessment)||'<p class="none">No narrative assessment was written.</p>'}
${t.situation?`<div class="meta">${c(t.situation)}</div>`:""}
<h2>Map extract</h2>
${typeof t.mapImage=="string"&&t.mapImage.startsWith("data:image/")?`<figure><img alt="Map extract at ${a(r)}" src="${a(t.mapImage)}"><figcaption>${a(t.mapCaption||`View at ${r}`)}</figcaption></figure>`:'<p class="none">No map extract.</p>'}
<h2>Findings</h2>
${u(["ID","Subject","Location","Time","Confidence","Source","Assessment"],d)}
<h2>Watch at time of export</h2>
${u(["Score","Item","Detail","Position","Why it ranks"],y)}
<h2>Contact log</h2>
${u(["Kind","Contact","Position","Note"],l)}
<h2>Event log</h2>
${u(["UTC","Severity","Event","Detail"],o)}
<h2>Analyst actions</h2>
${u(["UTC","Action","Arguments","Result"],m)}
<h2>Sources</h2>
${u(["Layer","Source","Feed state","Count","Age"],b)}
<p class="meta">Data attributions: ${a((t.attributions||[]).join(" · ")||"see the console’s Data attribution panel")}</p>
<h2>Confidence key</h2>
<table class="key"><tbody>
<tr><td>High (≥0.80)</td><td>Several independent sources agree; little room for another reading.</td></tr>
<tr><td>Moderate (0.55–0.79)</td><td>Credible and consistent, but a plausible alternative remains.</td></tr>
<tr><td>Low (0.30–0.54)</td><td>A lead: thin, single-source or inferred; needs confirmation.</td></tr>
<tr><td>Very low (&lt;0.30)</td><td>Speculative; recorded so it can be checked, not relied on.</td></tr>
</tbody></table>
<p class="meta">Behaviour findings, correlations, predictions and exposure radii are screening aids. Positions come from public broadcast data (ADS-B, AIS) and public sensors and may be delayed, spoofed or missing.</p>
</main>
<div class="mark bottom">${i}</div>
</body></html>`}async function J({title:t="ADAM situation product",bluf:i="",assessment:r="",marking:s="UNCLASSIFIED",preparedBy:c="",periodHours:d=24}={},y=()=>K()){var f,D,A,I,F,L,C,M,N,E,$,O,x,U,P,T,R,j,B,z,v,Z;const l=y(),o=l.intel,m=Date.now(),b=m-d*36e5;let e=null;try{e=await((D=(f=l.capture)==null?void 0:f.imageDataUrl)==null?void 0:D.call(f))}catch{e=null}const p=(I=(A=l.viewer)==null?void 0:A.camera)==null?void 0:I.positionCartographic,w=n=>n*180/Math.PI,g=(F=o==null?void 0:o.brief)==null?void 0:F.call(o,{format:"markdown"}),k=(((L=o==null?void 0:o.getPins)==null?void 0:L.call(o))||[]).map(n=>{var G,V;return{kind:`pinned ${n.layerKey}`,label:n.label,lat:((G=n.record)==null?void 0:G.lat)??null,lon:((V=n.record)==null?void 0:V.lon)??null,note:n.record?"":"not in current data"}}),h=(C=o==null?void 0:o.getLastTracked)==null?void 0:C.call(o);h&&k.unshift({kind:`tracked ${h.layerKey}`,label:h.label,lat:((M=h.record)==null?void 0:M.lat)??null,lon:((N=h.record)==null?void 0:N.lon)??null,note:""});for(const n of((O=($=(E=l.shepherd)==null?void 0:E.overlay)==null?void 0:$.pinsList)==null?void 0:O.call($))||[])k.push({kind:"analyst pin",label:n.label,lat:n.lat,lon:n.lon});const W=H(((U=(x=l.dataManager)==null?void 0:x.getAll)==null?void 0:U.call(x))||[]).filter(n=>n.enabled);return{html:Y({title:t,marking:s,at:m,preparedBy:c,period:`${new Date(b).toISOString().slice(0,16)}Z – ${new Date(m).toISOString().slice(0,16)}Z`,mission:((T=(P=o==null?void 0:o.getMission)==null?void 0:P.call(o))==null?void 0:T.text)||"",bluf:i||(g==null?void 0:g.headline)||"",assessment:r,situation:(g==null?void 0:g.spoken)||"",mapImage:e,mapCaption:p?`View centre ${w(p.latitude).toFixed(4)}, ${w(p.longitude).toFixed(4)} · camera ${Math.round(p.height).toLocaleString("en-US")} m · ${new Date(m).toISOString().slice(0,19)}Z`:"",findings:((R=o==null?void 0:o.listFindings)==null?void 0:R.call(o))||[],watch:((j=o==null?void 0:o.triage)==null?void 0:j.call(o,{limit:12}))||[],contacts:k,events:(((B=o==null?void 0:o.watchLog)==null?void 0:B.call(o,{since:b,limit:200}))||[]).slice().reverse(),actions:(((Z=(v=(z=l.shepherd)==null?void 0:z.agent)==null?void 0:v.actionLog)==null?void 0:Z.call(v))||[]).filter(n=>n.at>=b),sources:W,attributions:["Imagery © Esri and contributors","NASA GIBS / FIRMS","OpenStreetMap contributors (ODbL)","TeleGeography","VAT-Spy","world-countries (ODbL)"]}),name:`adam-product-${new Date(m).toISOString().slice(0,16).replace(/[:T]/g,"")}.html`}}async function tt(t,i=document){const{html:r,name:s}=await J(t),c=URL.createObjectURL(new Blob([r],{type:"text/html"})),d=i.createElement("a");return d.href=c,d.download=s,i.body.append(d),d.click(),d.remove(),setTimeout(()=>URL.revokeObjectURL(c),15e3),{ok:!0,file:s,bytes:r.length}}export{J as assembleProduct,tt as downloadProduct};
