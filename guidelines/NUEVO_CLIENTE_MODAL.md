# NUEVO CLIENTE — Modal Universal

**Tipo:** Modal / Acción  
**Invocable desde:** CRM, TPV, Pedidos, Presupuestos, Facturación, Verticales  
**Fecha:** 14 abril 2026  
**Estado:** Planificación  
**Tickets definitivos:** ver [`docs/tickets/NUEVO-CLIENTE-RAPIDO-TICKETS.md`](../docs/tickets/NUEVO-CLIENTE-RAPIDO-TICKETS.md)

---

## Análisis del estado actual

### Lo que YA existe

| Capa | Archivo | Qué hace | Limitaciones |
|------|---------|----------|--------------|
| **Backend — modelo** | `services/couchdb.js` → `buildClientDocument` | Construye doc CouchDB con 30+ campos (name, phone, email, dni, fiscalId, address…) | No tiene campo `defaultPaymentMethod` (forma de pago habitual) |
| **Backend — CRUD** | `controllers/clientsController.js` → `createClient` | Valida name + phone obligatorios, guarda doc, busca duplicados post-creación | No valida formato DNI/CIF en backend, no devuelve sugerencias en tiempo real |
| **Backend — duplicados** | `services/couchdb.js` → `findDuplicateClients` | Compara email, últimos 9 dígitos teléfono, DNI normalizado | Solo se ejecuta después de guardar, no hay endpoint de búsqueda en tiempo real por campo individual |
| **Backend — rutas** | `routers/clientsRouter.js` | CRUD completo + `check-duplicates` + merge + bulk | El endpoint `check-duplicates` existe pero recibe objeto completo, no búsqueda parcial |
| **Frontend — API** | `src/app/lib/crmApi.ts` → `createClientRequest` | POST a `/api/clients/:userId` | Devuelve duplicados pero el modal actual no los consume |
| **Frontend — modal delivery** | `src-delivery/.../CrearClienteRapidoModal.tsx` | Modal básico: nombre, email, teléfono, DNI, dirección, notas, portal | No integra validación DNI/CIF, no busca duplicados, no tiene forma de pago, no conecta con TPV/Verticales |
| **Frontend — validador** | `src/app/lib/dniCifValidator.ts` | Validación oficial DNI/NIE/CIF español con mensajes de error | Existe pero NO se usa en el modal de delivery |
| **Frontend — tipo TS** | `AppContext.tsx` → `interface Client` | Define tipo con name, phone, email, dni, address… | No incluye `clientType`, `fiscalId`, `legalName` ni `defaultPaymentMethod` |
| **Frontend — CRM principal** | `src/app/pages/saas/ClientsPage.tsx` | Página completa de clientes con formulario integrado | No es modal reutilizable, está acoplado a la página CRM |

### Lo que FALTA

1. **Campo `defaultPaymentMethod`** en el modelo de datos (backend + frontend)
2. **Modal unificado y reutilizable** que sirva para CRM, TPV, Verticales y Presupuestos
3. **Búsqueda de duplicados en tiempo real** (debounce al escribir teléfono, email o CIF)
4. **Validación DNI/CIF integrada** en el modal con feedback visual
5. **Callback de retorno al flujo** (`onClientCreated`) que devuelva el cliente al contexto que lo invocó
6. **Tipo TypeScript actualizado** con todos los campos necesarios

---

## TICKETS

---

### TICKET 1 — Backend: Añadir campo `defaultPaymentMethod` al modelo de cliente

**Prioridad:** Alta  
**Esfuerzo:** Bajo (30 min)  
**Módulo:** Backend → `services/couchdb.js`

#### Objetivo
Añadir el campo `defaultPaymentMethod` (forma de pago habitual) al documento de cliente en CouchDB para que el modal pueda recoger y persistir esta información.

#### Cambios requeridos

**Archivo: `services/couchdb.js`**

1. En `buildClientDocument` (~línea 2068, antes del `createdAt`), añadir:
```js
defaultPaymentMethod: String(data.defaultPaymentMethod || existing?.defaultPaymentMethod || '').trim(),
```

