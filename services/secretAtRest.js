/**
 * Secretos en reposo (AES-256-GCM).
 * Formato: enc:v1:<iv_b64url>:<tag_b64url>:<data_b64url>
 * Clave: SECRETS_ENCRYPTION_KEY (preferido) o JWT_SECRET.
 * Valores sin prefijo se tratan como texto plano (legado) hasta el próximo guardado.
 */
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const IMAP_MASK = '••••••••';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64url(s) {
  return Buffer.from(String(s || ''), 'base64url');
}

function getKeyMaterial() {
  const raw = String(process.env.SECRETS_ENCRYPTION_KEY || process.env.JWT_SECRET || '').trim();
  if (!raw || raw.length < 16) {
    throw new Error(
      'Falta SECRETS_ENCRYPTION_KEY (o JWT_SECRET ≥ 16 chars) para cifrar secretos IMAP.',
    );
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function isEncryptedSecret(value) {
  return String(value || '').startsWith(PREFIX);
}

export function encryptSecret(plaintext) {
  const text = String(plaintext ?? '');
  if (!text) return '';
  if (isEncryptedSecret(text)) return text;
  const key = getKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${b64url(iv)}:${b64url(tag)}:${b64url(enc)}`;
}

export function decryptSecret(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (!isEncryptedSecret(raw)) return raw;
  const parts = raw.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Secreto cifrado con formato inválido');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = getKeyMaterial();
  const iv = fromB64url(ivB64);
  const tag = fromB64url(tagB64);
  const data = fromB64url(dataB64);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Guarda IMAP: cifra texto plano; vacío/máscara sin tocar; no doble-cifra. */
export function sealImapPassword(value) {
  const v = String(value ?? '').replace(/\s+/g, '').trim();
  if (!v || v === IMAP_MASK) return v;
  if (isEncryptedSecret(v)) return v;
  return encryptSecret(v);
}

/** Uso IMAP: descifra si hace falta; legado en claro pasa igual. */
export function revealImapPassword(value) {
  const v = String(value ?? '').trim();
  if (!v || v === IMAP_MASK) return '';
  try {
    return decryptSecret(v).replace(/\s+/g, '').trim();
  } catch {
    return '';
  }
}

export function hasImapPasswordStored(value) {
  const v = String(value ?? '').trim();
  return Boolean(v && v !== IMAP_MASK);
}
