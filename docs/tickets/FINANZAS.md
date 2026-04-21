# FINANZAS — Plan de Tickets

**Página:** `/saas/finance` (sidebar label: "Finanzas")
**Objetivo:** Control económico global del negocio.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Movimientos cobro/pago (CRUD) | Completo | `financeController.js`, `financeApi.ts`, `financeTypes.ts` — DB `pay` |
| Vista principal Finance con tabs (overview, dashboard, transactions, reminders, vat-book) | Completo | `FinanceView.tsx` (~2500 líneas) con gráficos Recharts, KPIs, listado |
| Ingresos y Gastos (página separada) | Completo | `IncomeExpensesPage.tsx` — tabla, filtros mes/centro, KPIs, export CSV |
| EBITDA (página separada) | Completo | `EbitdaPage.tsx` — cálculo anual/mensual, gráfico barras, cuenta resultados simplificada, top categorías |
| Impuestos (página separada) | Completo | `TaxesPage.tsx` — IVA repercutido/soportado, libro IVA trimestral, IRPF estimado, descarga CSV |
| Conciliación bancaria | Completo | `BankReconciliationPage.tsx` — import CSV/OFX, auto-match, conciliación manual |
| Facturación a clientes (CRM) | Completo | `clientInvoicesApi.ts`, `invoicesController.js` — DB `*-crm-invoices`, status paid/pending/overdue/draft |
| Facturación proveedores (compras) | Completo | `SupplierBillingPage.tsx`, facturas tipo `purchase_invoice` en DB catálogo |
| Generación PDF facturas | Completo | `invoicePdfGenerator.ts` — buildInvoiceFromMovement, buildInvoiceNumber |
| Recordatorios de pago | Completo | `paymentRemindersApi.ts` — niveles de recordatorio, email body, marca sent/resolved |
| Exportación contable (Excel) | Completo | `accountingExport.ts` — exportAccountingToExcel |
| Libro de IVA (vatBook) | Completo | `vatBookApi.ts` — build trimestral, descarga CSV por trimestre |
| Conversor de divisa | Completo | `currencyApi.ts` — fetchExchangeRates, convertAmount |
| Gastos de personal | Completo | `staffExpensesApi.ts` — DB `staff-expenses` |
| Costes (costing) | Completo | `CostingPage.tsx` — análisis de costes |
| OCR de facturas/recibos | Completo | `POST /api/ocr/scan` en `index.js` — extrae JSON de documentos financieros |
| Numeración configurable (facturas, presupuestos, contratos) | Completo | `settingsController.js` — `GET/PUT /api/settings/numbering`, `POST /api/settings/numbering/next/:docType` |
| Permisos de equipo para finanzas | Completo | `couchdb.js` — `TEAM_PERMISSION_KEYS` incluye `'finance'` |
| API pública de finanzas (Bearer token) | Completo | `publicApiRouter.js` — `GET /api/v1/finance` |
| Sidebar financiero (grupo) | Completo | `Sidebar.tsx` — grupo `finanzas` con items: finance, income-expenses, ebitda, taxes, bank-reconciliation, reports, sales-metrics |
| Dashboard: KPIs financieros | Parcial | `Dashboard.tsx` — quickFinance + alertas básicas (ventas pendientes, caja negativa, margen bajo) |
| Alertas facturas compra vencidas | Completo | `alertEngine.js` — `checkOverdueInvoices()`, categoría `overdue_purchase` |
| Alertas cuentas por pagar elevadas | Completo | `alertEngine.js` — `checkHighPayables()`, umbral configurable |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Visión financiera unificada en landing page (resumen ejecutivo) | No existe — la vista actual son tabs funcionales, no un resumen ejecutivo |
| Panel de caja con saldo en tiempo real | No existe como entidad propia — se calcula como suma/resta ad-hoc |
| Gestión de cuentas bancarias (multi-banco) | No existe — la conciliación solo importa extractos, no gestiona cuentas |
| Panel de impuestos con calendario de vencimientos | Parcial — hay libro IVA pero NO calendario de obligaciones fiscales (modelo 303, 111, 390, IS) |
| Informes económicos configurables (P&L completo, cash flow, balance) | Parcial — hay cuenta de resultados simplificada en EBITDA, pero no es configurable ni hay cash flow ni balance de situación |
| Automatización: factura emitida → genera ingreso automático | No implementado — las facturas CRM y los movimientos financieros son entidades desconectadas |
| Automatización: factura recibida → genera gasto automático | No implementado — las facturas de compra y los movimientos financieros están desconectados |
| Automatización: cobro → actualiza saldo cuenta bancaria | No implementado — no existe entidad "cuenta bancaria" con saldo |
| Automatización: pago → actualiza pendiente proveedor | No implementado — el pago de factura de compra es manual |
| Alerta: impago de facturas cliente | Parcial — hay recordatorios de pago pero NO alerta proactiva en alertEngine |
| Alerta: caja descuadrada (conciliación vs contabilidad) | No implementado |
| Alerta: vencimiento impuesto próximo | No implementado |
| Alerta: gasto sin documento justificante | No implementado |
| Conexión CRM → Finanzas (factura cliente genera movimiento) | No implementado |
| Conexión Compras → Finanzas (factura proveedor genera movimiento) | No implementado |
| Conexión Dashboard → Finanzas (widget financiero completo) | Parcial — hay KPIs básicos pero no widget dedicado |
| Conexión Documentación → Finanzas (vincular docs a movimientos) | No implementado |
| Conexión Verticales → Finanzas (billing vertical genera movimientos) | No implementado |

---

## Tickets

---

### FIN-01 — Modelo de datos: Cuentas bancarias

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto
Actualmente no existe una entidad "cuenta bancaria" en el sistema. La conciliación bancaria (`BankReconciliationPage.tsx`) permite importar extractos CSV/OFX pero no hay concepto de cuentas separadas, saldos por cuenta, ni multi-banco. Para tener visión de caja y bancos real, necesitamos este modelo base.

#### Qué hacer

**1. Definir tipo de documento CouchDB en la DB de finanzas (`pay`)**