2. En `sanitizeClient` (~línea 2072), añadir al objeto retornado:
```js
defaultPaymentMethod: client.defaultPaymentMethod || '',
```

**Valores permitidos para `defaultPaymentMethod`:**
- `''` (vacío / sin definir)
- `'efectivo'`
- `'tarjeta'`
- `'transferencia'`
- `'domiciliacion'` (domiciliación bancaria)
- `'bizum'`
- `'cheque'`
- `'pagare'` (pagaré)
- `'confirming'`
- `'otro'`

#### Criterios de aceptación
- [ ] El campo se persiste correctamente en CouchDB al crear/actualizar cliente
- [ ] El campo se devuelve en `sanitizeClient` en todas las respuestas API
- [ ] Los clientes existentes sin este campo devuelven `''` (cadena vacía) sin errores
- [ ] No hay regresión en los endpoints existentes de clientes

---

### TICKET 2 — Frontend: Actualizar interfaz TypeScript `Client`

**Prioridad:** Alta  
**Esfuerzo:** Bajo (20 min)  
**Módulo:** Frontend → `src/app/context/AppContext.tsx`

#### Objetivo
Actualizar la interfaz `Client` para que incluya todos los campos que el modal necesita y que ya existen en backend pero no están tipados en frontend.

#### Cambios requeridos

**Archivo: `src/app/context/AppContext.tsx`**

Añadir los siguientes campos opcionales a la interfaz `Client` (después de `dni?`):

```typescript
clientType?: 'particular' | 'empresa';
legalName?: string;
fiscalId?: string;
fiscalAddress?: string;
fiscalCity?: string;
fiscalPostalCode?: string;
fiscalCountry?: string;
defaultPaymentMethod?: string;
contacts?: Array<{
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}>;
addresses?: Array<{
  id: string;
  label?: string;
  street: string;
  city?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}>;
socialLinks?: Array<{
  platform: string;
  url: string;
}>;
commercialStatus?: string;
referralCode?: string;
```

#### Criterios de aceptación
- [ ] La interfaz `Client` incluye `clientType`, `legalName`, `fiscalId`, `defaultPaymentMethod` y demás campos
- [ ] No hay errores de TypeScript en ningún componente que use `Client`
- [ ] Los campos son opcionales (`?`) para no romper código existente

---

### TICKET 3 — Frontend: Crear componente `NuevoClienteModal` universal

**Prioridad:** Crítica  
**Esfuerzo:** Alto (4-6h)  
**Módulo:** Frontend → `src/app/components/saas/NuevoClienteModal.tsx`

#### Objetivo
Crear un modal reutilizable y atractivo para dar de alta clientes desde cualquier punto de la aplicación (CRM, TPV, Verticales, Presupuestos), sin salir del flujo operativo.

#### Props del componente

```typescript
interface NuevoClienteModalProps {
  open: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  contexto?: 'crm' | 'tpv' | 'presupuesto' | 'pedido' | 'factura' | 'vertical';
  // Datos pre-rellenados (p.ej. si vienen de un lead o de un formulario parcial)
  initialData?: Partial<Client>;
  // Para vincular automáticamente al crear
  vincularA?: {
    tipo: 'presupuesto' | 'pedido' | 'venta' | 'factura';
    id?: string;
  };
}
```

#### Estructura visual del modal

