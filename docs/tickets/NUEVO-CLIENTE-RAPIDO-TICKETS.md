# NUEVO CLIENTE RÁPIDO — Diseño de Tickets

**Tipo:** Modal / Acción  
**Invocable desde:** TPV, Pedidos, CRM, Presupuestos, Facturación, Verticales  
**Objetivo:** Dar de alta clientes sin salir del flujo de venta.  
**Perfiles:** Gerente (crear, editar, fusionar) · Trabajador (crear rápido y usar en pedido)  
**Fecha:** 14 abril 2026

---

## Auditoría del estado actual

### Lo que YA existe

| Capa | Archivo | Qué hace | Limitaciones |
|------|---------|----------|--------------|
| **Backend — modelo** | `services/couchdb.js` → `buildClientDocument` | Documento CouchDB con 30+ campos: name, phone, email, dni, addresses[], contacts[], datos fiscales | No tiene `defaultPaymentMethod` ni campo de frecuencia de pedido |
| **Backend — direcciones** | `services/couchdb.js` → `sanitizeAddress` | Sanitiza direcciones con id, label, street, postalCode, city, state, country, isPrimary | No valida completitud de dirección; no tiene tracking de uso |
| **Backend — CRUD** | `controllers/clientsController.js` → `createClient` | Valida name + phone obligatorios, guarda doc, busca duplicados post-creación | No valida formato de teléfono (solo no vacío), no valida dirección |
| **Backend — duplicados** | `services/couchdb.js` → `findDuplicateClients` | Compara email, últimos 9 dígitos de teléfono, DNI normalizado | Solo se ejecuta tras guardar; `check-duplicates` recibe objeto completo |
| **Backend — rutas** | `routers/clientsRouter.js` | CRUD + `check-duplicates` + merge + bulk + notas + promociones + actividad | El endpoint merge existe; falta endpoint de estadísticas |
| **Frontend — API** | `src/app/lib/crmApi.ts` → `createClientRequest` | POST a `/api/clients/:userId`, devuelve duplicados | El modal actual no consume los duplicados |
| **Frontend — modal delivery** | `src-delivery/.../CrearClienteRapidoModal.tsx` | Modal básico: nombre, email, teléfono, DNI, dirección, notas, portal | No busca duplicados, no tiene forma de pago, una sola dirección |
| **Frontend — validador DNI** | `src/app/lib/dniCifValidator.ts` | Validación oficial DNI/NIE/CIF español con mensajes de error | Existe pero NO se usa en el modal de delivery |
| **Frontend — autocompletado** | `ACCESO__AddressAutocomplete.tsx` | Autocompletado de dirección con Google Places | Disponible pero no integrado en ningún modal de cliente |
| **Frontend — tipo TS** | `AppContext.tsx` → `interface Client` | name, phone, email, dni, address, city, status, notes, tags, gdpr | No incluye `clientType`, `defaultPaymentMethod`, `addresses[]` tipado |
| **Frontend — CRM** | `ClientsPage.tsx` | Página completa de clientes con formulario integrado | No es modal reutilizable; acoplado a la página CRM |
| **Frontend — merge** | `DuplicatesMergeModal.tsx` | Detecta duplicados por teléfono, email, DNI y permite fusionarlos | Solo accesible desde CRM, no desde el flujo de creación rápida |
| **Frontend — TPV** | `TpvContext.tsx` | Ticket TPV con líneas y trabajador activo | No tiene slot de "cliente vinculado" a la venta |
| **Frontend — Fidelización** | `SalonLoyalty.tsx` | UI prototipo de puntos/niveles (datos mock) | Sin backend dedicado; no conecta con clientes |
| **Backend — roles** | `ROLE_DEFINITIONS` en `couchdb.js` | Admin, Gerente, Comercial, Administración, Taller, Usuario | Permisos granulares por módulo (clients: read/write/delete) |

### Lo que FALTA

1. **Campo `defaultPaymentMethod`** en el modelo de datos (backend + frontend)
2. **Validación de formato de teléfono** — actualmente solo no vacío; falta ≥ 9 dígitos y formato
3. **Validación de dirección completa** — la calle es obligatoria según requisitos pero es opcional
4. **Modal unificado y reutilizable** desde CRM, TPV, Pedidos y todas las vistas
5. **Soporte multi-dirección en el modal** — el backend soporta `addresses[]` pero ningún modal lo expone
6. **Búsqueda de duplicados en tiempo real** por campo individual con debounce
7. **Callback `onClientCreated`** que vincule automáticamente al pedido/venta en curso
8. **Integración con Pedidos** (web_order, delivery_order) — sin botón de cliente nuevo
9. **Integración con Fidelización** — sin conexión entre creación de cliente y puntos
10. **Tracking de direcciones usadas y frecuencia de pedido** — sin inteligencia de hábitos
11. **Flujo diferenciado por perfil** — gerente (crear + editar + fusionar) vs trabajador (crear rápido)
12. **Tipo TypeScript actualizado** con los campos que el backend ya soporta
13. **Validación DNI/CIF integrada** en el modal con feedback visual

---

## TICKETS

---

