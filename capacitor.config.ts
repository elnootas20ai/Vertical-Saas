import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativa Vertial (iPad / Android móvil).
 *
 * Por defecto: WebView sirve `dist/` embebido (sin depender de vertialapp.com para la UI).
 * API: VITE_NATIVE_API_ORIGIN → https://vertialapp.com
 *
 * Build APK debug:  npm run cap:android:apk:debug
 * Build APK release (Play): npm run cap:android:apk:release
 *
 * En CI (opcional): CAPACITOR_SERVER_URL carga la web remota — no usar en tablets de producción
 * salvo acuerdo explícito (actualizar UI = nuevo APK).
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
          allowNavigation: ['vertialapp.com', '*.vertialapp.com'],
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
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
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
