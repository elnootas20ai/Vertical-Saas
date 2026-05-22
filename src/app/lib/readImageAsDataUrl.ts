const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function isBlankPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 12) return true;
  if (r > 242 && g > 242 && b > 242) return true;
  if (r < 14 && g < 14 && b < 14) return true;
  return false;
}

/** Quita márgenes blancos/negros/transparentes (típico en capturas de pantalla). */
function trimCanvasWhitespace(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d');
  if (!ctx) return source;

  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!isBlankPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }

  if (right <= left || bottom <= top) return source;

  const pad = 4;
  const cropLeft = Math.max(0, left - pad);
  const cropTop = Math.max(0, top - pad);
  const cropRight = Math.min(width - 1, right + pad);
  const cropBottom = Math.min(height - 1, bottom + pad);
  const cropW = cropRight - cropLeft + 1;
  const cropH = cropBottom - cropTop + 1;

  const trimmed = document.createElement('canvas');
  trimmed.width = cropW;
  trimmed.height = cropH;
  const tctx = trimmed.getContext('2d');
  if (!tctx) return source;
  tctx.drawImage(source, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);
  return trimmed;
}

function scaleCanvasToMax(canvas: HTMLCanvasElement, maxDimension: number): HTMLCanvasElement {
  let { width, height } = canvas;
  if (width <= maxDimension && height <= maxDimension) return canvas;

  if (width >= height) {
    height = Math.round((height * maxDimension) / width);
    width = maxDimension;
  } else {
    width = Math.round((width * maxDimension) / height);
    height = maxDimension;
  }

  const scaled = document.createElement('canvas');
  scaled.width = width;
  scaled.height = height;
  const ctx = scaled.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, width, height);
  return scaled;
}

export type ReadImageOptions = {
  maxDimension?: number;
  /** Recorta bordes vacíos (recomendado para logos). */
  trimWhitespace?: boolean;
};

/** Lee una imagen local, recorta márgenes, redimensiona y devuelve data URL. */
export function readImageFileAsDataUrl(
  file: File,
  maxDimensionOrOptions: number | ReadImageOptions = 512,
): Promise<{ dataUrl: string; trimmed: boolean }> {
  const options =
    typeof maxDimensionOrOptions === 'number'
      ? { maxDimension: maxDimensionOrOptions, trimWhitespace: true }
      : { maxDimension: 512, trimWhitespace: true, ...maxDimensionOrOptions };

  const maxDimension = options.maxDimension ?? 512;
  const trimWhitespace = options.trimWhitespace !== false;

  if (file.size > DEFAULT_MAX_BYTES) {
    return Promise.reject(new Error('La imagen no puede superar 2 MB'));
  }
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return Promise.reject(new Error('Formato no válido. Usa JPG, PNG o WebP.'));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const workMax = Math.min(1200, Math.max(img.naturalWidth, img.naturalHeight));
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > workMax || height > workMax) {
        if (width >= height) {
          height = Math.round((height * workMax) / width);
          width = workMax;
        } else {
          width = Math.round((width * workMax) / height);
          height = workMax;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo procesar la imagen'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      const before = { w: canvas.width, h: canvas.height };
      let working = trimWhitespace ? trimCanvasWhitespace(canvas) : canvas;
      const trimmed = working.width !== before.w || working.height !== before.h;
      working = scaleCanvasToMax(working, maxDimension);

      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve({
        dataUrl: working.toDataURL(mime, mime === 'image/jpeg' ? 0.88 : undefined),
        trimmed,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = objectUrl;
  });
}
