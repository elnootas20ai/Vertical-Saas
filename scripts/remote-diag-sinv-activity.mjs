#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];

const remoteCmd = `node <<'NODE'
const AUTH='Basic '+Buffer.from('vertialadmin:uriel12345').toString('base64');
async function all(db){
  const r=await fetch('http://127.0.0.1:5984/'+encodeURIComponent(db)+'/_all_docs?include_docs=true&limit=100000',{headers:{Authorization:AUTH,Accept:'application/json'}});
  const j=await r.json();
  return (j.rows||[]).map(x=>x.doc).filter(Boolean);
}
const acts=await all('activity-logs');
const hits=acts.filter(d=>{
  const s=JSON.stringify(d||{});
  return /supplier_invoice|imap|factura.*email|correo de facturas/i.test(s);
}).slice(-30).map(d=>({
  at:d.createdAt||d.timestamp||d.time,
  type:d.type||d.actionType,
  action:d.action||d.message,
  actor:d.actorName||d.actorUserId,
  meta:d.metadata||null,
}));
console.log(JSON.stringify({activityHits:hits.length, hits},null,2));

const pdvs=(await all('bbddsaas-delivery')).filter(d=>d&&d.type==='point_of_sale'&&!d.deletedAt);
let withAnyEmailField=0;
const sample=[];
for (const p of pdvs){
  const keys=Object.keys(p).filter(k=>/mail|imap|invoice|supplier/i.test(k));
  if(keys.length){
    withAnyEmailField++;
    if(sample.length<15) sample.push({id:p._id,name:p.name,keys,cfg:p.supplierInvoiceConfig||null,updatedAt:p.updatedAt});
  }
}
console.log(JSON.stringify({pdvs:pdvs.length, withAnyEmailField, sample},null,2));
NODE`;

spawnSync('ssh', ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd], {
  stdio: 'inherit',
});
