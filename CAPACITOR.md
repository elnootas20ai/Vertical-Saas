# Udar — Capacitor (App Nativa)

Este documento describe cómo compilar y publicar la aplicación **Udar** como app nativa en **Android** (Google Play) e **iOS** (App Store) usando [Capacitor](https://capacitorjs.com/).

---

## Requisitos previos

| Plataforma | Herramientas necesarias |
|------------|------------------------|
| Android | [Android Studio](https://developer.android.com/studio) · JDK 17+ · Android SDK |
| iOS | macOS + [Xcode](https://developer.apple.com/xcode/) 14+ |

---

## Configuración inicial (una sola vez)

### 1. Inicializar Capacitor

```bash
# El archivo capacitor.config.ts ya existe en la raíz del proyecto
# Solo hay que añadir las plataformas:

npm run cap:add:android   # añade la carpeta /android
npm run cap:add:ios       # añade la carpeta /ios (requiere macOS)
```

### 2. Configurar permisos de cámara

**Android** — edita `android/app/src/main/AndroidManifest.xml` y asegúrate de que existen:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<!-- Para Android < 13 -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
```

**iOS** — edita `ios/App/App/Info.plist` y añade:

```xml
<key>NSCameraUsageDescription</key>
<string>Necesitamos acceso a la cámara para fotografiar los vehículos en entrada.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Necesitamos acceso a tus fotos para adjuntarlas a los vehículos.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Necesitamos guardar fotos de los vehículos en tu galería.</string>
```

---

## Flujo de desarrollo y despliegue

### Build + sync (el más usado)

```bash
# Compila la web y sincroniza los assets con los proyectos nativos
npm run cap:sync
```

### Abrir Android Studio

```bash
npm run cap:android
# → Compila la web, hace sync y abre Android Studio
```

### Abrir Xcode

```bash
npm run cap:ios
# → Compila la web, hace sync y abre Xcode
```

### Actualizar plugins nativos

```bash
npm run cap:update
```

---

## Live reload durante desarrollo

Edita `capacitor.config.ts` y descomenta la sección `server.url` apuntando a tu IP local:

```ts
server: {
  url: 'http://192.168.1.100:3005',  // tu IP local
  cleartext: true,
},
```

Luego ejecuta:

```bash
npm run dev          # inicia el servidor Vite
npm run cap:android  # abre Android Studio y ejecuta en dispositivo/emulador
```

---

## Publicación en tiendas

### Google Play
1. En Android Studio: **Build → Generate Signed Bundle/APK**
2. Selecciona **Android App Bundle (.aab)**
3. Configura tu Keystore (créalo si es la primera vez)
4. Sube el `.aab` en [Google Play Console](https://play.google.com/console)

### App Store
1. En Xcode: **Product → Archive**
2. En el **Organizer**: **Distribute App → App Store Connect**
3. Sigue el wizard y sube a [App Store Connect](https://appstoreconnect.apple.com/)

---

## Arquitectura de la cámara

La app usa el hook `useCamera` (`src/app/hooks/useCamera.ts`) que:
- **En dispositivo nativo** (Android/iOS): usa el plugin `@capacitor/camera` con acceso a la cámara nativa.
- **En navegador/PWA**: usa un `<input type="file" accept="image/*" capture="environment">` como fallback.

El componente `CameraButton` (`src/app/components/saas/CameraButton.tsx`) encapsula este comportamiento y puede usarse en cualquier formulario de subida de fotos.

---

## IDs de la app

| Campo | Valor |
|-------|-------|
| App ID | `com.udar.app` |
| Nombre | `Udar` |
| Web Dir | `dist` |
| Versión inicial | `1.0.0` |
