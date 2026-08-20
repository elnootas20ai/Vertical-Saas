#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];

const remoteCmd = `
echo '===== APP LOGS SINV / IMAP / poll ====='
docker logs --tail 3000 deploy-app-1 2>&1 | grep -E 'SINV_|IMAP|imap|supplier.invoice|polling|facturas por email|Engine idle|IDLE' | tail -150
echo '===== ENV IMAP ====='
docker exec deploy-app-1 sh -c 'env | grep -E "SUPPLIER_INVOICE|IMAP|ENGINE_IDLE" || true' 2>/dev/null
echo '===== COUNT purchase types ====='
curl -s -u vertialadmin:uriel12345 http://127.0.0.1:5984/bbddsaas-catalog/_all_docs?include_docs=true | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d); const docs=(j.rows||[]).map(r=>r.doc).filter(Boolean);
  const by={};
  for (const x of docs){ const t=x.type||'?'; by[t]=(by[t]||0)+1; }
  console.log(JSON.stringify({catalogTypes:by, purchaseLike: docs.filter(x=>/invoice|factura|purchase|albaran/i.test(String(x.type||'')+String(x._id||''))).slice(0,20).map(x=>({id:x._id,type:x.type,createdAt:x.createdAt,source:x.source}))},null,2));
});"
`.trim();

const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
