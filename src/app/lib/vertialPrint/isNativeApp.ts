import { Capacitor } from '@capacitor/core';

/** App instalada (Android/iOS). No incluye Safari ni Chrome en tablet. */
export function isVertialNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
