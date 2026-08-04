import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type CameraPhoto = {
  dataUrl: string;
  format: string;
};

export type UseCameraOptions = {
  quality?: number;
  allowEditing?: boolean;
  source?: 'camera' | 'photos' | 'prompt';
  /** Limita el lado mayor en nativo (Capacitor) antes de devolver DataUrl — crítico para OCR. */
  maxWidth?: number;
};

export type CameraPermissionStatus = {
  camera: string;
  photos: string;
};

export type TakePhotoResult =
  | { ok: true; photo: CameraPhoto }
  | { ok: false; reason: 'cancelled' | 'denied' | 'unavailable' | 'failed'; message: string };

const ALLOWED_CAMERA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const CAMERA_ACCEPT = 'image/jpeg,image/png,image/webp';

function isUserCancelled(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  return (
    msg.includes('cancel') ||
    msg.includes('user cancelled') ||
    msg.includes('user canceled') ||
    msg.includes('no image')
  );
}

function isPermissionDenied(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || '').toLowerCase();
  return (
    msg.includes('permission') ||
    msg.includes('denied') ||
    msg.includes('not authorized') ||
    msg.includes('access')
  );
}

/**
 * useCamera – Capacitor Camera en app nativa; input file en navegador.
 */
export function useCamera() {
  const isNative = Capacitor.isNativePlatform();

  const requestPermissions = useCallback(async (): Promise<CameraPermissionStatus | null> => {
    if (!isNative) return { camera: 'granted', photos: 'granted' };
    try {
      return await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    } catch {
      return null;
    }
  }, [isNative]);

  const checkPermissions = useCallback(async (): Promise<CameraPermissionStatus | null> => {
    if (!isNative) return { camera: 'granted', photos: 'granted' };
    try {
      return await Camera.checkPermissions();
    } catch {
      return null;
    }
  }, [isNative]);

  /**
   * Captura con resultado tipado (razón de fallo). Preferible para OCR.
   */
  const takePhotoDetailed = useCallback(
    async (opts: UseCameraOptions = {}): Promise<TakePhotoResult> => {
      const { quality = 85, allowEditing = false, source = 'prompt', maxWidth } = opts;

      if (isNative) {
        const needCamera = source === 'camera' || source === 'prompt';
        const needPhotos = source === 'photos' || source === 'prompt';

        let perms = await checkPermissions();
        const cameraOk = !needCamera || perms?.camera === 'granted';
        const photosOk = !needPhotos || perms?.photos === 'granted' || perms?.photos === 'limited';

        if (!cameraOk || !photosOk) {
          perms = await requestPermissions();
        }

        const cameraGranted = !needCamera || perms?.camera === 'granted';
        const photosGranted =
          !needPhotos || perms?.photos === 'granted' || perms?.photos === 'limited';

        if (!cameraGranted || !photosGranted) {
          return {
            ok: false,
            reason: 'denied',
            message:
              'Sin permiso de cámara o fotos. Actívalo en Ajustes → Vertial → Cámara / Fotos.',
          };
        }

        try {
          const sourceMap = {
            camera: CameraSource.Camera,
            photos: CameraSource.Photos,
            prompt: CameraSource.Prompt,
          };
          const photo = await Camera.getPhoto({
            quality,
            allowEditing,
            resultType: CameraResultType.DataUrl,
            source: sourceMap[source],
            // Mejor lectura OCR: evita recortes raros del editor nativo
            correctOrientation: true,
            ...(typeof maxWidth === 'number' && maxWidth > 0 ? { width: maxWidth } : {}),
          });
          if (!photo.dataUrl) {
            return { ok: false, reason: 'cancelled', message: 'No se obtuvo ninguna imagen.' };
          }
          return { ok: true, photo: { dataUrl: photo.dataUrl, format: photo.format || 'jpeg' } };
        } catch (err) {
          if (isUserCancelled(err)) {
            return { ok: false, reason: 'cancelled', message: 'Captura cancelada.' };
          }
          if (isPermissionDenied(err)) {
            return {
              ok: false,
              reason: 'denied',
              message:
                'Sin permiso de cámara o fotos. Actívalo en Ajustes → Vertial → Cámara / Fotos.',
            };
          }
          return {
            ok: false,
            reason: 'failed',
            message: 'No se pudo abrir la cámara. Prueba de nuevo o elige una foto de la galería.',
          };
        }
      }

      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = CAMERA_ACCEPT;
        if (source === 'camera') {
          input.capture = 'environment';
        }
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ ok: false, reason: 'cancelled', message: 'No se seleccionó ningún archivo.' });
            return;
          }
          const type = (file.type || '').toLowerCase();
          if (!ALLOWED_CAMERA_MIME_TYPES.includes(type as (typeof ALLOWED_CAMERA_MIME_TYPES)[number])) {
            resolve({
              ok: false,
              reason: 'failed',
              message: 'Formato no soportado. Usa JPG, PNG o WebP.',
            });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const format = file.type.split('/')[1] ?? 'jpeg';
            resolve({ ok: true, photo: { dataUrl, format } });
          };
          reader.onerror = () =>
            resolve({ ok: false, reason: 'failed', message: 'No se pudo leer la imagen.' });
          reader.readAsDataURL(file);
        };
        input.oncancel = () =>
          resolve({ ok: false, reason: 'cancelled', message: 'Captura cancelada.' });
        input.click();
      });
    },
    [isNative, checkPermissions, requestPermissions],
  );

  /**
   * Compatibilidad: data URL o null (cancel / error).
   */
  const takePhoto = useCallback(
    async (opts: UseCameraOptions = {}): Promise<CameraPhoto | null> => {
      const result = await takePhotoDetailed(opts);
      return result.ok ? result.photo : null;
    },
    [takePhotoDetailed],
  );

  return { takePhoto, takePhotoDetailed, requestPermissions, checkPermissions, isNative };
}
