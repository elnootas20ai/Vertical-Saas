# PAGOS A GREMIOS Y SUBCONTRATAS — Plan de Tickets

**Página:** `/saas/vertical/construccion/pagos`
**URL pública:** `https://udaredge.com/saas/vertical/construccion/pagos`
**Objetivo:** Controlar pagos internos de la obra y reparto económico por gremio o proveedor. Saber en todo momento cuánto se ha pagado, cuánto queda pendiente, si hay justificantes y si el margen real de cada obra sigue siendo rentable.
**Tipo:** Módulo dentro de la vertical Construcción.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de gremios (`construction_guild`) con nombre, tipo, contacto, precios desglosados (materiales, mano obra, estructural) | Completo | `constructionRouter.js` → `constructionController.js` — tipo `construction_guild` (`cgld-*`) |
| Catálogo de gremios fijo: carpintería, peletería, lampistería, pradurista, yesero, pintor, herrero, electricista, fontanero, albañil, otro | Completo | `couchdb.js` → `CONSTRUCTION_GUILDS` |
| CRUD de obras (`construction_project`) con estado, progreso, cliente, presupuesto vinculado | Completo | `constructionRouter.js` — tipo `construction_project` (`cprj-*`) |
| Presupuestos (`construction_budget`) con partidas por gremio, margen %, pagos de cliente (contado/plazos), totalPagado, pendientePago | Completo | `constructionRouter.js` — tipo `construction_budget` (`cbud-*`) |
| `registerPayment` en presupuestos: marca un plazo del CLIENTE como pagado | Completo | `constructionController.js` → `registerPayment()` — solo pagos de cliente hacia la empresa |
| Proveedores genéricos (`supplier`) con CRUD en delivery | Completo | `deliveryRouter.js` → tipo `supplier` |
| Facturas de proveedor (`supplier_invoice`) con CRUD, approve/reject, link-finance, stats | Completo | `supplierInvoiceRouter.js` → `supplierInvoiceController.js` |
| OCR de facturas/documentos con OpenAI Vision → JSON estructurado | Completo | `POST /api/ocr/scan` en `index.js` — extrae datos de facturas y sugiere movimiento financiero |
| Módulo de finanzas: movimientos cobro/pago, cuentas bancarias, conciliación, impuestos | Completo | `financeRouter.js`, `financeController.js` — DB `pay` |
| Motor de alertas con emisión global, dedup, roles, canales (in-app, SSE, push) | Completo | `alertEngine.js` + `alertEmitter.js` — **no integra construcción** |
| SSE global: `broadcastToUser` / `broadcastToBusiness` | Completo | `sseService.js` |
| Sistema de documentos (`document`) con CRUD | Completo | `documentsRouter.js` → `documentsController.js` |
| Dashboard de construcción (esqueleto sin KPIs reales) | Parcial | `ConstructionDashboard.tsx` |
| Roles gerente/trabajador en fichas de equipo y fichajes | Completo | `clockinsController.js` — `ADMIN_ROLES` |
| Centro Operativo Construcción planificado (CO-04 incluye `totalPagadoProveedores`, `totalPendientePago`, `margenEstimadoGlobal`) | Ticket pendiente | `docs/tickets/CONSTRUCCION-OPS-CENTER.md` |
| Sidebar grupo Construcción | Completo | `Sidebar.tsx` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| **Entidad `construction_payment` (línea de pago interno a gremio/proveedor/gasto)** | No existe |
| **Entidad `construction_payment_installment` (pago parcial dentro de una línea)** | No existe |
| API REST para líneas de pago interno (CRUD + registrar pago parcial + vincular justificante) | No existe |
| Reparto de importes por fases o hitos dentro de una línea de pago | No existe |
| Página `/saas/vertical/construccion/pagos` con listado y detalle | No existe |
| Vista filtrada de pagos internos por obra | No existe |
| Automatización: restar pendiente al registrar pago parcial | No existe |
| Automatización: actualizar coste acumulado de la obra al pagar | No existe |
| Automatización: recalcular margen real de la obra vs presupuesto | No existe |
| Automatización: vincular justificantes y facturas OCR al pago | No existe |
| Alerta: pago próximo (fecha prevista en los próximos 7 días) | No existe |
| Alerta: pago vencido (fecha prevista pasada sin pagar) | No existe |
| Alerta: pago sin justificante (pagado pero sin documento adjunto) | No existe |
| Alerta: coste total de la obra superando lo presupuestado | No existe |
| Alerta: margen bajo de la obra (< umbral configurable) | No existe |
| Campos `costeAcumulado`, `margenReal`, `margenPrevisto` en `construction_project` | No existen |
| Conexión pagos internos → finanzas (movimiento de gasto automático) | No existe |
| Conexión pagos internos → facturas proveedor (vincular factura existente) | No existe |
| Conexión pagos internos → OCR (escanear justificante y prellenar datos) | No existe |
| Diferenciación gerente/trabajador en página de pagos | No existe |
| Sidebar: item `construction-payments` en grupo Construcción | No existe |

---

## Tickets

---

### PG-01 — Modelo de datos: Línea de pago interno

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

El sistema actual solo gestiona pagos del CLIENTE hacia la empresa (plazos del presupuesto en `construction_budget.pagos[]`). No existe ninguna entidad para registrar pagos de la empresa hacia gremios, proveedores o gastos generales de obra. Cada línea de pago interno representa un compromiso económico con un tercero: un gremio que ejecuta albañilería, un proveedor que suministra material, un gasto de licencias o alquileres de maquinaria, etc.

Necesitamos `construction_payment` como documento de primer nivel en la DB `*-construction`, con su propio ciclo de vida y la capacidad de registrar pagos parciales (un gremio puede cobrar por fases o hitos).

#### Qué hacer

**1. Definir builder en `services/couchdb.js` (sección CONSTRUCTION)**

```javascript
const PAYMENT_LINE_TYPES = ['gremio', 'proveedor', 'gasto_general'];
const PAYMENT_LINE_STATUSES = ['pendiente', 'parcial', 'pagado', 'anulado'];

export function buildConstructionPaymentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cpay-${uuidv4()}`;
  const ref = existing?.referencia || `PAG-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const pagos = Array.isArray(data.pagos) ? data.pagos.map((p, i) => ({
    id: p.id || `inst-${uuidv4()}`,
    concepto: String(p.concepto || ''),
    importe: Number(p.importe ?? 0),
    fecha: String(p.fecha || ''),
    pagado: Boolean(p.pagado),
    fechaPago: String(p.fechaPago || ''),
    metodoPago: String(p.metodoPago || ''),
    justificanteUrl: String(p.justificanteUrl || ''),
    justificanteBase64: String(p.justificanteBase64 || ''),
    justificanteMimeType: String(p.justificanteMimeType || ''),
    justificanteNombre: String(p.justificanteNombre || ''),
    facturaProveedorId: String(p.facturaProveedorId || ''),
    ocrData: p.ocrData || null,
    notas: String(p.notas || ''),
  })) : (existing?.pagos || []);

  const totalPagado = pagos.filter(p => p.pagado).reduce((s, p) => s + p.importe, 0);
  const importePactado = Number(data.importePactado ?? existing?.importePactado ?? 0);
  const pendiente = Math.max(0, importePactado - totalPagado);

  const fases = Array.isArray(data.fases) ? data.fases.map((f, i) => ({
    id: f.id || i + 1,
    nombre: String(f.nombre || ''),
    importe: Number(f.importe ?? 0),
    porcentaje: Number(f.porcentaje ?? 0),
    completada: Boolean(f.completada),
    fechaPrevista: String(f.fechaPrevista || ''),
  })) : (existing?.fases || []);

  let estado;
  if (data.estado === 'anulado' || existing?.estado === 'anulado') {
    estado = 'anulado';
  } else if (totalPagado === 0) {
    estado = 'pendiente';
  } else if (totalPagado >= importePactado) {
    estado = 'pagado';
  } else {
    estado = 'parcial';
  }

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_payment',
    id,
    user_id: userId,

    referencia: ref,
    nombre: String(data.nombre || existing?.nombre || ''),
    tipo: PAYMENT_LINE_TYPES.includes(String(data.tipo))
      ? String(data.tipo) : (existing?.tipo || 'gremio'),

    obraId: String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),

    gremioId: String(data.gremioId || existing?.gremioId || ''),
    gremioNombre: String(data.gremioNombre || existing?.gremioNombre || ''),
    gremioTipo: String(data.gremioTipo || existing?.gremioTipo || ''),

    proveedorId: String(data.proveedorId || existing?.proveedorId || ''),
    proveedorNombre: String(data.proveedorNombre || existing?.proveedorNombre || ''),

    presupuestoId: String(data.presupuestoId || existing?.presupuestoId || ''),

    importePactado,
    totalPagado,
    pendiente,
    estado,

    fechaPrevista: String(data.fechaPrevista || existing?.fechaPrevista || ''),

    fases,
    pagos,

    documentoUrl: String(data.documentoUrl || existing?.documentoUrl || ''),
    documentoBase64: String(data.documentoBase64 || existing?.documentoBase64 || ''),
    documentoMimeType: String(data.documentoMimeType || existing?.documentoMimeType || ''),
    documentoNombre: String(data.documentoNombre || existing?.documentoNombre || ''),

    observaciones: String(data.observaciones || existing?.observaciones || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Crear `sanitizeConstructionPayment` junto al builder** con los mismos campos y defaults seguros (sin base64 en listados).

**3. Exportar constantes**

```javascript
export { PAYMENT_LINE_TYPES, PAYMENT_LINE_STATUSES };
```

**4. Añadir tipo TypeScript en `src/app/lib/constructionApi.ts`**

```typescript
export interface PaymentInstallment {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  pagado: boolean;
  fechaPago: string;
  metodoPago: string;
  justificanteUrl: string;
  justificanteBase64: string;
  justificanteMimeType: string;
  justificanteNombre: string;
  facturaProveedorId: string;
  ocrData: Record<string, unknown> | null;
  notas: string;
}