```typescript
export interface BankAccount {
  _id: string;              // bank_account:{user_id}:{uuid}
  _rev?: string;
  type: 'bank_account';
  user_id: string;
  name: string;             // "CaixaBank Empresa", "Santander Nóminas"
  bankName: string;         // "CaixaBank", "Santander", "BBVA"
  iban: string;             // ES12 3456 7890 1234 5678 90
  swift?: string;
  accountNumber?: string;   // Últimos 4 dígitos para mostrar
  currency: string;         // "EUR" default
  initialBalance: number;   // Saldo inicial al crear la cuenta
  currentBalance: number;   // Saldo calculado (initialBalance + cobros - pagos)
  isDefault: boolean;       // true = cuenta principal
  color: string;            // Color para gráficos (#3b82f6)
  icon: string;             // Emoji o icono ("🏦")
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

**2. Crear `src/app/lib/bankAccountsApi.ts`**

| Función | Descripción |
|---|---|
| `listBankAccounts(userId)` | Listar cuentas bancarias del usuario |
| `getBankAccount(userId, accountId)` | Obtener una cuenta por ID |
| `saveBankAccount(userId, data, existing?)` | Crear/editar cuenta bancaria |
| `deleteBankAccount(userId, accountId)` | Eliminar cuenta (soft-delete) |
| `recalculateBalance(userId, accountId, movements[])` | Recalcular saldo desde initialBalance + movimientos |
| `getDefaultAccount(userId)` | Obtener la cuenta por defecto |
| `getTotalBalance(accounts[])` | Helper: suma de saldos de todas las cuentas |

**3. Vincular movimientos financieros a cuentas**

Ampliar `FinanceMovementRecord` en `financeTypes.ts`:

```typescript
export interface FinanceMovementRecord {
  // ... campos existentes ...
  bankAccountId?: string;     // ID de la cuenta bancaria asociada
  bankAccountName?: string;   // Nombre (desnormalizado para listados rápidos)
  reconciled?: boolean;       // true = conciliado con extracto bancario
  reconciledAt?: string;
  linkedInvoiceId?: string;   // Vinculación con factura (FIN-04)
  linkedInvoiceType?: 'client_invoice' | 'purchase_invoice';
  documentIds?: string[];     // IDs de documentos justificantes (FIN-08)
}
```

**4. Endpoint backend (financeRouter.js)**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/finance/:userId/accounts` | GET | Listar cuentas bancarias |
| `/api/finance/:userId/accounts` | POST | Crear cuenta bancaria |
| `/api/finance/:userId/accounts/:id` | PUT | Actualizar cuenta bancaria |
| `/api/finance/:userId/accounts/:id` | DELETE | Eliminar cuenta bancaria |
| `/api/finance/:userId/accounts/:id/recalculate` | POST | Forzar recálculo de saldo |

#### Criterios de aceptación
- [ ] Documento `bank_account` se persiste en la DB de finanzas
- [ ] CRUD completo funcional desde API client
- [ ] Campo `bankAccountId` disponible en `FinanceMovementRecord`
- [ ] Saldo se recalcula correctamente con initialBalance + cobros − pagos
- [ ] Soporte multi-cuenta (mínimo 5 cuentas por usuario)
- [ ] Campo `isDefault` asegura que solo una cuenta es la principal

---

### FIN-02 — Modelo de datos: Calendario fiscal

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto
La página de impuestos (`TaxesPage.tsx`) calcula IVA trimestral y IRPF estimado, pero no existe un calendario de obligaciones fiscales con sus fechas de vencimiento. Los autónomos y empresas en España tienen modelos obligatorios (303, 111, 115, 130, 390, Impuesto de Sociedades) con plazos concretos. El sistema debe alertar antes de los vencimientos.

#### Qué hacer

**1. Definir tipo de documento CouchDB**

```typescript
export type TaxModel =
  | 'modelo_303'    // IVA trimestral
  | 'modelo_111'    // Retenciones IRPF trabajadores
  | 'modelo_115'    // Retenciones alquileres
  | 'modelo_130'    // Pago fraccionado IRPF (autónomos)
  | 'modelo_200'    // Impuesto de Sociedades
  | 'modelo_390'    // Resumen anual IVA
  | 'modelo_190'    // Resumen anual retenciones
  | 'modelo_347'    // Operaciones con terceros
  | 'ibi'           // Impuesto bienes inmuebles
  | 'iae'           // Impuesto actividades económicas
  | 'custom';       // Obligación personalizada

export type TaxObligationStatus = 'pending' | 'in_progress' | 'filed' | 'paid' | 'overdue';

export interface TaxObligation {
  _id: string;               // tax_obligation:{user_id}:{model}:{period}
  _rev?: string;
  type: 'tax_obligation';
  user_id: string;
  model: TaxModel;
  modelName: string;          // "Modelo 303 — IVA trimestral"
  period: string;             // "2026-Q1", "2026", "2026-01"
  periodLabel: string;        // "1T 2026", "Anual 2026"
  dueDate: string;            // YYYY-MM-DD fecha límite
  filingDate?: string;        // Fecha en que se presentó
  status: TaxObligationStatus;
  estimatedAmount?: number;   // Importe estimado (se calcula desde movimientos)
  actualAmount?: number;      // Importe real presentado
  documentId?: string;        // ID del justificante/PDF
  notes: string;
  reminderDaysBefore: number; // Días antes para alertar (default: 7)
  createdAt: string;
  updatedAt: string;
}
```

**2. Crear `src/app/lib/taxCalendarApi.ts`**

| Función | Descripción |
|---|---|
| `listTaxObligations(userId, year?)` | Listar obligaciones del año |
| `saveTaxObligation(userId, data, existing?)` | Crear/editar obligación |
| `deleteTaxObligation(userId, obligationId)` | Eliminar obligación |
| `markFiled(userId, obligationId, filingDate, actualAmount)` | Marcar como presentado |
| `markPaid(userId, obligationId)` | Marcar como pagado |
| `generateDefaultCalendar(userId, year, businessType)` | Genera calendario fiscal por defecto según tipo de negocio (autónomo vs SL) |
| `getUpcomingDeadlines(obligations[], daysAhead?)` | Helper: obligaciones que vencen en los próximos X días |
| `getOverdueObligations(obligations[])` | Helper: obligaciones vencidas sin presentar |

**3. Presets de calendario fiscal español**

```typescript
export const FISCAL_CALENDAR_ES: FiscalPreset[] = [
  // Trimestrales
  { model: 'modelo_303', name: 'Modelo 303 — IVA', periods: ['Q1','Q2','Q3','Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' } },
  { model: 'modelo_111', name: 'Modelo 111 — Retenciones IRPF', periods: ['Q1','Q2','Q3','Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' } },
  { model: 'modelo_115', name: 'Modelo 115 — Retenciones alquiler', periods: ['Q1','Q2','Q3','Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' } },
  { model: 'modelo_130', name: 'Modelo 130 — Pago fraccionado IRPF', periods: ['Q1','Q2','Q3','Q4'],
    dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' } },
  // Anuales
  { model: 'modelo_390', name: 'Modelo 390 — Resumen anual IVA', periods: ['annual'],
    dueDates: { annual: '01-30' } },
  { model: 'modelo_190', name: 'Modelo 190 — Resumen retenciones', periods: ['annual'],
    dueDates: { annual: '01-31' } },
  { model: 'modelo_200', name: 'Modelo 200 — Impuesto Sociedades', periods: ['annual'],
    dueDates: { annual: '07-25' } },
  { model: 'modelo_347', name: 'Modelo 347 — Operaciones terceros', periods: ['annual'],
    dueDates: { annual: '02-28' } },
];
```

#### Criterios de aceptación
- [ ] Documento `tax_obligation` se persiste en la DB de finanzas
- [ ] CRUD completo funcional desde API client
- [ ] `generateDefaultCalendar()` crea las obligaciones del año con fechas correctas
- [ ] Diferencia entre preset autónomo (con modelo 130) y SL (con modelo 200)
- [ ] `getUpcomingDeadlines()` devuelve obligaciones próximas correctamente
- [ ] Soporte para obligaciones personalizadas (tipo `custom`)

---

### FIN-03 — Visión financiera unificada (landing de Finanzas)

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** FIN-01, FIN-02

#### Contexto
La vista actual de Finanzas (`FinanceView.tsx`) es funcional con tabs (overview, dashboard, transactions, reminders, vat-book), pero no existe una "landing" que ofrezca una visión ejecutiva global: cuánto hay en caja, cuánto se debe, cuánto deben los clientes, próximos vencimientos fiscales, y el estado general del negocio en un vistazo. 