```
┌─────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓ HEADER (gradiente verde) ▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  Nuevo Cliente           contexto: "para presupuesto"│
│  ─────────────────────────────────────────────────── │
│                                                       │
│  ┌─ TIPO DE CLIENTE ─────────────────────────────┐   │
│  │ [👤 Particular]    [🏢 Empresa]               │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ─── DATOS BÁSICOS (obligatorios) ───────────────    │
│                                                       │
│  Nombre / Razón social *     [________________________]│
│                                                       │
│  Teléfono *                  Email                    │
│  [📞 ___________________]    [📧 ___________________] │
│  ⚠️ "Ya existe: Juan Pérez"  (sugerencia duplicado)  │
│                                                       │
│  DNI/NIE / CIF               Forma de pago habitual  │
│  [📄 ___________________]    [💳 Seleccionar ▾ ]     │
│  ✅ "CIF válido"              Efectivo, Tarjeta...    │
│                                                       │
│  ─── DIRECCIÓN ──────────────────────────────────    │
│  [📍 _______________________________________________] │
│                                                       │
│  ─── OBSERVACIONES ──────────────────────────────    │
│  [📝 _______________________________________________] │
│  [   _______________________________________________] │
│                                                       │
│  ┌─ ALERTA DUPLICADO (condicional) ─────────────┐   │
│  │ ⚠️ Se encontró 1 cliente similar:             │   │
│  │    Juan Pérez — 666 123 456 — juan@email.com │   │
│  │    [Usar este cliente]  [Crear nuevo igualmente]│  │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ AVISO CONTEXTO (si aplica) ─────────────────┐   │
│  │ ✅ Se vinculará automáticamente al presupuesto│   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ─────────────────────────────────────────────────── │
│  [Cancelar]                    [Guardar cliente ✓]   │
│                    (si contexto) [Guardar y continuar]│
└─────────────────────────────────────────────────────┘
```

#### Campos del formulario

| Campo | Tipo | Obligatorio | Validación | Notas |
|-------|------|-------------|------------|-------|
| **Tipo de cliente** | Toggle `particular` / `empresa` | Sí (default: `particular`) | — | Cambia label nombre↔razón social y DNI↔CIF |
| **Nombre / Razón social** | `text` | Sí | `trim().length > 0` | Autofocus al abrir |
| **Teléfono** | `tel` | Sí | No vacío, búsqueda duplicados con debounce 500ms | Icono `Phone`, placeholder `+34 600 000 000` |
| **Email** | `email` | No | Formato email si se rellena, búsqueda duplicados debounce | Icono `Mail` |
| **DNI/NIE o CIF** | `text` | No | `dniCifValidator.ts` según tipo cliente | Feedback visual ✅/❌ en tiempo real |
| **Forma de pago habitual** | `select` | No | Valor de lista permitida | Opciones: Efectivo, Tarjeta, Transferencia, Domiciliación, Bizum, Cheque, Pagaré, Confirming, Otro |
| **Dirección** | `text` | No | — | Icono `MapPin`, campo libre |
| **Observaciones** | `textarea` | No | — | 3 líneas, resize vertical, nota "el cliente no verá esto" |

#### Comportamiento de búsqueda de duplicados

1. Al escribir en **teléfono** (debounce 500ms, mínimo 6 caracteres): llamar a `POST /api/clients/:userId/check-duplicates` con `{ client: { phone } }`
2. Al escribir en **email** (debounce 500ms, formato válido): llamar con `{ client: { email } }`
3. Al escribir en **DNI/CIF** (debounce 500ms, cuando pase validación): llamar con `{ client: { dni } }`
4. Si hay resultados, mostrar banner de alerta debajo del campo con opciones:
   - **"Usar este cliente"** → `onClientCreated(clienteExistente)` + cerrar modal
   - **"Crear nuevo igualmente"** → ocultar banner y seguir con el alta

#### Comportamiento de validación DNI/CIF

- Si `tipoCliente === 'particular'` → validar con `validateDniOrNie()` de `dniCifValidator.ts`
- Si `tipoCliente === 'empresa'` → validar con `validateCif()` de `dniCifValidator.ts`
- Mostrar icono ✅ verde si válido, ❌ rojo con mensaje de error si inválido
- La validación es informativa, NO bloquea el guardado (el campo es opcional)

#### Flujo de guardado

1. Validar campos obligatorios (nombre + teléfono)
2. Llamar a `createClientRequest(userId, clientData)` de `crmApi.ts`
3. Si la API devuelve duplicados en la respuesta:
   - Mostrar banner de duplicados con opciones
4. Si no hay duplicados o el usuario confirma crear nuevo:
   - Llamar a `onClientCreated(clienteCreado)` con el cliente devuelto por la API
   - Cerrar el modal
5. Si hay `vincularA`, la lógica de vinculación la gestiona el componente padre

#### Alertas visibles en el modal

