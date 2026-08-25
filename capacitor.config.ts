import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativa Vertial (iPad tienda / TestFlight).
 *
 * Por defecto (dev local): WebView sirve `dist/` embebido.
 *
 * En CI (Codemagic): CAPACITOR_SERVER_URL=https://vertialapp.com
 * → la app carga la MISMA web que Safari (caja, fondo, Continuar al día).
 * El API sigue en vertialapp.com; plugins nativos (impresora, cámara) siguen en el IPA.
 */
const liveServerUrl = String(
  process.env.CAPACITOR_SERVER_URL || process.env.VITE_CAPACITOR_SERVER_URL || '',
).trim();

const config: CapacitorConfig = {
  appId: 'com.vertial.app',
  appName: 'Vertial',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(liveServerUrl
      ? {
          url: liveServerUrl,
          cleartext: false,
        }
      : {}),
  },
  plugins: {
    Camera: {
      // Permissions are declared in AndroidManifest.xml and Info.plist
    },
    Geolocation: {
      // Fichaje: ACCESS_FINE/COARSE en AndroidManifest + NSLocationWhenInUse en iOS
    },
    PushNotifications: {
      // Foreground: badge. Lock screen / background: lo pinta el SO (APNs/FCM alert).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#030213',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Default',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;