Esta página debe ser el punto de entrada al módulo financiero. El usuario debe poder ver en 10 segundos si su negocio va bien o hay problemas.

#### Qué hacer

**1. Rediseñar la tab "overview" de `FinanceView.tsx` como landing ejecutiva**

No crear página nueva; reorganizar la tab `overview` existente con este layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│  FINANZAS · Control económico de tu negocio                         │
├─────────────────────────────────────────────────────────────────────┤
│  [⚠ Alertas financieras]  ← Banner colapsable si hay alertas       │
├─────────────────────────────────────────────────────────────────────┤
│  📊 KPIs principales (6 cards)                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │Saldo     │ │Ingresos  │ │Gastos    │ │Pendiente │ │EBITDA    │ │
│  │total     │ │mes       │ │mes       │ │cobro     │ │mes       │ │
│  │12.450€   │ │8.300€    │ │5.200€    │ │3.100€    │ │3.100€    │ │
│  │↑ 12%     │ │↑ 8%      │ │↓ 3%      │ │2 fact.   │ │37.3%     │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  FILA 2: dos columnas                                               │
│  ┌────────────────────────┐  ┌──────────────────────────────┐      │
│  │ 📈 Evolución mensual   │  │ 🏦 Cuentas bancarias          │      │
│  │ Gráfico ingresos vs    │  │ CaixaBank: 8.200€            │      │
│  │ gastos (12 meses)      │  │ Santander: 4.250€            │      │
│  │ con línea EBITDA       │  │ Total: 12.450€               │      │
│  │                        │  │ [+ Añadir cuenta]            │      │
│  └────────────────────────┘  └──────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│  FILA 3: dos columnas                                               │
│  ┌────────────────────────┐  ┌──────────────────────────────┐      │
│  │ 📋 Facturas pendientes  │  │ 🗓️ Próximos vencimientos     │      │
│  │ 3 facturas emitidas    │  │ Modelo 303 — 20 abr (6 días)│      │
│  │ por cobrar (3.100€)    │  │ Modelo 111 — 20 abr (6 días)│      │
│  │ 1 factura recibida     │  │ Factura Prov. X — 25 abr    │      │
│  │ por pagar (1.200€)     │  │ [Ver calendario fiscal →]   │      │
│  │ [Ver facturas →]       │  │                              │      │
│  └────────────────────────┘  └──────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│  FILA 4: accesos rápidos                                            │
│  [Nuevo ingreso] [Nuevo gasto] [Nueva factura] [Importar extracto] │
│  [Ver EBITDA →] [Ver Impuestos →] [Ver Conciliación →]             │
└─────────────────────────────────────────────────────────────────────┘
```

**2. KPIs principales (6 cards)**

| KPI | Cálculo | Comparación |
|---|---|---|
| Saldo total | Suma de `currentBalance` de todas las `BankAccount` | vs mes anterior (%) |
| Ingresos mes | Suma `totalAmount` de movimientos tipo `cobro` del mes actual | vs mismo mes año anterior |
| Gastos mes | Suma `totalAmount` de movimientos tipo `pago` del mes actual | vs mismo mes año anterior |
| Pendiente de cobro | Suma `total` de facturas cliente con status `pending` o `overdue` | count de facturas |
| Pendiente de pago | Suma `total` de facturas proveedor sin pagar | count de facturas |
| EBITDA mes | Ingresos − OPEX del mes (misma lógica que `EbitdaPage.tsx`) | margen % |

**3. Gráfico de evolución (12 meses)**

Reutilizar la lógica de Recharts que ya existe en `FinanceView.tsx`:
- Área chart con dos series: ingresos (verde) y gastos (rojo)
- Línea superpuesta: EBITDA (azul)
- Tooltip con detalle de los 3 valores
- Selector de período: "Últimos 12 meses" / "Año actual" / "Año anterior"

**4. Widget de cuentas bancarias**

Lista compacta de cuentas con:
- Nombre + banco + últimos 4 dígitos IBAN
- Saldo actual con color (verde si positivo, rojo si negativo)
- Barra de proporción visual (qué % del total tiene cada cuenta)
- Botón "+" para añadir cuenta (abre modal — FIN-01)

**5. Widget facturas pendientes**

Dos secciones:
- **Por cobrar:** facturas `client_invoice` con status `pending`/`overdue`, ordenadas por fecha vencimiento
- **Por pagar:** facturas `purchase_invoice` sin pagar, ordenadas por fecha vencimiento
- Cada fila: cliente/proveedor, importe, días desde/hasta vencimiento
- Badge de color: verde (a tiempo), amber (próximo a vencer), rojo (vencida)
- Click navega a la factura

**6. Widget próximos vencimientos**

Unifica en una sola lista:
- Obligaciones fiscales próximas (`TaxObligation` de FIN-02)
- Facturas de proveedor próximas a vencer
- Pagos recurrentes si existieran
- Ordenados por fecha ascendente, máximo 5 items
- Icono por tipo + días restantes + badge de urgencia

**7. Accesos rápidos**

Fila de botones compactos que lanzan acciones o navegan:
- "Nuevo ingreso" → abre modal de crear movimiento (tipo cobro)
- "Nuevo gasto" → abre modal de crear movimiento (tipo pago)
- "Nueva factura" → navega a `/saas/crm/clientes` tab facturación
- "Importar extracto" → navega a `/saas/bank-reconciliation`
- Links de navegación rápida a las sub-páginas del módulo

#### Criterios de aceptación
- [ ] Tab "overview" rediseñada como landing ejecutiva
- [ ] 6 KPIs con comparación vs período anterior
- [ ] Gráfico de evolución 12 meses con ingresos, gastos y EBITDA
- [ ] Widget de cuentas bancarias con saldos (datos de FIN-01)
- [ ] Widget de facturas pendientes (por cobrar y por pagar)
- [ ] Widget de próximos vencimientos (fiscales + facturas)
- [ ] Accesos rápidos funcionales
- [ ] Responsive: 1 columna en mobile, 2 columnas en desktop
- [ ] Dark mode coherente con el diseño actual
- [ ] Carga progresiva: KPIs primero, widgets después (skeleton loaders)

---

### FIN-04 — Automatización: Factura emitida = Ingreso

**Tipo:** Lógica de negocio (Backend + API Client)
**Prioridad:** Crítica
**Dependencias:** FIN-01

#### Contexto
Actualmente, cuando un usuario crea una factura a un cliente (`client_invoice` vía `clientInvoicesApi.ts`), NO se genera automáticamente un movimiento de ingreso en finanzas. Son dos mundos desconectados. El usuario tiene que crear la factura Y luego ir a finanzas a registrar el cobro manualmente. Esto es duplicar trabajo y fuente de descuadres.

#### Qué hacer

**1. Hook post-creación de factura cliente**

Modificar `clientInvoicesApi.ts` (o el controller backend si es más limpio) para que al crear o marcar como pagada una factura:

```
Si factura.status === 'paid':
  1. Buscar si ya existe un movimiento vinculado (linkedInvoiceId === factura._id)
  2. Si NO existe:
     - Crear movimiento tipo 'cobro' automáticamente
     - concept: "Factura {invoiceNumber} — {clientName}"
     - amountBase: factura.subtotal
     - taxRate: factura.taxRate
     - totalAmount: factura.total
     - date: factura.paidDate || factura.date
     - payMethod: factura.payMethod || 'transferencia'
     - category: 'ventas'
     - reference: factura.invoiceNumber
     - linkedInvoiceId: factura._id
     - linkedInvoiceType: 'client_invoice'
     - bankAccountId: cuenta por defecto del usuario
  3. Si YA existe:
     - Actualizar el movimiento existente con los datos actualizados
