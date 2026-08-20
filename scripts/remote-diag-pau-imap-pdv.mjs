#!/usr/bin/env node
/**
 * Solo lectura: PDVs Pau / ownership vs configs IMAP.
 */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

const remoteCmd = `node <<'NODE'
const AUTH='Basic '+Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU='${PAU}';
async function all(db){
  const r=await fetch('http://127.0.0.1:5984/'+encodeURIComponent(db)+'/_all_docs?include_docs=true&limit=200000',{headers:{Authorization:AUTH,Accept:'application/json'}});
  const j=await r.json();
  if(j.error) throw new Error(db+': '+j.error);
  return (j.rows||[]).map(x=>x.doc).filter(Boolean);
}
const accounts=await all('accounts');
const pauAcc=accounts.find(a=>a && (a.userId===PAU || a._id===PAU || String(a.email||'').toLowerCase().includes('pau') || String(a.fullName||'').toLowerCase().includes('pau')));
const pauish=accounts.filter(a=>a&&(/pau|royo|amor/i.test(JSON.stringify(a)))).slice(0,10).map(a=>({id:a._id,userId:a.userId,email:a.email,name:a.fullName||a.name,hasCfg:Boolean(a.supplierInvoiceConfig)}));
console.log('pauish_accounts', JSON.stringify(pauish,null,2));

const delivery=await all('bbddsaas-delivery');
const pdvs=delivery.filter(d=>d&&d.type==='point_of_sale'&&!d.deletedAt);
const pauPdvs=pdvs.filter(p=>String(p.user_id||'')===PAU || /tiana|badalona|modomio|pau/i.test(String(p.name||'')));
console.log('pdvs_total', pdvs.length);
console.log('pau_related_pdvs', JSON.stringify(pauPdvs.map(p=>({
  id:p._id,name:p.name,user_id:p.user_id,business:p.business_id||p.businessId,
  active:p.active!==false, hasCfg:Boolean(p.supplierInvoiceConfig),
  cfgKeys:p.supplierInvoiceConfig?Object.keys(p.supplierInvoiceConfig):[],
  updatedAt:p.updatedAt
})),null,2));

// any cfg anywhere in delivery
const withCfg=pdvs.filter(p=>p.supplierInvoiceConfig);
console.log('pdvs_with_cfg', withCfg.length, JSON.stringify(withCfg.slice(0,10).map(p=>({id:p._id,name:p.name,user_id:p.user_id,enabled:p.supplierInvoiceConfig?.enabled,host:p.supplierInvoiceConfig?.imapHost,user:String(p.supplierInvoiceConfig?.imapUser||'').replace(/(^.).+(@.*)$/,'$1***$2')})),null,2));

// recent app logs about supplier invoice config / 404
NODE
echo '===== recent API errors supplier-invoices ====='
docker logs --tail 4000 deploy-app-1 2>&1 | grep -E 'supplier-invoice|SINV_|IMAP|factura' | tail -60
`;

spawnSync('ssh', ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd], { stdio: 'inherit' });
