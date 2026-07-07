# Implementación MONEI — Vertial

Guía para activar cobros reales de suscripción SaaS (planes Básico / Normal / Pro).

## Estado actual del código

| Pieza | Estado |
|-------|--------|
| Cliente API MONEI (`services/monei.js`) | Listo |
| Crear / activar / cancelar suscripción | Listo |
| Webhooks status + payment | Listo + firma HMAC |
| Factura en CouchDB tras cobro (webhook) | Listo |
| UI Ajustes → Facturación | Listo |
| Panel Admin → Pagos MONEI | Listo |
| Onboarding tarjeta (`PaymentInfo`) | **No usa MONEI** (solo trial local) |
| Cambio de plan con sub activa | **Bloqueado** (409) — decidir mañana |

---

## Mañana: orden recomendado

### 1. Cuenta MONEI (30 min)

1. Entrar en [dashboard.monei.com](https://dashboard.monei.com)
2. Modo **Test** → copiar API key (`pk_test_…`)
3. Si la cuenta pide Account ID → copiar UUID
4. Anotar URLs que el código ya registra automáticamente al crear suscripción

### 2. Variables en el servidor (15 min)

En el `.env` del VPS (no commitear):

```env
MONEI_MODE=test
SKIP_MONEI_SUBSCRIPTION=false
APP_URL=https://vertialapp.com

TOKEN_API_KEY_TEST=pk_test_XXXX
# TOKEN_API_ID_TEST=uuid-si-aplica

# Producción real (cuando paséis a live):
# MONEI_MODE=live
# TOKEN_API_KEY=pk_live_XXXX
# SKIP_MONEI_SUBSCRIPTION=false
```

Comprobar:

```bash
npm run monei:preflight
```

**Importante:** `SKIP_MONEI_SUBSCRIPTION=true` hace que “Ir a pagar” active el plan **sin** pasarela. En producción debe ser `false`.

### 3. Webhooks accesibles (15 min)

MONEI debe poder hacer POST sin JWT a:

- `https://vertialapp.com/api/subscriptions/webhook/status`
- `https://vertialapp.com/api/subscriptions/webhook/payment`

Nginx: proxy a Node, **sin** auth básica en esas rutas.

El backend valida `MONEI-Signature` (HMAC-SHA256). Solo en dev local:

```env
MONEI_WEBHOOK_SKIP_VERIFY=true
```

**Nunca** en producción.

### 4. Prueba en test (45 min)

1. Reiniciar backend con `.env` nuevo
2. Login → **Ajustes → Facturación**
3. Elegir plan → **Ir a pagar** → debe redirigir a MONEI (no mensaje “modo sin MONEI”)
4. Tarjeta test MONEI → volver a `?subscription_complete=true&subscription_id=…`
5. Confirmar: plan activo + mensaje verde
6. Admin → **Pagos MONEI** → ver pago / suscripción
7. Simular webhook desde dashboard MONEI o esperar renovación test
8. **Facturación** → debe aparecer factura tras webhook de pago (no al volver del redirect)

### 5. Pasar a live (cuando test OK)

```env
MONEI_MODE=live
TOKEN_API_KEY=pk_live_XXXX
SKIP_MONEI_SUBSCRIPTION=false
```

Repetir flujo con importe real pequeño.

---

## Planes y precios (código)

Importes en **céntimos** (`controllers/subscriptionController.js`):

| Plan | Mensual | Anual (−20 %) |
|------|---------|---------------|
| Básico | 49 € | 470,40 € |
| Normal | 149 € | 1.430,40 € |
| Pro | 349 € | 3.350,40 € |

Trial: **14 días** en primera alta; **0 días** si reactiva desde cuenta bloqueada.

---

## Flujo técnico

```
Usuario → POST /api/subscriptions/create
       → MONEI createSubscription + activate
       → redirectUrl (pago hosted)
       → Usuario paga
       → completeUrl → /saas/settings/facturacion?subscription_complete=true
       → POST /api/subscriptions/confirm
       → MONEI webhooks → actualizan cuenta + factura en DB `invoice`
```

Archivos clave:

- `services/monei.js` — API + firma webhook
- `controllers/subscriptionController.js` — create, confirm, webhooks
- `services/subscriptionBillingInvoice.js` — factura idempotente por `paymentId`
- `src/app/pages/saas/Settings.tsx` — UI facturación
- `src/app/lib/subscriptionApi.ts` — cliente frontend
- `controllers/adminMoneiController.js` — panel admin

---

## Checklist día de implementación

- [ ] `npm run monei:preflight` sin errores
- [ ] `SKIP_MONEI_SUBSCRIPTION=false` en servidor
- [ ] `APP_URL` = dominio público HTTPS
- [ ] Claves test/live en `.env`
- [ ] Webhooks responden 200 (probar con dashboard MONEI)
- [ ] Suscripción test de punta a punta
- [ ] Factura aparece tras webhook de pago
- [ ] Cancelación desde Ajustes funciona
- [ ] iOS: compra oculta en app (solo web) — ya implementado
- [ ] Decidir: onboarding con MONEI vs mantener trial sin tarjeta real

---

## Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| “Plan activado sin MONEI” | `SKIP_MONEI_SUBSCRIPTION=true` |
| 401 en webhook | Firma incorrecta o body alterado por proxy |
| No redirectUrl | API key vacía o error MONEI (ver logs `[MONEI]`) |
| Ya tienes suscripción activa | 409 — cancelar o admin “clear MONEI link” |
| Factura no aparece | Solo webhook `/webhook/payment`, no al volver del pago |

Logs: buscar `[MONEI]` en stdout del backend.

---

## Admin

**Admin Panel → Pagos MONEI**: dashboard, listados, reembolsos, pausar/reanudar, meses gratis, reactivar cuenta, limpiar enlace MONEI roto.

API: `/api/admin/monei/*` (solo rol Admin).

---

## MONEI Connect — alta comercio (`promo=vertial`)

Enlace de partner: [dashboard.monei.com/signup?promo=vertial](https://dashboard.monei.com/signup?promo=vertial)

Esto es **distinto** de pagar la suscripción Vertial: aquí el cliente se da de alta como **comercio MONEI** para cobrar a sus propios clientes (TPV, online, etc.).

### Cómo se valida el alta

1. **Solo `promo=vertial`** — MONEI atribuye el comercio a Vertial, pero Vertial no sabe qué usuario es.
2. **Enlace firmado (recomendado)** — Desde Ajustes → Facturación → «Darse de alta en MONEI»:
   - Backend genera `mid={userId}` + `h=HMAC-SHA256(userId, Partner API Key)`
   - MONEI devuelve `externalId` en webhooks → vinculamos cuenta Vertial
3. **Webhook partner** — Configurar en [admin.monei.com](https://admin.monei.com) → Settings → Webhooks:
   - URL: `https://vertialapp.com/api/monei-connect/webhook`
   - Eventos: `account.pending`, `account.approved`, `account.activated`, `account.rejected`
4. Estado visible en UI: pendiente / aprobada / activa / rechazada

Documentación MONEI: [MONEI Connect](https://docs.monei.com/monei-connect/)

### Mañana (Connect)

- [ ] Partner API keys en `.env` (`MONEI_PARTNER_API_KEY_TEST` / `_LIVE`)
- [ ] Webhook partner apuntando a `/api/monei-connect/webhook`
- [ ] Probar alta desde Ajustes → Facturación (no pegar link a mano sin mid/h)
- [ ] Verificar en logs `[MONEI-Connect] Alta MONEI validada`