| Alerta | Cuándo | Estilo |
|--------|--------|--------|
| **Cliente duplicado** | Duplicado encontrado por teléfono, email o DNI/CIF | Banner amarillo/ámbar con datos del cliente similar y acciones |
| **Teléfono vacío** | Campo teléfono está vacío y el usuario intenta guardar | Borde rojo + mensaje "El teléfono es obligatorio" |
| **CIF inválido** | Tipo empresa + CIF rellenado con formato incorrecto | Texto rojo bajo el campo con mensaje específico del validador |
| **DNI/NIE inválido** | Tipo particular + DNI rellenado con formato incorrecto | Texto rojo bajo el campo con mensaje específico del validador |
| **Nombre vacío** | Campo nombre vacío al intentar guardar | Borde rojo + mensaje "El nombre es obligatorio" |

#### Criterios de aceptación
- [ ] El modal se abre/cierra correctamente con animación suave
- [ ] Toggle particular/empresa cambia labels y validación dinámicamente
- [ ] Campos obligatorios (nombre, teléfono) muestran error al intentar guardar vacíos
- [ ] La búsqueda de duplicados funciona con debounce en teléfono, email y DNI/CIF
- [ ] El banner de duplicado muestra datos del cliente existente y permite usarlo directamente
- [ ] La validación DNI/CIF usa `dniCifValidator.ts` con feedback visual en tiempo real
- [ ] El selector de forma de pago muestra todas las opciones definidas
- [ ] `onClientCreated` se llama con el objeto `Client` completo (sea nuevo o existente)
- [ ] La prop `contexto` adapta textos del header y botones ("Guardar y crear presupuesto")
- [ ] La prop `initialData` pre-rellena campos (útil para conversión lead → cliente)
- [ ] La prop `vincularA` muestra aviso visual de lo que se va a vincular
- [ ] Responsive: funciona en desktop, tablet y móvil
- [ ] El modal bloquea scroll del fondo (`overflow-hidden` en body)
- [ ] `Escape` cierra el modal, click fuera cierra el modal
- [ ] Loading state en el botón guardar mientras la API responde

---

### TICKET 4 — Frontend: Hook `useClientDuplicateSearch` para búsqueda reactiva

**Prioridad:** Alta  
**Esfuerzo:** Medio (1-2h)  
**Módulo:** Frontend → `src/app/hooks/useClientDuplicateSearch.ts`

#### Objetivo
Crear un hook reutilizable que encapsule la lógica de búsqueda de duplicados con debounce, para que el modal y otros componentes puedan detectar clientes existentes en tiempo real.

#### Firma del hook

```typescript
interface DuplicateSearchResult {
  duplicates: Client[];
  isSearching: boolean;
  matchedField: 'phone' | 'email' | 'dni' | null;
  clearDuplicates: () => void;
}

function useClientDuplicateSearch(params: {
  userId: string;
  phone?: string;
  email?: string;
  dni?: string;
  enabled?: boolean;
  debounceMs?: number;
}): DuplicateSearchResult;
```

#### Comportamiento

1. Observa cambios en `phone`, `email` y `dni`
2. Aplica debounce configurable (default 500ms)
3. Solo dispara búsqueda si:
   - `enabled !== false`
   - `phone` tiene al menos 6 dígitos, O
   - `email` tiene formato válido (contiene `@` y `.`), O
   - `dni` tiene al menos 8 caracteres
4. Llama a `POST /api/clients/:userId/check-duplicates` con los datos
5. Devuelve array de duplicados encontrados + campo que matcheó
6. `clearDuplicates()` limpia el estado (útil tras confirmar "Crear nuevo igualmente")

#### Criterios de aceptación
- [ ] El hook hace debounce correcto (no dispara llamadas en cada keystroke)
- [ ] Solo busca cuando los campos tienen longitud mínima suficiente
- [ ] `isSearching` es `true` durante la petición HTTP
- [ ] `matchedField` indica por qué campo se encontró el duplicado
- [ ] `clearDuplicates` resetea el estado a vacío
- [ ] Si el componente se desmonta durante una búsqueda, no hay memory leak ni setState en unmounted
- [ ] Cancelación de peticiones previas si el usuario sigue escribiendo (AbortController)

---

