import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vertial.app',
  appName: 'Vertial',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Uncomment for live reload during development (replace with your local IP):
    // url: 'http://192.168.1.x:3005',
    // cleartext: true,
  },
  plugins: {
    Camera: {
      // Permissions are declared in AndroidManifest.xml and Info.plist
    },
    PushNotifications: {
      // iOS: muestra banner/listado/sonido/badge con la app en primer plano
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
