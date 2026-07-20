# Vertial — Capacitor (App nativa)

Este documento describe cómo compilar y publicar la aplicación **Vertial** como app nativa en **Android** (Google Play) e **iOS** (App Store) usando [Capacitor](https://capacitorjs.com/).

---

## Estado del proyecto

| Elemento | Estado |
|----------|--------|
| `capacitor.config.ts` | Configurado (`com.vertial.app`) |
| Carpeta `android/` | Generada |
| Carpeta `ios/` | Generada |
| Iconos y splash | Generados desde `src/assets/logo.svg` |
| Plugins nativos | Camera, SplashScreen, StatusBar, esc-pos-proxy (impresión WiFi) |

---

## Requisitos previos

| Plataforma | Herramientas necesarias |
|------------|------------------------|
| Android | [Android Studio](https://developer.android.com/studio) · JDK 17+ · Android SDK |
| iOS | macOS + [Xcode](https://developer.apple.com/xcode/) 14+ · CocoaPods |
| Apple Developer Program | 99 USD/año — solo para App Store / TestFlight |
| Google Play Console | 25 USD (una vez) — solo para publicar en Play Store |

---

## Comandos habituales

```bash
# Compila la web y sincroniza con los proyectos nativos
npm run cap:sync

# Regenerar iconos/splash (tras cambiar el logo)
npm run cap:assets

# Abrir Android Studio (Windows/Mac/Linux)
npm run cap:android

# Abrir Xcode (solo macOS)
npm run cap:ios
```

---

## Iconos y splash

Los PNG fuente están en `resources/` (generados desde `src/assets/logo.svg`, la **V** con gradiente verde→azul):

| Archivo | Uso |
|---------|-----|
| `icon.png` | Icono completo iOS / fallback (fondo `#030213` + V) |
| `icon-foreground.png` | Solo la V (transparente) — adaptive icon Android |
| `icon-background.png` | Fondo sólido `#030213` — adaptive icon Android |
| `splash.png` | Pantalla de arranque (V centrada) |

Para regenerar todos los tamaños nativos:

```bash
npm run cap:assets
npm run cap:sync
```

---

## Permisos configurados

### Android (`AndroidManifest.xml`)

- Cámara y galería (Capacitor Camera)
- Red local / WiFi (impresoras térmicas ESC/POS por IP)

### iOS (`Info.plist`)

- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`
- `NSLocalNetworkUsageDescription` (impresoras en LAN)

---

## Live reload durante desarrollo

Edita `capacitor.config.ts` y descomenta `server.url` apuntando a tu IP local:

```ts
server: {
  url: 'http://192.168.1.100:3005',
  cleartext: true,
},
```

```bash
npm run dev
npm run cap:android   # o cap:ios en Mac
```

---

## Publicación en tiendas

### Google Play

1. Android Studio → **Build → Generate Signed Bundle/APK**
2. Selecciona **Android App Bundle (.aab)**
3. Sube el `.aab` en [Google Play Console](https://play.google.com/console)

### App Store

1. Cuenta de pago en [Apple Developer Program](https://developer.apple.com/programs/enroll/)
2. Xcode → **Product → Archive**
3. **Organizer → Distribute App → App Store Connect**
4. [App Store Connect](https://appstoreconnect.apple.com/)

---

## Impresión térmica nativa

En la app nativa (Android/iPad), la impresión WiFi directa usa `esc-pos-proxy-capacitor-plugin` — no hace falta Vertial Print en PC.

En Safari/iPad sin app nativa, sigue usándose el puente **Vertial Print** (Windows) o ePOS según el dispositivo.

---

## Arquitectura de la cámara

El hook `useCamera` (`src/app/hooks/useCamera.ts`):

- **App nativa**: plugin `@capacitor/camera`
- **Navegador/PWA**: `<input type="file" capture="environment">`

---

## IDs de la app

| Campo | Valor |
|-------|-------|
| App ID | `com.vertial.app` |
| Nombre | `Vertial` |
| Web Dir | `dist` |
| Versión inicial | `1.0.0` |

---

## Notas iOS en Windows

La carpeta `ios/` ya está en el repo. Para compilar hace falta un **Mac** con Xcode y `pod install` (CocoaPods). En Windows solo se puede editar el código web y sincronizar assets; el build iOS se hace en Mac.

---

## Revisión App Store (Apple)

Checklist completo: **`docs/APP_STORE_IOS.md`**

Resumen de cumplimiento ya aplicado en código:

| Requisito Apple | Solución en Vertial |
|-----------------|---------------------|
| 4.8 Sign in with Apple | Google oculto en iOS (`appStoreCompliance.ts`) |
| 5.1.1(v) Eliminar cuenta | Ajustes → Seguridad + WorkerSecurity |
| 3.1.1 IAP / suscripciones | App iOS solo clientes; alta/pago en web (sin checkout en app) |
| 5.1.1 Purpose strings | Info.plist (cámara, fotos, ubicación, LAN) |
| Privacy manifest | `PrivacyInfo.xcprivacy` |
| Export encryption | `ITSAppUsesNonExemptEncryption = false` |
| API en app nativa | `VITE_NATIVE_API_ORIGIN` + CORS Capacitor |
| Push nativo | `@capacitor/push-notifications` + `aps-environment` |
| Abrir Ajustes (Red local) | `@capacitor/app` → `App.openUrl('app-settings:')` |