### NC-01 — Backend: Ampliar modelo de cliente con forma de pago y estadísticas

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** Ninguna

#### Contexto

El documento de cliente en CouchDB no tiene `defaultPaymentMethod` (forma de pago habitual) ni campos para tracking de frecuencia/comportamiento.

#### Cambios requeridos

**Archivo: `services/couchdb.js` → `buildClientDocument`**

Añadir antes de `createdAt`:

```js
defaultPaymentMethod: String(data.defaultPaymentMethod || existing?.defaultPaymentMethod || '').trim(),
stats: {
  totalOrders: Number(data.stats?.totalOrders ?? existing?.stats?.totalOrders ?? 0),
  lastOrderDate: data.stats?.lastOrderDate || existing?.stats?.lastOrderDate || null,
  orderFrequencyDays: Number(data.stats?.orderFrequencyDays ?? existing?.stats?.orderFrequencyDays ?? 0),
  favoriteAddressId: data.stats?.favoriteAddressId || existing?.stats?.favoriteAddressId || null,
  totalSpent: Number(data.stats?.totalSpent ?? existing?.stats?.totalSpent ?? 0),
  createdFrom: String(data.stats?.createdFrom || existing?.stats?.createdFrom || 'crm'),
},
```

**Archivo: `services/couchdb.js` → `sanitizeClient`**

Añadir al objeto retornado:

```js
defaultPaymentMethod: client.defaultPaymentMethod || '',
stats: {
  totalOrders: client.stats?.totalOrders || 0,
  lastOrderDate: client.stats?.lastOrderDate || null,
  orderFrequencyDays: client.stats?.orderFrequencyDays || 0,
  favoriteAddressId: client.stats?.favoriteAddressId || null,
  totalSpent: client.stats?.totalSpent || 0,
  createdFrom: client.stats?.createdFrom || 'crm',
},
```

**Valores permitidos para `defaultPaymentMethod`:**

| Valor | Etiqueta |
|-------|----------|
| `''` | Sin definir |
| `'efectivo'` | Efectivo |
| `'tarjeta'` | Tarjeta |
| `'transferencia'` | Transferencia |
| `'domiciliacion'` | Domiciliación bancaria |
| `'bizum'` | Bizum |
| `'cheque'` | Cheque |
| `'pagare'` | Pagaré |
| `'confirming'` | Confirming |
| `'otro'` | Otro |

**Valores de `stats.createdFrom`:** `'crm'`, `'tpv'`, `'pedido'`, `'presupuesto'`, `'factura'`, `'vertical'`, `'import'`, `'web'`

#### Criterios de aceptación

- [ ] `defaultPaymentMethod` se persiste al crear/actualizar cliente
- [ ] `stats` se devuelve en todas las respuestas API con valores por defecto para clientes existentes
- [ ] Clientes existentes sin estos campos devuelven valores vacíos/cero sin errores
- [ ] No hay regresión en endpoints existentes de clientes
- [ ] `stats.createdFrom` registra el contexto de origen al crear

---

### NC-02 — Backend: Validación de teléfono y dirección mejorada

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** Ninguna

#### Contexto

`createClient` solo valida que el teléfono no esté vacío. No hay validación de formato, longitud mínima ni caracteres permitidos. La dirección (calle) es completamente opcional. Según los requisitos, la calle es obligatoria y el teléfono debe tener formato mínimamente válido.

#### Cambios requeridos

**Archivo: `controllers/clientsController.js` → `createClient`**

Añadir tras las validaciones existentes:

```js
const cleanPhone = String(client.phone || '').replace(/\D/g, '');
if (cleanPhone.length < 9) {
  return badRequest(res, 'El teléfono debe tener al menos 9 dígitos');
}
if (!/^[\d\s\+\-\(\)\.]+$/.test(client.phone.trim())) {
  return badRequest(res, 'El teléfono contiene caracteres no válidos');
}
```

Ampliar respuesta con warnings:

```js
const warnings = [];
if (client.address?.trim() && !client.city?.trim()) {
  warnings.push({ field: 'city', message: 'Ciudad no especificada' });
}
if (client.address?.trim() && !client.postalCode?.trim()) {
  warnings.push({ field: 'postalCode', message: 'Código postal no especificado' });
}
if (!client.email?.trim()) {
  warnings.push({ field: 'email', message: 'Sin email — no se podrán enviar comunicaciones' });
}

return res.status(201).json({ ok: true, client: sanitizeClient(saved), duplicates, warnings });
```

**Archivo: `services/couchdb.js` → `sanitizeAddress`**

Añadir campos de tracking:

```js
usageCount: Number(addr.usageCount || 0),
lastUsedAt: addr.lastUsedAt || null,
```

#### Criterios de aceptación

- [ ] Teléfono con < 9 dígitos (sin espacios/guiones) es rechazado
- [ ] Teléfono con letras o símbolos extraños es rechazado
- [ ] La respuesta incluye `warnings[]` con advertencias no bloqueantes
- [ ] `sanitizeAddress` incluye `usageCount` y `lastUsedAt`
- [ ] Compatibilidad total con teléfonos válidos existentes

---

### NC-03 — Backend: Optimizar búsqueda de duplicados para tiempo real

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** Ninguna

