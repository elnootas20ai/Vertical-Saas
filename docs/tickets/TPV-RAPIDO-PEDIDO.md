# TPV RAPIDO DE PEDIDO - Plan de Tickets

**Pagina:** `/saas/vertical/delivery/tpv`
**Sidebar:** Grupo "Delivery" -> item "TPV Rapido"
**Objetivo:** Crear pedidos en segundos desde mostrador o telefono.
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

~85% implementado. Backend completo: modelo cliente (`defaultPaymentMethod`, `phonePrefix`, `addresses` en `couchdb.js`), búsqueda por teléfono (`searchClientsByPhone` + `clientsRouter`), hook `useClientPhoneSearch` y `PhonePrefixSelector` existen y funcionan. La página `TpvRapidoPage.tsx` está creada y en producción (ruta `/saas/vertical/delivery/tpv`). Desviaciones: la búsqueda usa debounce 400ms/mín. 2 caracteres y también busca por nombre (más amplio que lo especificado); el backend corta en <2 dígitos, no <3. Falta: verificación de rendimiento <200ms y navegación por teclado (flechas) en el selector de prefijos.

---

## Auditoria de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo | Limitaciones |
|---|---|---|---|
| **CreateOrderModal (wizard 5 pasos)** | Completo | `Delivery.tsx` -> `CreateOrderModal` (lineas 169-683) | Es un modal dentro de Delivery, no pagina independiente. No busca clientes en CRM. No empieza por telefono con busqueda real-time. No carga datos de cliente existente |
| **API CRUD pedidos delivery** | Completo | `deliveryApi.ts` -> `create/list/update/deleteDeliveryOrderRequest` | Funcional. Tipos `DeliveryOrder`, `DeliveryOrderItem`, `DeliveryStageEvent` definidos |
| **API clientes (CRM)** | Completo | `crmApi.ts` -> `createClientRequest`, `listClientsRequest` + `clientsRouter.js` | CRUD completo + check-duplicates + merge + bulk. No hay endpoint busqueda real-time por telefono parcial |
| **Interfaz Client (TS)** | Parcial | `AppContext.tsx` -> `interface Client` | Tiene name, phone, email, dni, address, city, postalCode, notes, tags. Falta: `defaultPaymentMethod`, `addresses[]`, `phonePrefix` |
| **Interfaz DeliveryOrder (TS)** | Completo | `deliveryApi.ts` -> `interface DeliveryOrder` | Tiene customerName, customerPhone, customerAddress (string plano), items, totalAmount, status, stageHistory |
| **Catalogo delivery** | Completo | `deliveryApi.ts` -> `listCatalogItemsRequest` + `DeliveryCatalog.tsx` | Funcional con categorias, imagen, precio, stock activo/inactivo |
| **TpvContext (carrito)** | Parcial | `TpvContext.tsx` | Solo carrito en memoria. Sin persistencia, sin cliente, sin pedido, sin tipo de entrega |
| **Metodos de pago** | Parcial | `Delivery.tsx` -> `PAYMENT_METHOD_CONFIG` | Efectivo, Tarjeta, Bizum, Otros. Sin UI de cambio para efectivo |
| **Sidebar delivery** | Completo | `Sidebar.tsx` -> grupo `delivery` | Items: tpv, tpv-locales, delivery, delivery-catalog, web-orders, web-config. Falta item TPV Rapido |
| **Permisos equipo** | Parcial | `couchdb.js` -> `TEAM_PERMISSION_KEYS` | No existe permiso `delivery` |
| **Busqueda duplicados** | Parcial | `clientsController.js` -> `checkClientDuplicates` | Recibe objeto completo, no busqueda parcial por telefono |
| **Worker TPV Delivery** | Completo | `WorkerTpvDelivery.tsx` | Solo seguimiento y avance de estados. No crea pedidos |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Pagina dedicada `/saas/vertical/delivery/tpv` | No existe |
| Busqueda de cliente por telefono en tiempo real | No existe |
| Selector de prefijo telefonico (+34 default) | No existe |
| Autocarga de datos del cliente existente | No existe |
| Flujo obligatorio de alta de cliente si no existe | No existe |
| Recuperacion de direcciones previas del cliente | No existe |
| Campo `defaultPaymentMethod` en cliente | No existe en modelo |
| Campo `addresses[]` multiples en cliente | No existe (solo `address` string) |
| Endpoint busqueda rapida por telefono parcial | No existe |
| Vista estilo chat/mensajeria para busqueda | No existe |
| Alertas contextuales integradas | No existen |
| Permisos TPV rapido (gerente vs trabajador) | No existen |
| Conexiones CRM-Pedidos-Caja-Cocina-Finanzas | Parciales |

