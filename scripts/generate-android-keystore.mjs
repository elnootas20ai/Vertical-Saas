// Genera el keystore de firma release de Android (PKCS12) sin necesidad de JDK/keytool.
// Uso: node scripts/generate-android-keystore.mjs
// Salida: android/vertial-release.keystore + android/keystore.properties (ambos fuera de git).
import forge from 'node-forge';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keystorePath = join(root, 'android', 'vertial-release.keystore');
const propsPath = join(root, 'android', 'keystore.properties');

if (existsSync(keystorePath)) {
  console.error(`ABORTADO: ya existe ${keystorePath}. No se sobrescribe una clave de firma.`);
  process.exit(1);
}

const alias = 'vertial';
// Contraseña alfanumérica (sin símbolos que den problemas en properties/CLI)
const password = randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 28);

console.log('Generando clave RSA 4096 (puede tardar unos segundos)...');
const keys = forge.pki.rsa.generateKeyPair({ bits: 4096 });

const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + randomBytes(15).toString('hex');
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
// 40 años: Play exige validez más allá de 2033-10-22
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 40);

const attrs = [
  { name: 'commonName', value: 'Vertial' },
  { name: 'organizationName', value: 'Vertial' },
  { name: 'countryName', value: 'ES' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
  algorithm: '3des',
  friendlyName: alias,
});
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
writeFileSync(keystorePath, Buffer.from(p12Der, 'binary'));

const props = [
  'storeFile=../vertial-release.keystore',
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n');
writeFileSync(propsPath, props);

console.log('Keystore generado correctamente:');
console.log(`  ${keystorePath}`);
console.log(`  ${propsPath}`);
console.log('');
console.log(`  Alias:      ${alias}`);
console.log(`  Password:   ${password}`);
console.log('');
console.log('GUARDA ESTA CONTRASEÑA Y EL KEYSTORE EN UN LUGAR SEGURO (gestor de contraseñas + copia de seguridad).');
console.log('Si los pierdes, no podrás publicar actualizaciones de la app con la misma firma.');
