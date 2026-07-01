import JSZip from 'jszip';

const MAX_PHOTOS_PER_VEHICLE = 30;
const MAX_IMAGE_SIDE = 2048;
const JPEG_QUALITY = 0.85;

/** Clave de emparejamiento: matrícula/bastidor sin espacios ni guiones. */
export function normalizeVehicleMediaKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export type ZipImageGroup = Map<string, string[]>;

export function parseZipImagePath(entryName: string): { groupKey: string; order: number } {
  const parts = entryName.split('/').filter(Boolean);
  const filename = parts.pop() || entryName;
  const rawBase = filename.replace(/\.[^.]+$/i, '');

  const suffixMatch = rawBase.match(/^(.+?)_(\d+)$/i);
  const order = suffixMatch ? Number(suffixMatch[2]) : 0;
  const namePart = suffixMatch ? suffixMatch[1] : rawBase;

  if (parts.length > 0) {
    const folderKey = normalizeVehicleMediaKey(parts[parts.length - 1]);
    if (folderKey) {
      return { groupKey: folderKey, order };
    }
  }

  return { groupKey: normalizeVehicleMediaKey(namePart), order };
}

async function compressImageBlob(blob: Blob): Promise<string> {
  if (!blob.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
    throw new Error('unsupported');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
          const ratio = Math.min(MAX_IMAGE_SIDE / width, MAX_IMAGE_SIDE / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error('decode'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


/** Lee un ZIP y agrupa fotos por matrícula/bastidor (nombre de archivo o carpeta). */
export async function loadVehicleImagesFromZip(file: File): Promise<ZipImageGroup> {
  const zip = await JSZip.loadAsync(file);
  const pending: Array<{ groupKey: string; order: number; dataUrl: Promise<string> }> = [];

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const lower = entry.name.toLowerCase();
    if (!/\.(jpe?g|png|webp)$/.test(lower)) continue;

    const { groupKey, order } = parseZipImagePath(entry.name);
    if (!groupKey) continue;

    pending.push({
      groupKey,
      order,
      dataUrl: entry.async('blob').then((blob) => compressImageBlob(blob)),
    });
  }

  const groups: ZipImageGroup = new Map();
  const buckets = new Map<string, Array<{ order: number; dataUrl: string }>>();

  for (const item of pending) {
    try {
      const dataUrl = await item.dataUrl;
      const list = buckets.get(item.groupKey) || [];
      list.push({ order: item.order, dataUrl });
      buckets.set(item.groupKey, list);
    } catch {
      /* omitir imagen corrupta */
    }
  }

  for (const [key, list] of buckets) {
    list.sort((a, b) => a.order - b.order);
    groups.set(key, list.slice(0, MAX_PHOTOS_PER_VEHICLE).map((x) => x.dataUrl));
  }

  return groups;
}

export function resolveVehicleImagesFromZip(
  entry: { registrationPlate?: string; vin?: string },
  groups: ZipImageGroup,
): string[] {
  const keys = [
    normalizeVehicleMediaKey(entry.registrationPlate || ''),
    normalizeVehicleMediaKey(entry.vin || ''),
  ].filter(Boolean);

  for (const key of keys) {
    const imgs = groups.get(key);
    if (imgs?.length) return [...imgs];
  }
  return [];
}

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pO7s/0AAAAASUVORK5CYII=';

export async function downloadSampleVehiclePhotosZip(): Promise<void> {
  const zip = new JSZip();
  zip.file('1234ABC.jpg', SAMPLE_PNG_BASE64, { base64: true });
  zip.file('1234ABC_1.jpg', SAMPLE_PNG_BASE64, { base64: true });
  zip.file('1234ABC_2.jpg', SAMPLE_PNG_BASE64, { base64: true });
  zip.file(
    'LEEME.txt',
    [
      'ZIP de fotos para importación de vehículos (compraventa)',
      '',
      '1) Nombra cada foto con la MATRÍCULA del Excel (sin espacios recomendado).',
      '   Ejemplo: 1234ABC.jpg, 1234ABC_1.jpg, 1234ABC_2.jpg',
      '2) También vale carpeta por matrícula: 1234ABC/interior.jpg',
      '3) Si no hay matrícula en el Excel, usa el BASTIDOR (VIN).',
      '4) Formatos: .jpg, .jpeg, .png, .webp',
      '5) Sube el Excel y este ZIP en el mismo importador.',
    ].join('\n'),
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ejemplo_fotos_vehiculos.zip';
  link.click();
  URL.revokeObjectURL(url);
}