### TICKET 5 — Frontend: Integrar `NuevoClienteModal` en CRM (ClientsPage)

**Prioridad:** Alta  
**Esfuerzo:** Medio (1-2h)  
**Módulo:** Frontend → `src/app/pages/saas/ClientsPage.tsx`

#### Objetivo
Reemplazar o complementar el formulario de alta de clientes actual en la página CRM con el nuevo `NuevoClienteModal` universal, manteniendo toda la funcionalidad existente.

#### Cambios requeridos

1. Importar `NuevoClienteModal` en `ClientsPage.tsx`
2. Añadir estado `showNuevoClienteModal` (boolean)
3. El botón "Nuevo cliente" / "Añadir cliente" existente abre el modal con `contexto="crm"`
4. En `onClientCreated`:
   - Añadir el cliente nuevo a la lista local
   - Opcionalmente navegar al detalle del cliente creado
   - Mostrar toast de confirmación

#### Criterios de aceptación
- [ ] El botón de crear cliente en CRM abre el `NuevoClienteModal`
- [ ] Al crear un cliente, la lista se actualiza sin recargar la página
- [ ] El modal se pasa `contexto="crm"` para adaptar textos
- [ ] No hay regresión en la funcionalidad existente del CRM

---

### TICKET 6 — Frontend: Integrar `NuevoClienteModal` en TPV

**Prioridad:** Alta  
**Esfuerzo:** Medio (1-2h)  
**Módulo:** Frontend → Páginas TPV (`TpvPage.tsx`, `WorkerTpv*.tsx`)

#### Objetivo
Permitir crear un cliente rápidamente desde el flujo TPV sin salir de la pantalla de venta.

#### Cambios requeridos

1. En las páginas/componentes TPV donde se selecciona cliente, añadir botón "Nuevo cliente" que abra `NuevoClienteModal` con `contexto="tpv"`
2. En `onClientCreated`:
   - Asignar automáticamente el cliente a la venta/ticket en curso
   - Actualizar el selector de clientes con el nuevo cliente
3. Si la venta ya tiene datos parciales, pasarlos como `vincularA={{ tipo: 'venta' }}`

#### Puntos de integración (archivos a modificar)

- `src/app/pages/saas/TpvPage.tsx` — si tiene selector de clientes
- `src/app/context/TpvContext.tsx` — si el cliente seleccionado se gestiona en contexto
- `src/app/pages/saas/worker/WorkerTpv*.tsx` — los TPV verticales que necesiten seleccionar cliente

#### Criterios de aceptación
- [ ] Desde cualquier TPV se puede abrir el modal de nuevo cliente
- [ ] Al crear, el cliente queda seleccionado automáticamente en la venta
- [ ] El flujo de venta no se interrumpe (el modal está por encima)
- [ ] `contexto="tpv"` muestra textos adaptados ("Guardar y volver a la venta")

---

### TICKET 7 — Frontend: Integrar `NuevoClienteModal` en Presupuestos

**Prioridad:** Alta  
**Esfuerzo:** Medio (1h)  
**Módulo:** Frontend → `src/app/pages/saas/Quotes.tsx` + `src-delivery/.../PresupuestosView.tsx`

#### Objetivo
Sustituir el modal `CrearClienteRapidoModal` de delivery por el nuevo `NuevoClienteModal` y añadir la misma capacidad en los presupuestos del módulo principal.

#### Cambios requeridos

**Módulo principal (`src/`):**
1. En `Quotes.tsx` (o el componente de creación de presupuesto), añadir botón "Nuevo cliente" junto al selector de clientes
2. Abrir `NuevoClienteModal` con `contexto="presupuesto"` y `vincularA={{ tipo: 'presupuesto' }}`
3. En `onClientCreated`: asignar el cliente al presupuesto en creación

**Módulo delivery (`src-delivery/`):**
1. En `CrearPresupuestoModal.tsx`, reemplazar la referencia a `CrearClienteRapidoModal` por `NuevoClienteModal`
2. Adaptar las props al nuevo componente
3. Marcar `CrearClienteRapidoModal.tsx` como deprecated (o eliminarlo si no tiene otros consumidores)

