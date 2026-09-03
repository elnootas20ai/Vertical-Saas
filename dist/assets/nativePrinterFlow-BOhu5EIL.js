const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-DZ8jURG0.js","assets/index-8LadFfuP.js","assets/index-BLJo5J82.css"])))=>i.map(i=>d[i]);
import{bg as P,r3 as b,_ as z}from"./index-8LadFfuP.js";import{r as M,a as O,i as V,n as H}from"./printerActiveScope-Bg7GyaCC.js";import{formatRemovedIngredientLabel as g,formatKitchenExtraLabel as _}from"./deliveryTicketHelpers-Bf_SOa07.js";import{t as k,w as x,b as F,c as N}from"./escposEncode-CaR-x8RZ.js";import{i as B,N as U}from"./nativePrintRouting-D48ZjDce.js";function E(){return!P()}function q(e){let t="";for(let n=0;n<e.length;n+=1)t+=String.fromCharCode(e[n]);return btoa(t)}function j(e){if(e.connectionType==="browser")return null;if(e.connectionType==="network"){const n=String(e.networkHost||"").trim();return n?{type:"network",host:n,port:Number(e.networkPort||9100)||9100}:null}const t=String(e.systemPrinterName||"").trim();return t?{type:"system",name:t}:null}function A(e){return b(e??M())}async function xe(e=1200,t){if(!E())return{ok:!1};try{const n=new AbortController,s=setTimeout(()=>n.abort(),e),a=await fetch(`${A(t)}/v1/health`,{signal:n.signal});if(clearTimeout(s),!a.ok)return{ok:!1};const r=await a.json();return{ok:!!r.ok,version:r.version}}catch{return{ok:!1}}}async function Ne(e,t,n){if(!E())return{ok:!1,error:"Comprobación vía PC solo en navegador"};const s=String(e||"").trim();if(!s)return{ok:!1,error:"Falta IP de la impresora"};const a=Number(n==null?void 0:n.port)||9100,r=Math.min(5e3,Math.max(800,Number(n==null?void 0:n.timeoutMs)||2e3));try{const p=new AbortController,m=setTimeout(()=>p.abort(),r+400),u=await fetch(`${A(t)}/v1/ping?host=${encodeURIComponent(s)}&port=${a}&timeoutMs=${r}`,{signal:p.signal});clearTimeout(m);const f=await u.json().catch(()=>({}));return!u.ok||!f.ok?{ok:!1,error:f.error||"La impresora no responde en esa IP"}:{ok:!0}}catch{return{ok:!1,error:"No se pudo comprobar la impresora. ¿Vertial Print está abierto?"}}}async function Pe(e,t,n){if(!E())return{ok:!1,error:"Impresión vía PC del mostrador no disponible en la app del móvil"};const s=j(t);if(!s)return{ok:!1,error:"Configura la impresora en el TPV (icono de impresora arriba)"};const a=Math.min(8e3,Math.max(2500,Number((n==null?void 0:n.timeoutMs)||5500)||5500));try{const r=new AbortController,p=setTimeout(()=>r.abort(),a),m=await fetch(`${A(t)}/v1/print`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({connection:s,data:q(e)}),signal:r.signal});clearTimeout(p);const u=await m.json().catch(()=>({}));return!m.ok||!u.ok?{ok:!1,error:u.error||"No se pudo imprimir via Vertial Print"}:{ok:!0}}catch(r){return{ok:!1,error:r instanceof Error&&r.name==="AbortError"?"La impresora no respondió a tiempo. Comprueba que está encendida y en la misma red.":"No se detectó el servicio de impresión. Comprueba el PC del mostrador."}}}const G=8,W=3.75;function C(e,t){const n=Math.max(0,Math.round(t*10*G));if(typeof e.addFeedUnit=="function"){let a=n;for(;a>0;){const r=Math.min(255,a);e.addFeedUnit(r),a-=r}return}const s=Math.max(1,Math.round(t*10/W));typeof e.addFeedLine=="function"?e.addFeedLine(s):e.addText(`
`.repeat(s))}function v(e){return`${Number(e||0).toFixed(2)} EUR`}function Y(e,t,n=42){const s=N(e),a=N(t),r=Math.max(1,n-s.length-a.length);return`${s}${" ".repeat(r)}${a}`.slice(0,n)}function $(e,t){const n=e===58?32:42;return t?Math.floor(n/2):n}function l(e,t,n){for(const s of F(t,n))e.addText(`${s}
`)}function T(e,t,n,s){const a=N(n),r=Math.max(8,s-a.length-1),p=F(t,r);for(let m=0;m<p.length;m+=1)m===p.length-1?l(e,Y(p[m],a,s),s):l(e,p[m],s)}function c(e,t){l(e,"-".repeat(Math.min(t,32)),t)}function o(e,t,n){typeof e.addTextSize=="function"&&e.addTextSize(t,n)}function K(e,t,n,s){const a=$(s,!1);o(e,1,2),l(e,`${t.qty}x ${t.name}`,a),o(e,1,1),x(t,{onComposition:r=>l(e,`  > ${r}`,n),onAdded:(r,p)=>l(e,`${p?"    ":"  "}+ ${r}`,n),onRemoved:(r,p)=>l(e,`${p?"    ":"  "}${g(r)}`,n),onNote:(r,p)=>l(e,`${p?"    ":"  "}NOTA: ${r}`,n)})}function J(e,t,n){const s=$(n,!1),a=$(n,!0);o(e,2,2),d(e,`${t.qty}x ${t.name}`,a),o(e,1,1),x(t,{onComposition:r=>l(e,`  > ${r}`,s),onAdded:(r,p)=>{e.addTextStyle&&e.addTextStyle(!1,!1,!0),l(e,`${p?"    ":"  "}${_(r)}`,s),e.addTextStyle&&e.addTextStyle(!1,!1,!1)},onRemoved:(r,p)=>{e.addTextStyle&&e.addTextStyle(!0,!1,!1),l(e,`${p?"    ":"  "}${g(r)}`,s),e.addTextStyle&&e.addTextStyle(!1,!1,!1)},onNote:(r,p)=>l(e,`${p?"    ":"  "}NOTA: ${r}`,s)})}function d(e,t,n){e.addTextStyle&&e.addTextStyle(!1,!1,!0),l(e,t,n),e.addTextStyle&&e.addTextStyle(!1,!1,!1)}function I(e,t,n,s){e.addTextStyle&&e.addTextStyle(!1,!1,!0),T(e,t,n,s),e.addTextStyle&&e.addTextStyle(!1,!1,!1)}function Q(e,t,n=80,s){const a=$(n,!1),r=$(n,!1),p=$(n,!0),m=s==null?void 0:s.customerTailFeedCm;if(t.variant==="kitchen"){e.addTextAlign("center"),o(e,2,2),d(e,t.title,p),o(e,1,1),l(e,`${t.ticketNo} - ${t.dateLabel}`,a),c(e,a),e.addTextAlign("left"),o(e,1,2),d(e,`Pedido: #${t.orderNumber}`,r),o(e,1,1),t.deliveryTypeLabel&&(o(e,2,2),d(e,t.deliveryTypeLabel,p),o(e,1,1)),t.customerPhone&&(o(e,1,2),d(e,`Tel: ${t.customerPhone}`,r),o(e,1,1)),t.paymentLabel&&(o(e,1,2),d(e,`Pago: ${t.paymentLabel}`,r),o(e,1,1)),c(e,a);for(const f of t.lines)J(e,f,n);t.orderNotes&&(c(e,a),o(e,1,2),d(e,`NOTA: ${t.orderNotes}`,r),o(e,1,1)),(t.customerName||t.customerAddress)&&(c(e,a),e.addTextAlign("left"),t.customerName&&(o(e,2,2),d(e,t.customerName,p),o(e,1,1)),t.customerAddress&&(o(e,1,2),d(e,t.customerAddress,r),o(e,1,1))),e.addTextAlign("center"),l(e,t.footer,a),C(e,k(t.variant,m)),typeof e.addCut=="function"&&e.addCut(e.CUT_NO_FEED??e.CUT_FEED??1);return}e.addTextAlign("center"),o(e,1,2),l(e,t.issuer,r),o(e,1,1),t.taxId&&l(e,`NIF/CIF: ${t.taxId}`,a),t.addressLine&&l(e,t.addressLine,a),t.phone&&l(e,`Tel: ${t.phone}`,a),c(e,a),o(e,2,2),d(e,t.title,p),o(e,1,1),l(e,`${t.ticketNo} - ${t.dateLabel}`,a),c(e,a),e.addTextAlign("left"),t.salesPointName&&l(e,`Tienda: ${t.salesPointName}`,a),o(e,1,2),l(e,`Pedido: #${t.orderNumber}`,r),o(e,1,1);const u=()=>{t.customerAddress&&(o(e,1,2),t.emphasizeCustomerAddress?d(e,`Dir: ${t.customerAddress}`,r):l(e,`Dir: ${t.customerAddress}`,r),o(e,1,1))};if(t.variant==="delivery"){t.deliveryTypeLabel&&(o(e,1,2),l(e,t.deliveryTypeLabel,r),o(e,1,1)),o(e,2,2),l(e,t.customerName,p),o(e,1,1),t.customerPhone&&(o(e,1,2),l(e,`Tel: ${t.customerPhone}`,r),o(e,1,1)),u(),c(e,a);for(const f of t.lines)K(e,f,a,n);c(e,a),o(e,2,2),I(e,"TOTAL",v(t.total),p),o(e,1,1),t.paymentLabel&&(o(e,1,2),l(e,`Metodo: ${t.paymentLabel}`,r),o(e,1,1)),t.paymentStatusLabel&&l(e,t.paymentStatusLabel,a),t.orderNotes&&(o(e,1,2),l(e,`NOTA: ${t.orderNotes}`,r),o(e,1,1))}else{o(e,1,2),l(e,`Cliente: ${t.customerName}`,r),o(e,1,1),t.customerPhone&&(o(e,1,2),l(e,`Tel: ${t.customerPhone}`,r),o(e,1,1)),u(),t.deliveryTypeLabel&&l(e,t.deliveryTypeLabel,a),t.cashierName&&l(e,`Atendido: ${t.cashierName}`,a),c(e,a);for(const f of t.lines)o(e,1,2),T(e,`${f.qty}x ${f.name}`,v(f.total),r),o(e,1,1),x(f,{onComposition:h=>l(e,`  > ${h}`,a),onAdded:(h,y)=>l(e,`${y?"    ":"  "}+ ${h}`,a),onRemoved:(h,y)=>l(e,`${y?"    ":"  "}${g(h)}`,a),onNote:(h,y)=>l(e,`${y?"    ":"  "}NOTA: ${h}`,a)});c(e,a),T(e,"Base imponible",v(t.base),a),T(e,`IVA ${t.vatRate}%`,v(t.vat),a),c(e,a),o(e,2,2),I(e,t.isRefund?"TOTAL DEV.":"TOTAL",`${t.isRefund?"-":""}${v(t.total)}`,p),o(e,1,1),c(e,a),t.paymentLabel&&(o(e,1,2),l(e,`Metodo: ${t.paymentLabel}`,r),o(e,1,1)),t.paymentStatusLabel&&l(e,t.paymentStatusLabel,a),t.refundReason&&l(e,`Motivo: ${t.refundReason}`,a)}e.addTextAlign("center"),l(e,t.footer,a),t.variant==="customer"&&l(e,"Gracias por su visita",a),C(e,k(t.variant,m)),typeof e.addCut=="function"&&e.addCut(e.CUT_NO_FEED??e.CUT_FEED??1)}function X(e){const t=String(e||"").trim();return t?`http://${t}`:""}function Z(){if(typeof navigator>"u")return!1;const e=navigator.userAgent||"";return/iPad|iPhone|iPod/.test(e)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1}function R(e,t){const n=String(t||"").trim(),s=String(e||"").trim(),a=s.toLowerCase();return n&&ee(n),n&&X(n),a.includes("error de red")||a.includes("sin conexión")||a.includes("sin conexion")||a.includes("sin respuesta")||a.includes("network_error")||a.includes("connection_error")||a.includes("failed to fetch")||a.includes("websocket")||a.includes("socket")?Z()?["La Epson está bien configurada, pero Safari no deja que Vertial (internet) hable con la red local.","Solución en el local: un PC encendido con Vertial Print, misma WiFi; en el TPV pon la IP de ese PC en «PC del mostrador».","Alternativa: exporta el certificado SSL de la impresora, instálalo en el iPad (Ajustes → Confianza de certificados)."].join(" "):["No se llega a la impresora. ¿Estás en la misma WiFi que la Epson (192.168.1.x)?","Desde casa no funciona: la IP 192.168.1.200 solo existe dentro del local.","En el PC del local: abre Vertial Print, recarga Vertial y prueba otra vez."].join(" "):a.includes("timeout")||a.includes("tard")?"La impresora no respondió a tiempo. Comprueba que está encendida y en la misma WiFi.":a.includes("cover")||a.includes("tapa")?"Cierra la tapa de la impresora e inténtalo de nuevo.":a.includes("paper")||a.includes("papel")?"No hay papel en la impresora.":s.length>160||/\bnpm\s+run\b/i.test(s)||/TypeError|ReferenceError|SyntaxError/i.test(s)?"No se pudo imprimir en la impresora Epson.":s||"No se pudo imprimir en la impresora Epson."}function ee(e){const t=String(e||"").trim();return t?`https://${t}:8043`:""}function te(){return typeof window<"u"&&window.location.protocol==="https:"?[{useHttps:!0,printerPort:8043}]:[{useHttps:!0,printerPort:8043},{useHttps:!1,printerPort:8008}]}function ne(e,t){return{printerIP:e,printerPort:t.printerPort,useHttps:t.useHttps,timeout:35e3,deviceId:"local_printer"}}function ae(e){return P()||!O()||e.connectionType!=="network"?!1:V(e.networkHost)}async function se(){return z(()=>import("./index-DZ8jURG0.js"),__vite__mapDeps([0,1,2]))}async function re(e){const t=`https://${e}:8043/`;try{await fetch(t,{method:"GET",mode:"no-cors",cache:"no-store"})}catch{}await new Promise(n=>setTimeout(n,400))}async function oe(e,t){const{EposPrintService:n}=await se();let s="No se pudo conectar con la impresora Epson",a="";await re(e);for(const r of te())try{const p=new n(ne(e,r)),m=await t(p);if(m.success)return{ok:!0};a=String(m.message||m.code||"").trim(),s=R(a,e)}catch(p){a=p instanceof Error?p.message:s,s=R(a,e)}return a&&!s.includes(a)&&(s=`${s} (${a})`),{ok:!1,error:s}}async function ie(e,t){if(!ae(t))return{ok:!1,error:"Configura la IP de la impresora WiFi"};const n=String(t.networkHost||"").trim();return oe(n,s=>s.printWithBuilder(a=>{Q(a,e,t.paperWidthMm,{customerTailFeedCm:t.ticketBottomFeedCm})}))}async function Ee(e){const n={variant:"customer",title:"PRUEBA",ticketNo:"TEST-001",dateLabel:new Date().toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}),issuer:"Vertial",taxId:"",addressLine:"",phone:"",salesPointName:"",orderNumber:"0000",customerName:"Impresion de prueba",customerPhone:"",customerAddress:"",emphasizeCustomerAddress:!1,deliveryTypeLabel:"",cashierName:"",lines:[{qty:1,name:"Producto demo",total:9.99}],base:9.08,vat:.91,vatRate:10,total:9.99,paymentLabel:"Efectivo",paymentStatusLabel:"Cobrado",refundReason:"",orderNotes:"",footer:"Si ves esto, la impresora funciona",isRefund:!1};return ie(n,e)}function i(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function L(e,t){if(e==="kitchen")return"6cm";const n=Number(t);return Number.isFinite(n)?`${Math.min(18,Math.max(4,Math.round(n)))}cm`:"8cm"}const S=`
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:300px;margin:0 auto;padding:5px 12px 24px;font-size:14px;color:#000;line-height:1.4}
.c{text-align:center}.hr{border-top:1px dashed #333;margin:10px 0}
table{width:100%;border-collapse:collapse}.b{font-weight:bold}
.t td{font-size:16px;font-weight:bold;padding-top:6px}
.f{margin-top:20px;font-size:12px;text-align:center;color:#666;line-height:1.4}
.small{font-size:12px;color:#444}
.note{color:#b45309;font-size:14px;font-weight:900}
.add{color:#047857;font-size:15px;font-weight:900;letter-spacing:0.02em}
.rem{color:#b91c1c;font-size:15px;font-weight:900;letter-spacing:0.02em;text-decoration:line-through}
.item{padding:8px 0;border-bottom:1px dotted #ccc}
.item:last-child{border-bottom:none}
.big{font-size:16px;font-weight:bold}
.kitchen-item{font-size:22px;font-weight:900}
.comp{font-size:17px;font-weight:900;letter-spacing:0.02em}
.kitchen-comp{font-size:18px;font-weight:900;letter-spacing:0.03em}
.order-note{background:#fef3c7;border:1px solid #f59e0b;padding:6px 8px;margin-top:8px;font-weight:bold;color:#92400e}
@media print{body{margin:0}}
`;function w(e,t=!1){const n=[];return x(e,{onComposition:s=>{n.push(t?`<div class="kitchen-comp">&gt; ${i(s)}</div>`:`<div class="comp">&gt; ${i(s)}</div>`)},onAdded:(s,a)=>{const r=a?"padding-left:16px":"";n.push(t?`<div class="add" style="${r}">${i(_(s))}</div>`:`<div class="add" style="${r}">+ ${i(s)}</div>`)},onRemoved:(s,a)=>{const r=a?"padding-left:16px":"";n.push(`<div class="rem" style="${r}">${i(g(s))}</div>`)},onNote:(s,a)=>{const r=a?"padding-left:16px":"";n.push(`<div class="note" style="${r}">NOTA: ${i(s)}</div>`)}}),n.length>0?`<div style="margin-top:3px;padding-left:8px">${n.join("")}</div>`:""}function D(e){return`<div class="c">
  <strong style="font-size:18px">${i(e.issuer)}</strong><br/>
  ${e.taxId?`<span class="small">NIF/CIF: ${i(e.taxId)}</span><br/>`:""}
  ${e.addressLine?`<span class="small">${i(e.addressLine)}</span><br/>`:""}
  ${e.phone?`<span class="small">Tel: ${i(e.phone)}</span><br/>`:""}
</div>
<div class="hr"></div>
<div class="c">
  <strong style="font-size:22px">${i(e.title)}</strong><br/>
  <span class="small">${i(e.ticketNo)} - ${i(e.dateLabel)}</span>
</div>
<div class="hr"></div>`}function le(e,t){const n=e.lines.map(s=>{const a=w(s,!0);return`<div class="item"><span class="kitchen-item">${s.qty}x ${i(s.name)}</span>${a}</div>`}).join("");return`<!DOCTYPE html><html><head><title>Comanda ${i(e.ticketNo)}</title>
<style>${S}
body{padding-bottom:${L(e.variant,t)}}
</style></head><body>
<div class="c">
  <strong style="font-size:24px;font-weight:900">${i(e.title)}</strong><br/>
  <span class="small">${i(e.ticketNo)} - ${i(e.dateLabel)}</span>
</div>
<div class="hr"></div>
<p class="kitchen-item">Pedido: #${i(e.orderNumber)}</p>
${e.deliveryTypeLabel?`<p class="kitchen-item">${i(e.deliveryTypeLabel)}</p>`:""}
${e.customerPhone?`<p class="kitchen-item">Tel: ${i(e.customerPhone)}</p>`:""}
${e.paymentLabel?`<p class="kitchen-item">Pago: ${i(e.paymentLabel)}</p>`:""}
<div class="hr"></div>
${n}
${e.orderNotes?`<div class="order-note">NOTA PEDIDO: ${i(e.orderNotes)}</div>`:""}
${e.customerName||e.customerAddress?`<div class="hr"></div>
${e.customerName?`<p class="kitchen-item">${i(e.customerName)}</p>`:""}
${e.customerAddress?`<p class="kitchen-item">${i(e.customerAddress)}</p>`:""}`:""}
<div class="f">${i(e.footer)}</div>
</body></html>`}function pe(e,t){const n=e.lines.map(s=>{const a=w(s);return`<div class="item"><span class="b">${s.qty}x</span> ${i(s.name)}${a}</div>`}).join("");return`<!DOCTYPE html><html><head><title>Reparto ${i(e.ticketNo)}</title>
<style>${S}
body{padding-bottom:${L(e.variant,t)}}
</style></head><body>
${D(e)}
<p>Pedido: <strong>#${i(e.orderNumber)}</strong></p>
${e.deliveryTypeLabel?`<p class="b">${i(e.deliveryTypeLabel)}</p>`:""}
<div class="hr"></div>
<p class="big">${i(e.customerName)}</p>
${e.customerPhone?`<p class="big">Tel: ${i(e.customerPhone)}</p>`:""}
${e.customerAddress?`<p class="big${e.emphasizeCustomerAddress?" b":""}">Dir: ${i(e.customerAddress)}</p>`:""}
<div class="hr"></div>
${n}
<div class="hr"></div>
<table class="t"><tr><td>TOTAL</td><td style="text-align:right">${e.total.toFixed(2)}€</td></tr></table>
${e.paymentLabel?`<p class="b">Método: ${i(e.paymentLabel)}</p>`:""}
${e.paymentStatusLabel?`<p>${i(e.paymentStatusLabel)}</p>`:""}
${e.orderNotes?`<div class="order-note">NOTA PEDIDO: ${i(e.orderNotes)}</div>`:""}
<div class="f">${i(e.footer)}</div>
</body></html>`}function me(e,t){const n=e.lines.map(s=>{const a=w(s);return`<tr><td style="padding:4px 0;vertical-align:top"><span class="b">${s.qty}x</span> ${i(s.name)}${a}</td><td style="text-align:right;padding:4px 0;vertical-align:top">${s.total.toFixed(2)}€</td></tr>`}).join("");return`<!DOCTYPE html><html><head><title>${e.isRefund?"Devolución":"Ticket"} ${i(e.ticketNo)}</title>
<style>${S}
body{padding-bottom:${L(e.variant,t)}}
</style></head><body>
${D(e)}
${e.salesPointName?`<p>Tienda: ${i(e.salesPointName)}</p>`:""}
<p>Pedido: <strong>#${i(e.orderNumber)}</strong></p>
<p>Cliente: ${i(e.customerName)}</p>
${e.customerPhone?`<p>Tel: ${i(e.customerPhone)}</p>`:""}
${e.customerAddress?`<p${e.emphasizeCustomerAddress?' class="b"':""}>Dir: ${i(e.customerAddress)}</p>`:""}
${e.deliveryTypeLabel?`<p>${i(e.deliveryTypeLabel)}</p>`:""}
${e.cashierName?`<p>Atendido por: ${i(e.cashierName)}</p>`:""}
<div class="hr"></div>
<table>${n}</table>
<div class="hr"></div>
<table>
  <tr><td>Base imponible</td><td style="text-align:right">${e.base.toFixed(2)}€</td></tr>
  <tr><td>IVA ${e.vatRate}%</td><td style="text-align:right">${e.vat.toFixed(2)}€</td></tr>
</table>
<div class="hr"></div>
<table class="t"><tr><td>${e.isRefund?"TOTAL DEVUELTO":"TOTAL"}</td><td style="text-align:right">${e.isRefund?"-":""}${e.total.toFixed(2)}€</td></tr></table>
<div class="hr"></div>
${e.paymentLabel?`<p class="b">Método: ${i(e.paymentLabel)}</p>`:""}
${e.paymentStatusLabel?`<p>${i(e.paymentStatusLabel)}</p>`:""}
${e.refundReason?`<p>Motivo: ${i(e.refundReason)}</p>`:""}
<div class="f">
  ${i(e.footer)}<br/>
  Gracias por su visita
</div>
</body></html>`}function ce(e,t){return e.variant==="kitchen"?le(e,t):e.variant==="delivery"?pe(e,t):me(e,t)}function fe(e){const t=document.createElement("iframe");t.setAttribute("aria-hidden","true"),t.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden",document.body.appendChild(t);const n=t.contentWindow,s=n==null?void 0:n.document;if(!n||!s)return t.remove(),!1;let a=!1;const r=()=>{a||(a=!0,t.remove())},p=()=>{try{n.focus(),n.print()}catch{return r(),!1}return setTimeout(r,1500),!0};return s.open(),s.write(e),s.close(),setTimeout(()=>p(),250),!0}function de(e){const t=window.open("","_blank","width=360,height=720");t&&(t.document.write(e),t.document.close(),setTimeout(()=>{try{t.print()}catch{}},300))}function ue(e,t,n){const s=ce(t,n);fe(s)||de(s)}function Ae(e=80){const n={variant:"customer",title:"PRUEBA",ticketNo:"TEST-001",dateLabel:new Date().toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}),issuer:"Vertial TPV",taxId:"",addressLine:"",phone:"",salesPointName:"",orderNumber:"0000",customerName:"Impresion de prueba",customerPhone:"",customerAddress:"",emphasizeCustomerAddress:!1,deliveryTypeLabel:"",cashierName:"",lines:[{qty:1,name:"Producto demo",total:9.99}],base:8.26,vat:1.73,vatRate:10,total:9.99,paymentLabel:"Efectivo",paymentStatusLabel:"Cobrado",refundReason:"",orderNotes:"",footer:"Si ves esto, la impresora funciona",isRefund:!1};ue({},n)}const Le="Ajustes → Empresa → Impresora",he=U,Se="No se pudo imprimir. Comprueba que la impresora está encendida, en la misma WiFi, y que «Red local» está activado en Ajustes → Vertial.";function we(e){const t=M(),n=e?H({...t,...e}):t;return P()?B(n)?{ready:!0,config:n}:{ready:!1,config:n,error:he}:{ready:!0,config:n}}export{Le as I,Se as N,Pe as a,ie as b,Ee as c,Ae as d,Ne as e,xe as f,ue as p,we as r,ae as s};
