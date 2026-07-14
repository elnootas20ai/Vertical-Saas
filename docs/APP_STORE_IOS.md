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
- `NSBonjourServices` para impresoras térmicas LAN
- `ITSAppUsesNonExemptEncryption = false`
- Sin `armv7` (solo dispositivos arm64 actuales)
- iOS mínimo **15.0**

### Privacidad Apple
- `ios/App/App/PrivacyInfo.xcprivacy` incluido en el target Xcode

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

1. Login email/contraseña
2. Navegación TPV / módulos principales
3. Cámara (si usáis esa función)
4. Ajustes → Seguridad → enlaces legales abren en Safari
5. Eliminar cuenta (cuenta de prueba)

## Notas para el revisor (Review Notes)

Texto sugerido en inglés o español:

> Vertial is a B2B operations platform for restaurants, retail and workshops. The iOS app uses native Capacitor plugins for camera capture and LAN thermal printer connectivity (ESC/POS). Digital subscriptions are purchased on our website (vertialapp.com); the iOS app is for authenticated business users. Account deletion: Settings → Security → Delete account. Test account: [email] / [password].

## Codemagic — error exit 65 al compilar IPA

Si **Compilar IPA** falla con `Failed to archive` / exit code **65**, casi siempre es **firma**:

1. El perfil de aprovisionamiento en Codemagic es **antiguo** (no incluye **Sign in with Apple**).
2. Solución automática (ya en `codemagic.yaml`): paso **Refrescar certificados y perfiles App Store** con `--delete-stale-profiles`.
3. Si sigue fallando, en Codemagic → **Code signing identities** → **iOS provisioning profiles** → **Fetch profiles** → descarga de nuevo `com.vertial.app` (App Store).
4. Comprueba en [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list) que el App ID `com.vertial.app` tiene **Sign In with Apple** activo.

## Pendiente a futuro (no bloqueante si se mantiene política actual)

- **Sign in with Apple** — necesario si volvéis a mostrar Google en iOS
- **IAP StoreKit** — alternativa si queréis vender planes dentro de la app iOS
- Cookies `SameSite=strict` — la app nativa usa Bearer token en localStorage; revisar refresh de sesión en iOS
