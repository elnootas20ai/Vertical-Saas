# Vertial iOS — Checklist App Store Review

Usa esta lista antes de subir a App Store Connect o TestFlight.

## App Store Connect (metadatos)

| Campo | Valor recomendado |
|-------|-------------------|
| Nombre | Vertial |
| Bundle ID | `com.vertial.app` |
| Categoría principal | Business |
| Política de privacidad | https://vertialapp.com/legal/privacidad |
| URL de soporte | https://vertialapp.com |
| Edad | 4+ (contenido empresarial) |
| Export compliance | No — solo HTTPS estándar (`ITSAppUsesNonExemptEncryption = false`) |

## App Privacy (cuestionario)

Declarar según uso real:

- Email, nombre — registro / cuenta
- Fotos — cámara y galería (TPV, vehículos, documentos)
- Ubicación precisa — fichajes y servicios en campo (solo mientras usas la app)
- Identificadores — ID de usuario / sesión
- Datos de uso — solo si activáis analytics con consentimiento

**No** marcar seguimiento publicitario (NSPrivacyTracking = false en `PrivacyInfo.xcprivacy`).

## Ya configurado en el proyecto

### Info.plist
- Textos de privacidad (cámara, fotos, ubicación, red local)
- `NSBonjourServices` para impresoras térmicas LAN (`_pdl-datastream`, `_printer`, `_epos`, `_jetdirect`, `_ipp`)
- `UIBackgroundModes` → `remote-notification` (push)
- `ITSAppUsesNonExemptEncryption = false`
- Sin `armv7` (solo dispositivos arm64 actuales)
- iOS mínimo **15.0**

### Capacidades / entitlements
- **Sign in with Apple** + **Push** (`aps-environment` = `production` para TestFlight / App Store)
- En developer.apple.com el App ID `com.vertial.app` debe tener **Push Notifications** y **Sign In with Apple**; regenerar el perfil si acabas de activar Push

### Plugins nativos
Tras `npm run cap:sync`, `packageClassList` debe incluir Push, Apple Sign In, App, Camera, Splash, StatusBar y ESC/POS. En Mac: `cd ios/App && pod install`.

### Privacidad Apple
- `ios/App/App/PrivacyInfo.xcprivacy` (email, nombre, user ID, device ID/APNs, fotos, ubicación)

### Guideline 4.8 — Login
- **Google oculto en app iOS**; **Sign in with Apple** en login y registro (`@capacitor-community/apple-sign-in`)
- Login con email/contraseña disponible
- Backend: `POST /api/auth/apple-login`

### Guideline 5.1.1(v) — Eliminar cuenta
- Ajustes → Seguridad → **Eliminar cuenta** (propietarios)
- Trabajadores → Seguridad → eliminar cuenta (compacto)
- Backend: `DELETE /api/auth/profile/:userId` (auto-borrado)

### Guideline 3.1.1 — Suscripciones
- **Sin cobro MONEI dentro de la app iOS**
- Banner con enlace a https://vertialapp.com/saas/settings?tab=facturacion
- Usuarios con plan activo pueden usar la app con login normal

### API nativa
- `getApiBase()` usa `https://vertialapp.com` en Capacitor cuando `VITE_API_URL=/api`
- CORS backend incluye orígenes `capacitor://localhost` y `https://localhost`

## Build para revisión

```bash
npm run cap:assets
npm run cap:sync
# En Mac:
npm run cap:ios
# Xcode → Product → Archive → Distribute → App Store Connect
```

Antes del archive, verifica en dispositivo real:

1. Login email/contraseña **y** Sign in with Apple
2. Al iniciar sesión, iOS pide permiso de **notificaciones** → aceptar; enviar un push de prueba
3. TPV → configurar impresora: modal de **red local** → Continuar → popup iOS → permitir; botón «Abrir Ajustes» abre la ficha de Vertial
4. Cámara (si usáis esa función)
5. Fichaje / ubicación (si aplica): permiso de ubicación
6. Ajustes → Seguridad → enlaces legales abren en Safari
7. Eliminar cuenta (cuenta de prueba)

### Push (TestFlight → producción)

| Pieza | Dónde |
|-------|--------|
| Entitlement `aps-environment` = production | `ios/App/App/App.entitlements` |
| AppDelegate token hooks | `AppDelegate.swift` (ya están) |
| JS registro | `useNativePushNotifications` + backend `/api/push/native-register` |
| APNs key / cert en servidor | variables `APNS_*` (mismo key sirve sandbox+prod; el entorno lo marca el token) |
| Capability en Xcode | Signing & Capabilities → Push Notifications (si no aparece, añádela una vez) |

**Importante:** builds de debug con perfil *development* usan tokens sandbox; TestFlight/App Store usan producción. El entitlement del repo está en `production` para TestFlight.

En el **servidor** (.env): `APNS_PRODUCTION=true` para TestFlight, más `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH` o `APNS_KEY_CONTENT`. El payload APNs usa `pushType=alert` y `sound=default` (banner + sonido).

Push al iPhone del **CEO**: solo críticas + dinero/caja (descuadre, caja sin cerrar, impagos…). Lista en `services/pushAlertPolicy.js` (`CEO_MOBILE_PUSH_RULE_IDS`). Suenan también en horario silencioso.

## Notas para el revisor (Review Notes)

Texto sugerido en inglés o español:

> Vertial is a B2B operations platform for restaurants, retail and workshops. The iOS app uses native Capacitor plugins for camera capture and LAN thermal printer connectivity (ESC/POS). Digital subscriptions are purchased on our website (vertialapp.com); the iOS app is for authenticated business users. Account deletion: Settings → Security → Delete account. Test account: [email] / [password].

## Codemagic — error exit 65 al compilar IPA

Si **Compilar IPA** falla con `Failed to archive` / exit code **65**, casi siempre es **firma**:

1. El perfil de aprovisionamiento en Codemagic es **antiguo** (no incluye **Sign in with Apple**).
2. En Codemagic → **Team settings** → **Code signing identities** → pestaña **iOS provisioning profiles**.
3. Borra el perfil viejo de `com.vertial.app` (App Store) si existe.
4. Pulsa **Fetch profiles**, selecciona el perfil **App Store** de `com.vertial.app` y descárgalo.
5. Comprueba que junto al perfil aparece **certificado en verde** (checkmark).
6. Vuelve a lanzar el build en **`iOS Release (TestFlight)`**.

Comprueba en [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) que el App ID `com.vertial.app` tiene **Sign In with Apple** y **Push Notifications** activos.

### Error «Cannot save Signing Certificates without certificate private key»

Ese paso falló porque Codemagic no tiene la variable **`CERTIFICATE_PRIVATE_KEY`**. No hace falta regenerar certificados desde el YAML: basta con **refrescar el provisioning profile** en la UI (pasos de arriba). El workflow ya usa `ios_signing` + `use-profiles`.

## Pendiente a futuro (no bloqueante si se mantiene política actual)

- **IAP StoreKit** — alternativa si queréis vender planes dentro de la app iOS
- Cookies `SameSite=strict` — la app nativa usa Bearer token en localStorage; revisar refresh de sesión en iOS
