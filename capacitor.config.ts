import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativa Vertial (iPad tienda / TestFlight).
 *
 * El WebView sirve el front embebido desde `dist/` (el del `npm run build`
 * en Codemagic o local). Misma cara que el build: para actualizar UI en tablet
 * hace falta un IPA/APK nuevo. El API sigue en vertialapp.com vía
 * VITE_NATIVE_API_ORIGIN en el build nativo.
 */
const config: CapacitorConfig = {
  appId: 'com.vertial.app',
  appName: 'Vertial',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
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