#### Contexto

El endpoint `check-duplicates` recibe `{ client }` completo. El modal necesita buscar mientras el usuario escribe en un solo campo.

#### Cambios requeridos

**Archivo: `controllers/clientsController.js` → `checkClientDuplicates`**

Ampliar para aceptar dos modos:

```js
export async function checkClientDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { client, field, value } = req.body || {};

    // Modo 1: objeto completo (retrocompatible)
    if (client && typeof client === 'object') {
      const duplicates = await findDuplicateClients(req, userId, client);
      return res.json({ ok: true, duplicates });
    }

    // Modo 2: campo individual (para el modal)
    if (field && value) {
      const allowedFields = ['phone', 'email', 'dni'];
      if (!allowedFields.includes(field)) return badRequest(res, `Campo no permitido: ${field}`);
      const minLengths = { phone: 6, email: 5, dni: 8 };
      if (String(value).trim().length < minLengths[field]) {
        return res.json({ ok: true, duplicates: [], matchedField: field });
      }
      const duplicates = await findDuplicateClients(req, userId, { [field]: value });
      return res.json({ ok: true, duplicates, matchedField: field });
    }

    return badRequest(res, 'Enviar { client } o { field, value }');
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
```

**Archivo: `src/app/lib/crmApi.ts`**

Nueva función:

```typescript
export async function checkClientDuplicatesByFieldRequest(
  userId: string,
  field: 'phone' | 'email' | 'dni',
  value: string,
  signal?: AbortSignal,
): Promise<{ duplicates: Client[]; matchedField: string }>;
```

#### Criterios de aceptación

- [ ] Acepta `{ client }` (retrocompatible) y `{ field, value }` (nuevo)
- [ ] Solo permite campos `phone`, `email`, `dni`
- [ ] Longitud mínima por campo evita búsquedas triviales
- [ ] `matchedField` en la respuesta indica campo que matcheó
- [ ] La función TS soporta `AbortSignal` para cancelación
- [ ] Respuesta < 200ms para bases normales (< 10k clientes)

---

### NC-04 — Backend: Tracking de estadísticas y direcciones usadas

**Tipo:** Backend  
**Prioridad:** Media  
**Esfuerzo:** 2-3h  
**Dependencias:** NC-01

#### Contexto

El sistema debe "aprender" las direcciones que usa cada cliente y su frecuencia de pedido. Se necesita un endpoint que actualice las estadísticas cuando se completa un pedido/venta.

#### Cambios requeridos

**Archivo: `controllers/clientsController.js`**

Nuevo endpoint `updateClientStats`:

```js
export async function updateClientStats(req, res) {
  const { userId, clientId } = req.params;
  const { addressId, orderTotal } = req.body || {};
  // 1. Leer cliente actual
  // 2. Incrementar stats.totalOrders
  // 3. Actualizar stats.totalSpent
  // 4. Calcular stats.orderFrequencyDays como media móvil
  // 5. Actualizar stats.lastOrderDate
  // 6. Si addressId → incrementar addresses[x].usageCount + lastUsedAt
  // 7. Recalcular stats.favoriteAddressId al más usado
  // 8. Guardar y devolver cliente actualizado
}
```

Nuevo endpoint `getClientAddresses`:

```js
export async function getClientAddresses(req, res) {
  // Devolver addresses[] ordenadas: isPrimary primero, luego por usageCount desc
}
```

**Archivo: `routers/clientsRouter.js`**

```js
clientsRouter.post('/:userId/:clientId/stats', updateClientStats);
clientsRouter.get('/:userId/:clientId/addresses', getClientAddresses);
```

**Llamadas automáticas** desde los controladores que completan operaciones:

| Controlador | Cuándo | Datos |
|-------------|--------|-------|
| `deliveryController.js` | Pedido entregado (`status: 'delivered'`) | clientId, addressId, orderTotal |
| `webController.js` | Pedido web completado | clientId, addressId, orderTotal |
| Flujo TPV (venta cerrada) | Al registrar venta con cliente | clientId, orderTotal |

#### Criterios de aceptación

- [ ] `POST /:userId/:clientId/stats` actualiza contadores y frecuencia
- [ ] `usageCount` de la dirección usada se incrementa en cada pedido
- [ ] `favoriteAddressId` se recalcula al dirección más usada
- [ ] `GET /:userId/:clientId/addresses` devuelve direcciones ordenadas por uso
- [ ] La frecuencia se calcula como media móvil de días entre pedidos
- [ ] Los controladores de pedidos llaman a stats al completar operaciones

---

### NC-05 — Frontend: Actualizar interfaz TypeScript `Client`

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 30 min  
**Dependencias:** NC-01

#### Cambios requeridos

**Archivo: `src/app/context/AppContext.tsx`**

Añadir campos opcionales a `Client` y crear interfaces nuevas:

```typescript
export interface ClientAddress {
  id: string;
  label?: string;
  street: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  isPrimary: boolean;
  usageCount?: number;
  lastUsedAt?: string | null;
}

export interface ClientStats {
  totalOrders: number;
  lastOrderDate: string | null;
  orderFrequencyDays: number;
  favoriteAddressId: string | null;
  totalSpent: number;
  createdFrom: 'crm' | 'tpv' | 'pedido' | 'presupuesto' | 'factura' | 'vertical' | 'import' | 'web';
}

// Añadir a interface Client:
clientType?: 'particular' | 'empresa';
legalName?: string;
fiscalId?: string;
fiscalAddress?: string;
fiscalCity?: string;
fiscalPostalCode?: string;
fiscalCountry?: string;
defaultPaymentMethod?: string;
addresses?: ClientAddress[];
contacts?: Array<{ id: string; name: string; role?: string; phone?: string; email?: string }>;
stats?: ClientStats;
loyalty?: { enrolled: boolean; enrolledAt: string | null; points: number; level: string; totalVisits: number };
```

**Archivo: `src/app/lib/crmApi.ts` → `normalizeClientRecord`**

Mapear los campos nuevos con valores por defecto seguros.

#### Criterios de aceptación

- [ ] Interfaz `Client` incluye todos los campos nuevos como opcionales
- [ ] `ClientAddress` y `ClientStats` están tipados y exportados
- [ ] `normalizeClientRecord` mapea campos nuevos con defaults seguros
- [ ] Sin errores TypeScript en componentes existentes
- [ ] Campos opcionales para no romper código existente

---

### NC-06 — Frontend: Hook `useClientDuplicateSearch`

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Módulo:** `src/app/hooks/useClientDuplicateSearch.ts`  
**Dependencias:** NC-03, NC-05

#### Firma del hook

```typescript
interface DuplicateSearchResult {
  duplicates: Client[];
  isSearching: boolean;
  matchedField: 'phone' | 'email' | 'dni' | null;
  dismissed: boolean;
  clearDuplicates: () => void;
  dismissDuplicates: () => void;
}

function useClientDuplicateSearch(params: {
  userId: string;
  phone?: string;
  email?: string;
  dni?: string;
  enabled?: boolean;
  debounceMs?: number; // default 500
}): DuplicateSearchResult;
```

#### Comportamiento

1. Observa cambios en `phone`, `email` y `dni`
2. Aplica debounce configurable (default 500ms)
3. Solo busca si: `phone` ≥ 6 dígitos, O `email` válido, O `dni` ≥ 8 chars
4. Prioridad: teléfono > email > DNI
5. Cancela peticiones previas con AbortController
6. `clearDuplicates()` resetea estado; `dismissDuplicates()` oculta sin borrar
7. Sin memory leak si el componente se desmonta

#### Criterios de aceptación

- [ ] Debounce correcto (no dispara en cada keystroke)
- [ ] Solo busca con longitud mínima suficiente
- [ ] `isSearching` true durante la petición
- [ ] `matchedField` indica campo que matcheó
- [ ] `clearDuplicates` y `dismissDuplicates` funcionan correctamente
- [ ] Cancelación con AbortController
- [ ] Sin memory leak en desmontaje

---

### NC-07 — Frontend: Componente `NuevoClienteModal` universal

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Esfuerzo:** 5-7h  
**Módulo:** `src/app/components/saas/NuevoClienteModal.tsx`  
**Dependencias:** NC-05, NC-06

#### Props del componente

```typescript
interface NuevoClienteModalProps {
  open: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  contexto?: 'crm' | 'tpv' | 'pedido' | 'presupuesto' | 'factura' | 'vertical';
  initialData?: Partial<Client>;
  vincularA?: { tipo: 'presupuesto' | 'pedido' | 'venta' | 'factura'; id?: string; label?: string };
  perfil?: 'gerente' | 'trabajador';
}
```

#### Diseño visual del modal

```
┌──────────────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓ HEADER (gradiente marca) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│   🧑 Nuevo Cliente                    contexto: "desde TPV" │
│   Rellena los datos para dar de alta un nuevo cliente.       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ TIPO DE CLIENTE ──────────────────────────────────────┐  │
│  │  [ 👤 Particular ]        [ 🏢 Empresa ]               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ═══ DATOS BÁSICOS ═══════════════════════════════════════   │
│                                                               │
│  Nombre *                                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 🏷  Juan Pérez García                                │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Teléfono *                       Email                       │
│  ┌────────────────────┐          ┌────────────────────┐      │
│  │ 📞 +34 666 123 456 │          │ 📧 juan@email.com  │      │
│  └────────────────────┘          └────────────────────┘      │
│                                                               │
│  ┌─ 🔍 POSIBLE DUPLICADO ─────────────────────────────────┐  │
│  │  Juan Pérez — 666 123 456 — juan@correo.es             │  │
│  │  Último pedido: hace 3 días · 15 pedidos totales        │  │
│  │                                                          │  │
│  │  [👆 Usar este]  [➕ Crear nuevo]  [🔀 Fusionar ᴳ]     │  │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  DNI / NIE / CIF                  Forma de pago habitual      │
│  ┌────────────────────┐          ┌────────────────────┐      │
│  │ 📄 12345678Z  ✅    │          │ 💳 Efectivo ▾      │      │
│  └────────────────────┘          └────────────────────┘      │
│                                                               │
│  ═══ DIRECCIÓN PRINCIPAL * ═══════════════════════════════   │
│                                                               │
│  Calle *                                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 📍 Calle Mayor 15, 3ºB   (autocompletado Places)     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Ciudad                           Código postal               │
│  ┌────────────────────┐          ┌────────────────────┐      │
│  │ 🏙  Madrid          │          │ 📮 28001            │      │
│  └────────────────────┘          └────────────────────┘      │
│                                                               │
│  Etiqueta: [🏠 Casa / Trabajo / ...]                         │
│                                                               │
│  [+ Añadir otra dirección]  ← sección expandible             │
│                                                               │
│  ═══ OBSERVACIONES ═══════════════════════════════════════   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 📝 Alérgico a frutos secos. Llamar 10 min antes.     │    │
│  └──────────────────────────────────────────────────────┘    │
│  El cliente no verá estas observaciones.                      │
│                                                               │
│  ┌─ ✅ VINCULACIÓN (si vincularA) ────────────────────────┐  │
│  │  Se vinculará automáticamente al pedido #1234           │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ 🏆 FIDELIZACIÓN (si activa) ──────────────────────────┐  │
│  │  Se inscribirá en el programa (+50 pts bienvenida)      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│  [Cancelar]              [💾 Guardar]  [💾 Guardar y continuar →] │
└──────────────────────────────────────────────────────────────┘
```