#### Criterios de aceptación
- [ ] Desde presupuestos (principal y delivery) se puede crear cliente sin salir del flujo
- [ ] El cliente creado se vincula automáticamente al presupuesto
- [ ] `contexto="presupuesto"` muestra "Guardar y continuar con presupuesto"
- [ ] El antiguo `CrearClienteRapidoModal` queda eliminado o marcado como deprecated

---

### TICKET 8 — Frontend: Integrar `NuevoClienteModal` en Verticales

**Prioridad:** Media  
**Esfuerzo:** Medio (2-3h)  
**Módulo:** Frontend → Páginas verticales sectoriales

#### Objetivo
Permitir alta rápida de clientes desde los flujos operativos de cada vertical (taller, veterinaria, construcción, etc.).

#### Puntos de integración

Las verticales que tienen gestión de clientes y necesitan el modal:

| Vertical | Archivo principal | Contexto |
|----------|-------------------|----------|
| Construcción | `ConstructionClients.tsx` | `contexto="vertical"` |
| Abogacía | `LawyerClients.tsx` | `contexto="vertical"` |
| Peluquería | `SalonClientHistory.tsx` | `contexto="vertical"` |
| Veterinaria | `WorkerTpvVet.tsx` | `contexto="tpv"` |
| Clínica | `WorkerTpvClinic.tsx` | `contexto="tpv"` |
| Farmacia | `WorkerTpvFarmacia.tsx` | `contexto="tpv"` |
| Inmobiliaria | `WorkerTpvInmobiliaria.tsx` | `contexto="vertical"` |

#### Cambios por cada vertical

1. Importar `NuevoClienteModal`
2. Añadir estado `showNuevoClienteModal`
3. Botón "Nuevo cliente" abre el modal con contexto apropiado
4. `onClientCreated` integra el cliente en el flujo de la vertical

#### Criterios de aceptación
- [ ] Cada vertical listada tiene acceso al modal de nuevo cliente
- [ ] El modal funciona igual en todas las verticales (mismo componente)
- [ ] Los textos se adaptan al contexto de cada vertical
- [ ] No hay regresión en la funcionalidad existente de ninguna vertical

---

### TICKET 9 — Frontend: Integrar `NuevoClienteModal` en Facturación

**Prioridad:** Media  
**Esfuerzo:** Bajo (1h)  
**Módulo:** Frontend → `src/app/pages/saas/Billing.tsx`, `NewInvoiceModal.tsx`

#### Objetivo
Permitir crear un cliente desde el flujo de creación de facturas.

#### Cambios requeridos

1. En `NewInvoiceModal.tsx` (o `InvoiceCreationModal.tsx`), junto al selector de cliente, añadir botón "Nuevo cliente"
2. Abrir `NuevoClienteModal` con `contexto="factura"` y `vincularA={{ tipo: 'factura' }}`
3. En `onClientCreated`: asignar el cliente a la factura en creación

#### Criterios de aceptación
- [ ] Desde la creación de factura se puede crear un cliente nuevo
- [ ] El cliente creado se selecciona automáticamente como destinatario de la factura
- [ ] `contexto="factura"` muestra "Guardar y continuar con factura"

---

### TICKET 10 — Backend: Optimizar endpoint de búsqueda de duplicados para tiempo real

**Prioridad:** Media  
**Esfuerzo:** Medio (1-2h)  
**Módulo:** Backend → `controllers/clientsController.js` + `services/couchdb.js`

#### Objetivo
Optimizar el endpoint `check-duplicates` para soportar búsquedas parciales rápidas desde el modal, sin necesidad de enviar el objeto cliente completo.

#### Cambios requeridos

**Archivo: `controllers/clientsController.js`**

Modificar `checkClientDuplicates` para aceptar búsqueda por campo individual:

```js
export async function checkClientDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { client, field, value } = req.body || {};
    
    // Modo 1: búsqueda por objeto completo (compatibilidad actual)
    if (client && typeof client === 'object') {
      const duplicates = await findDuplicateClients(req, userId, client);
      return res.json({ ok: true, duplicates });
    }
    
    // Modo 2: búsqueda por campo individual (nuevo, para modal)
    if (field && value) {
      const searchObj = { [field]: value };
      const duplicates = await findDuplicateClients(req, userId, searchObj);
      return res.json({ ok: true, duplicates, matchedField: field });
    }
    
    return badRequest(res, 'Falta client o field+value');
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
```

