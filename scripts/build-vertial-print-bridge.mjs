#!/usr/bin/env node
/**
 * Empaqueta Vertial Print como .exe para clientes (sin Node ni repo del proyecto).
 * Salida: public/downloads/VertialPrint.exe (se publica con el frontend).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'downloads');
const entry = join(root, 'scripts', 'vertial-print-bridge.mjs');
const outFile = join(outDir, 'VertialPrint.exe');

mkdirSync(outDir, { recursive: true });

const cmd = [
  'npx',
  '-y',
  '@yao-pkg/pkg',
  entry,
  '--targets',
  'node20-win-x64',
  '--output',
  outFile,
  '--compress',
  'GZip',
].join(' ');

console.log('[build:print-bridge]', cmd);
execSync(cmd, { cwd: root, stdio: 'inherit' });
console.log(`[build:print-bridge] Listo: ${outFile}`);