---

## Tickets

---

### TPV-01 -- Backend: Campos `defaultPaymentMethod` y `addresses` en modelo cliente

**Tipo:** Backend | **Prioridad:** Critica | **Esfuerzo:** Bajo (45 min) | **Dep:** Ninguna

#### Contexto
El TPV necesita cargar forma de pago habitual y direcciones previas del cliente. El modelo actual solo tiene `address` (string plano) y no tiene `defaultPaymentMethod` ni array de direcciones.

#### Que hacer

**`services/couchdb.js` -> `buildClientDocument`:** Anadir antes de `createdAt`:
```js
defaultPaymentMethod: String(data.defaultPaymentMethod || existing?.defaultPaymentMethod || '').trim(),
phonePrefix: String(data.phonePrefix || existing?.phonePrefix || '+34').trim(),
addresses: Array.isArray(data.addresses) ? data.addresses : (existing?.addresses || []),
```

**`services/couchdb.js` -> `sanitizeClient`:** Anadir al objeto retornado:
```js
defaultPaymentMethod: client.defaultPaymentMethod || '',
phonePrefix: client.phonePrefix || '+34',
addresses: Array.isArray(client.addresses) ? client.addresses : [],
```

**Estructura de cada direccion:**
```js
{ id: String, label: String, street: String, city: String, postalCode: String,
  notes: String, isDefault: Boolean, lastUsedAt: String }
```

**Valores `defaultPaymentMethod`:** `''`, `'efectivo'`, `'tarjeta'`, `'bizum'`, `'otros'`

#### Criterios de aceptacion
- [x] `defaultPaymentMethod` se persiste y devuelve en todas las respuestas
- [x] `phonePrefix` se persiste y devuelve (default `'+34'`)
- [x] `addresses` se persiste como array y devuelve en todas las respuestas
- [x] Clientes existentes sin estos campos devuelven valores por defecto sin error
- [x] El campo `address` (string original) sigue funcionando
- [ ] Sin regresion en endpoints existentes (no verificado con tests)

---

### TPV-02 -- Frontend: Actualizar interfaces TypeScript Client y DeliveryOrder

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Bajo (20 min) | **Dep:** TPV-01

#### Que hacer

**`AppContext.tsx` -> `interface Client`:** Anadir despues de `dni?`:
```typescript
phonePrefix?: string;
defaultPaymentMethod?: '' | 'efectivo' | 'tarjeta' | 'bizum' | 'otros';
addresses?: Array<{
  id: string; label: string; street: string; city?: string;
  postalCode?: string; notes?: string; isDefault?: boolean; lastUsedAt?: string;
}>;
```

**`deliveryApi.ts` -> `interface DeliveryOrder`:** Anadir despues de `customerAddress`:
```typescript
paymentMethod?: 'efectivo' | 'tarjeta' | 'bizum' | 'otros';
clientId?: string;
orderType?: 'domicilio' | 'recogida';
deliveryAddressId?: string;
```

#### Criterios de aceptacion
- [x] Interfaces incluyen todos los campos nuevos como opcionales (`orderType` se implementó como `deliveryType`)
- [ ] Sin errores TypeScript en componentes existentes (no verificado con typecheck)

---

### TPV-03 -- Backend: Endpoint busqueda rapida de clientes por telefono parcial