#### Campos del formulario

| Campo | Tipo | Obligatorio | Validación | Notas |
|-------|------|:-----------:|------------|-------|
| **Tipo de cliente** | Toggle | Sí (default: particular) | — | Cambia label nombre↔razón social y DNI↔CIF |
| **Nombre / Razón social** | `text` | **Sí** | `trim().length > 0` | Autofocus al abrir |
| **Teléfono** | `tel` | **Sí** | ≥ 9 dígitos + caracteres válidos + duplicados debounce | Placeholder `+34 600 000 000` |
| **Email** | `email` | No | Formato email + duplicados debounce | — |
| **DNI/NIE o CIF** | `text` | No | `dniCifValidator.ts` según tipo | ✅/❌ en tiempo real |
| **Forma de pago** | `select` | No | Valor de lista | Efectivo, Tarjeta, Transferencia, etc. |
| **Calle** | `text` | **Sí** | `trim().length > 0` | Integrar `AddressAutocomplete` |
| **Ciudad** | `text` | No (recomendado) | — | Auto-rellena con Places |
| **Código postal** | `text` | No (recomendado) | — | Auto-rellena con Places |
| **Etiqueta dirección** | `text` | No | — | "Casa", "Trabajo", "Oficina" |
| **Direcciones adicionales** | Expandible | No | Calle obligatoria si se añade | Botón "+ Añadir otra dirección" |
| **Observaciones** | `textarea` | No | — | 3 líneas, "el cliente no verá esto" |

#### Adaptación por contexto

| Contexto | Header | Botón principal | Botón secundario |
|----------|--------|-----------------|------------------|
| `crm` | "Nuevo Cliente" | "Guardar cliente" | — |
| `tpv` | "Nuevo Cliente — TPV" | "Guardar y volver a la venta" | "Guardar cliente" |
| `pedido` | "Nuevo Cliente — Pedido" | "Guardar y asignar al pedido" | "Guardar cliente" |
| `presupuesto` | "Nuevo Cliente — Presupuesto" | "Guardar y continuar" | "Guardar cliente" |
| `factura` | "Nuevo Cliente — Factura" | "Guardar y asignar a factura" | "Guardar cliente" |
| `vertical` | "Nuevo Cliente" | "Guardar y continuar" | "Guardar cliente" |

#### Adaptación por perfil

| Sección | Gerente | Trabajador |
|---------|:-------:|:----------:|
| Tipo de cliente (particular/empresa) | ✅ | ❌ (siempre particular) |
| Datos básicos (nombre, tel, email) | ✅ | ✅ |
| DNI / CIF | ✅ | ❌ |
| Forma de pago | ✅ | ❌ |
| Dirección principal (calle) | ✅ | ✅ |
| Ciudad, CP, etiqueta | ✅ | ⚠️ Colapsado |
| Direcciones adicionales | ✅ | ❌ |
| Observaciones | ✅ | ✅ |
| Banner duplicado — "Usar este" | ✅ | ✅ |
| Banner duplicado — "Fusionar" | ✅ | ❌ |

El modal en modo **trabajador** muestra solo: nombre, teléfono, calle y observaciones. Formulario mínimo para no frenar la venta.

#### Alertas visibles en el modal

| Alerta | Cuándo | Estilo |
|--------|--------|--------|
| **Cliente duplicado** | Duplicado por teléfono, email o DNI | Banner ámbar con datos del similar + acciones |
| **Teléfono inválido** | < 9 dígitos o caracteres extraños | Borde rojo + mensaje bajo campo |
| **Teléfono vacío** | Campo vacío al guardar | Borde rojo + "Obligatorio" |
| **Nombre vacío** | Campo vacío al guardar | Borde rojo + "Obligatorio" |
| **Calle vacía** | Campo vacío al guardar | Borde rojo + "La calle es obligatoria" |
| **Dirección incompleta** | Calle sin ciudad o CP | Texto ámbar (no bloqueante) |
| **DNI/CIF inválido** | Formato incorrecto | ❌ rojo + mensaje del validador |
| **Vinculación** | `vincularA` definido | Banner azul info |
| **Fidelización** | Cuenta con loyalty activa | Banner verde info |