export interface PaymentPhase {
  id: number | string;
  nombre: string;
  importe: number;
  porcentaje: number;
  completada: boolean;
  fechaPrevista: string;
}

export interface ConstructionPayment {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;

  referencia: string;
  nombre: string;
  tipo: 'gremio' | 'proveedor' | 'gasto_general';

  obraId: string;
  obraNombre: string;

  gremioId: string;
  gremioNombre: string;
  gremioTipo: string;

  proveedorId: string;
  proveedorNombre: string;

  presupuestoId: string;

  importePactado: number;
  totalPagado: number;
  pendiente: number;
  estado: 'pendiente' | 'parcial' | 'pagado' | 'anulado';

  fechaPrevista: string;

  fases: PaymentPhase[];
  pagos: PaymentInstallment[];

  documentoUrl: string;
  documentoNombre: string;

  observaciones: string;

  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento en CouchDB con `type: 'construction_payment'` y prefijo `cpay-`
- [ ] `referencia` auto-generada (`PAG-XXXXXX`)
- [ ] Tres tipos: `gremio`, `proveedor`, `gasto_general`
- [ ] Array `pagos[]` con pagos parciales, cada uno con justificante opcional y vínculo a factura proveedor
- [ ] Array `fases[]` para repartir el importe por fases/hitos
- [ ] `estado` se calcula automáticamente: `pendiente` (0 pagado), `parcial` (algo pagado), `pagado` (todo pagado), `anulado` (manual)
- [ ] `totalPagado` y `pendiente` se recalculan siempre a partir de `pagos[]`
- [ ] Vínculo a obra (`obraId`), gremio (`gremioId`), proveedor (`proveedorId`), presupuesto (`presupuestoId`)
- [ ] Tipo TS completo exportado desde `constructionApi.ts`

---

### PG-02 — Campos de coste y margen en Obra

**Tipo:** Backend (CouchDB)
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto

El modelo `construction_project` actual no tiene campos para acumular costes internos ni calcular el margen real. Solo tiene `progreso` (0-100). Para que las automatizaciones y alertas funcionen, necesitamos ampliar el proyecto con campos financieros que se actualizarán automáticamente al registrar pagos.

El **margen previsto** se calcula desde el presupuesto aceptado (totalConMargen − totalPartidas). El **margen real** se calcula en tiempo real como: lo cobrado al cliente − lo pagado a gremios/proveedores.

#### Qué hacer

**1. Ampliar `buildConstructionProjectDocument` en `couchdb.js`**

Añadir estos campos al return del builder:

```javascript
presupuestoTotal: Number(data.presupuestoTotal ?? existing?.presupuestoTotal ?? 0),
costePresupuestado: Number(data.costePresupuestado ?? existing?.costePresupuestado ?? 0),
margenPrevisto: Number(data.margenPrevisto ?? existing?.margenPrevisto ?? 0),
margenPrevistoPorc: Number(data.margenPrevistoPorc ?? existing?.margenPrevistoPorc ?? 0),

costeAcumulado: Number(data.costeAcumulado ?? existing?.costeAcumulado ?? 0),
cobradoCliente: Number(data.cobradoCliente ?? existing?.cobradoCliente ?? 0),
margenReal: Number(data.margenReal ?? existing?.margenReal ?? 0),
margenRealPorc: Number(data.margenRealPorc ?? existing?.margenRealPorc ?? 0),

totalLineasPago: Number(data.totalLineasPago ?? existing?.totalLineasPago ?? 0),
totalPagadoInterno: Number(data.totalPagadoInterno ?? existing?.totalPagadoInterno ?? 0),
totalPendienteInterno: Number(data.totalPendienteInterno ?? existing?.totalPendienteInterno ?? 0),
```

**2. Ampliar `sanitizeConstructionProject`** con los mismos campos.

**3. Ampliar tipo TS `ConstructionProject`** en `constructionApi.ts`.

#### Criterios de aceptación

- [ ] `presupuestoTotal` y `costePresupuestado` almacenan los valores del presupuesto aceptado
- [ ] `margenPrevisto` = `presupuestoTotal − costePresupuestado`
- [ ] `margenPrevistoPorc` = `(margenPrevisto / presupuestoTotal) × 100`
- [ ] `costeAcumulado` se actualiza automáticamente desde los pagos internos (PG-06)
- [ ] `cobradoCliente` se actualiza desde los pagos del presupuesto
- [ ] `margenReal` = `cobradoCliente − costeAcumulado`
- [ ] `margenRealPorc` = `(margenReal / cobradoCliente) × 100` (si cobradoCliente > 0)
- [ ] `totalLineasPago`, `totalPagadoInterno`, `totalPendienteInterno` reflejan estado de pagos internos
- [ ] Campos retrocompatibles (default 0, CouchDB no requiere migración)

---

### PG-03 — API REST: CRUD de líneas de pago

**Tipo:** Backend (Router + Controller)
**Prioridad:** Crítica
**Dependencias:** PG-01

#### Contexto

Necesitamos endpoints REST bajo `/api/construction/payments/:userId` siguiendo el mismo patrón que `projects`, `workers` y `budgets`. Filtros por obra, tipo y estado son esenciales para las vistas de gerente.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listPayments(req, res)` | Leer todos los docs `type === 'construction_payment'` del usuario. Soportar `query.projectId`, `query.tipo`, `query.estado`, `query.guildId`, `query.supplierId`. Devolver `{ ok: true, payments: [...] }` |
| `createPayment(req, res)` | `buildConstructionPaymentDocument(userId, req.body.payment)`. Log de actividad `"Creó línea de pago {nombre} para {obraNombre}"`. Devolver `{ ok: true, payment }` |
| `updatePayment(req, res)` | Obtener existente, merge con builder. Recalcular `totalPagado`, `pendiente`, `estado`. Devolver `{ ok: true, payment }` |
| `removePayment(req, res)` | Solo si `estado !== 'pagado'`. Si tiene pagos parciales registrados, devolver 403 con mensaje `"No se puede eliminar una línea con pagos registrados. Anúlela en su lugar."` |

**2. Endpoints especiales**

| Función | Endpoint | Lógica |
|---|---|---|
| `registerInstallment` | `POST .../payments/:userId/:id/pay` | Recibe `{ installment: PaymentInstallment }`. Push al array `pagos[]`. Recalcular totales. Disparar automatizaciones (PG-06). Log `"Registró pago de {importe}€ en {nombre}"`. |
| `cancelPaymentLine` | `POST .../payments/:userId/:id/cancel` | Cambiar `estado` a `anulado`. No eliminar — conservar histórico. Log `"Anuló línea de pago {nombre}"`. |
| `linkReceipt` | `POST .../payments/:userId/:id/installments/:installmentId/receipt` | Recibe `{ justificanteUrl, justificanteBase64, justificanteMimeType, justificanteNombre, facturaProveedorId, ocrData }`. Actualizar el pago parcial específico dentro de `pagos[]`. |
| `getPaymentsByProject` | `GET .../payments/:userId/by-project/:projectId` | Atajo para listar pagos de una obra con resumen: totalPactado, totalPagado, totalPendiente, desglose por tipo. |
| `getPaymentsSummary` | `GET .../payments/:userId/summary` | Resumen global: totalPactado, totalPagado, totalPendiente, desglose por obra, desglose por tipo, líneas vencidas. Soporta `query.projectId` para filtrar por obra. |

**3. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/payments/:userId', listPayments);
constructionRouter.post('/payments/:userId', createPayment);
constructionRouter.put('/payments/:userId/:id', updatePayment);
constructionRouter.delete('/payments/:userId/:id', removePayment);
constructionRouter.post('/payments/:userId/:id/pay', registerInstallment);
constructionRouter.post('/payments/:userId/:id/cancel', cancelPaymentLine);
constructionRouter.post('/payments/:userId/:id/installments/:installmentId/receipt', linkReceipt);
constructionRouter.get('/payments/:userId/by-project/:projectId', getPaymentsByProject);
constructionRouter.get('/payments/:userId/summary', getPaymentsSummary);
```

**4. Funciones en `constructionApi.ts`**

```typescript
export async function listPayments(
  userId: string,
  filters?: { projectId?: string; tipo?: string; estado?: string; guildId?: string; supplierId?: string }
): Promise<ConstructionPayment[]>;

export async function createPayment(userId: string, data: Partial<ConstructionPayment>): Promise<ConstructionPayment>;
export async function updatePayment(userId: string, payment: ConstructionPayment): Promise<ConstructionPayment>;
export async function deletePayment(userId: string, paymentId: string): Promise<void>;
export async function registerInstallment(userId: string, paymentId: string, installment: Partial<PaymentInstallment>): Promise<ConstructionPayment>;
export async function cancelPaymentLine(userId: string, paymentId: string): Promise<ConstructionPayment>;
export async function linkReceipt(userId: string, paymentId: string, installmentId: string, receipt: Partial<PaymentInstallment>): Promise<ConstructionPayment>;
export async function getPaymentsByProject(userId: string, projectId: string): Promise<{ payments: ConstructionPayment[]; summary: PaymentProjectSummary }>;
export async function getPaymentsSummary(userId: string, projectId?: string): Promise<PaymentGlobalSummary>;
```

#### Criterios de aceptación

- [ ] CRUD completo en `/api/construction/payments/:userId`
- [ ] Filtros por `projectId`, `tipo`, `estado`, `guildId`, `supplierId` (query params)
- [ ] `totalPagado`, `pendiente`, `estado` se recalculan automáticamente en cada escritura
- [ ] Endpoint `pay` añade pago parcial al array `pagos[]` y recalcula
- [ ] Endpoint `cancel` cambia estado a `anulado` sin eliminar datos
- [ ] Endpoint `receipt` vincula justificante a un pago parcial específico
- [ ] Endpoint `by-project` devuelve pagos de una obra con resumen
- [ ] Endpoint `summary` devuelve resumen global o por obra
- [ ] Eliminar solo posible si no hay pagos registrados; si los hay, sugerir anular
- [ ] Log de actividad en cada operación de escritura
- [ ] Funciones tipadas en `constructionApi.ts`

---

### PG-04 — Generación automática de líneas desde presupuesto

**Tipo:** Backend (Controller)
**Prioridad:** Alta
**Dependencias:** PG-01, PG-03

#### Contexto

Cuando un presupuesto se acepta (`acceptBudget`), ya se generan los pagos del cliente (plazos). El paso lógico es que también se generen automáticamente las líneas de pago interno a cada gremio que aparece en las partidas del presupuesto. Así el gerente tiene de inmediato una visión completa del flujo saliente de dinero.

#### Qué hacer

**1. Modificar `acceptBudget` en `constructionController.js`**

Después de generar los `pagos[]` del cliente, iterar `partidas[]` del presupuesto y:

```
Por cada partida con gremio:
  1. Buscar si ya existe un `construction_guild` con ese nombre → obtener gremioId
  2. Crear un `construction_payment`:
     - nombre: "{gremio} — {descripcion de la partida}"
     - tipo: 'gremio'
     - obraId: presupuesto.proyectoId
     - obraNombre: presupuesto.proyectoNombre
     - gremioId: ID del gremio encontrado (o vacío)
     - gremioNombre: nombre del gremio de la partida
     - presupuestoId: presupuesto._id
     - importePactado: partida.subtotal
     - pagos: [] (vacío, se registrarán conforme avance la obra)
     - fases: [] (vacío, el gerente las define después si quiere)
     - fechaPrevista: '' (lo rellena el gerente)
```

**2. Actualizar campos financieros de la obra**

Tras aceptar presupuesto, actualizar `construction_project`:
- `presupuestoTotal` = `presupuesto.totalConMargen`
- `costePresupuestado` = `presupuesto.totalPartidas`
- `margenPrevisto` = `presupuestoTotal − costePresupuestado`
- `margenPrevistoPorc` = `(margenPrevisto / presupuestoTotal) × 100`
- `totalLineasPago` = Σ importePactado de todas las líneas generadas

**3. Endpoint manual para generar líneas**

Caso: presupuesto ya aceptado sin líneas (datos previos al módulo).

```
POST /api/construction/payments/:userId/generate-from-budget/:budgetId
```

Lee las partidas del presupuesto y crea las líneas que no existan (deduplica por `presupuestoId` + `gremio`).

#### Criterios de aceptación

- [ ] Al aceptar presupuesto, se crean automáticamente líneas de pago por cada partida con gremio
- [ ] Cada línea vincula `presupuestoId`, `obraId`, `gremioId` correctamente
- [ ] `importePactado` de cada línea = `subtotal` de la partida
- [ ] Campos financieros de la obra se actualizan (`presupuestoTotal`, `costePresupuestado`, `margenPrevisto`)
- [ ] Endpoint manual genera líneas para presupuestos ya aceptados sin duplicar existentes
- [ ] Si no hay partidas con gremio, no se crean líneas (sin error)

---

### PG-05 — Reparto por fases e hitos

**Tipo:** Backend + Frontend (lógica)
**Prioridad:** Alta
**Dependencias:** PG-01, PG-03

#### Contexto

El requisito especifica "permitir repartir importes por fases o hitos". Esto significa que una línea de pago de 30.000€ al fontanero puede dividirse en 3 fases: Fase 1 "Saneamiento" (10.000€), Fase 2 "Fontanería interior" (12.000€), Fase 3 "Instalación final" (8.000€). Cada fase tiene su fecha prevista y se puede marcar como completada. Los pagos parciales (`pagos[]`) pueden vincularse a una fase concreta.

#### Qué hacer

**1. Ampliar `PaymentInstallment` con campo `faseId`**

En el builder de `construction_payment`, añadir a cada pago parcial:

```javascript
faseId: String(p.faseId || ''),
faseNombre: String(p.faseNombre || ''),
```

**2. Validaciones al registrar pago**

En `registerInstallment`:
- Si la línea tiene `fases[]` y el pago indica `faseId`, validar que la fase existe
- Recalcular el progreso de la fase: Σ pagos de esa fase vs importe de la fase
- Si la fase está 100% pagada, marcarla como `completada: true`

**3. Endpoint para gestionar fases**

```
PUT /api/construction/payments/:userId/:id/phases
```

Recibe `{ fases: PaymentPhase[] }`. Valida que la suma de importes de fases <= importePactado. Si la suma es menor, la diferencia queda "sin asignar a fase".

**4. Auto-distribución**

Si el gerente no define fases manualmente, ofrecer distribución automática:
- Equitativa: importePactado / N fases
- Por porcentaje: 30%, 40%, 30%
- Personalizada: el gerente pone importes

#### Criterios de aceptación

- [ ] Array `fases[]` almacena fases con nombre, importe, porcentaje, fechaPrevista, completada
- [ ] Pagos parciales pueden vincularse a una fase concreta (`faseId`)
- [ ] Al pagar una fase completa, se marca como `completada: true`
- [ ] Endpoint `PUT .../phases` permite crear/editar fases con validación de suma
- [ ] Tipo TS `PaymentInstallment` incluye `faseId` y `faseNombre`
- [ ] Si no hay fases definidas, los pagos funcionan normalmente sin restricción

---

### PG-06 — Automatizaciones al registrar pago

**Tipo:** Backend (Controller)
**Prioridad:** Crítica
**Dependencias:** PG-02, PG-03

#### Contexto

Las automatizaciones son la clave del módulo: al registrar un pago parcial, el sistema debe actualizar automáticamente los totales de la obra, recalcular el margen real y opcionalmente crear un movimiento en finanzas. Sin estas automatizaciones, el gerente tendría que actualizar todo manualmente y los datos estarían siempre desactualizados.

#### Qué hacer

**1. Al REGISTRAR un pago parcial (`registerInstallment`):**

| Automatización | Detalle |
|---|---|
| Recalcular línea | `totalPagado` = Σ pagos pagados. `pendiente` = `importePactado − totalPagado`. `estado` = pendiente/parcial/pagado. |
| Actualizar obra | Leer `construction_project` por `obraId`. Recalcular `costeAcumulado` = Σ `totalPagado` de TODAS las `construction_payment` de esa obra. `totalPagadoInterno` = idem. `totalPendienteInterno` = Σ `pendiente`. |
| Recalcular margen real | `cobradoCliente` = leer `construction_budget` vinculado, Σ pagos del cliente con `pagado === true`. `margenReal` = `cobradoCliente − costeAcumulado`. `margenRealPorc` = `(margenReal / cobradoCliente) × 100` si cobradoCliente > 0. Guardar en la obra. |
| Crear movimiento financiero (opcional) | Si el usuario tiene configurado `autoSyncConstructionToFinance: true`: crear movimiento tipo `pago` en la DB de finanzas con concepto `"Pago {nombre} — {obraNombre}"`, categoría `construccion_gremio` o `construccion_proveedor`, linkedEntityId → `cpay-*`, importe del pago parcial. |
| Emitir SSE | `broadcastToBusiness` con evento `construction:payment_registered` y payload mínimo (obraId, paymentId, importe, pendiente, margenReal). |

**2. Al ANULAR una línea (`cancelPaymentLine`):**

| Automatización | Detalle |
|---|---|
| Recalcular obra | Re-sumar excluyendo la línea anulada. Recalcular margen. |
| Emitir SSE | `construction:payment_cancelled` |

**3. Al VINCULAR justificante (`linkReceipt`):**

| Automatización | Detalle |
|---|---|
| OCR automático | Si se adjunta imagen/PDF pero no datos de factura (`ocrData` vacío), invocar `POST /api/ocr/scan` internamente para extraer datos. Guardar `ocrData` en el pago parcial. |
| Vincular factura proveedor | Si `facturaProveedorId` se proporciona, verificar que existe en `supplier_invoice`. Marcarla como vinculada. |

#### Criterios de aceptación

- [ ] Al registrar pago parcial: `totalPagado`, `pendiente`, `estado` de la línea se recalculan
- [ ] Al registrar pago parcial: `costeAcumulado`, `margenReal`, `margenRealPorc` de la obra se actualizan
- [ ] `cobradoCliente` de la obra se calcula desde los pagos del presupuesto
- [ ] Movimiento financiero se crea automáticamente si la config lo permite
- [ ] Evento SSE se emite tras cada operación de pago
- [ ] Al anular línea: los totales de la obra se recalculan excluyendo la línea anulada
- [ ] Al adjuntar justificante sin datos: se invoca OCR automáticamente
- [ ] Si hay `facturaProveedorId`, se verifica y vincula la factura de proveedor

---

### PG-07 — Alertas de pagos internos

**Tipo:** Backend (Alert Engine)
**Prioridad:** Alta
**Dependencias:** PG-03, PG-06

#### Contexto

El motor de alertas (`alertEngine.js`) no tiene reglas de construcción. Necesitamos 5 alertas específicas para pagos internos que se evalúen periódicamente y se emitan por los canales existentes (in-app, SSE, push).

#### Qué hacer

**1. Añadir función de evaluación en `alertEngine.js`**

Crear `checkConstructionPayments(ctx, constructionDb)` como nueva función, similar a las existentes (`checkPurchaseAlerts`, `checkStockAlerts`, etc.):

**Alerta 1: Pago próximo**

```javascript
async function checkConstructionPaymentUpcoming(ctx, payments) {
  const now = new Date();
  const alerts = [];
  for (const payment of payments) {
    if (payment.estado === 'pagado' || payment.estado === 'anulado') continue;
    if (!payment.fechaPrevista) continue;
    const daysUntil = -daysBetween(payment.fechaPrevista, now);
    if (daysUntil > 0 && daysUntil <= 7) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-upcoming-${payment._id}`,
        level: daysUntil <= 3 ? 'warning' : 'info',
        category: 'construction_payment_upcoming',
        source: 'construction',
        title: 'Pago interno próximo',
        message: `${payment.nombre} (${payment.obraNombre}): ${payment.pendiente.toFixed(2)}€ pendiente, vence en ${daysUntil} día(s) — ${payment.fechaPrevista}.`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, pendiente: payment.pendiente, daysUntil, fechaPrevista: payment.fechaPrevista },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**Alerta 2: Pago vencido**

