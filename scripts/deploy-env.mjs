import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const LOCAL_VALUES_PATH = resolve(REPO_ROOT, 'deploy', 'local-values.env');

/**
 * Lee deploy/local-values.env (sin dependencias).
 * No imprime valores.
 */
export function loadLocalValues() {
  if (!existsSync(LOCAL_VALUES_PATH)) {
    return null;
  }
  const raw = readFileSync(LOCAL_VALUES_PATH, 'utf-8');
  const out = {};
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function mergedEnvForChild(baseEnv, values) {
  if (!values) return { ...baseEnv };
  return { ...baseEnv, ...values };
}