```

**2. Hook al cambiar status de factura**

Cuando una factura pasa de `pending` a `paid`:
- Crear el movimiento de cobro (como arriba)
- Actualizar saldo de la cuenta bancaria asociada

Cuando una factura pasa de `paid` a `pending` (rectificación):
- Marcar el movimiento vinculado como anulado o eliminarlo
- Ajustar saldo de la cuenta bancaria

**3. Indicador visual de vinculación**

En la tabla de movimientos (`FinanceView.tsx` tab transactions):
- Si el movimiento tiene `linkedInvoiceId`: mostrar badge "Factura" con link
- En el detalle/edición del movimiento: campo de solo lectura "Vinculado a factura {number}"

En la vista de facturas cliente:
- Si la factura tiene movimiento vinculado: mostrar badge "Contabilizado" con link al movimiento
- Si NO tiene: mostrar badge "Sin contabilizar" con botón "Crear cobro"

**4. Configuración opt-in**

Añadir en Settings una opción:

```typescript
financeAutomation: {
  autoCreateIncomeOnPaidInvoice: boolean;   // default: true
  autoCreateExpenseOnPurchaseInvoice: boolean; // FIN-05
  defaultBankAccountId: string;
  defaultIncomeCategory: string;            // default: 'ventas'
  defaultExpenseCategory: string;           // default: 'materiales'
}
```

El usuario debe poder desactivar la automatización si prefiere control manual.

#### Criterios de aceptación
- [ ] Al marcar factura cliente como `paid`, se crea movimiento `cobro` automáticamente
- [ ] El movimiento incluye `linkedInvoiceId` y `linkedInvoiceType`
- [ ] Si la factura se revierte a `pending`, el movimiento se elimina/anula
- [ ] Badge "Contabilizado" visible en la factura con link al movimiento
- [ ] Badge "Factura" visible en el movimiento con link a la factura
- [ ] Configuración en Settings para activar/desactivar la automatización
- [ ] No crea duplicados si el movimiento ya existe
- [ ] Saldo de cuenta bancaria se actualiza tras la creación del movimiento

---

### FIN-05 — Automatización: Factura recibida = Gasto

**Tipo:** Lógica de negocio (Backend + API Client)
**Prioridad:** Crítica
**Dependencias:** FIN-01

#### Contexto
Mismo problema que FIN-04 pero para facturas de proveedor. Cuando se registra una factura de compra (`purchase_invoice` via `deliveryController.js`) o se marca como pagada, no se genera automáticamente un movimiento de gasto en finanzas. El usuario tiene que ir a registrar el pago manualmente.

#### Qué hacer

**1. Hook en factura de compra al marcar como pagada**

Misma lógica que FIN-04 pero invertida:

```
Si purchase_invoice.status === 'paid':
  1. Buscar movimiento vinculado
  2. Si NO existe:
     - Crear movimiento tipo 'pago'
     - concept: "Factura {invoiceNumber} — {supplierName}"
     - amountBase: factura.subtotal
     - taxRate: factura.taxRate
     - totalAmount: factura.total
     - date: factura.paidDate || factura.date
     - payMethod: factura.payMethod || 'transferencia'
     - category: categoría según tipo de compra o 'materiales'
     - reference: factura.invoiceNumber
     - linkedInvoiceId: factura._id
     - linkedInvoiceType: 'purchase_invoice'
     - bankAccountId: cuenta por defecto
```

**2. Actualización de pendientes**

Al registrar el pago de una factura de proveedor:
- El movimiento `pago` se crea automáticamente
- El saldo pendiente del proveedor se actualiza (campo calculado)
- En `SupplierBillingPage.tsx`, la factura muestra "Pagada" + link al movimiento

**3. Indicadores visuales**

En la tabla de facturas proveedor (`SupplierBillingPage.tsx`):
- Badge "Contabilizado" si existe movimiento vinculado
- Badge "Pendiente de pago" con días de retraso si vencida

En la tabla de movimientos:
- Badge "Fact. proveedor" si tiene `linkedInvoiceType === 'purchase_invoice'`

#### Criterios de aceptación
- [ ] Al marcar factura proveedor como `paid`, se crea movimiento `pago` automáticamente
- [ ] El movimiento incluye `linkedInvoiceId` con tipo `purchase_invoice`
- [ ] Si la factura se revierte, el movimiento se elimina/anula
- [ ] Badge "Contabilizado" en la factura de proveedor
- [ ] Badge "Fact. proveedor" en el movimiento
- [ ] Saldo pendiente del proveedor se actualiza visualmente
- [ ] Usa la misma configuración opt-in de FIN-04

---

### FIN-06 — Automatización: Cobro/Pago actualiza saldos

**Tipo:** Lógica de negocio (API Client)
**Prioridad:** Alta
**Dependencias:** FIN-01, FIN-04, FIN-05

#### Contexto
Con las cuentas bancarias (FIN-01) y las automatizaciones de facturas (FIN-04, FIN-05), falta la pieza que cierra el ciclo: cuando se registra cualquier movimiento (manual o automático), el saldo de la cuenta bancaria asociada debe actualizarse en tiempo real.

#### Qué hacer

**1. Middleware de actualización de saldo**

Crear `src/app/lib/balanceEngine.ts`:

```typescript
export async function onMovementCreated(
  userId: string,
  movement: FinanceMovementRecord,
): Promise<void> {
  if (!movement.bankAccountId) return;
  const account = await getBankAccount(userId, movement.bankAccountId);
  if (!account) return;

  const delta = movement.type === 'cobro' ? movement.totalAmount : -movement.totalAmount;
  account.currentBalance = Number((account.currentBalance + delta).toFixed(2));
  account.updatedAt = new Date().toISOString();
  await saveBankAccount(userId, account, account);
}

export async function onMovementDeleted(
  userId: string,
  movement: FinanceMovementRecord,
): Promise<void> {
  if (!movement.bankAccountId) return;
  const account = await getBankAccount(userId, movement.bankAccountId);
  if (!account) return;

  const delta = movement.type === 'cobro' ? -movement.totalAmount : movement.totalAmount;
  account.currentBalance = Number((account.currentBalance + delta).toFixed(2));
  account.updatedAt = new Date().toISOString();
  await saveBankAccount(userId, account, account);
}