**Tipo:** Backend + API Client | **Prioridad:** Critica | **Esfuerzo:** Medio (2h) | **Dep:** TPV-01

#### Contexto
El TPV necesita buscar clientes mientras el operador escribe el telefono. El endpoint `check-duplicates` actual no sirve para busqueda parcial rapida.

#### Que hacer

**1. Nuevo endpoint:** `GET /api/clients/:userId/search-by-phone?q=666&limit=5`

**2. Controlador (`clientsController.js`):**
```js
export async function searchClientsByPhone(req, res) {
  const { userId } = req.params;
  const { q, limit = 5 } = req.query;
  if (!q || q.replace(/\D/g, '').length < 3) return res.json({ ok: true, clients: [] });
  const digits = q.replace(/\D/g, '');
  // Buscar en CouchDB clientes cuyo telefono contenga los digitos
  // Devolver: id, name, phone, phonePrefix, address, addresses, defaultPaymentMethod, notes
  // Ordenar: exacta primero, luego parcial
}
```

**3. Nueva funcion (`crmApi.ts`):**
```typescript
export async function searchClientsByPhoneRequest(
  userId: string, query: string, limit?: number
): Promise<Client[]>
```

**4. Vista CouchDB (recomendado):** `clients/by-phone-digits` para busquedas rapidas.

#### Criterios de aceptacion
- [ ] Responde en < 200ms para hasta 10.000 clientes (escaneo en memoria, sin vista CouchDB; no medido)
- [x] Busca por fragmento (minimo 3 digitos), ignora espacios/guiones/prefijo
- [x] Devuelve maximo `limit` resultados con datos completos del cliente
- [ ] Si `q` < 3 digitos, devuelve array vacio (el backend corta en < 2 caracteres, no < 3)

---

### TPV-04 -- Frontend: Hook `useClientPhoneSearch`

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Medio (1.5h) | **Dep:** TPV-03

#### Firma
```typescript
interface ClientPhoneSearchResult {
  results: Client[]; isSearching: boolean; selectedClient: Client | null;
  selectClient: (client: Client) => void; clearSelection: () => void; clearResults: () => void;
}
function useClientPhoneSearch(params: {
  userId: string; phone: string; enabled?: boolean;
  debounceMs?: number; minDigits?: number;
}): ClientPhoneSearchResult;
```

#### Comportamiento
1. Observa `phone`, extrae digitos, aplica debounce 300ms
2. Solo busca si hay >= `minDigits` (default 3) digitos
3. Cancela peticiones previas con `AbortController`
4. `selectClient` guarda cliente completo y limpia resultados

#### Criterios de aceptacion
- [x] Debounce correcto, no dispara en cada keystroke
- [x] `AbortController` cancela peticiones anteriores
- [x] Sin memory leak al desmontar
- [x] `selectClient` almacena cliente completo con direcciones y forma de pago

---

### TPV-05 -- Frontend: Componente `PhonePrefixSelector`

**Tipo:** Frontend | **Prioridad:** Alta | **Esfuerzo:** Bajo (1h) | **Dep:** Ninguna

#### Props
```typescript
interface PhonePrefixSelectorProps {
  value: string; onChange: (prefix: string) => void;
  className?: string; compact?: boolean;
}
```

#### Prefijos (prioridad Espana)
+34 Espana (default), +33 Francia, +351 Portugal, +44 Reino Unido, +49 Alemania, +39 Italia, +212 Marruecos, +40 Rumania, +57 Colombia, +593 Ecuador, +54 Argentina, +52 Mexico, +51 Peru, +1 Estados Unidos

#### Criterios de aceptacion
- [x] +34 default y primero en lista
- [x] Dropdown con banderas emoji, prefijo y nombre
- [x] Buscador interno por nombre o prefijo
- [x] Cierre: seleccionar, clic fuera, Escape
- [x] Modo compact (bandera + prefijo inline)
- [ ] Responsive, dark mode, navegacion teclado (dark mode si; falta navegacion con flechas)
