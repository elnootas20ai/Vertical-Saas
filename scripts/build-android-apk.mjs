#!/usr/bin/env node
/**
 * Build APK Android (Capacitor) — solo carpeta android/, no toca iOS.
 *
 * Uso:
 *   node scripts/build-android-apk.mjs           → debug (prueba en móvil)
 *   node scripts/build-android-apk.mjs --release → Play Store (requiere keystore.properties)
 *
 * Requisitos: Android SDK, JDK (Android Studio JBR vale), npm deps instaladas.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const release = process.argv.includes('--release');
const gradleTask = release ? 'assembleRelease' : 'assembleDebug';
const apkSubdir = release ? 'release' : 'debug';
const apkName = release ? 'app-release.apk' : 'app-debug.apk';

function log(msg) {
  console.log(`[android-apk] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[android-apk] ERROR: ${msg}`);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  log(`${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    stdio: 'inherit',
    shell: platform() === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    fail(`comando falló (${cmd})`, result.status ?? 1);
  }
}

function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', platform() === 'win32' ? 'java.exe' : 'java'))) {
    return process.env.JAVA_HOME;
  }
  const candidates = platform() === 'win32'
    ? [
        join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
        join(process.env.LOCALAPPDATA || '', 'Programs', 'Android', 'Android Studio', 'jbr'),
      ]
    : [
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
        join(homedir(), 'android-studio', 'jbr'),
      ];
  for (const dir of candidates) {
    const javaBin = join(dir, 'bin', platform() === 'win32' ? 'java.exe' : 'java');
    if (existsSync(javaBin)) return dir;
  }
  return null;
}

function findAndroidSdk() {
  const fromEnv = String(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '').trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = join(process.env.LOCALAPPDATA || homedir(), 'Android', 'Sdk');
  if (existsSync(local)) return local;
  const mac = join(homedir(), 'Library', 'Android', 'sdk');
  if (existsSync(mac)) return mac;
  const linux = join(homedir(), 'Android', 'Sdk');
  if (existsSync(linux)) return linux;
  return null;
}

function ensureLocalProperties(sdkPath) {
  const path = join(androidDir, 'local.properties');
  const sdkLine = `sdk.dir=${sdkPath.replace(/\\/g, '\\\\')}`;
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8');
    if (raw.includes('sdk.dir=')) return;
  }
  writeFileSync(path, `${sdkLine}\n`, 'utf8');
  log(`creado ${path}`);
}

function main() {
  const javaHome = findJavaHome();
  if (!javaHome) {
    fail('No se encontró JDK. Instala Android Studio o define JAVA_HOME.');
  }
  const sdkPath = findAndroidSdk();
  if (!sdkPath) {
    fail('No se encontró Android SDK. Instala Android Studio o define ANDROID_HOME.');
  }

  ensureLocalProperties(sdkPath);

  if (release) {
    const keystoreProps = join(androidDir, 'keystore.properties');
    if (!existsSync(keystoreProps)) {
      fail(
        'Release requiere android/keystore.properties. Genera uno con: npm run cap:android:keystore',
      );
    }
  }

  const gradleEnv = {
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkPath,
    ANDROID_SDK_ROOT: sdkPath,
  };

  log(`modo: ${release ? 'release (Play Store)' : 'debug (prueba móvil)'}`);
  const apiOrigin = process.env.VITE_NATIVE_API_ORIGIN || 'https://vertialapp.com';
  log(`API nativa: ${apiOrigin}`);

  const googleServices = join(androidDir, 'app', 'google-services.json');
  const fcmEnabled =
    String(process.env.VITE_ANDROID_FCM_ENABLED || '').trim() === 'true'
    || existsSync(googleServices);
  if (fcmEnabled && !existsSync(googleServices)) {
    fail('VITE_ANDROID_FCM_ENABLED=true pero falta android/app/google-services.json');
  }
  if (fcmEnabled) {
    log('FCM Android: ON (google-services.json + VITE_ANDROID_FCM_ENABLED)');
  } else {
    log('FCM Android: OFF (sin google-services.json — push nativo desactivado en APK)');
  }

  const buildEnv = {
    ...gradleEnv,
    VITE_NATIVE_API_ORIGIN: apiOrigin,
    VITE_ANDROID_FCM_ENABLED: fcmEnabled ? 'true' : '',
  };

  run('npm', ['run', 'build'], { env: buildEnv });
  run('npx', ['cap', 'sync', 'android'], { env: buildEnv });

  const gradlew = platform() === 'win32' ? join(androidDir, 'gradlew.bat') : join(androidDir, 'gradlew');
  if (!existsSync(gradlew)) {
    fail(`No existe ${gradlew}. ¿Capacitor android inicializado?`);
  }

  run(gradlew, [gradleTask], { cwd: androidDir, env: gradleEnv });

  const apkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', apkSubdir, apkName);
  if (!existsSync(apkPath)) {
    fail(`APK no encontrada en ${apkPath}`);
  }

  const outDir = join(root, 'dist-android');
  mkdirSync(outDir, { recursive: true });
  const outName = release ? 'vertial-release.apk' : 'vertial.apk';
  const outPath = join(outDir, outName);
  copyFileSync(apkPath, outPath);

  log('');
  log('APK lista:');
  log(`  ${apkPath}`);
  log(`  ${outPath}`);
  log('');
  if (!release) {
    log('Instalar en móvil: copia vertial.apk al teléfono o usa adb install dist-android/vertial.apk');
  } else {
    log('Play Store: sube el AAB (bundleRelease) o esta APK según tu flujo de publicación.');
  }
}

main();