export async function onMovementUpdated(
  userId: string,
  oldMovement: FinanceMovementRecord,
  newMovement: FinanceMovementRecord,
): Promise<void> {
  // Si cambió de cuenta, revertir en la vieja y aplicar en la nueva
  // Si cambió de importe, ajustar la diferencia
}
```

**2. Integrar en flujos existentes**

Modificar `FinanceView.tsx`, `IncomeExpensesPage.tsx` y los hooks de FIN-04/FIN-05:
- Después de `createFinanceMovementInCouch()` → llamar `onMovementCreated()`
- Después de `deleteFinanceMovementFromCouch()` → llamar `onMovementDeleted()`
- Después de `updateFinanceMovementInCouch()` → llamar `onMovementUpdated()`

**3. Selector de cuenta en el modal de movimiento**

En el `CreateMovementModal` de `IncomeExpensesPage.tsx` y en el modal de `FinanceView.tsx`:
- Añadir dropdown de cuenta bancaria (pre-selecciona la cuenta por defecto)
- Mostrar saldo actual de la cuenta seleccionada debajo del dropdown
- Si solo hay una cuenta, seleccionarla automáticamente y no mostrar dropdown

**4. Botón de recálculo forzado**

En la vista de cuentas bancarias:
- Botón "Recalcular saldo" que ejecuta `recalculateBalance()` — recorre todos los movimientos vinculados a esa cuenta y recalcula desde `initialBalance`
- Útil si hay descuadres por bugs o imports manuales

#### Criterios de aceptación
- [ ] Al crear cobro → saldo de la cuenta asociada sube
- [ ] Al crear pago → saldo de la cuenta asociada baja
- [ ] Al eliminar movimiento → saldo se revierte
- [ ] Al editar importe/cuenta → saldo se ajusta correctamente
- [ ] Selector de cuenta bancaria en el modal de creación de movimiento
- [ ] Botón de recálculo forzado funcional
- [ ] El saldo nunca pierde centimos por redondeo (toFixed(2) en cada operación)

---

### FIN-07 — Sistema de alertas financieras

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** FIN-01, FIN-02

#### Contexto
El `alertEngine.js` actual genera alertas para stock, facturas de compra vencidas y cuentas por pagar elevadas, pero NO cubre las alertas financieras definidas en los requisitos: impago de clientes, caja descuadrada, vencimiento de impuestos, gasto sin documento justificante.

#### Qué hacer

**1. Nuevas reglas en `alertEngine.js`**

Añadir las siguientes funciones al motor de alertas existente:

**Alerta: Impago de facturas cliente**

```javascript
async function checkClientInvoiceOverdue(userId, clientInvoices, config) {
  if (!config.clientOverdueEnabled) return [];
  const now = new Date();
  const alerts = [];

  const overdue = clientInvoices.filter(inv => {
    if (inv.status === 'paid' || inv.status === 'draft') return false;
    if (!inv.dueDate) return false;
    return new Date(inv.dueDate) < now;
  });

  for (const inv of overdue) {
    const daysLate = daysBetween(inv.dueDate, now);
    alerts.push(await emitAlert({
      userId,
      dedupKey: `clientoverdue-${inv._id}`,
      level: daysLate > 30 ? 'alert' : 'warning',
      category: 'client_invoice_overdue',
      title: 'Factura de cliente impagada',
      message: `Factura ${inv.invoiceNumber} de ${inv.clientName || 'cliente'} venció hace ${daysLate} días. Importe: ${inv.total?.toFixed(2) || '0.00'} €.`,
      entityId: inv._id,
      entityType: 'client_invoice',
      route: '/saas/finance',
      metadata: { invoiceNumber: inv.invoiceNumber, clientName: inv.clientName, total: inv.total, daysLate },
    }));
  }

  return alerts.filter(Boolean);
}
```

**Alerta: Caja descuadrada**

```javascript
async function checkCashMismatch(userId, bankAccounts, movements, config) {
  if (!config.cashMismatchEnabled) return [];
  const alerts = [];

  for (const account of bankAccounts) {
    const accountMovements = movements.filter(m => m.bankAccountId === account._id);
    const calculatedBalance = account.initialBalance
      + accountMovements.filter(m => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0)
      - accountMovements.filter(m => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);

    const diff = Math.abs(account.currentBalance - calculatedBalance);
    if (diff > 0.01) {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `cashmismatch-${account._id}`,
        level: diff > 100 ? 'alert' : 'warning',
        category: 'cash_mismatch',
        title: 'Caja descuadrada',
        message: `La cuenta "${account.name}" tiene un descuadre de ${diff.toFixed(2)} €. Saldo registrado: ${account.currentBalance.toFixed(2)} €, saldo calculado: ${calculatedBalance.toFixed(2)} €.`,
        entityId: account._id,
        entityType: 'bank_account',
        route: '/saas/bank-reconciliation',
        metadata: { accountName: account.name, currentBalance: account.currentBalance, calculatedBalance, diff },
      }));
    }
  }

  return alerts.filter(Boolean);
}
```

**Alerta: Vencimiento impuesto próximo**

```javascript
async function checkTaxDeadlines(userId, taxObligations, config) {
  if (!config.taxDeadlineEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const obligation of taxObligations) {
    if (obligation.status === 'filed' || obligation.status === 'paid') continue;
    const daysUntil = -daysBetween(obligation.dueDate, now);

    if (daysUntil <= 0) {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `taxoverdue-${obligation._id}`,
        level: 'alert',
        category: 'tax_overdue',
        title: 'Impuesto vencido sin presentar',
        message: `${obligation.modelName} (${obligation.periodLabel}) venció hace ${Math.abs(daysUntil)} días.`,
        entityId: obligation._id,
        entityType: 'tax_obligation',
        route: '/saas/taxes',
        metadata: { model: obligation.model, period: obligation.period, daysLate: Math.abs(daysUntil) },
      }));
    } else if (daysUntil <= (obligation.reminderDaysBefore || 7)) {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `taxdue-${obligation._id}`,
        level: 'warning',
        category: 'tax_upcoming',
        title: 'Vencimiento impuesto próximo',
        message: `${obligation.modelName} (${obligation.periodLabel}) vence en ${daysUntil} días (${obligation.dueDate}).`,
        entityId: obligation._id,
        entityType: 'tax_obligation',
        route: '/saas/taxes',
        metadata: { model: obligation.model, period: obligation.period, daysUntil },
      }));
    }
  }

  return alerts.filter(Boolean);
}
```

**Alerta: Gasto sin documento justificante**

```javascript
async function checkExpensesWithoutDocument(userId, movements, config) {
  if (!config.expenseDocumentEnabled) return [];
  const now = new Date();
  const alerts = [];

  const recentExpenses = movements.filter(m =>
    m.type === 'pago'
    && !m.documentIds?.length
    && !m.linkedInvoiceId
    && daysBetween(m.createdAt, now) >= (config.expenseDocumentGraceDays || 7)
  );

  if (recentExpenses.length > 0) {
    const totalAmount = recentExpenses.reduce((s, m) => s + m.totalAmount, 0);
    alerts.push(await emitAlert({
      userId,
      dedupKey: `expnodoc-${now.toISOString().slice(0, 7)}`,
      level: 'warning',
      category: 'expense_no_document',
      title: 'Gastos sin documento justificante',
      message: `${recentExpenses.length} gasto(s) por ${totalAmount.toFixed(2)} € sin factura ni documento adjunto.`,
      entityType: 'finance_movement',
      route: '/saas/income-expenses',
      metadata: { count: recentExpenses.length, totalAmount, movementIds: recentExpenses.slice(0, 10).map(m => m._id) },
    }));
  }

  return alerts.filter(Boolean);
}
```

**2. Configuración de alertas financieras**

Ampliar `getAlertConfig()` en `alertEngine.js`:

```javascript
// Finanzas
clientOverdueEnabled: cfg.clientOverdueEnabled !== false,
cashMismatchEnabled: cfg.cashMismatchEnabled !== false,
taxDeadlineEnabled: cfg.taxDeadlineEnabled !== false,
expenseDocumentEnabled: cfg.expenseDocumentEnabled !== false,
expenseDocumentGraceDays: Number(cfg.expenseDocumentGraceDays || 7),
```

**3. Integrar nuevas reglas en `runAlertsForUser()`**

Añadir al `Promise.all` de carga de datos:
- `clientInvoices` (desde DB `*-crm-invoices`)
- `bankAccounts` (desde DB `pay`, tipo `bank_account`)
- `taxObligations` (desde DB `pay`, tipo `tax_obligation`)

Ejecutar las 4 nuevas funciones de chequeo.

**4. Banner de alertas en la landing financiera (FIN-03)**

El banner de alertas de la landing financiera consume las alertas generadas por este sistema:
- Alertas `alert` (críticas): borde rojo, icono `AlertTriangle`
- Alertas `warning`: borde amber, icono `AlertCircle`
- Cada alerta con botón "Resolver" que navega a la ruta indicada
- Dismissable (localStorage)

#### Criterios de aceptación
- [ ] `checkClientInvoiceOverdue()` detecta facturas cliente impagadas
- [ ] `checkCashMismatch()` detecta descuadres entre saldo registrado y calculado
- [ ] `checkTaxDeadlines()` detecta impuestos próximos a vencer y vencidos
- [ ] `checkExpensesWithoutDocument()` detecta gastos sin justificante tras período de gracia
- [ ] Las 4 reglas integradas en el ciclo del `alertEngine`
- [ ] Configuración de activación/desactivación por regla
- [ ] Notificaciones in-app + SSE + Web Push como las alertas existentes
- [ ] Banner visible en la landing de finanzas

---

### FIN-08 — Conexión: Documentación ↔ Finanzas

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** FIN-04, FIN-05

#### Contexto
Los movimientos financieros (gastos especialmente) necesitan documentos justificantes (facturas, tickets, recibos). El módulo de Documentación (`DocumentsPage.tsx`) ya existe pero no está conectado con Finanzas. Un gasto debería poder tener uno o varios documentos adjuntos, y viceversa, desde un documento debería poder verse qué movimiento financiero justifica.

#### Qué hacer

**1. Vincular documentos a movimientos**

Ya se añadió `documentIds: string[]` al `FinanceMovementRecord` en FIN-01. Ahora implementar:

En el modal de edición de movimiento:
- Sección "Documentos adjuntos" con:
  - Lista de documentos vinculados (nombre + tipo + link)
  - Botón "Adjuntar documento" que abre un selector de documentos existentes O permite subir uno nuevo
  - Botón "Escanear factura" que invoca el OCR (`POST /api/ocr/scan`) para extraer datos automáticamente

**2. Desde Documentación, vincular con movimiento**

En `DocumentDetail.tsx` o en la lista de documentos:
- Si el documento es de tipo financiero (factura, recibo, ticket):
  - Mostrar sección "Movimiento financiero"
  - Si está vinculado: mostrar resumen del movimiento (concepto, importe, fecha)
  - Si NO está vinculado: botón "Vincular a movimiento existente" o "Crear movimiento desde este documento"

**3. "Crear movimiento desde documento" con OCR**

Al subir una factura/recibo:
1. Invocar OCR para extraer datos
2. Pre-rellenar el formulario de movimiento con los datos extraídos
3. El usuario confirma y guarda
4. El movimiento queda vinculado al documento automáticamente

**4. Indicador "gasto sin documento" en la tabla de movimientos**

En la tabla de transacciones:
- Si un gasto lleva más de 7 días sin `documentIds` ni `linkedInvoiceId`: icono de warning `⚠` con tooltip "Sin documento justificante"
- Filtro rápido: "Gastos sin justificante" en los tabs

#### Criterios de aceptación
- [ ] Se pueden adjuntar documentos a un movimiento financiero
- [ ] Se pueden vincular movimientos desde la vista de un documento
- [ ] OCR funcional para pre-rellenar datos desde factura/recibo
- [ ] Indicador visual de "gasto sin justificante" en la tabla de movimientos
- [ ] Filtro "Sin justificante" en la lista de movimientos
- [ ] La vinculación es bidireccional (se ve desde ambos lados)

---

### FIN-09 — Informes económicos

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** FIN-01, FIN-02

#### Contexto
Actualmente hay una cuenta de resultados simplificada en `EbitdaPage.tsx` y métricas de ventas en `SalesMetrics.tsx`, pero no existen informes económicos completos y configurables: P&L detallado, flujo de caja (cash flow), balance de situación, ni comparativas interanuales.

#### Qué hacer

**1. Ampliar `Reports.tsx` o crear sub-página `FinanceReportsPage.tsx`**

Si `Reports.tsx` ya existe para informes generales, añadir una pestaña "Económicos". Si no, crear página dedicada con ruta `/saas/finance-reports`.

**2. Informe: Cuenta de Pérdidas y Ganancias (P&L)**

```
CUENTA DE PÉRDIDAS Y GANANCIAS — Enero-Diciembre 2026