**Archivo: `src/app/lib/crmApi.ts`**

Añadir función para búsqueda por campo:

```typescript
export async function checkClientDuplicatesRequest(
  userId: string,
  field: 'phone' | 'email' | 'dni',
  value: string,
): Promise<{ duplicates: Client[]; matchedField: string }> {
  // POST /api/clients/:userId/check-duplicates
  // body: { field, value }
}
```

#### Criterios de aceptación
- [ ] El endpoint acepta tanto `{ client }` (modo actual) como `{ field, value }` (modo nuevo)
- [ ] La búsqueda por campo individual es rápida (< 200ms para bases de datos normales)
- [ ] Compatibilidad hacia atrás: el modo `{ client }` sigue funcionando igual
- [ ] La función `crmApi.ts` nueva está tipada y consume el endpoint correctamente
- [ ] `matchedField` se devuelve en la respuesta para que el frontend sepa qué campo matcheó

---

## Orden de implementación recomendado

```
TICKET 1  ─→  TICKET 2  ─→  TICKET 10  ─→  TICKET 4  ─→  TICKET 3
(backend)     (tipos TS)     (API duplic)    (hook)         (modal)
                                                               │
                                              ┌────────────────┼────────────────┐
                                              ▼                ▼                ▼
                                          TICKET 5         TICKET 6         TICKET 7
                                          (CRM)            (TPV)            (Presupuestos)
                                                               │
                                              ┌────────────────┼────────────────┐
                                              ▼                ▼                
                                          TICKET 8         TICKET 9
                                          (Verticales)     (Facturación)
```

**Fase 1 — Base (Tickets 1, 2, 10):** Preparar backend y tipos. Sin esto el modal no puede funcionar.  
**Fase 2 — Modal core (Tickets 4, 3):** El hook de duplicados y el componente principal. Es el corazón del feature.  
**Fase 3 — Integraciones (Tickets 5, 6, 7):** Conectar a los flujos principales (CRM, TPV, Presupuestos).  
**Fase 4 — Expansión (Tickets 8, 9):** Conectar a verticales y facturación.

---

## Resumen de archivos afectados

| Archivo | Acción | Ticket(s) |
|---------|--------|-----------|
| `services/couchdb.js` | Modificar (añadir campo) | 1 |
| `src/app/context/AppContext.tsx` | Modificar (ampliar interfaz) | 2 |
| `controllers/clientsController.js` | Modificar (optimizar duplicados) | 10 |
| `src/app/lib/crmApi.ts` | Modificar (añadir función) | 10 |
| `src/app/hooks/useClientDuplicateSearch.ts` | **Crear nuevo** | 4 |
| `src/app/components/saas/NuevoClienteModal.tsx` | **Crear nuevo** | 3 |
| `src/app/pages/saas/ClientsPage.tsx` | Modificar (integrar modal) | 5 |
| `src/app/pages/saas/TpvPage.tsx` | Modificar (integrar modal) | 6 |
| `src/app/context/TpvContext.tsx` | Posiblemente modificar | 6 |
| `src/app/pages/saas/worker/WorkerTpv*.tsx` | Modificar (varios) | 6, 8 |
| `src/app/pages/saas/Quotes.tsx` | Modificar (integrar modal) | 7 |
| `src-delivery/.../PresupuestosView.tsx` | Modificar (reemplazar modal viejo) | 7 |
| `src-delivery/.../CrearClienteRapidoModal.tsx` | Deprecated / Eliminar | 7 |
| Archivos verticales (`Construction*`, `Lawyer*`, etc.) | Modificar (integrar modal) | 8 |
| `src/app/pages/saas/Billing.tsx` o `NewInvoiceModal.tsx` | Modificar (integrar modal) | 9 |
| `src/app/lib/dniCifValidator.ts` | Sin cambios (se reutiliza tal cual) | 3 |
