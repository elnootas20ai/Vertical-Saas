export const VEHICLE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const ALLOWED_DATA_PREFIXES = [
  'data:image/jpeg;',
  'data:image/jpg;',
  'data:image/png;',
  'data:image/webp;',
] as const;

export function isAllowedVehicleImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (ALLOWED_MIME.includes(type as (typeof ALLOWED_MIME)[number])) return true;
  const name = (file.name || '').toLowerCase();
  return ALLOWED_EXT.some((ext) => name.endsWith(ext));
}

export function isAllowedVehicleImageDataUrl(dataUrl: string): boolean {
  const normalized = String(dataUrl || '').trim().toLowerCase();
  return ALLOWED_DATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export async function compressVehicleImage(file: File, maxWidth = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
