/**
 * Secretos JWT centralizados.
 * Sin JWT_SECRET válido el proceso no arranca (evita el fallback hardcodeado).
 */
import './env.js';

const DEV_PLACEHOLDER = 'vertial-dev-secret-change-in-production';

function readSecret(name) {
  return String(process.env[name] || '').trim();
}

const rawJwt = readSecret('JWT_SECRET');
const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const isProd = nodeEnv === 'production';

if (!rawJwt || rawJwt.length < 16) {
  console.error(
    '[config] Falta JWT_SECRET (≥16 caracteres). Define JWT_SECRET en .env o .env.<NODE_ENV> y reinicia.',
  );
  process.exit(1);
}

if (rawJwt === DEV_PLACEHOLDER) {
  if (isProd) {
    console.error(
      '[config] JWT_SECRET no puede ser el valor de desarrollo en producción. Cambia JWT_SECRET y reinicia.',
    );
    process.exit(1);
  }
  console.warn(
    '[config] JWT_SECRET es el placeholder de desarrollo — solo válido fuera de producción.',
  );
}

export const JWT_SECRET = rawJwt;

const rawRefresh = readSecret('JWT_REFRESH_SECRET');
export const JWT_REFRESH_SECRET = rawRefresh.length >= 16 ? rawRefresh : `${JWT_SECRET}_refresh`;

if (isProd && !rawRefresh) {
  console.warn(
    '[config] JWT_REFRESH_SECRET no definido; se deriva de JWT_SECRET. Recomendado: definir uno propio.',
  );
}
