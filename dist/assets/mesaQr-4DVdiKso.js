import{aW as o,aX as i}from"./index-B5kxc-qh.js";const a=i();function c(e){const t=String(e||"").trim();return t?`/m/${encodeURIComponent(t)}`:""}function p(e,t){const n=c(e);if(!n)return"";const r=String(typeof window<"u"?window.location.origin:"").replace(/\/$/,"");return r?`${r}${n}`:n}function l(e,t=240){return`https://api.qrserver.com/v1/create-qr-code/?size=${t}x${t}&data=${encodeURIComponent(e)}&margin=8&color=111111&bgcolor=FFFFFF`}async function b(e){const t=await fetch(`${a}/api/web/mesa/${encodeURIComponent(e)}`),n=await t.json().catch(()=>({}));if(!t.ok||!n.mesa)throw new Error(n.error||"QR no válido");return n.mesa}async function u(e,t){const n=await o(`${a}/api/sala/tables/${encodeURIComponent(e)}/ensure-qr`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({businessId:t})}),r=await n.json().catch(()=>({}));if(!n.ok)throw new Error(r.error||"No se pudieron generar los QR");return{tables:r.tables||[],created:Number(r.created||0)}}async function m(e,t){const n=await o(`${a}/api/sala/tables/${encodeURIComponent(e)}/${encodeURIComponent(t)}/regenerate-qr`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),r=await n.json().catch(()=>({}));if(!n.ok||!r.table)throw new Error(r.error||"No se pudo regenerar el QR");return r.table}function g(e){const t=l(e.publicUrl,280),n=String(e.storeLabel||"").trim(),r=window.open("","_blank");r&&(r.document.write(`
    <!DOCTYPE html><html><head><title>QR — ${e.tableName}</title>
    <style>
      body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
      .card { border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px 40px; text-align: center; max-width: 360px; }
      h2 { margin: 16px 0 4px; font-size: 22px; color: #111; }
      p  { margin: 0 0 12px; color: #6b7280; font-size: 14px; }
      img { width: 240px; height: 240px; }
      small { display: block; margin-top: 12px; color: #9ca3af; font-size: 10px; word-break: break-all; }
    </style></head><body>
    <div class="card">
      <img src="${t}" alt="QR" />
      <h2>${e.tableName}</h2>
      ${n?`<p>${n}</p>`:"<p>Escanea para pedir en esta mesa</p>"}
      <small>${e.publicUrl}</small>
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `),r.document.close())}const s="vertial.mesaQr.lock";function f(e){try{sessionStorage.setItem(s,JSON.stringify({token:e.token,tableId:e.tableId,tableNumber:e.tableNumber,tableName:e.tableName,businessId:e.businessId,at:Date.now()}))}catch{}}function h(){try{const e=sessionStorage.getItem(s);if(!e)return null;const t=JSON.parse(e),n=String(t.token||"").trim(),r=String(t.tableId||"").trim();return!n||!r?null:{token:n,tableId:r,tableNumber:Number(t.tableNumber)||0,tableName:String(t.tableName||"").trim()||`Mesa ${t.tableNumber||""}`,businessId:String(t.businessId||"").trim()}}catch{return null}}export{m as a,p as b,l as c,u as e,b as g,g as p,h as r,f as w};