#### Flujo de guardado

```
1. Validar obligatorios (nombre + teléfono + calle)
   ├── ❌ Error → mostrar errores, scroll al primero
   └── ✅ OK ↓
2. Montar objeto: campos + addresses[] + stats.createdFrom
3. POST /api/clients/:userId
   ├── ❌ Error API → toast error, modal abierto
   └── ✅ OK ↓
4. ¿API devuelve duplicados?
   ├── SÍ → Banner → "Usar existente" | "Crear nuevo" | "Fusionar"
   └── NO ↓
5. onClientCreated(cliente) → vincularA → cerrar modal → toast ✓
```

#### Criterios de aceptación

- [ ] Se abre/cierra con animación suave
- [ ] Toggle particular/empresa cambia labels y validación
- [ ] Campos obligatorios (nombre, teléfono, calle) con error al guardar vacíos
- [ ] Validación teléfono: ≥ 9 dígitos, caracteres válidos
- [ ] Duplicados con debounce en teléfono, email, DNI/CIF
- [ ] Banner duplicado con datos + estadísticas + acciones
- [ ] Validación DNI/CIF con feedback en tiempo real
- [ ] Multi-dirección expandible
- [ ] `contexto` adapta header y botones
- [ ] `perfil` controla campos visibles (gerente vs trabajador)
- [ ] `initialData` pre-rellena campos
- [ ] `vincularA` muestra banner informativo
- [ ] Responsive: 1 col mobile, 2 col desktop
- [ ] Escape cierra, click fuera cierra, body scroll bloqueado
- [ ] Loading state en botón guardar
- [ ] Autocompletado dirección (Google Places)

---

### NC-08 — Frontend: Integrar en CRM (ClientsPage)

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** NC-07

#### Cambios requeridos

**Archivo: `src/app/pages/saas/ClientsPage.tsx`**

1. Importar `NuevoClienteModal`
2. Botón "Nuevo cliente" abre el modal con `contexto="crm"`
3. `onClientCreated`: añadir a la lista local + toast
4. En banner duplicado, "Fusionar" abre `DuplicatesMergeModal`

#### Criterios de aceptación

- [ ] Botón "Nuevo cliente" en CRM abre el modal
- [ ] Lista se actualiza sin recargar
- [ ] Gerente ve opción de fusionar
- [ ] Sin regresión en CRM existente

---

### NC-09 — Frontend: Integrar en TPV

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 2-3h  
**Dependencias:** NC-07

#### Cambios requeridos

**Archivo: `src/app/context/TpvContext.tsx`**

Añadir al ticket TPV:

```typescript
clientId?: string;
clientName?: string;
clientPhone?: string;
clientAddressId?: string;
// + acciones: setTicketClient, setTicketAddress
```

**Archivo: `src/app/pages/saas/TpvPage.tsx` / `TpvTab.tsx`**

Zona "Cliente" en el ticket:

```
┌─ TICKET TPV ────────────────────┐
│ Cliente: (ninguno)  [+ Nuevo]   │
│ ── o ──                         │
│ Cliente: Juan Pérez [✏ Cambiar] │
│ Dir: Calle Mayor 15  [▾]       │
└────────────────────────────────┘
```

Modal con `contexto="tpv"`, `perfil` según rol, `vincularA={{ tipo: 'venta' }}`.

**Archivos: `src/app/pages/saas/worker/WorkerTpv*.tsx`**

Verticales que necesitan cliente:

| Vertical | Necesita | Vertical | Necesita |
|----------|:--------:|----------|:--------:|
| Delivery | ✅ | Hotel | ✅ |
| Workshop | ✅ | Academy | ✅ |
| Vet | ✅ | Gym | ✅ |
| Sales | ✅ | Cleaning | ✅ |
| Clinic | ✅ | Scrapyard | ✅ |
| HairSalon | ✅ | CarWash | ⚠️ Opcional |
| Construction | ✅ | ButcherShop | ⚠️ Opcional |
| Lawyer | ✅ | Tobacco | ❌ |
| RealEstate | ✅ | Taxi | ❌ |
| Pharmacy | ⚠️ Opcional | Nightclub | ⚠️ Opcional |
| SpareParts | ⚠️ Opcional | | |

#### Criterios de aceptación

- [ ] Desde TPV se abre el modal de nuevo cliente
- [ ] Al crear, el cliente queda vinculado al ticket en `TpvContext`
- [ ] Zona "Cliente" en el ticket muestra nombre, teléfono, dirección
- [ ] Si tiene varias direcciones, selector ordenado por uso
- [ ] Verticales con ✅ tienen botón "Nuevo cliente"
- [ ] Flujo de venta no se interrumpe
- [ ] Trabajador ve formulario mínimo

---

