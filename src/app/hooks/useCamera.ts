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
};

const ALLOWED_CAMERA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const CAMERA_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * useCamera – abstraction that uses the native Capacitor Camera plugin
 * when running inside a Capacitor app (Android / iOS), and falls back to
 * a standard HTML <input type="file"> when running as a PWA in the browser.
 */
export function useCamera() {
  const isNative = Capacitor.isNativePlatform();

  /**
   * Take a photo or pick one from the gallery.
   * Returns a data URL (base64) or null if the user cancelled.
   */
  const takePhoto = useCallback(
    async (opts: UseCameraOptions = {}): Promise<CameraPhoto | null> => {
      const {
        quality = 85,
        allowEditing = false,
        source = 'prompt',
      } = opts;

      if (isNative) {
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
          });
          if (!photo.dataUrl) return null;
          return { dataUrl: photo.dataUrl, format: photo.format };
        } catch {
          return null;
        }
      }

      // Browser fallback – open a file picker
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = CAMERA_ACCEPT;
        if (source === 'camera') {
          input.capture = 'environment';
        }
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          const type = (file.type || '').toLowerCase();
          if (!ALLOWED_CAMERA_MIME_TYPES.includes(type as (typeof ALLOWED_CAMERA_MIME_TYPES)[number])) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const format = file.type.split('/')[1] ?? 'jpeg';
            resolve({ dataUrl, format });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    },
    [isNative],
  );

  /**
   * Request camera/gallery permissions (native only – no-op in browser).
   */
  const requestPermissions = useCallback(async () => {
    if (!isNative) return { camera: 'granted', photos: 'granted' };
    try {
      return await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    } catch {
      return null;
    }
  }, [isNative]);

  return { takePhoto, requestPermissions, isNative };
}