```javascript
async function checkConstructionPaymentOverdue(ctx, payments) {
  const now = new Date();
  const alerts = [];
  for (const payment of payments) {
    if (payment.estado === 'pagado' || payment.estado === 'anulado') continue;
    if (!payment.fechaPrevista) continue;
    const daysLate = daysBetween(payment.fechaPrevista, now);
    if (daysLate > 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-overdue-${payment._id}`,
        level: daysLate > 15 ? 'alert' : 'warning',
        category: 'construction_payment_overdue',
        source: 'construction',
        title: 'Pago interno vencido',
        message: `${payment.nombre} (${payment.obraNombre}): ${payment.pendiente.toFixed(2)}€ sin pagar, venció hace ${daysLate} día(s).`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, pendiente: payment.pendiente, daysLate },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**Alerta 3: Pago sin justificante**

```javascript
async function checkConstructionPaymentNoReceipt(ctx, payments) {
  const alerts = [];
  for (const payment of payments) {
    const sinJustificante = payment.pagos.filter(p => p.pagado && !p.justificanteUrl && !p.facturaProveedorId);
    if (sinJustificante.length > 0) {
      const totalSin = sinJustificante.reduce((s, p) => s + p.importe, 0);
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-noreceipt-${payment._id}`,
        level: 'warning',
        category: 'construction_payment_no_receipt',
        source: 'construction',
        title: 'Pago sin justificante',
        message: `${payment.nombre} (${payment.obraNombre}): ${sinJustificante.length} pago(s) por ${totalSin.toFixed(2)}€ sin justificante ni factura vinculada.`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, count: sinJustificante.length, totalSin },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**Alerta 4: Coste superando presupuesto**