Ingresos de explotación
  Ventas                          120.000 €
  Servicios                        45.000 €
  Otros ingresos                    5.000 €
  ─────────────────────────────────────────
  Total ingresos                  170.000 €

Gastos de explotación
  Compras / Materiales            -40.000 €
  Personal                        -55.000 €
  Alquiler                        -12.000 €
  Suministros                      -4.800 €
  Marketing                        -6.000 €
  Seguros                          -3.200 €
  Software / Herramientas          -2.400 €
  Asesoría                         -1.800 €
  Otros gastos                     -4.800 €
  ─────────────────────────────────────────
  Total gastos                   -130.000 €

RESULTADO OPERATIVO (EBITDA)       40.000 €
  Margen EBITDA                     23.5 %

Impuestos estimados
  IVA neto (a ingresar)            -8.400 €
  IRPF / IS estimado              -34.000 €

RESULTADO NETO ESTIMADO            -2.400 €
```

Controles:
- Período: mes / trimestre / semestre / año / personalizado
- Comparativa: vs período anterior, vs mismo período año anterior
- Exportar: CSV, Excel, PDF

**3. Informe: Flujo de Caja (Cash Flow)**

```
FLUJO DE CAJA — Abril 2026

Saldo inicial                     12.450 €

  (+) Cobros del mes               8.300 €
      Ventas                        6.200 €
      Servicios                     1.800 €
      Otros                           300 €

  (-) Pagos del mes                -5.200 €
      Proveedores                  -2.100 €
      Personal                     -1.800 €
      Alquiler                       -600 €
      Otros                          -700 €

  Flujo neto operativo             3.100 €

