/**
 * Preparación de imagen para OCR en móvil.
 * Las fotos nativas suelen ser 4–12 MB; sin downscale la WebView puede
 * congelarse o forzar reinicio por OOM.
 */

export const OCR_MAX_IMAGE_DIMENSION = 1600;
export const OCR_JPEG_QUALITY = 0.82;
/** Límite aproximado del payload base64 que mandamos al API / adjuntamos. */
export const OCR_MAX_PAYLOAD_BYTES = 2_500_000;
export const OCR_MAX_PDF_BYTES = 8_000_000;

export function estimateBase64Bytes(base64: string): number {
  const len = String(base64 || '').length;
  if (!len) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, raw] = dataUrl.split(',');
  const mime = /data:([^;]+);/.exec(header || '')?.[1] || 'image/jpeg';
  const binary = atob(raw || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Reduce y recomprime desde un src (data URL u object URL).
 * Fondo blanco + JPEG para Vision / WebView.
 */
export async function downscaleImageSrcToBase64(
  src: string,
  maxDimension = OCR_MAX_IMAGE_DIMENSION,
  quality = OCR_JPEG_QUALITY,
): Promise<{ base64: string; mime: string; dataUrl: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
    el.src = src;
  });

  const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Liberar referencia al bitmap cuanto antes (ayuda en iOS WKWebView).
  try {
    elSrcRelease(img);
  } catch {
    /* noop */
  }

  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let base64 = dataUrl.split(',')[1] || '';

  // Segunda pasada más agresiva si sigue demasiado grande (móviles bajos).
  if (estimateBase64Bytes(base64) > OCR_MAX_PAYLOAD_BYTES && maxDimension > 1024) {
    return downscaleImageSrcToBase64(dataUrl, 1024, 0.72);
  }

  // Evitar retener el canvas grande.
  canvas.width = 0;
  canvas.height = 0;

  return { base64, mime: 'image/jpeg', dataUrl };
}

function elSrcRelease(img: HTMLImageElement) {
  img.onload = null;
  img.onerror = null;
  img.src = '';
}

export async function downscaleImageFileToBase64(
  file: File,
  maxDimension = OCR_MAX_IMAGE_DIMENSION,
  quality = OCR_JPEG_QUALITY,
): Promise<{ base64: string; mime: string; dataUrl: string }> {
  const url = URL.createObjectURL(file);
  try {
    return await downscaleImageSrcToBase64(url, maxDimension, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileToRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/** Fuerza un repaint ligero tras volver de la cámara (bug WebView Android). */
export function forceWebViewRepaint() {
  if (typeof document === 'undefined') return;
  const b = document.body;
  const prev = b.style.transform;
  b.style.transform = 'translateZ(0)';
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  b.offsetHeight;
  b.style.transform = prev;
}