### NC-10 — Frontend: Integrar en Pedidos, Presupuestos y Facturación

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 2-3h  
**Dependencias:** NC-07

#### Puntos de integración

| Flujo | Archivo | Contexto |
|-------|---------|----------|
| Pedidos web | `WebOrders.tsx` | `contexto="pedido"` |
| Delivery wizard | `ModalNuevoPedidoWizard.tsx` / `PedidosTabModalNuevo.tsx` | `contexto="pedido"`, `perfil="trabajador"` |
| Presupuestos | `Quotes.tsx` | `contexto="presupuesto"` |
| Facturación | `NewInvoiceModal.tsx` (o similar) | `contexto="factura"` |

#### Flujo de vinculación

```
1. "Nuevo pedido" → Paso "Seleccionar cliente"
   ┌──────────────────────────────┐
   │ 🔍 Buscar cliente...        │
   │ [+ Nuevo cliente rápido]     │
   └──────────────────────────────┘
2. Se abre NuevoClienteModal → contexto="pedido"
3. Usuario rellena y guarda
4. onClientCreated(nuevo):
   a) Asignar cliente al pedido
   b) Pre-seleccionar dirección principal como entrega
   c) Avanzar al siguiente paso
```

#### Deprecar modales antiguos

| Modal actual | Acción |
|---|---|
| `src-delivery/.../CrearClienteRapidoModal.tsx` | Deprecar → usar NuevoClienteModal |
| `src-delivery/.../AñadirClienteModal.tsx` | Deprecar → usar NuevoClienteModal |
| `src-delivery/.../NuevoPedidoClienteModal.tsx` | Evaluar integración parcial |

#### Criterios de aceptación

- [ ] Desde WebOrders se puede crear cliente sin salir del pedido
- [ ] Desde wizard delivery se puede crear cliente rápidamente
- [ ] Desde presupuestos se puede crear cliente
- [ ] Desde facturación se puede crear cliente
- [ ] Al crear, el cliente se vincula automáticamente al recurso
- [ ] Dirección del nuevo cliente pre-seleccionada como dirección de entrega
- [ ] `CrearClienteRapidoModal` y `AñadirClienteModal` deprecados
- [ ] Sin regresión en flujos de pedido existentes

---

### NC-11 — Frontend + Backend: Conexión con Fidelización

**Tipo:** Full-stack  
**Prioridad:** Media  
**Esfuerzo:** 2-3h  
**Dependencias:** NC-07, NC-01

#### Cambios requeridos

**Archivo: `services/couchdb.js` → `buildClientDocument`**

Añadir campo `loyalty`:

```js
loyalty: {
  enrolled: Boolean(data.loyalty?.enrolled ?? existing?.loyalty?.enrolled ?? false),
  enrolledAt: data.loyalty?.enrolledAt || existing?.loyalty?.enrolledAt || null,
  points: Number(data.loyalty?.points ?? existing?.loyalty?.points ?? 0),
  level: String(data.loyalty?.level || existing?.loyalty?.level || 'bronze'),
  totalVisits: Number(data.loyalty?.totalVisits ?? existing?.loyalty?.totalVisits ?? 0),
},
```

**Archivo: `controllers/clientsController.js` → `createClient`**

Tras crear, si la cuenta tiene fidelización activa, inscribir automáticamente con puntos de bienvenida.

**Archivo: `NuevoClienteModal.tsx`**

Si loyalty activa, mostrar badge: "Se inscribirá en el programa (+50 pts bienvenida)"

**Archivo: `SalonLoyalty.tsx`**

Conectar con datos reales: leer clientes con `loyalty.enrolled === true`.

#### Criterios de aceptación

- [ ] Al crear, inscripción automática si la cuenta tiene loyalty activa
- [ ] Puntos de bienvenida configurables
- [ ] Badge informativo en el modal
- [ ] `SalonLoyalty.tsx` muestra datos reales
- [ ] Sin inscripción ni badge si loyalty no está activa

---

### NC-12 — Frontend: Permisos y flujo por perfil (gerente vs trabajador)

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** NC-07

#### Flujo del Gerente

```
GERENTE puede:
├── Crear cliente completo (todos los campos)
├── Ver y buscar duplicados
├── Fusionar duplicados desde el banner
│   └── Abre DuplicatesMergeModal
├── Editar cliente existente
├── Asignar forma de pago, tipo empresa, datos fiscales
└── Gestionar múltiples direcciones
```

En el banner de duplicados, botón **"Fusionar duplicados"** (solo gerente):
- Cierra `NuevoClienteModal` temporalmente
- Abre `DuplicatesMergeModal` con el formulario actual y el duplicado
- Al fusionar: `onClientCreated(clienteFusionado)`

#### Flujo del Trabajador

```
TRABAJADOR puede:
├── Crear cliente rápido (nombre + teléfono + calle + observaciones)
├── Ver duplicados (no fusionar)
│   ├── "Usar este cliente" ✅
│   └── "Crear nuevo igualmente" ✅
└── Asignar cliente al pedido/venta en curso
```

#### Detección automática

```typescript
const MANAGER_ROLES = ['Admin', 'Gerente', 'Comercial', 'Administración'];
const effectivePerfil = perfil || (
  MANAGER_ROLES.includes(user?.role) ? 'gerente' : 'trabajador'
);
```