Saldo final                       15.550 €
```

Fuente de datos: movimientos financieros agrupados por categoría + saldo de cuentas bancarias (FIN-01).

**4. Informe: Comparativa interanual**

Tabla con columnas por mes y filas por concepto:
- Fila por cada categoría de ingreso/gasto
- Columnas: Ene-Dic del año actual + total
- Fila inferior: mismo período del año anterior
- Celda con % de variación y flecha ↑↓
- Resaltado en rojo si la variación es negativa > 20%

**5. Exportación universal**

Todos los informes deben poder exportarse en:
- **CSV**: para hojas de cálculo
- **Excel**: usando la librería existente (`accountingExport.ts`)
- **PDF**: usando la misma lógica de `invoicePdfGenerator.ts`

#### Criterios de aceptación
- [ ] Informe P&L completo con desglose por categoría
- [ ] Informe de flujo de caja con saldo inicial/final
- [ ] Comparativa interanual con % de variación
- [ ] Selector de período flexible (mes, trimestre, año, personalizado)
- [ ] Exportación CSV, Excel y PDF funcional
- [ ] Gráficos complementarios (evolución, distribución por categoría)
- [ ] Responsive y dark mode

---

### FIN-10 — Integración: Dashboard ↔ Finanzas

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** FIN-01, FIN-07

#### Contexto
El Dashboard (`Dashboard.tsx`) tiene KPIs financieros básicos (`quickFinance` en el endpoint de KPIs) y algunos enlaces a finanzas, pero no hay un widget financiero completo que resuma el estado económico del negocio. La conexión debe ser bidireccional: el dashboard muestra resumen, y desde ahí se navega al detalle en finanzas.

#### Qué hacer

**1. Widget "Salud financiera" en Dashboard**

Card grande en el dashboard:

```
┌──────────────────────────────────────────────────┐
│  💰 Salud financiera                              │
│                                                    │
│  Saldo total:     12.450 €  ↑ 8%                 │
│  Ingresos mes:     8.300 €  ↑ 12%                │
│  Gastos mes:       5.200 €  ↓ 3%                 │
│  EBITDA mes:       3.100 €  (37.3%)              │
│                                                    │
│  ⚠ 2 facturas impagadas (3.100 €)               │
│  🗓️ Modelo 303 vence en 6 días                    │
│                                                    │
│  [Ver finanzas →]                                 │
└──────────────────────────────────────────────────┘
```

**2. Ampliar endpoint `/api/dashboard/kpis/:userId`**

Añadir al objeto de respuesta:

```javascript
finance: {
  totalBalance: 12450.00,          // Suma saldos cuentas bancarias
  monthIncome: 8300.00,
  monthExpenses: 5200.00,
  monthEbitda: 3100.00,
  ebitdaMargin: 37.3,
  pendingReceivables: 3100.00,     // Facturas cliente pendientes
  pendingReceivablesCount: 2,
  pendingPayables: 1200.00,        // Facturas proveedor pendientes
  pendingPayablesCount: 1,
  alerts: [
    { type: 'client_invoice_overdue', count: 2, total: 3100 },
    { type: 'tax_upcoming', count: 1, model: 'modelo_303', daysUntil: 6 },
  ],
  vsLastMonth: {
    incomeChange: 12.0,            // % cambio vs mes anterior
    expenseChange: -3.0,
    balanceChange: 8.0,
  },
},
```

**3. Mini-gráfico sparkline**

Dentro del widget, incluir un sparkline (línea pequeña) de los últimos 6 meses de EBITDA para dar contexto de tendencia sin ocupar mucho espacio.

**4. Acciones rápidas desde Dashboard**

Botones en el widget:
- "Registrar cobro" → abre modal de nuevo ingreso
- "Registrar pago" → abre modal de nuevo gasto
- "Ver finanzas" → navega a `/saas/finance`

#### Criterios de aceptación
- [ ] Widget "Salud financiera" visible en Dashboard
- [ ] KPIs calculados desde datos reales (cuentas, movimientos, facturas)
- [ ] Alertas financieras visibles dentro del widget
- [ ] Sparkline de tendencia EBITDA
- [ ] Acciones rápidas funcionales
- [ ] Click en widget navega a `/saas/finance`
- [ ] Responsive + dark mode

---

### FIN-11 — Integración: CRM ↔ Finanzas

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** FIN-04

#### Contexto
El módulo CRM (`ClientsPage.tsx`, `ClientDetail.tsx`) tiene su propia pestaña de facturación, pero no hay visibilidad cruzada con finanzas. Un comercial que ve un cliente no sabe si ese cliente tiene facturas impagadas que están generando alertas financieras.

#### Qué hacer

**1. Resumen financiero en ficha de cliente (`ClientDetail.tsx`)**

En la pestaña de facturación del cliente o como sección nueva:

```
┌────────────────────────────────────┐
│  📊 Resumen financiero              │
│                                      │
│  Total facturado:    15.400 €       │
│  Total cobrado:      12.300 €       │
│  Pendiente:           3.100 €       │
│  Facturas impagadas:  2             │
│                                      │
│  Última factura: F-2026-042 (Mar)   │
│  Método habitual: Transferencia     │
│  Plazo medio cobro: 28 días        │
│                                      │
│  ⚠ Factura F-2026-038 vencida      │
│    hace 15 días (1.800 €)           │
│  [Enviar recordatorio]             │
└────────────────────────────────────┘
```

**2. Indicador de riesgo en la lista de clientes**

En `ClientsPage.tsx`, añadir columna o badge:
- 🟢 Al día (sin facturas impagadas)
- 🟡 Pendiente (factura próxima a vencer)
- 🔴 Impago (factura vencida)

**3. Acción "Crear factura" → flujo integrado**

Al crear factura desde CRM:
- Pre-seleccionar la cuenta bancaria por defecto
- Mostrar aviso si el cliente tiene impagos anteriores
- Al marcar como pagada: activar la automatización de FIN-04

#### Criterios de aceptación
- [ ] Resumen financiero visible en la ficha del cliente
- [ ] Indicador de riesgo de impago en la lista de clientes
- [ ] Aviso al crear factura si el cliente tiene impagos
- [ ] Links cruzados entre CRM y Finanzas
- [ ] Plazo medio de cobro calculado correctamente

---

### FIN-12 — Integración: Compras y Stock ↔ Finanzas

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** FIN-05

#### Contexto
El módulo de Compras (`CatalogPage.tsx`, `SuppliersPage.tsx`, `OrdersPage.tsx`, `SupplierBillingPage.tsx`) gestiona proveedores y facturas de compra, pero la visibilidad financiera es limitada. Un gestor de compras no ve fácilmente cuánto debe a proveedores en total, ni el impacto de las compras en el cash flow.

#### Qué hacer

**1. Resumen financiero en ficha de proveedor**

En la página de proveedores o en su detalle:

```
┌────────────────────────────────────┐
│  📊 Resumen financiero              │
│                                      │
│  Total comprado:     24.600 €       │
│  Total pagado:       21.400 €       │
│  Pendiente de pago:   3.200 €       │
│  Facturas pendientes: 3             │
│                                      │
│  Plazo medio pago: 35 días         │
│  Último pago: 28/03/2026           │
└────────────────────────────────────┘
```

**2. Widget en SupplierBillingPage**

Añadir KPIs superiores:
- Total pendiente de pago (todas las facturas)
- Facturas vencidas (count + importe)
- Promedio de días de pago
- Comparativa vs mes anterior

**3. Flujo de pago integrado**

Al marcar una factura de compra como pagada en `SupplierBillingPage`:
- Si la automatización FIN-05 está activa: el gasto se crea solo
- Si no: ofrecer botón "Registrar pago en finanzas" que abre el modal pre-rellenado
- Actualizar el estado de la factura Y del movimiento vinculado

#### Criterios de aceptación
- [ ] Resumen financiero en ficha de proveedor
- [ ] KPIs financieros en página de facturación proveedores
- [ ] Flujo de pago integrado con automatización FIN-05
- [ ] Links cruzados entre Compras y Finanzas
- [ ] Promedio de días de pago calculado correctamente

---

### FIN-13 — Integración: Verticales ↔ Finanzas

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** FIN-04, FIN-05

#### Contexto
Varias verticales tienen su propia facturación especializada: `LawyerBilling.tsx`, `TaxiBilling.tsx`, `VetBilling.tsx`. Estas facturaciones generan ingresos/gastos pero están desconectadas del módulo central de finanzas. El grupo `finanzas` del sidebar ya está en todas las verticales (`Sidebar.tsx` línea 450-471), pero los datos no fluyen.

#### Qué hacer

**1. Mapeo vertical → categorías financieras**

Crear `src/app/lib/verticalFinanceMapping.ts`:

```typescript
export const VERTICAL_INCOME_CATEGORIES: Record<BusinessType, {value:string, label:string}[]> = {
  carDealership: [
    { value: 'venta_vehiculo', label: 'Venta vehículo' },
    { value: 'financiacion', label: 'Financiación' },
    { value: 'garantia', label: 'Garantía' },
    // ... 
  ],
  lawyer: [
    { value: 'honorarios', label: 'Honorarios' },
    { value: 'provisiones', label: 'Provisiones de fondos' },
    { value: 'costas', label: 'Costas procesales' },
  ],
  vet: [
    { value: 'consulta', label: 'Consulta' },
    { value: 'cirugia', label: 'Cirugía' },
    { value: 'vacunacion', label: 'Vacunación' },
  ],
  // ... para cada vertical
};
```

**2. Hook de facturación vertical → movimiento financiero**

Cuando una vertical genera una factura/cobro (ej: `LawyerBilling` registra honorarios):
- Invocar la misma lógica de FIN-04 para crear el movimiento
- Usar las categorías específicas de la vertical
- Vincular con `linkedInvoiceType: 'vertical_billing'` + identificador de la vertical

**3. Categorías dinámicas en FinanceView**

En `FinanceView.tsx`, las constantes `INCOME_CATEGORIES` y `EXPENSE_CATEGORIES` actualmente están hardcodeadas. Deben ser dinámicas según la vertical:
- Leer la vertical activa del contexto de negocio
- Combinar las categorías base con las de la vertical
- Mostrar todas en el selector del modal de movimiento

**4. Informe "Finanzas por vertical"**

En los informes financieros (FIN-09), añadir vista que agrupe ingresos/gastos por la categoría de la vertical. Ejemplo para un concesionario:

```
Ingresos por actividad
  Venta vehículos:    85.000 € (70%)
  Financiación:       20.000 € (17%)
  Taller:             10.000 € (8%)
  Garantías:           5.000 € (4%)
