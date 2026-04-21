/**
 * Carga variables de entorno en orden de precedencia:
 *   1. .env.<NODE_ENV>   (sobreescribe la base)
 *   2. .env              (base compartida / fallback)
 *
 * El archivo específico de entorno tiene mayor prioridad porque dotenv
 * respeta por defecto las variables ya definidas (override: false),
 * por lo que cargamos el específico PRIMERO y el base DESPUÉS sin override.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NODE_ENV = process.env.NODE_ENV || 'development';
const envSpecific = path.join(ROOT, `.env.${NODE_ENV}`);
const envBase = path.join(ROOT, '.env');

dotenv.config({ path: envSpecific });
dotenv.config({ path: envBase });
