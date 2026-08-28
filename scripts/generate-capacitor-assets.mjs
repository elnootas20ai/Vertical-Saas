/**
 * Genera PNG fuente para @capacitor/assets a partir de src/assets/logo.svg (V Vertial).
 *
 * Salida en resources/:
 *   icon.png              — icono iOS / fallback (fondo + V)
 *   icon-foreground.png   — solo la V (transparente) para adaptive icon Android
 *   icon-background.png   — fondo sólido #030213
 *   splash.png            — pantalla de arranque
 */
import sharp from 'sharp';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logoSvg = path.join(root, 'src/assets/logo.svg');
const resourcesDir = path.join(root, 'resources');

/** Fondo splash / icono — negro puro (sin tinte azul #030213) */
const BG = '#000000';

/** V en splash fullscreen (2732) — ~38 % del lienzo */
const SPLASH_LOGO_SCALE = 0.38;

/** Icono animado Android 12+ (1152) — V grande, sin placa de fondo */
const SPLASH_ICON_SIZE = 1152;
const SPLASH_ICON_LOGO_SCALE = 0.68;

/** Alta densidad al rasterizar SVG → bordes nítidos al reducir */
const SVG_DENSITY = 384;

async function renderLogoPng(pixelSize) {
  const svg = await readFile(logoSvg);
  return sharp(svg, { density: SVG_DENSITY })
    .resize(pixelSize, pixelSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function canvasWithLogo(size, logoScale, { transparent = false } = {}) {
  const logoSize = Math.round(size * logoScale);
  const logoPng = await renderLogoPng(logoSize);
  const offset = Math.round((size - logoSize) / 2);
  const background = transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : BG;
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: logoPng, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function solidBackground(size) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: BG },
  })
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(resourcesDir, { recursive: true });

  // Android adaptive: V en zona segura (~58 % del lienzo 1024)
  const iconForeground = await canvasWithLogo(1024, 0.58, { transparent: true });
  const iconBackground = await solidBackground(1024);

  // iOS / icono completo: V un poco más grande, fondo incluido
  const icon = await canvasWithLogo(1024, 0.62);

  // Splash: V centrada, proporción cómoda en tablet/móvil
  const splash = await canvasWithLogo(2732, SPLASH_LOGO_SCALE);

  // Android 12+ animated splash icon (transparente — sin cuadrado de fondo)
  const splashIcon = await canvasWithLogo(SPLASH_ICON_SIZE, SPLASH_ICON_LOGO_SCALE, {
    transparent: true,
  });

  await sharp(iconForeground).toFile(path.join(resourcesDir, 'icon-foreground.png'));
  await sharp(iconBackground).toFile(path.join(resourcesDir, 'icon-background.png'));
  await sharp(icon).flatten({ background: BG }).png().toFile(path.join(resourcesDir, 'icon.png'));
  await sharp(splash).toFile(path.join(resourcesDir, 'splash.png'));
  await sharp(splashIcon).toFile(path.join(resourcesDir, 'splash-icon.png'));

  const androidSplashIcon = path.join(
    root,
    'android/app/src/main/res/drawable/vertial_splash_icon.png',
  );
  await sharp(splashIcon).toFile(androidSplashIcon);

  console.log('OK resources/');
  console.log('  icon.png, icon-foreground.png, icon-background.png (1024)');
  console.log('  splash.png (2732), splash-icon.png (1152)');
  console.log('  android drawable/vertial_splash_icon.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