#### Criterios de aceptación

- [ ] Gerente ve todos los campos y opción fusionar
- [ ] Trabajador ve solo nombre, teléfono, calle, observaciones
- [ ] "Fusionar duplicados" solo para gerente
- [ ] Fusión abre `DuplicatesMergeModal` y devuelve resultado
- [ ] Si no se pasa `perfil`, se detecta automáticamente por rol
- [ ] Formulario trabajador visualmente más limpio y rápido

---

### NC-13 — Frontend: Integrar en Verticales sectoriales

**Tipo:** Frontend  
**Prioridad:** Media  
**Esfuerzo:** 2-3h  
**Dependencias:** NC-07

#### Puntos de integración

| Vertical | Archivo | Contexto |
|----------|---------|----------|
| Construcción | `ConstructionClients.tsx` | `vertical` |
| Abogacía | `LawyerClients.tsx` | `vertical` |
| Peluquería | `SalonClientHistory.tsx` | `vertical` |
| Veterinaria | `WorkerTpvVet.tsx` | `tpv` |
| Clínica | `WorkerTpvClinic.tsx` | `tpv` |
| Inmobiliaria | `WorkerTpvRealEstate.tsx` | `vertical` |
| Hotel | `WorkerTpvHotel.tsx` | `tpv` |
| Academia | `WorkerTpvAcademy.tsx` | `tpv` |
| Gimnasio | `WorkerTpvGym.tsx` | `tpv` |

#### Cambios por vertical

1. Importar `NuevoClienteModal`
2. Estado `showNuevoClienteModal`
3. Botón "Nuevo cliente" con contexto apropiado
4. `onClientCreated` integra al flujo de la vertical

#### Criterios de aceptación

- [ ] Cada vertical listada tiene acceso al modal
- [ ] Mismo componente en todas las verticales
- [ ] `onClientCreated` conecta al flujo propio
- [ ] Sin regresión en funcionalidad existente

---

## Orden de ejecución

```
Fase 1 — Cimientos backend (1-2 días)
├── NC-01  Modelo: defaultPaymentMethod + stats
├── NC-02  Validación teléfono + dirección
└── NC-03  Duplicados tiempo real

Fase 2 — Tipos + hooks (1 día)
├── NC-05  Interfaz TypeScript Client
└── NC-06  Hook useClientDuplicateSearch

Fase 3 — Modal core (2-3 días)
├── NC-07  NuevoClienteModal universal
└── NC-12  Permisos gerente vs trabajador

Fase 4 — Integraciones principales (2-3 días)
├── NC-08  CRM
├── NC-09  TPV
└── NC-10  Pedidos + Presupuestos + Facturación

Fase 5 — Inteligencia y expansión (2-3 días)
├── NC-04  Tracking estadísticas + direcciones
├── NC-11  Fidelización
└── NC-13  Verticales sectoriales
```

## Estimación total

| Ticket | Complejidad | Estimación |
|--------|:-----------:|:----------:|
| NC-01 Modelo datos | Baja | 1-2h |
| NC-02 Validación tel/dir | Baja-Media | 1-2h |
| NC-03 Duplicados RT | Baja-Media | 1-2h |
| NC-04 Tracking stats | Media | 2-3h |
| NC-05 Tipos TS | Baja | 30 min |
| NC-06 Hook duplicados | Media | 1-2h |
| NC-07 **Modal principal** | **Alta** | **5-7h** |
| NC-08 CRM | Baja-Media | 1-2h |
| NC-09 TPV | Media | 2-3h |
| NC-10 Pedidos/Presup/Fact | Media-Alta | 2-3h |
| NC-11 Fidelización | Media | 2-3h |
| NC-12 Perfiles | Media | 1-2h |
| NC-13 Verticales | Media | 2-3h |
| **Total** | | **~22-34h** |

---

## Notas técnicas

### Base de datos
Cambios en documento `type: 'client'` en BD `*-clients` de CouchDB. Sin migraciones: campos nuevos aparecen al crear/actualizar, los existentes devuelven defaults.

### Retrocompatibilidad
- Endpoints existentes mantienen interfaz (solo campos opcionales nuevos)
- `check-duplicates` mantiene modo `{ client }` + nuevo `{ field, value }`
- Modales antiguos se deprecan pero no se eliminan inmediatamente
- Interfaces TS con campos opcionales (`?`)

### Componentes reutilizados (sin cambios)
- `dniCifValidator.ts` → Validación DNI/NIE/CIF
- `ACCESO__AddressAutocomplete.tsx` → Autocompletado Google Places
- `DuplicatesMergeModal.tsx` → Fusión de duplicados (gerente)
- Componentes design-system (Button, Input, Select, Modal)

### Permisos
- **Gerente** (Admin, Gerente, Comercial, Administración): acceso completo + fusión
- **Trabajador** (Taller, Usuario, otros): formulario mínimo
- Requisito: permiso `clients: write` en el rol

### i18n
Textos en es, en, pt, fr. Claves bajo `nuevoClienteModal.*` en `i18n.ts`.
