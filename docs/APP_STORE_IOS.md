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

### Guideline 3.1.1 — Suscripciones (modelo clientes)
- **App iOS = acceso para clientes** con cuenta/plan ya activos
- **Alta de empresa + cobro solo en la web** (vertialapp.com), fuera de la app
- Sin botones de pagar, planes, transferencia ni enlace a checkout en iOS
- Sin «Crear cuenta de empresa» en la pantalla de entrada iOS
- Usuarios con plan activo usan la app con login normal (email / Sign in with Apple / trabajador)

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

## Respuesta al rechazo App Store (julio 2026 — Submission a51496f4)

### Qué marcó Apple y qué hacer

| Guideline | Qué pidieron | Acción |
|-----------|--------------|--------|
| **3.1.1** | Quitar registro de empresa/organización | En iOS: sin «Crear cuenta de empresa», sin solicitud de afiliado, sin alta de clientes Vertial desde panel afiliado. Solo login. |
| **5.1.2(i)** | Banner de cookies / tracking sin ATT | En iOS nativo: **no** se muestra el banner de cookies; solo cookies necesarias; sin analytics/marketing. |
| **2.3** | No encuentran «Sign in with Google» | En iOS Google está **oculto a propósito** (Guideline 4.8 → Sign in with Apple). **Quitar Google** de descripción, capturas y keywords en App Store Connect. |
| **2.1(a)** | No pueden entrar en Empresa ni Afiliado | Pegar **dos** cuentas demo en App Review Information (ver abajo). |

### Cuentas demo (App Review Information)

```
Empresa (owner / dashboard):
Email: apple-review@vertialapp.com
Password: [la de seed / APPLE_REVIEW_PASSWORD]
→ Entry → Empresa → Iniciar sesión

Afiliado:
Email / código: [cuenta afiliado de prueba activa]
Password: [si login por cuenta]
→ Entry → Afiliado → Iniciar sesión
```

Asegura que la cuenta empresa tenga **suscripción activa** (script `scripts/seed-apple-review-account.mjs` en prod con OK).

### Review Notes (pegar en inglés)

> Vertial is a B2B multiplatform operations SaaS. The iOS app is login-only for existing accounts (company staff, workers, affiliates). There is NO business/organization registration and NO in-app purchase for Vertial subscriptions on iOS.
>
> Sign in with Google is intentionally NOT available on iOS (we use Sign in with Apple per Guideline 4.8). Please ignore any older metadata mentioning Google — Sign in with Apple + email/password are the iOS methods.
>
> Cookies: the iOS app does not show a cookie consent banner and does not use advertising/analytics cookies or tracking. No App Tracking Transparency prompt is required because we do not track users.
>
> Demo — Company: [email] / [password] (active Pro). Path: Entry → Empresa → Iniciar sesión.
> Demo — Affiliate: [email or code] / [password]. Path: Entry → Afiliado → Iniciar sesión.
> Account deletion: Settings → Security → Delete account.

### Checklist App Store Connect (metadatos 2.3)

1. Descripción / What’s New / keywords: **sin** «Google» / «Sign in with Google».
2. Capturas: login con Apple o email, TPV, fichaje — sin Google ni precios de suscripción.
3. App Privacy: Tracking = **No**. Cookies de marketing no aplican en iOS.

## Respuesta al rechazo App Store (2.3.0 / 3.1.1 / 5.1.2) — notas previas

### 3.1.1 — Payments / In-App Purchase (hecho en código)

**Modelo:** app iOS = acceso para clientes existentes. Alta + cobro de Vertial **solo en la web**.

En iOS nativo ya no hay:
- Crear cuenta de empresa / organización / solicitud de afiliado
- Onboarding de planes / tarjeta
- Pantalla de pagar / transferencia
- Banners «ir a facturación / pagar»
- Botones «Subir a Pro» / precio de compra en upsell
- Enlace a checkout web dentro de la app
- Banner de cookies de marketing/analítica

**Login, trabajador, tablet TPV y operativa (caja, pedidos, fichaje) no cambian.**

Cuenta de revisión: debe tener **suscripción ya activa** (o `billingExempt` / trial admin).

### 5.1.2 — Privacy / Data Use and Sharing

**En App Store Connect → App Privacy**, declarar solo lo real (alineado con `PrivacyInfo.xcprivacy` y la política):

| Tipo | Linked to user | Tracking | Purpose |
|------|----------------|----------|---------|
| Email | Sí | No | App Functionality |
| Name | Sí | No | App Functionality |
| User ID | Sí | No | App Functionality |
| Device ID | Sí | No | App Functionality (push) |
| Photos | Sí | No | App Functionality |
| Precise Location | Sí | No | App Functionality (clock-in; while using) |

- **Tracking:** No / `NSPrivacyTracking = false`
- **No** declarar datos que no recogéis
- Política pública: https://vertialapp.com/legal/privacidad (actualizada con app móvil, push, ubicación, fotos, red local, sin tracking)
- Cookies: en iOS nativo no hay banner ni cookies de tracking (Guideline 5.1.2(i))

Tras deploy frontend, verifica que la página de privacidad en producción muestra la fecha **20 de julio de 2026** y la sección de app móvil.

### 2.3.0 — Accurate Metadata

En App Store Connect, alinear con la build:

1. **Descripción:** B2B para negocios. Acceso para clientes con cuenta; **sin** Google Sign-In en iOS; **sin** «contrata o paga desde la app».
2. **Capturas:** pantallas reales (login Apple/email, dashboard/TPV, fichaje). Sin Google ni checkout.
3. **Categoría:** Business. **Edad:** 4+.
4. **Keywords / promo text:** sin IAP ni Google.
5. **Review Notes:** usar el bloque de arriba (julio 2026).

## Notas para el revisor (Review Notes)

Ver sección «Review Notes (pegar en inglés)» más arriba.

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