```

#### Criterios de aceptación
- [ ] Mapping de categorías financieras por vertical
- [ ] Al facturar desde vertical, se crea movimiento en finanzas automáticamente
- [ ] Categorías del modal de movimiento son dinámicas según vertical
- [ ] Informe de finanzas agrupado por categoría de vertical
- [ ] Funciona para las verticales con billing propio (lawyer, taxi, vet como mínimo)

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelos de datos)
├── FIN-01 Cuentas bancarias
└── FIN-02 Calendario fiscal

Fase 2 — Vista ejecutiva
└── FIN-03 Landing financiera (visión unificada)

Fase 3 — Automatizaciones
├── FIN-04 Factura emitida = Ingreso
├── FIN-05 Factura recibida = Gasto
└── FIN-06 Cobro/Pago actualiza saldos

Fase 4 — Alertas e Informes
├── FIN-07 Sistema de alertas financieras
└── FIN-09 Informes económicos

Fase 5 — Integraciones
├── FIN-08 Documentación ↔ Finanzas
├── FIN-10 Dashboard ↔ Finanzas
├── FIN-11 CRM ↔ Finanzas
├── FIN-12 Compras y Stock ↔ Finanzas
└── FIN-13 Verticales ↔ Finanzas
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| FIN-01 Cuentas bancarias | Media | 4-5h |
| FIN-02 Calendario fiscal | Media | 3-4h |
| FIN-03 Landing financiera | Alta | 6-8h |
| FIN-04 Factura emitida = Ingreso | Alta | 5-6h |
| FIN-05 Factura recibida = Gasto | Alta | 4-5h |
| FIN-06 Cobro/Pago actualiza saldos | Media-Alta | 4-5h |
| FIN-07 Alertas financieras | Alta | 5-6h |
| FIN-08 Documentación ↔ Finanzas | Media | 4-5h |
| FIN-09 Informes económicos | Muy Alta | 8-10h |
| FIN-10 Dashboard ↔ Finanzas | Media | 3-4h |
| FIN-11 CRM ↔ Finanzas | Media | 3-4h |
| FIN-12 Compras y Stock ↔ Finanzas | Media | 3-4h |
| FIN-13 Verticales ↔ Finanzas | Alta | 5-6h |
| **Total** | | **~57-72h** |

---

## Notas técnicas

### Base de datos
Todos los documentos nuevos (`bank_account`, `tax_obligation`) se almacenan en la DB de finanzas (nombre de env `VITE_FINANCE_DB` o `VITE_PAYMENTS_DB`, por defecto `pay`). Las ampliaciones a `FinanceMovementRecord` (campos `bankAccountId`, `linkedInvoiceId`, `documentIds`) son retrocompatibles — CouchDB no requiere migraciones.

### Sin migraciones
CouchDB no requiere migraciones de esquema. Los nuevos campos en documentos existentes se acceden con fallback a `undefined`. Los nuevos tipos de documento se crean al vuelo.

### Retrocompatibilidad
- Los movimientos existentes sin `bankAccountId` siguen funcionando (campo opcional)
- Las facturas existentes sin `linkedMovementId` siguen funcionando
- Las automatizaciones son opt-in con configuración en Settings
- Las rutas existentes (`/saas/finance`, `/saas/income-expenses`, etc.) no cambian

### Acceso y permisos
- La lógica de permisos ya existe: `TEAM_PERMISSION_KEYS` incluye `'finance'`
- Las nuevas funcionalidades respetan el mismo sistema de permisos
- Las alertas financieras solo se generan para usuarios con permiso `finance`

### Consistencia con alertEngine existente
Las nuevas alertas (FIN-07) siguen exactamente el mismo patrón del `alertEngine.js` actual:
- Misma función `emitAlert()` con dedup por `_id` diario
- Mismas notificaciones in-app + SSE + Web Push
- Misma estructura de configuración en `account.alertConfig`

### Precisión numérica
Todos los cálculos financieros usan `Number.toFixed(2)` para evitar errores de punto flotante. Los saldos se almacenan como números con 2 decimales.

### i18n
Los labels nuevos deben incluirse en los idiomas existentes del sistema (es, en, pt, fr) siguiendo el patrón de `i18n.ts`. Las categorías financieras por vertical deben ser traducibles.
