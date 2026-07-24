#!/usr/bin/env node
/**
 * Solo lectura: catálogo delivery Pau (DISARMINK) vs Excel local.
 * NO escribe en prod. Opcionalmente corrige el Excel local con --fix-excel.
 *
 * node scripts/audit-pau-excel-vs-catalog.mjs
 * node scripts/audit-pau-excel-vs-catalog.mjs --fix-excel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const EXCEL_PATH = 'C:/Users/Urieel/Desktop/catalogo_pizzeria_burger_completo_corregido.xlsx';
const FIX_EXCEL = process.argv.includes('--fix-excel');

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseIng(raw) {
  return String(raw || '')
    .split(/[,;\n]/)
    .map((s) => fold(s))
    .filter(Boolean)
    .sort();
}

function ingEqual(a, b) {
  const A = parseIng(a);
  const B = parseIng(b);
  if (A.length !== B.length) return false;
  return A.every((x, i) => x === B[i]);
}

function priceClose(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return true;
  return Math.abs(na - nb) < 0.051;
}

function readExcel() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const rows = XLSX.utils
    .sheet_to_json(wb.Sheets.catalogo, { defval: '' })
    .filter((r) => String(r.nombre || '').trim());
  return { wb, rows };
}

function fetchProdCatalog() {
  const values = loadLocalValues();
  if (!values) throw new Error(`No existe ${LOCAL_VALUES_PATH}`);
  const user = values.DEPLOY_USER || values.SSH_USER;
  const host = values.DEPLOY_HOST || values.VPS_IP;
  const identity = values.SSH_IDENTITY_FILE?.trim();

  const remoteJs = `
const COUCH='http://127.0.0.1:5984';
const user=process.env.COUCHDB_USER||'vertialadmin';
const pass=process.env.COUCHDB_PASSWORD;
if(!pass){console.error('Falta COUCHDB_PASSWORD');process.exit(1)}
const AUTH='Basic '+Buffer.from(user+':'+pass).toString('base64');
const BIZ='${DISARMINK}';
(async()=>{
  const res=await fetch(COUCH+'/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000',{headers:{Authorization:AUTH}});
  const data=await res.json();
  const docs=(data.rows||[]).map(r=>r.doc).filter(Boolean);
  const items=docs.filter(d=>{
    const id=String(d.business_id||d.businessId||'').replace(/^business:/,'').trim();
    if(id!==BIZ) return false;
    if(d.deletedAt) return false;
    if(d.active===false) return false;
    if(d.isStockItem===true) return false;
    const mod=d.module||'catalog';
    if(mod!=='catalog') return false;
    const t=d.itemType||'product';
    if(t!=='product' && t!=='combo') return false;
    return Boolean(d.name);
  }).map(d=>{
    let ing=d.customFields?.ingredients ?? d.ingredients ?? '';
    if(Array.isArray(ing)) {
      ing=ing.map(x=>typeof x==='object'?(x.name||''):String(x||'')).filter(Boolean).join(', ');
    }
    return {
      id:d._id,
      name:String(d.name||'').trim(),
      category:String(d.category||'').trim(),
      price: d.unitPrice ?? d.price ?? d.salePrice ?? d.customFields?.price ?? null,
      ingredients:String(ing||'').trim(),
      itemType:d.itemType||'product',
      linea:String(d.linea||d.line||'').trim(),
    };
  });
  console.log(JSON.stringify({biz:BIZ,count:items.length,items}));
})().catch(e=>{console.error(e);process.exit(1)});
`;

  const b64 = Buffer.from(remoteJs, 'utf8').toString('base64');
  const args = ['-o', 'ConnectTimeout=25', '-o', 'ServerAliveInterval=5'];
  if (identity) args.push('-i', identity);
  args.push(`${user}@${host}`, `echo ${b64} | base64 -d > /tmp/pau_cat.js && node /tmp/pau_cat.js`);
  const r = spawnSync('ssh', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'SSH falló');
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

function matchExcel(prod, excelRows) {
  const pn = fold(prod.name);
  const candidates = excelRows
    .map((r, idx) => ({ r, idx, n: fold(r.nombre) }))
    .filter((x) => x.n);

  // 1) exact
  let hit = candidates.find((x) => x.n === pn);
  if (hit) return hit.r;

  // 2) strip pizza prefix both sides
  const strip = (s) => s.replace(/^pizza /, '');
  hit = candidates.find((x) => strip(x.n) === strip(pn));
  if (hit) return hit.r;

  // 3) aliases
  const aliases = {
    'dulce roquefort': ['ai due', 'al dulce roquefort'],
    apericina: ['apericena', 'apreciena'],
    apericena: ['apericina', 'apreciena'],
    'pizza 3 ingredientes': ['modomio'],
    'al pesto': ['al pesto'],
  };
  for (const [k, list] of Object.entries(aliases)) {
    if (pn === k || list.includes(pn)) {
      hit = candidates.find((x) => x.n === k || list.includes(x.n));
      if (hit) return hit.r;
    }
  }

  return null;
}

function main() {
  console.log('Fuente de verdad: catálogo PROD Pau delivery (DISARMINK)');
  console.log('Excel local:', EXCEL_PATH);
  console.log('Cuenta Pau: NO se modifica\n');

  const prod = fetchProdCatalog();
  const { wb, rows: excelRows } = readExcel();

  console.log(`Prod carta (activos, no stock): ${prod.count}`);
  console.log(`Excel filas con nombre: ${excelRows.length}\n`);

  const ok = [];
  const nameOnly = []; // name matches but price/ing differ
  const missingInExcel = [];
  const excelOnly = [];

  const matchedExcelIdx = new Set();

  for (const p of prod.items) {
    const hit = matchExcel(p, excelRows);
    if (!hit) {
      missingInExcel.push(p);
      continue;
    }
    matchedExcelIdx.add(excelRows.indexOf(hit));
    const issues = [];
    if (!priceClose(hit.precio, p.price)) {
      issues.push(`precio excel=${hit.precio} prod=${p.price}`);
    }
    const excelIng = String(hit.ingredientes || '').trim();
    if (!ingEqual(excelIng, p.ingredients)) {
      if (!excelIng && p.ingredients) issues.push('excel SIN ingredientes / prod SÍ');
      else if (excelIng && !p.ingredients) issues.push('excel CON ingredientes / prod VACÍO');
      else issues.push('ingredientes distintos');
    }
    if (issues.length === 0) ok.push({ prod: p, excel: hit });
    else nameOnly.push({ prod: p, excel: hit, issues, excelIng, prodIng: p.ingredients });
  }

  excelRows.forEach((r, i) => {
    if (matchedExcelIdx.has(i)) return;
    // ignore empty template slots
    if (!String(r.nombre || '').trim()) return;
    excelOnly.push(r);
  });

  console.log('=== CUADRA (nombre + precio + ingredientes) ===');
  console.log(ok.length);
  for (const x of ok.slice(0, 15)) {
    console.log(`  ✓ ${x.prod.name}`);
  }
  if (ok.length > 15) console.log(`  … +${ok.length - 15} más`);

  console.log('\n=== EN PROD, FALTA O NO CASA EN EXCEL (nombre) ===');
  console.log(missingInExcel.length);
  for (const p of missingInExcel) {
    console.log(`  ✗ ${p.name} | ${p.category} | ${p.price ?? '?'}€ | ing="${p.ingredients || 'VACÍO'}"`);
  }

  console.log('\n=== MISMO NOMBRE PERO DISTINTO (precio/ingredientes) ===');
  console.log(nameOnly.length);
  for (const x of nameOnly) {
    console.log(`  ~ ${x.prod.name}`);
    console.log(`      issues: ${x.issues.join('; ')}`);
    console.log(`      PROD : ${x.prodIng || '(vacío)'}`);
    console.log(`      EXCEL: ${x.excelIng || '(vacío)'}`);
  }

  console.log('\n=== EN EXCEL Y NO EN PROD (o no matchea) ===');
  console.log(excelOnly.length);
  for (const r of excelOnly) {
    console.log(`  ? ${r.nombre} | ${r.categoria} | ${r.linea} | ${r.precio} | "${String(r.ingredientes || '').slice(0, 60)}"`);
  }

  // Focus pizza/combo for clarity
  const pizzaIssues = nameOnly.filter((x) => {
    const blob = `${x.prod.category} ${x.prod.name}`.toLowerCase();
    return /pizza|calzone|especialidad|premium|combo|italiani/.test(blob);
  });
  const pizzaMissing = missingInExcel.filter((p) =>
    /pizza|calzone|especialidad|premium|combo|italiani/.test(`${p.category} ${p.name}`.toLowerCase()),
  );

  console.log('\n=== RESUMEN PIZZA/COMBO ===');
  console.log('Prod pizza-like issues (ing/precio):', pizzaIssues.length);
  console.log('Prod pizza-like ausentes en Excel:', pizzaMissing.length);

  if (FIX_EXCEL) {
    // Align Excel ingredients+price to PROD for matched rows only (do not delete excel-only rows)
    let changed = 0;
    for (const x of nameOnly) {
      const r = x.excel;
      const before = `${r.precio}|${r.ingredientes}`;
      if (x.prod.price != null && Number.isFinite(Number(x.prod.price))) r.precio = Number(x.prod.price);
      r.ingredientes = x.prod.ingredients || '';
      const after = `${r.precio}|${r.ingredientes}`;
      if (before !== after) changed++;
    }
    // Add missing prod items to excel end
    let added = 0;
    for (const p of missingInExcel) {
      excelRows.push({
        nombre: p.name,
        codigo: '',
        categoria: p.category || '',
        linea: p.linea || (String(p.category || '').toLowerCase().includes('burger') ? 'burger' : 'pizza'),
        precio: p.price ?? '',
        ingredientes: p.ingredients || '',
        descripcion: '',
      });
      added++;
    }
    // Rebuild sheet keeping template padding to ~5000? Keep only filled + new
    const outRows = excelRows;
    const sheet = XLSX.utils.json_to_sheet(outRows);
    wb.Sheets.catalogo = sheet;
    const outPath = EXCEL_PATH.replace(/\.xlsx$/i, '_alineado_prod.xlsx');
    XLSX.writeFile(wb, outPath);
    console.log(`\n[fix-excel] Escrito ${outPath}`);
    console.log(`[fix-excel] Filas actualizadas (precio/ing): ${changed}; añadidas desde prod: ${added}`);
    console.log('[fix-excel] Original NO sobrescrito. Cuenta Pau NO tocada.');
  } else {
    console.log('\n(Sin --fix-excel: solo informe. Para generar Excel alineado: node scripts/audit-pau-excel-vs-catalog.mjs --fix-excel)');
  }
}

main();