```javascript
async function checkConstructionCostOverBudget(ctx, projects) {
  const alerts = [];
  for (const project of projects) {
    if (!project.costePresupuestado || project.costePresupuestado === 0) continue;
    if (project.costeAcumulado > project.costePresupuestado) {
      const exceso = project.costeAcumulado - project.costePresupuestado;
      const excesoPorc = ((exceso / project.costePresupuestado) * 100).toFixed(1);
      alerts.push(await emit({
        ...ctx, dedupKey: `cprj-overcost-${project._id}`,
        level: 'alert',
        category: 'construction_cost_over_budget',
        source: 'construction',
        title: 'Coste de obra superior al presupuestado',
        message: `${project.nombre}: coste acumulado ${project.costeAcumulado.toFixed(2)}€ supera los ${project.costePresupuestado.toFixed(2)}€ presupuestados (+${excesoPorc}%).`,
        entityId: project._id, entityType: 'construction_project',
        route: '/saas/vertical/construccion/pagos',
        metadata: { costeAcumulado: project.costeAcumulado, costePresupuestado: project.costePresupuestado, exceso, excesoPorc },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**Alerta 5: Margen bajo en la obra**

```javascript
async function checkConstructionLowMargin(ctx, projects, config) {
  const umbral = config.constructionLowMarginThreshold || 10;
  const alerts = [];
  for (const project of projects) {
    if (!project.cobradoCliente || project.cobradoCliente === 0) continue;
    if (project.margenRealPorc < umbral && project.margenRealPorc !== 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cprj-lowmargin-${project._id}`,
        level: project.margenRealPorc < 0 ? 'alert' : 'warning',
        category: 'construction_low_margin',
        source: 'construction',
        title: project.margenRealPorc < 0 ? 'Obra con margen negativo' : 'Margen bajo en obra',
        message: `${project.nombre}: margen real ${project.margenRealPorc.toFixed(1)}% (previsto: ${project.margenPrevistoPorc.toFixed(1)}%). Cobrado: ${project.cobradoCliente.toFixed(2)}€, coste: ${project.costeAcumulado.toFixed(2)}€.`,
        entityId: project._id, entityType: 'construction_project',
        route: '/saas/vertical/construccion/pagos',
        metadata: { margenReal: project.margenReal, margenRealPorc: project.margenRealPorc, margenPrevistoPorc: project.margenPrevistoPorc, umbral },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**2. Configuración de alertas**

Ampliar `getAlertConfig()`:

```javascript
constructionPaymentUpcomingEnabled: cfg.constructionPaymentUpcomingEnabled !== false,
constructionPaymentOverdueEnabled: cfg.constructionPaymentOverdueEnabled !== false,
constructionPaymentNoReceiptEnabled: cfg.constructionPaymentNoReceiptEnabled !== false,
constructionCostOverBudgetEnabled: cfg.constructionCostOverBudgetEnabled !== false,
constructionLowMarginEnabled: cfg.constructionLowMarginEnabled !== false,
constructionLowMarginThreshold: Number(cfg.constructionLowMarginThreshold || 10),
```

**3. Integrar en el ciclo de `runAlertsForUser()`**

Importar `getConstructionDbName`. Cargar `construction_payment` y `construction_project` de la DB de construcción. Ejecutar las 5 funciones de chequeo.

#### Criterios de aceptación

- [ ] 5 tipos de alerta definidos e implementados
- [ ] Pago próximo: detecta pagos con `fechaPrevista` en los próximos 7 días
- [ ] Pago vencido: detecta pagos con `fechaPrevista` pasada y `pendiente > 0`
- [ ] Pago sin justificante: detecta pagos registrados sin `justificanteUrl` ni `facturaProveedorId`
- [ ] Coste sobre presupuesto: detecta `costeAcumulado > costePresupuestado`
- [ ] Margen bajo: detecta `margenRealPorc < umbral` (configurable, default 10%)
- [ ] Margen negativo tiene nivel `alert`, margen bajo tiene nivel `warning`
- [ ] Dedup por `_id` del documento afectado + ventana 24h
- [ ] Configuración on/off por alerta + umbral de margen ajustable
- [ ] Integración con emisión global (in-app + SSE + push)

---

### PG-08 — Página principal: `/saas/vertical/construccion/pagos`

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** PG-03

#### Contexto

Página central del módulo de pagos internos. Muestra un resumen financiero global arriba, un panel de alertas, y debajo el listado de todas las líneas de pago con filtros avanzados. Dos vistas: cards (mobile-first) y tabla (desktop pro). Solo visible para perfil gerente.

#### Qué hacer

**1. Crear `src/app/pages/saas/ConstructionPayments.tsx`**

**2. Registrar en `routes.tsx`**

```typescript
{ path: 'vertical/construccion/pagos', Component: ConstructionPayments }
```

**3. Barra superior**

- Título: **"Pagos a gremios y subcontratas"**
- Subtítulo: "Control de pagos internos de obra"
- Icono info con tooltip: "Gestiona los pagos a gremios, proveedores y gastos internos de cada obra. Controla importes pactados, pagos parciales, justificantes y margen real."
- Selector de obra (filtro rápido): dropdown con todas las obras activas + opción "Todas las obras"
- Toggle vista: **Cards** | **Tabla** (iconos `LayoutGrid` / `TableIcon`)
- Botón primario: **"+ Nueva línea de pago"**

**4. KPIs superiores (4 tarjetas)**

| KPI | Cálculo | Icono | Color |
|---|---|---|---|
| Total pactado | Σ `importePactado` de todas las líneas (filtrado por obra si aplica) | `Wallet` | Azul |
| Total pagado | Σ `totalPagado` | `CheckCircle` | Esmeralda |
| Total pendiente | Σ `pendiente` | `Clock` | Amber si > 0, gris si 0 |
| Líneas vencidas | Count de líneas con `fechaPrevista` < hoy y `estado !== 'pagado'` | `AlertTriangle` | Rojo si > 0, gris si 0 |

Cada tarjeta clicable: Total pactado → scroll a tabla. Pendiente → filtra solo pendientes. Vencidas → filtra solo vencidas.

**5. Barra de progreso de obra (si hay obra seleccionada)**

Si el filtro de obra está activo, mostrar una barra visual:

```
[████████████░░░░░░░░░░░░░] 48% pagado
Presupuesto: 120.000€  |  Coste: 62.400€  |  Pagado: 57.600€  |  Pendiente: 4.800€  |  Margen real: 12.3%
```

Colores del margen: esmeralda (>15%), amber (10-15%), rojo (<10%).

**6. Panel de alertas (colapsable)**

Consume las alertas de PG-07 filtradas por obra si aplica. Mismo patrón que `CONSTRUCCION-OPS-CENTER.md` CO-10:
- Borde izquierdo coloreado por severidad
- Icono + mensaje + botón "Ver"
- Sin alertas: oculto con indicador verde

**7. Vista Cards (mobile-first)**

- **Buscador**: placeholder "Buscar por PAG-xxx, nombre, gremio, obra o proveedor..."
- **Chips de filtro** (scroll horizontal): Tipo (gremio/proveedor/gasto) | Estado (pendiente/parcial/pagado/anulado) | Obra | Gremio | `Limpiar todo`
- **Card de línea de pago**:
  - Header: `PAG-XXXXXX` + badge Estado (`pendiente` amber, `parcial` blue, `pagado` green, `anulado` gray) + menú `⋯`
  - Título: Nombre de la línea (ej. "Fontanería — Instalación completa")
  - Contexto: Obra + icono del tipo (martillo para gremio, camión para proveedor, recibo para gasto)
  - Barra de progreso: `totalPagado / importePactado` con % y colores
  - Meta: Importe pactado · Pagado X€ · Pendiente Y€
  - Footer: Fecha prevista (rojo si vencida, amber si próxima) + icono justificante si falta (`⚠`) + botón "Registrar pago"
  - Tap → abre drawer (PG-09)

**8. Vista Tabla (modo pro)**

| Columna | Filtrable | Ordenable | Tipo filtro |
|---|---|---|---|
| REF | Sí | Sí | Búsqueda |
| NOMBRE | Sí | Sí | Búsqueda |
| TIPO | Sí | Sí | Multi (gremio/proveedor/gasto) |
| OBRA | Sí | Sí | Multi + búsqueda |
| GREMIO/PROVEEDOR | Sí | Sí | Multi + búsqueda |
| IMPORTE PACTADO | No | Sí | — |
| PAGADO | No | Sí | — (barra de progreso mini) |
| PENDIENTE | No | Sí | — |
| FECHA PREVISTA | Sí | Sí | Rango |
| ESTADO | Sí | Sí | Multi |
| JUSTIFICANTE | Sí | No | Sí/No (con/sin) |
| ACCIONES | No | No | Ver / Pagar / `⋯` |

- Click en fila → abre drawer
- Menú `⋯`: Editar, Registrar pago, Ver justificantes, Anular
- Fila con fondo `red-50` si vencida, `amber-50` si vence esta semana
- Footer de tabla: totales de importe pactado, pagado, pendiente

#### Criterios de aceptación

- [ ] Página renderiza en `/saas/vertical/construccion/pagos`
- [ ] Carga datos de `listPayments` al montar + `getPaymentsSummary` para KPIs
- [ ] 4 KPIs con datos reales, clicables para filtrar
- [ ] Barra de progreso de obra visible cuando hay obra seleccionada con margen real
- [ ] Panel de alertas con datos del alert engine
- [ ] Vista cards con filtros en chips y búsqueda
- [ ] Vista tabla con filtros por columna, ordenamiento y totales en footer
- [ ] Botón "Nueva línea de pago" abre formulario (PG-09)
- [ ] Botón "Registrar pago" abre modal rápido de pago (PG-10)
- [ ] Resaltado visual de filas vencidas y próximas
- [ ] Responsive: cards por defecto en móvil, tabla en desktop
- [ ] Dark mode completo

---

### PG-09 — Drawer de detalle y formulario de línea de pago

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** PG-03, PG-08

#### Contexto

El drawer se abre para ver/editar una línea de pago existente o para crear una nueva. Es la pieza principal de la UX: desde aquí se gestionan las fases, se ven los pagos parciales, se adjuntan justificantes y se controla el estado financiero de cada compromiso.

#### Qué hacer

**1. Crear `src/app/pages/saas/components/ConstructionPaymentDrawer.tsx`**

**2. Header del drawer**

- Modo edición: `PAG-XXXXXX — {Nombre}` + badge estado
- Modo creación: "Nueva línea de pago"
- Botón cerrar (`X`)
- Ancho: 640px desktop, full-width móvil

**3. Tabs internas**

| Tab | Contenido |
|---|---|
| **Resumen** | KPIs de la línea + barra de progreso + timeline de pagos + alertas contextuales |
| **Datos** | Formulario de creación/edición |
| **Fases** | Gestión de fases/hitos con reparto de importes |
| **Pagos** | Historial de pagos parciales con justificantes |
| **Documento** | Contrato o documento asociado a la línea |

**4. Tab Resumen**

- **Barra de progreso circular** grande: `totalPagado / importePactado` con %
- **3 mini-KPIs**: Pactado (azul) | Pagado (verde) | Pendiente (amber/rojo)
- **Info rápida**: Obra + tipo + gremio/proveedor + fecha prevista
- **Timeline de pagos**: línea temporal con puntos por cada pago registrado (fecha, importe, justificante sí/no)
- **Alertas contextuales**: si vencido, si sin justificante, si excede presupuesto
- **Links**: "Ir a obra", "Ver presupuesto", "Ver gremio/proveedor"

**5. Tab Datos — campos del formulario**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre | Input texto | Sí | Ej. "Fontanería — Instalación baños" |
| Tipo | Select (`gremio` / `proveedor` / `gasto_general`) | Sí | Condiciona los campos siguientes |
| Obra | Selector (`construction_project`) | Sí | Autocompletar `obraId`/`obraNombre` |
| Gremio | Selector (`construction_guild`, solo si tipo=gremio) | Condicional | Autocompletar `gremioId`/`gremioNombre`/`gremioTipo` |
| Proveedor | Selector (proveedores del sistema, solo si tipo=proveedor) | Condicional | Autocompletar `proveedorId`/`proveedorNombre` |
| Presupuesto | Selector (`construction_budget`, filtrado por obra) | No | Vincular a partida del presupuesto |
| Importe pactado | Input numérico (€) | Sí | El total comprometido |
| Fecha prevista | Datepicker | No | Fecha límite de pago |
| Observaciones | Textarea (3 líneas) | No | Notas internas |

**Lógica condicional:**
- Si tipo = `gremio`: mostrar selector de gremio, ocultar proveedor
- Si tipo = `proveedor`: mostrar selector de proveedor, ocultar gremio
- Si tipo = `gasto_general`: ocultar ambos selectores, solo nombre libre
- Si se selecciona gremio: prellenar nombre con `"{tipo de gremio} — {nombre del gremio}"`

**6. Tab Fases**

- **Tabla editable de fases**: nombre, importe, %, fechaPrevista, completada
- **Barra visual**: segmentos coloreados por fase (completada=verde, pendiente=gris)
- **Botón "Añadir fase"**: abre fila inline editable
- **Botón "Distribución automática"**: modal con opciones (equitativa, personalizada)
- **Validación**: total de fases <= importePactado. Mostrar "sin asignar" si queda resto.
- **Formato**: cada fila con mini barra de progreso propia (pagado en esa fase / importe de la fase)

**7. Tab Pagos**

- **Lista cronológica de pagos parciales** (más reciente arriba):
  - Fecha de pago + concepto + importe + badge (pagado=verde)
  - Método de pago (transferencia, efectivo, etc.)
  - Justificante: thumbnail si hay, icono `⚠` si falta, botón "Adjuntar"
  - Fase vinculada (si aplica)
  - Notas del pago
- **Botón prominente "Registrar pago"** → abre modal PG-10
- **Subtotales**: total pagado, pendiente, próximo pago previsto (si hay fases)

**8. Tab Documento**

- **Zona de documento principal**: contrato, acuerdo o documento que respalda la línea
- Drag & drop o botón para subir
- Preview (si es imagen/PDF)
- Campos: nombre del documento, notas
- Solo 1 documento principal (los justificantes de pagos van en la tab Pagos)

**9. Acciones del footer**

| Estado | Acciones |
|---|---|
| (nuevo) | Guardar |
| pendiente | Editar, Registrar pago, Anular |
| parcial | Editar, Registrar pago, Anular (con confirmación) |
| pagado | Solo ver, descargar resumen |
| anulado | Solo ver |

#### Criterios de aceptación

- [ ] Drawer con 5 tabs funcionales
- [ ] Formulario crea/edita líneas de pago vía API
- [ ] Selectores de obra/gremio/proveedor/presupuesto cargados desde API
- [ ] Campos condicionales según tipo (gremio, proveedor, gasto_general)
- [ ] Tab Fases con tabla editable, validación de sumas y distribución automática
- [ ] Tab Pagos con historial cronológico y botón "Registrar pago"
- [ ] Tab Documento con upload y preview
- [ ] Barra de progreso en resumen
- [ ] Timeline de pagos visual
- [ ] Alertas contextuales (vencido, sin justificante)
- [ ] Responsive: full-width en móvil, 640px en desktop

---

### PG-10 — Modal de registro de pago parcial

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** PG-03, PG-06

#### Contexto

El registro de un pago parcial es la acción más frecuente del módulo. Debe ser rápido: el gerente selecciona cuánto paga, con qué método, adjunta justificante si lo tiene y confirma. El modal se abre desde la tab Pagos del drawer, desde el botón de la card/fila en la lista, o desde un acceso rápido.

#### Qué hacer

**1. Crear `src/app/pages/saas/components/RegisterPaymentModal.tsx`**

**2. Campos del modal**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Importe | Input numérico (€) | Sí | Pre-rellenado con `pendiente` de la línea |
| Concepto | Input texto | No | Ej. "Pago parcial fase 1", auto-sugerir si hay fase |
| Fecha de pago | Datepicker | Sí | Default: hoy |
| Método de pago | Select (transferencia, efectivo, cheque, pagaré, confirming, bizum, otro) | Sí | Default: transferencia |
| Fase | Select (fases de la línea, solo si hay fases definidas) | No | Vincular pago a fase |
| Justificante | File upload (imagen o PDF) | No | Con opción "Escanear factura" |
| Factura proveedor | Selector (facturas del proveedor, si tipo=proveedor) | No | Vincular factura existente |
| Notas | Input texto corto | No | — |

**3. Sección "Justificante" expandida**

- **Opción A:** Subir archivo (drag & drop o clic)
- **Opción B:** "Escanear factura con OCR" → invoca `POST /api/ocr/scan` con la imagen → muestra datos extraídos (proveedor, importe, fecha, número de factura) para confirmar
- **Opción C:** "Vincular factura existente" → selector de facturas de proveedor sin vincular
- Preview del archivo adjuntado
- Si hay datos OCR, mostrar resumen: `"Factura #123 de Fontanería López — 3.500€ — 12/04/2026"`

**4. Validaciones**

- Importe > 0
- Importe <= pendiente de la línea (warning si intenta pagar más de lo pendiente, permitir con confirmación)
- Si la línea tiene fases y se selecciona una: importe <= pendiente de la fase
- Si ya está `pagado` (pendiente = 0): bloquear con mensaje "Esta línea ya está completamente pagada"

**5. Al confirmar**

1. Llamar `registerInstallment(userId, paymentId, installment)`
2. Si hay justificante con imagen/PDF: llamar `linkReceipt(...)` en secuencia
3. Mostrar toast de confirmación con resumen: "Pago de X€ registrado. Pendiente: Y€"
4. Cerrar modal y refrescar datos (via re-fetch o actualización optimista)
5. Si la línea queda completamente pagada (pendiente = 0): toast especial "Línea completamente pagada" con confeti/check verde

#### Criterios de aceptación

- [ ] Modal con todos los campos funcionales
- [ ] Importe pre-rellenado con pendiente
- [ ] Selector de fase visible solo si la línea tiene fases
- [ ] Upload de justificante con preview
- [ ] OCR integrado: escanear, mostrar datos extraídos, confirmar
- [ ] Vincular factura de proveedor existente
- [ ] Validaciones de importe (> 0, <= pendiente, warning si excede)
- [ ] Al confirmar: llama a `registerInstallment` + `linkReceipt` si hay archivo
- [ ] Toast de confirmación con resumen
- [ ] Toast especial si la línea queda 100% pagada
- [ ] Responsive

---

### PG-11 — Conexión: Obras → Pagos

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** PG-02, PG-08

#### Contexto

Desde la ficha de una obra (`ConstructionProjects.tsx`) el gerente debe poder ver directamente los pagos internos asociados y el estado financiero. Los nuevos campos de margen real y coste acumulado (PG-02) deben mostrarse de forma prominente.

#### Qué hacer

**1. Widget financiero en la ficha de obra**

Dentro del drawer/detalle de un `construction_project`, añadir sección o tab "Finanzas":

```
┌────────────────────────────────────────────────────┐
│  💰 Estado financiero de la obra                    │
│                                                      │
│  Presupuesto:        120.000€                       │
│  Coste presupuestado: 104.348€                      │
│  Margen previsto:      15.652€ (13.0%)              │
│  ─────────────────────────────────────────          │
│  Cobrado del cliente:  72.000€ (60%)                │
│  Pagado a gremios:     58.400€                      │
│  Pendiente de pago:    45.948€                      │
│  ─────────────────────────────────────────          │
│  Margen real:          13.600€ (18.9%)  ✅          │
│                                                      │
│  [Ver pagos internos →]  [Ver presupuesto →]        │
└────────────────────────────────────────────────────┘
```

Indicadores de margen: `>=15%` esmeralda + check, `10-15%` amber, `<10%` rojo + warning, `<0%` rojo oscuro + alerta.

**2. Tabla compacta de líneas de pago por obra**

Bajo el widget, tabla de las `construction_payment` de esa obra:
- Nombre | Tipo | Pactado | Pagado | Pendiente | Estado
- Máximo 5 filas, botón "Ver todos" → navega a `/saas/vertical/construccion/pagos?obraId=cprj-xxx`

**3. KPIs de margen en la card de obra (listado)**

En la tabla/cards de obras de `ConstructionProjects.tsx`, añadir columna o dato:
- Margen real % con color (verde/amber/rojo)
- Tooltip: "Cobrado: X€ — Coste: Y€ — Margen: Z€"

#### Criterios de aceptación

- [ ] Widget financiero visible en el detalle de cada obra
- [ ] Margen real y previsto con indicadores de color
- [ ] Tabla compacta de pagos internos (max 5) con link a "ver todos"
- [ ] KPI de margen visible en el listado de obras
- [ ] Links bidireccionales: obra → pagos, pagos → obra

---

### PG-12 — Conexión: Proveedores y Gremios → Pagos

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** PG-03, PG-08

#### Contexto

Desde la ficha de un gremio (`construction-guilds`) y desde la ficha de un proveedor (`suppliers`) el gerente debe poder ver los pagos asociados: cuánto se le ha comprometido, cuánto se le ha pagado y cuánto queda pendiente.

#### Qué hacer

**1. Widget de pagos en ficha de gremio**

En el drawer/detalle de `construction_guild`, añadir sección "Pagos":

```
┌────────────────────────────────────────┐
│  💳 Pagos a este gremio                 │
│                                          │
│  Total comprometido: 45.000€            │
│  Total pagado:       32.000€            │
│  Pendiente:          13.000€            │
│  Obras activas:      3                  │
│                                          │
│  Desglose por obra:                     │
│  · Obra Calle Mayor:  18.000€ (pagado)  │
│  · Obra Torres:       15.000€ (parcial) │
│  · Obra Centro:       12.000€ (pend.)   │
│                                          │
│  [Ver todos los pagos →]                │
└────────────────────────────────────────┘
```

Datos: filtrar `construction_payment` por `gremioId`. Link "Ver todos" → `/saas/vertical/construccion/pagos?gremioId=cgld-xxx` (requiere ampliar filtros de la página).

**2. Widget de pagos en ficha de proveedor**

Misma idea para proveedores: filtrar por `proveedorId`. Incluir además las facturas de proveedor vinculadas a pagos.

**3. Al crear línea de pago desde el gremio/proveedor**

Botón "Nuevo pago" en la ficha del gremio/proveedor que abre el drawer de PG-09 con el gremio/proveedor pre-seleccionado.

#### Criterios de aceptación

- [ ] Widget de pagos visible en ficha de gremio con totales y desglose por obra
- [ ] Widget de pagos visible en ficha de proveedor con totales
- [ ] Links "Ver todos los pagos" con filtro pre-aplicado
- [ ] Botón "Nuevo pago" que abre drawer con gremio/proveedor pre-seleccionado

---

### PG-13 — Conexión: Finanzas y OCR

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** PG-06

#### Contexto

Los pagos a gremios son gastos reales del negocio que deben reflejarse en el módulo de finanzas. La conexión con OCR permite escanear justificantes (facturas de proveedor, recibos) y vincular datos automáticamente.

#### Qué hacer

**1. Sincronización con Finanzas**

Opción configurable (`autoSyncConstructionToFinance`):

Al registrar un pago parcial en `registerInstallment`:
- Crear movimiento financiero tipo `pago` en la DB de finanzas (`pay`)
- Concepto: `"[Construcción] {nombre de línea} — {obraNombre}"`
- Categoría: `construccion_gremio`, `construccion_proveedor` o `construccion_gasto` según tipo
- Tags: `['construccion', obraNombre]`
- Reference: `referencia` del pago (`PAG-XXXXXX`)
- `linkedEntityId`: `_id` de la `construction_payment`
- `linkedEntityType`: `'construction_payment'`

Invertir si se anula: marcar el movimiento como anulado o eliminarlo.

**2. Vista cruzada en Finanzas**

En `FinanceView.tsx` (tabla de movimientos): si un movimiento tiene `linkedEntityType === 'construction_payment'`:
- Badge "Obra" con link a la línea de pago
- Icono de martillo para identificar gastos de construcción

**3. Integración OCR en el modal de pago**

En el modal PG-10, al usar "Escanear factura":
1. Enviar imagen/PDF a `POST /api/ocr/scan`
2. Recibir JSON con: `proveedor`, `cifProveedor`, `numeroFactura`, `fecha`, `base`, `iva`, `total`
3. Mostrar datos extraídos en un mini-panel de confirmación
4. Si el proveedor coincide con uno existente: sugerir vinculación
5. Si hay factura de proveedor coincidente: sugerir vincular `facturaProveedorId`
6. Guardar `ocrData` en el pago parcial para auditoría

**4. Flujo de factura proveedor → pago**

Desde `SupplierBillingPage.tsx`, si una factura de proveedor tiene relación con una obra (campo a añadir):
- Botón "Vincular a pago de obra" que busca líneas de pago del proveedor en obras activas
- Al vincular: actualiza `facturaProveedorId` en el pago parcial correspondiente

#### Criterios de aceptación

- [ ] Movimiento financiero se crea automáticamente al registrar pago (si config activa)
- [ ] Categorías específicas de construcción en finanzas
- [ ] Badge "Obra" en movimientos de finanzas con link cruzado
- [ ] OCR funcional desde modal de pago: escanear → extraer → confirmar → guardar
- [ ] Sugerencia de vinculación a proveedor/factura existente tras OCR
- [ ] Botón "Vincular a pago de obra" en facturas de proveedor
- [ ] `ocrData` almacenado para auditoría

---

### PG-14 — Conexión: Dashboard y Centro Operativo

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** PG-03, PG-07

#### Contexto

Los datos de pagos internos deben reflejarse en el Dashboard de construcción (`ConstructionDashboard.tsx`) y en el Centro Operativo (ticket `CO-04`). El endpoint `ops-center` ya prevé campos como `totalPagadoProveedores`, `totalPendientePago` y `margenEstimadoGlobal` — ahora tenemos datos reales para alimentarlos.

#### Qué hacer

**1. Alimentar `ops-center` con datos de pagos**

En el endpoint `GET /api/construction/ops-center/:userId` (CO-04, cuando se implemente):

```javascript
const payments = await listConstructionDocsByType(req, userId, 'construction_payment');
const resumen = {
  ...resumenExistente,
  totalPagadoProveedores: payments.reduce((s, p) => s + p.totalPagado, 0),
  totalPendientePago: payments.reduce((s, p) => s + p.pendiente, 0),
  margenEstimadoGlobal: calcularMargenGlobal(projects),
  lineasVencidas: payments.filter(p => p.fechaPrevista && new Date(p.fechaPrevista) < new Date() && p.estado !== 'pagado' && p.estado !== 'anulado').length,
};
```

**2. KPIs de pagos en Dashboard de construcción**

Añadir a `ConstructionDashboard.tsx`:

| KPI | Cálculo | Icono | Color |
|---|---|---|---|
| Costes internos | Σ `costeAcumulado` de obras activas | `CreditCard` | Orange |
| Pendiente pago | Σ `totalPendienteInterno` de obras activas | `Clock` | Amber |
| Margen medio | Media ponderada de `margenRealPorc` de obras activas | `TrendingUp` | Verde/Rojo |

**3. Widget "Pagos internos" en Dashboard**

Card compacta con:
- 3 mini-KPIs (pactado, pagado, pendiente)
- Top 3 obras por pendiente de pago
- Alertas activas de pagos (vencidos, sin justificante)
- Botón "Ver pagos" → `/saas/vertical/construccion/pagos`

**4. Acceso rápido en Centro Operativo**

En CO-09 (accesos rápidos), añadir botón "Pagos" con icono `Banknote` que navega a `/saas/vertical/construccion/pagos`.

#### Criterios de aceptación

- [ ] Endpoint ops-center incluye totales de pagos internos
- [ ] KPIs de costes y margen en Dashboard de construcción
- [ ] Widget "Pagos internos" en Dashboard con top 3 obras y alertas
- [ ] Acceso rápido "Pagos" en Centro Operativo
- [ ] Links bidireccionales Dashboard ↔ Pagos

---

### PG-15 — Diferenciación gerente / trabajador

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** PG-08

#### Contexto

Requisito explícito: "Perfil trabajador: no ve pagos internos." La página entera de pagos es exclusiva del gerente. El trabajador no debe ver datos financieros internos en ningún sitio.

#### Qué hacer

**1. Protección de ruta**

En `ConstructionPayments.tsx`:
- Detectar rol: `useAuth().user.role` → `owner/admin/manager` = gerente
- Si `worker/employee`: redirigir a `/saas/vertical/construccion` o mostrar mensaje "No tienes acceso a esta sección"

**2. Ocultar en sidebar**

En `Sidebar.tsx`, el item `construction-payments` solo debe aparecer si el usuario es gerente. Usar el mismo patrón de permisos que se usa para finanzas (`TEAM_PERMISSION_KEYS` incluye `finance`).

**3. Ocultar widget financiero en ficha de obra**

Para trabajadores: la sección "Estado financiero" (PG-11) no se renderiza. Solo ven los datos operativos (progreso, tareas, fechas).

**4. Ocultar en Dashboard**

Los KPIs de costes, margen y pagos internos (PG-14) no se muestran a trabajadores.

**5. Protección de API**

En los endpoints de pagos (`constructionRouter.js`), añadir middleware que valide el rol. Si un trabajador intenta acceder vía API directa, devolver 403:

```javascript
function requireManager(req, res, next) {
  const role = req.userRole || req.headers['x-user-role'];
  if (['worker', 'employee'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a gerentes' });
  }
  next();
}

constructionRouter.use('/payments', requireManager);
```

#### Criterios de aceptación

- [ ] Trabajador no ve la página de pagos (redirigido o mensaje de acceso denegado)
- [ ] Sidebar no muestra `construction-payments` para trabajadores
- [ ] Widget financiero en ficha de obra oculto para trabajadores
- [ ] KPIs de costes/margen en Dashboard ocultos para trabajadores
- [ ] API devuelve 403 si un trabajador intenta acceder a endpoints de pagos
- [ ] Gerente ve todo sin restricciones

---

### PG-16 — Sidebar y navegación

**Tipo:** Frontend (Config)
**Prioridad:** Media
**Dependencias:** PG-08

#### Contexto

Falta el enlace en el sidebar y la definición del item en el grupo de construcción.

#### Qué hacer

**1. Añadir item en `Sidebar.tsx`**

```typescript
{
  id: 'construction-payments',
  navKey: 'constructionPayments',
  icon: <Banknote className="w-5 h-5" />,
  path: '/saas/vertical/construccion/pagos',
}
```

**2. Posición en el grupo de construcción**

Después de presupuestos (lógica: obras → presupuestos → pagos → tareas → ...):

```typescript
itemIds: [
  'construction-projects',
  'construction-budgets',
  'construction-payments',  // ← NUEVO
  'construction-execution',
  'construction-machinery',
  'construction-materials',
  'construction-subcontractors',
  'construction-plans',
]
```

**3. Badge de alerta**

Si hay pagos vencidos (`estado !== 'pagado'` y `fechaPrevista < hoy`), mostrar badge rojo con el count en el item del sidebar.

**4. Añadir traducción/navKey en `sectorTerminology.ts`** si aplica:
- `constructionPayments`: "Pagos internos" / "Pagos gremios"

#### Criterios de aceptación

- [ ] Item visible en sidebar bajo grupo Construcción (solo para gerentes)
- [ ] Icono `Banknote` (lucide-react)
- [ ] Posición: tercer item (después de Presupuestos)
- [ ] Badge rojo con count de pagos vencidos
- [ ] Navega correctamente a `/saas/vertical/construccion/pagos`

---

## Resumen de dependencias

```
PG-01 (Modelo payment)
 ├── PG-03 (API CRUD) ←── bloquea la mayoría
 │    ├── PG-04 (Generación desde presupuesto)
 │    ├── PG-05 (Fases e hitos)
 │    ├── PG-06 (Automatizaciones) ←── crítico
 │    │    ├── PG-07 (Alertas)
 │    │    └── PG-13 (Conexión Finanzas/OCR)
 │    ├── PG-08 (Página principal) ←── crítico
 │    │    ├── PG-09 (Drawer detalle)
 │    │    ├── PG-10 (Modal pago)
 │    │    ├── PG-15 (Gerente/Trabajador)
 │    │    └── PG-16 (Sidebar)
 │    ├── PG-11 (Conexión Obras)
 │    ├── PG-12 (Conexión Proveedores/Gremios)
 │    └── PG-14 (Conexión Dashboard)
 │
PG-02 (Campos margen en obra)
 ├── PG-06 (Automatizaciones)
 └── PG-11 (Conexión Obras)
```

## Orden de ejecución recomendado

| Fase | Tickets | Descripción | Estimación |
|---|---|---|---|
| **1. Modelos** | PG-01, PG-02 | Entidad de pago + campos financieros en obra | 3-4h |
| **2. API** | PG-03 | CRUD completo + endpoints especiales | 4-5h |
| **3. Automatizaciones** | PG-04, PG-05, PG-06 | Generación desde presupuesto, fases, recálculos automáticos | 5-6h |
| **4. Alertas** | PG-07 | 5 alertas en motor existente | 3-4h |
| **5. UI Core** | PG-08, PG-09, PG-10, PG-16 | Página, drawer, modal de pago, sidebar | 8-10h |
| **6. Perfiles** | PG-15 | Gerente vs trabajador | 2-3h |
| **7. Conexiones** | PG-11, PG-12, PG-13, PG-14 | Obras, Proveedores, Finanzas, OCR, Dashboard | 6-8h |
| **Total** | | | **~31-40h** |

## Notas de diseño

### Paleta de colores
- Pagos: orange/amber como color dominante (gasto = naranja)
- Pendiente: amber | Pagado: esmeralda | Vencido: rojo | Anulado: gris
- Margen real: esmeralda (>15%), amber (10-15%), rojo (<10%), rojo oscuro (<0%)
- Gremio: indigo | Proveedor: teal | Gasto general: slate

### Convenciones UI
- Layout de `components/saas/Layout` | Dark mode obligatorio
- Iconos: lucide-react (`Banknote`, `Wallet`, `CheckCircle`, `Clock`, `AlertTriangle`, `Receipt`, `Hammer`, `Truck`)
- Bordes: `rounded-xl/2xl` | `border-2 border-gray-200 dark:border-gray-700`
- Hover: `shadow-sm` | Transiciones: `transition-all 150-200ms`
- EUR: `toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })`
- Fechas: `dd/MM/yyyy`

### Patrón estado/fetching
- `useState` + `useMemo` + `useCallback` (sin Redux/Zustand)
- `constructionApi.ts` para todas las llamadas
- Polling 60s como fallback si SSE desconecta
- `useAuth()` para userId/role

### Referencia visual
Mismo patrón que `ConstructionBudgets.tsx` (listado con cards/tabla + drawer de detalle). Los KPIs superiores siguen el patrón de `ButcherHub.tsx`. El modal de pago sigue el patrón de los modales de `FinanceView.tsx`.

### Base de datos
Todos los documentos `construction_payment` se almacenan en la DB de construcción (`getConstructionDbName()`). Los campos nuevos en `construction_project` son retrocompatibles (default 0). Los movimientos financieros opcionales se crean en la DB de finanzas (`getFinanceDbName()`). CouchDB no requiere migraciones.

### Precisión numérica
Todos los cálculos financieros usan `Number((valor).toFixed(2))` o `Math.round(valor * 100) / 100` para evitar errores de punto flotante.
