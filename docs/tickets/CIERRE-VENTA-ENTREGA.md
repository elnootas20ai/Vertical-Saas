# CIERRE DE VENTA Y ENTREGA — Plan de Tickets

**Página:** `/saas/vertical/compraventa/cierre-venta` (accesible también desde `/saas/sales/:id`)
**Objetivo:** Cerrar la operación de venta del vehículo y preparar/confirmar la entrega al cliente.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo `SaleRecord` con stages: interested → reserved → documentation → sold → delivered | Completo | `src/app/lib/salesTypes.ts` — `SaleStage`, `SaleRecord` |
| CRUD de ventas (CouchDB) | Completo | `src/app/lib/salesApi.ts` — `createSaleInCouch`, `updateSaleInCouch`, `listSalesRecords`, `deleteSaleInCouch` |
| Cambio de fase (stage) con historial | Completo | `SaleDetail.tsx` — `handleStageChange()` con `stageHistory[]` |
| Registro de cobros (pagos parciales/totales) | Completo | `SaleDetail.tsx` — `RegisterPaymentModal`, `handleRegisterPayment()` con `paymentHistory[]` |
| Auto-cambio a `sold` cuando `depositPaid + financingAmount >= totalPrice` | Completo | `SaleDetail.tsx` — `handleRegisterPayment()` (líneas 1824–1827) |
| Tab Resumen con acción recomendada dinámica según fase y cobros | Completo | `SaleDetail.tsx` — `TabResumen`, `getNextAction()` |
| Tab Cobros con desglose (señal, financiación, pendiente), barra de progreso, fiscal | Completo | `SaleDetail.tsx` — `TabCobros` con hero status, desglose, IVA 21% |
| Tab Documentos con 4 docs requeridos (contrato, factura, hoja encargo, acta entrega) | Completo | `SaleDetail.tsx` — `TabDocumentos`, `REQUIRED_DOC_DEFS` |
| Tab Entrega con checklist de 7 puntos + confirmar entrega | Completo | `SaleDetail.tsx` — `TabEntrega`, `DEFAULT_DELIVERY_CHECKLIST` |
| Tab Historial con timeline unificado (stages, cobros, documentos, notas, precios) | Completo | `SaleDetail.tsx` — `TabHistorial` |
| Modal de edición de venta (precio, financiación, entrega prevista, responsable, etc.) | Completo | `SaleDetail.tsx` — `EditSaleModal` |
| Modal de cambio de fase | Completo | `SaleDetail.tsx` — `ChangeStageModal` |
| Simulador de financiación | Completo | `SaleDetail.tsx` — `FinancingCalculatorModal` |
| Notificaciones in-app al cambiar a `sold`/`delivered` | Completo | `SaleDetail.tsx` — `createNotification()` en `handleStageChange` y `handleConfirmDelivery` |
| Listado de ventas con vista pipeline + tabla + facturación + objetivos | Completo | `Sales.tsx` — 4 tabs |
| Creación de venta con modal completo | Completo | `SAAS__CreateSaleModal.tsx` |
| Generación de documentos (contrato + factura) | Completo | `contractsApi.ts` — `saveContractAndGenerateInvoice()` |
| Firma digital en contratos | Completo | `contractsApi.ts` — `signContractInCouch()` |
| Estado de vehículo: available, reserved, sold, workshop, scrapped | Completo | `AppContext.tsx` — `Vehicle.status`, `DesignTokens.ts` — `VEHICLE_STATUS_TOKEN` |
| Margen estimado (precio venta − precio compra) | Completo | `SaleDetail.tsx` — `TabResumen` y `TabCobros` |
| Historial de cambios de precio con aprobación de gerente | Completo | `SaleDetail.tsx` — `EditSaleModal` con `priceHistory[]` |
| Precio mínimo con validación | Completo | `salesTypes.ts` — `SaleRecord.minimumPrice` |
| Motor de alertas general con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Alerta: velocidad de ventas baja | Completo | `alertEngine.js` — `checkLowSalesVelocity()` |
| Centro de trabajo multi-sede | Completo | `SaleRecord.workCenterId`, `workCenterName` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Página dedicada de "cierre de venta" como paso claro del flujo | No existe — el cierre es solo cambiar fase a `sold` en `SaleDetail.tsx` |
| Validación pre-cierre (checklist de requisitos: cobro, contrato, documentación) | No existe — se puede marcar como `sold` sin validar nada |
| Bloqueo del vehículo al cerrar la venta (impedir que se venda a otro) | No existe — el status del vehículo NO se actualiza automáticamente al cambiar la venta de fase |
| Generación automática de ingreso en Finanzas al cerrar venta | No existe — los módulos Sales y Finance están desconectados |
| Registro de entrega con acta formal (fecha real, firma, observaciones) | Parcial — hay checklist pero no genera acta ni registra quién entregó/recibió |
| Alerta: venta sin pago completo | No existe en `alertEngine.js` |
| Alerta: entrega pendiente (venta cerrada pero vehículo no entregado) | No existe en `alertEngine.js` |
| Alerta: contrato pendiente de firma | No existe en `alertEngine.js` |
| Alerta: vehículo vendido no entregado pasado X días | No existe en `alertEngine.js` |
| Conexión Sales → Reservas (la reserva debería cerrarse al cerrar la venta) | No existe |
| Conexión Sales → CRM (actualizar estado del lead/oportunidad) | No existe |
| Conexión Sales → Vehículos (cambiar estado automáticamente) | No existe — `Vehicle.status` no se toca desde el flujo de venta |
| Conexión Sales → Documentación (vincular docs generados al módulo central) | No existe |
| Conexión Sales → Finanzas (generar ingreso, alimentar informes) | No existe |
| Conexión Sales → Dashboard (KPIs de cierre, margen final) | Parcial — hay `soldThisMonth` pero no KPIs de cierre en dashboard |
| Perfil gerente: validación obligatoria de cobros/contratos antes del cierre | No existe — cualquier perfil puede cerrar |
| Perfil trabajador: restricción de permisos para cierre final | No existe — no hay control de permisos en el flujo de venta |
| Margen final calculado post-cierre (incluyendo costes asociados, comisiones) | Parcial — solo compra vs venta, no incluye costes asociados del vehículo |
| Documento de venta generado automáticamente al cerrar (factura + acta) | No existe como automatización — es manual |
| Observaciones de cierre (campo dedicado para notas del cierre) | No existe — las notas internas no distinguen contexto |

---

## Tickets

---

### CV-01 — Modelo de datos: Ampliación de SaleRecord para cierre y entrega

**Tipo:** API Client + Types
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto

El `SaleRecord` actual tiene los campos básicos para el flujo de venta, pero le faltan datos estructurados para el cierre formal y la entrega. El cierre necesita su propio registro: quién lo autorizó, cuándo, bajo qué condiciones, y con qué validaciones. La entrega también necesita más datos: quién recibió, quién entregó, firma, observaciones, y un acta generada.

#### Qué hacer

**1. Ampliar `SaleRecord` en `src/app/lib/salesTypes.ts`**

```typescript
export interface SaleClosureData {
  closedAt: string;
  closedBy: string;
  approvedBy?: string;
  paymentComplete: boolean;
  contractSigned: boolean;
  documentationComplete: boolean;
  closureNotes: string;
  finalPrice: number;
  finalMargin: number;
  finalMarginPercent: number;
  associatedCosts: number;
  commissionAmount?: number;
  commissionAgent?: string;
}

export interface SaleDeliveryData {
  scheduledDate: string;
  actualDate?: string;
  deliveredBy: string;
  receivedBy: string;
  receivedByDni?: string;
  receivedByPhone?: string;
  deliveryLocation: string;
  deliveryNotes: string;
  signatureData?: string;
  actaDocumentId?: string;
  fuelLevel?: string;
  mileageAtDelivery?: number;
  conditionNotes?: string;
  photosAtDelivery?: string[];
}

export type SaleBlockReason = 'sold' | 'reserved' | 'pending_delivery';
```

Añadir a `SaleRecord`:

```typescript
export interface SaleRecord {
  // ... campos existentes ...
  closureData?: SaleClosureData;
  deliveryData?: SaleDeliveryData;
  vehicleBlocked: boolean;
  vehicleBlockReason?: SaleBlockReason;
  vehicleStatusBeforeSale?: string;
}
```

**2. Ampliar `normalizeSaleRecord()` para los nuevos campos**

Retrocompatibilidad: registros existentes sin `closureData` siguen funcionando (campo opcional con fallback a `undefined`).

**3. Ampliar `DEFAULT_DELIVERY_CHECKLIST` con puntos adicionales**

```typescript
export const DEFAULT_DELIVERY_CHECKLIST = [
  { id: 'payment',     label: 'Cobro completo verificado' },
  { id: 'contract',    label: 'Contrato de compraventa firmado por ambas partes' },
  { id: 'invoice',     label: 'Factura de venta emitida y entregada' },
  { id: 'docs',        label: 'Documentación completa (ficha técnica, ITV, permiso circulación)' },
  { id: 'transfer',    label: 'Transferencia de titularidad tramitada' },
  { id: 'keys',        label: 'Llaves entregadas (principal + copia)' },
  { id: 'accessories', label: 'Accesorios incluidos (alfombrillas, triángulos, chaleco)' },
  { id: 'condition',   label: 'Estado del vehículo verificado (sin daños nuevos)' },
  { id: 'manual',      label: 'Manual del propietario entregado' },
  { id: 'warranty',    label: 'Garantía y condiciones explicadas al cliente' },
  { id: 'clean',       label: 'Vehículo limpio y preparado para entrega' },
  { id: 'fuel',        label: 'Nivel de combustible verificado y registrado' },
  { id: 'mileage',     label: 'Kilometraje registrado en el acta de entrega' },
];
```

**4. Helpers nuevos**

```typescript
export function isSaleReadyToClose(sale: SaleRecord): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (getSalePendingAmount(sale) > 0) missing.push('Cobro incompleto');
  if (!sale.generatedDocuments.some(d => d.type === 'contract' && d.status === 'ok'))
    missing.push('Contrato de compraventa');
  if (!sale.generatedDocuments.some(d => d.type === 'invoice' && d.status === 'ok'))
    missing.push('Factura de venta');
  return { ready: missing.length === 0, missing };
}

export function isSaleReadyToDeliver(sale: SaleRecord): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (sale.stage !== 'sold' && sale.stage !== 'delivered') missing.push('La venta no está cerrada');
  if (getSalePendingAmount(sale) > 0) missing.push('Cobro incompleto');
  if (!sale.deliveryChecklist.every(i => i.checked)) missing.push('Checklist de entrega incompleto');
  return { ready: missing.length === 0, missing };
}

export function getSaleFinalMargin(sale: SaleRecord, vehicleCosts: number): number {
  return sale.totalPrice - sale.purchasePrice - vehicleCosts - (sale.closureData?.commissionAmount || 0);
}
```

#### Criterios de aceptación
- [ ] `SaleClosureData` y `SaleDeliveryData` definidos en `salesTypes.ts`
- [ ] `normalizeSaleRecord()` maneja los nuevos campos con retrocompatibilidad
- [ ] Checklist de entrega ampliado con 13 puntos (6 nuevos)
- [ ] `isSaleReadyToClose()` valida cobro, contrato y factura
- [ ] `isSaleReadyToDeliver()` valida cierre, cobro y checklist
- [ ] `getSaleFinalMargin()` incluye costes asociados y comisiones
- [ ] Los registros existentes sin los nuevos campos siguen funcionando sin errores

---

### CV-02 — Flujo de cierre de venta con validación pre-cierre

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** CV-01

#### Contexto

Actualmente, pasar una venta a `sold` es un simple cambio de fase en el `ChangeStageModal`: se selecciona "Vendido" y se confirma, sin ninguna validación. El cierre de una venta requiere verificar que el cobro está completo, que existe contrato firmado, que la documentación está en orden, y que un gerente ha dado el visto bueno si la operación lo requiere.

#### Qué hacer

**1. Crear `CloseSaleWizard` como modal de 3 pasos**

Cuando el usuario intenta pasar una venta a `sold` (desde `ChangeStageModal`, desde el botón "Cerrar venta" del `TabResumen`, o desde acción contextual), abrir un wizard:

**Paso 1 — VERIFICACIÓN DE REQUISITOS:**

```
┌──────────────────────────────────────────────────────────┐
│  Cerrar venta — Verificación                              │
│                                                            │
│  ✅ Cobro completado (15.400 €)                           │
│  ✅ Contrato de compraventa firmado                       │
│  ❌ Factura de venta — Pendiente                          │
│  ✅ Documentación completa                                │
│                                                            │
│  ⚠ Hay 1 requisito pendiente. Puedes cerrar con          │
│    autorización de gerente.                                │
│                                                            │
│  [Cancelar]                           [Continuar →]       │
└──────────────────────────────────────────────────────────┘
```

Lógica de validación usando `isSaleReadyToClose()` de CV-01:

| Requisito | Fuente | Obligatorio |
|---|---|---|
| Cobro completo | `getSalePendingAmount(sale) === 0` | Sí (o aprobación gerente) |
| Contrato firmado | `generatedDocuments` tipo `contract` status `ok` | Sí (o aprobación gerente) |
| Factura emitida | `generatedDocuments` tipo `invoice` status `ok` | Sí |
| Documentación completa | `REQUIRED_DOC_DEFS` todos con status `ok` | Recomendado |

Si hay requisitos incumplidos y el usuario es gerente: checkbox "Autorizo el cierre con requisitos pendientes" + campo de motivo. Si es trabajador: bloquear.

**Paso 2 — RESUMEN DE OPERACIÓN:**

```
┌──────────────────────────────────────────────────────────┐
│  Cerrar venta — Resumen final                             │
│                                                            │
│  Vehículo:    BMW Serie 3 320d (1234 ABC)                 │
│  Cliente:     Juan García López                           │
│  Precio:      15.400 €                                    │
│  Forma pago:  Transferencia + Financiación (8.000€ BBVA)  │
│  Cobrado:     15.400 € (100%)                             │
│  Margen:      3.200 € (20.8%)                             │
│  Costes asoc: 450 € (ITV + limpieza)                      │
│  Margen neto: 2.750 € (17.9%)                             │
│  Comisión:    [250 €] → [Pedro Ruiz ▾]                    │
│  Entrega:     [📅 18/04/2026]                             │
│  Observaciones: [________________________]                │
│                                                            │
│  [← Atrás]                         [Confirmar cierre →]   │
└──────────────────────────────────────────────────────────┘
```

Campos editables: comisión (importe + agente), fecha entrega prevista, observaciones de cierre.

**Paso 3 — CONFIRMACIÓN:**

```
┌──────────────────────────────────────────────────────────┐
│  ✅ Venta cerrada correctamente                           │
│                                                            │
│  BMW Serie 3 320d vendido a Juan García López             │
│  Margen final: 2.750 € (17.9%)                           │
│                                                            │
│  Se ha realizado automáticamente:                         │
│  ✓ Vehículo marcado como vendido                         │
│  ✓ Vehículo bloqueado para nuevas ventas                 │
│  ✓ Ingreso registrado en Finanzas                        │
│  ✓ Historial actualizado                                 │
│                                                            │
│  [Ver entrega]          [Volver a ventas]                 │
└──────────────────────────────────────────────────────────┘
```

**2. Acciones automáticas al confirmar cierre**

```typescript
async function executeSaleClosure(sale, closureForm, userId) {
  const now = new Date().toISOString();
  const closureData: SaleClosureData = {
    closedAt: now,
    closedBy: userId,
    approvedBy: closureForm.approvedBy,
    paymentComplete: getSalePendingAmount(sale) === 0,
    contractSigned: Boolean(sale.generatedDocuments.find(d => d.type === 'contract' && d.status === 'ok')),
    documentationComplete: true,
    closureNotes: closureForm.notes,
    finalPrice: sale.totalPrice,
    finalMargin: sale.totalPrice - sale.purchasePrice - closureForm.associatedCosts,
    finalMarginPercent: Math.round(((sale.totalPrice - sale.purchasePrice - closureForm.associatedCosts) / sale.totalPrice) * 100),
    associatedCosts: closureForm.associatedCosts,
    commissionAmount: closureForm.commissionAmount,
    commissionAgent: closureForm.commissionAgent,
  };

  // 1. Actualizar SaleRecord con closureData y stage='sold'
  // 2. Sincronizar estado del vehículo → sold (CV-04)
  // 3. Generar ingreso en Finanzas (CV-05)
  // 4. Generar documentos pendientes si aplica (CV-06)
  // 5. Crear notificación
}
```

**3. Intercepción del cambio de fase**

En `handleStageChange()` de `SaleDetail.tsx`:
- Si `nextStage === 'sold'`: abrir `CloseSaleWizard` en vez de cambiar directamente
- Si `nextStage === 'delivered'`: abrir flujo de entrega (CV-03)
- Para el resto de fases: mantener el comportamiento actual

**4. Acceso directo desde la tabla de ventas**

En `Sales.tsx`, acción contextual "Cerrar venta" visible cuando la venta está en fase `documentation` o `reserved` con cobro completo.

#### Criterios de aceptación
- [ ] `CloseSaleWizard` con 3 pasos: verificación, resumen, confirmación
- [ ] Paso 1 valida cobro, contrato, factura y documentación
- [ ] Si hay requisitos pendientes: gerente puede autorizar, trabajador es bloqueado
- [ ] Paso 2 muestra resumen completo con margen neto, comisiones y costes
- [ ] Paso 3 ejecuta acciones automáticas (vehículo, finanzas, documentos)
- [ ] El `ChangeStageModal` redirige al wizard al seleccionar `sold`
- [ ] Se registra `closureData` en el `SaleRecord`
- [ ] Timeline refleja el cierre con todos los datos
- [ ] Dark mode y responsive
- [ ] Diseño coherente con modales existentes (rounded-3xl, sombras, gradientes)

---

### CV-03 — Flujo de entrega formal con acta y firma

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** CV-01, CV-02

#### Contexto

La tab de entrega actual (`TabEntrega`) tiene un checklist funcional y un botón de confirmación, pero le falta el contexto de una entrega formal: quién entrega, quién recibe, firma del receptor, datos del vehículo al momento (km, combustible), observaciones de estado, y generación de un acta firmada.

#### Qué hacer

**1. Rediseñar `TabEntrega` con 4 secciones**

**Sección 1 — Estado previo:** Banner informativo con estado de cobro, contrato, documentación y vehículo. Badges verde/rojo. Warning si hay cobro pendiente (requiere aprobación gerente).

**Sección 2 — Checklist de entrega:** El existente, ampliado con los 13 puntos de CV-01. Barra de progreso. Misma mecánica de toggle + notas.

**Sección 3 — Datos de entrega:** Formulario con campos pre-rellenados:

| Campo | Pre-relleno desde | Editable |
|---|---|---|
| Fecha de entrega | Hoy | Sí |
| Entregado por | Usuario actual (equipo) | Sí (dropdown equipo) |
| Recibido por | `sale.clientName` | Sí |
| DNI receptor | CRM del cliente | Sí |
| Teléfono receptor | `sale.clientPhone` | Sí |
| Lugar de entrega | Centro de trabajo | Sí |
| Km en entrega | `sale.vehicleMileage` | Sí |
| Nivel combustible | — | Sí (dropdown: vacío, 1/4, 1/2, 3/4, lleno) |
| Estado vehículo | — | Sí (textarea) |
| Observaciones | — | Sí (textarea) |
| Fotos de entrega | — | Sí (upload múltiple / cámara Capacitor) |

**Sección 4 — Firma del receptor:** Canvas HTML5 para captura de firma (táctil en tablet, ratón en desktop). Texto legal: "Acepto haber recibido el vehículo {nombre} ({matrícula}) en las condiciones indicadas." Botón "Limpiar" para reiniciar. Firma almacenada como base64 en `deliveryData.signatureData`.

**2. Acciones al confirmar entrega**

```
1. Guardar deliveryData en SaleRecord
2. Cambiar stage a 'delivered', setear deliveredAt
3. Generar acta de entrega PDF (CV-06)
4. Registrar en historial con detalle completo
5. Actualizar vehículo (CV-04)
6. Notificación
```

**3. Botón "Generar acta sin firma"**

Para casos donde el cliente firma en papel. Genera PDF con espacio para firma manuscrita.

#### Criterios de aceptación
- [ ] Sección 1: verificación de estado previo con badges verde/rojo
- [ ] Sección 2: checklist ampliado a 13 puntos
- [ ] Sección 3: formulario de datos de entrega con pre-relleno
- [ ] Sección 4: canvas de firma táctil/ratón con texto legal
- [ ] Datos de entrega guardados en `sale.deliveryData`
- [ ] "Confirmar entrega" cambia stage, genera acta, registra historial
- [ ] "Generar acta sin firma" genera PDF con espacio para firma manuscrita
- [ ] Warning si hay cobro pendiente (requiere aprobación gerente)
- [ ] Responsive: funcional en tablet para firma táctil in-situ
- [ ] Dark mode coherente
- [ ] Fotos: captura desde cámara (Capacitor) o upload de archivo

---

### CV-04 — Automatización: Vehículo bloqueado y estado sincronizado

**Tipo:** Lógica de negocio (API Client)
**Prioridad:** Crítica
**Dependencias:** CV-01, CV-02

#### Contexto

Cuando una venta cambia de fase, el vehículo asociado NO se actualiza. Un vehículo vendido sigue como "En stock" y nada impide crear otra venta sobre él. Es un bug de integridad de datos crítico.

#### Qué hacer

**1. Crear `src/app/lib/vehicleSaleSync.ts`**

```typescript
const STAGE_TO_VEHICLE_STATUS: Partial<Record<SaleStage, Vehicle['status']>> = {
  reserved: 'reserved',
  documentation: 'reserved',
  sold: 'sold',
  delivered: 'sold',
};

export async function syncVehicleWithSale(userId, sale, previousStage?) {
  const targetStatus = STAGE_TO_VEHICLE_STATUS[sale.stage];
  if (!targetStatus) return;
  await updateVehicle(userId, sale.vehicleId, { status: targetStatus });
}

export async function releaseVehicleFromSale(userId, sale) {
  const originalStatus = sale.vehicleStatusBeforeSale || 'available';
  await updateVehicle(userId, sale.vehicleId, { status: originalStatus });
}

export function isVehicleAvailableForSale(vehicle, existingSales) {
  if (vehicle.status === 'sold') return { available: false, reason: 'Vehículo ya vendido' };
  const activeSale = existingSales.find(
    s => s.vehicleId === vehicle.id && ['reserved', 'documentation', 'sold'].includes(s.stage)
  );
  if (activeSale) return { available: false, reason: `Operación activa (${activeSale.clientName})`, blockingSaleId: activeSale.id };
  return { available: true };
}
```

**2. Integrar en flujos**

- `handleStageChange()`: llamar `syncVehicleWithSale()` después de actualizar venta
- `SAAS__CreateSaleModal.tsx`: si fase inicial es `reserved`, marcar vehículo como `reserved`
- Al eliminar venta: llamar `releaseVehicleFromSale()`
- Guardar `vehicleStatusBeforeSale` al crear la venta para poder restaurar si se cancela

**3. Validación en creación de venta**

En `SAAS__CreateSaleModal.tsx`, al seleccionar vehículo:
- Llamar `isVehicleAvailableForSale()`
- Si no disponible: error con motivo y link a la venta que lo bloquea
- Vehículos `sold` NO aparecen en el selector

**4. Indicador visual en Vehículos**

En `Vehicles.tsx` y `VehicleDetail.tsx`:
- Vehículo `sold`: banner "Vendido — Operación {saleId}" con link
- Vehículo `reserved`: banner "Reservado — Operación {saleId}" con link

#### Criterios de aceptación
- [ ] Al cambiar fase a `reserved`/`documentation` → vehículo pasa a `reserved`
- [ ] Al cambiar fase a `sold` → vehículo pasa a `sold`
- [ ] Al cancelar/eliminar venta → vehículo vuelve a su estado anterior
- [ ] No se puede crear nueva venta sobre vehículo con venta activa
- [ ] `isVehicleAvailableForSale()` valida disponibilidad en creación
- [ ] Indicador visual en lista y detalle de vehículo con link a la venta
- [ ] Selector de vehículos en `CreateSaleModal` filtra vehículos no disponibles
- [ ] `vehicleStatusBeforeSale` se guarda al crear la venta

---

### CV-05 — Automatización: Generar ingreso en Finanzas al cerrar venta

**Tipo:** Lógica de negocio (API Client)
**Prioridad:** Alta
**Dependencias:** CV-02

#### Contexto

Cuando se cierra una venta, finanzas necesita un ingreso automático. Actualmente Sales y Finance están desconectados. El módulo de finanzas ya existe (`financeApi.ts`, `financeTypes.ts`) con movimientos tipo `cobro` y `pago`.

#### Qué hacer

**1. Crear `src/app/lib/saleFinanceSync.ts`**

```typescript
export async function generateSaleIncomeMovement(userId, sale) {
  const baseImponible = sale.totalPrice / 1.21;
  await createFinanceMovement(userId, {
    type: 'cobro',
    concept: `Venta vehículo — ${sale.vehicleName} (${sale.vehiclePlate}) a ${sale.clientName}`,
    amountBase: baseImponible,
    taxRate: 21,
    totalAmount: sale.totalPrice,
    date: sale.closureData?.closedAt || new Date().toISOString(),
    payMethod: sale.paymentMethod || 'transferencia',
    category: 'venta_vehiculo',
    reference: `VENTA-${sale.id}`,
    linkedEntityId: sale.id,
    linkedEntityType: 'sale',
    notes: sale.closureData?.closureNotes || '',
  });
}

export async function generateCommissionExpense(userId, sale) {
  if (!sale.closureData?.commissionAmount) return;
  await createFinanceMovement(userId, {
    type: 'pago',
    concept: `Comisión venta — ${sale.vehicleName} → ${sale.closureData.commissionAgent}`,
    totalAmount: sale.closureData.commissionAmount,
    category: 'comisiones',
    reference: `COM-${sale.id}`,
    linkedEntityId: sale.id,
    linkedEntityType: 'sale',
  });
}
```

**2. Integrar en flujo de cierre (CV-02, paso 3)**

Tras confirmar cierre: generar ingreso + comisión. Validar duplicados por `reference`.

**3. Configuración opt-in**

En Settings: `financeAutomation.autoCreateIncomeOnSale: boolean` (default: `true`). Si desactivado: mostrar botón "Registrar en finanzas" manual.

#### Criterios de aceptación
- [ ] Al cerrar venta → movimiento `cobro` creado en finanzas automáticamente
- [ ] Movimiento incluye `linkedEntityId` y `linkedEntityType: 'sale'`
- [ ] Si hay comisión → movimiento `pago` por la comisión
- [ ] No se crean duplicados (validación por `reference`)
- [ ] Configuración opt-in en Settings
- [ ] Confirmación visual en paso 3 del wizard
- [ ] Desglose fiscal (base imponible + IVA) correcto

---

### CV-06 — Generación automática de documentos de venta

**Tipo:** Lógica de negocio (Frontend + Backend)
**Prioridad:** Alta
**Dependencias:** CV-02, CV-03

#### Contexto

La documentación requiere contrato, factura, hoja de encargo y acta de entrega. Actualmente se suben manualmente. Ya existe `contractsApi.ts` con `saveContractAndGenerateInvoice()` pero no se invoca automáticamente, y no existe generador de acta de entrega.

#### Qué hacer

**1. Generar documentos al cerrar venta (CV-02, paso 3)**

Si faltan documentos requeridos al confirmar cierre:
- Sin contrato → generar con `saveContractAndGenerateInvoice()`
- Sin factura → generar con `invoicePdfGenerator`
- Vincular documentos generados al `SaleRecord.generatedDocuments`

**2. Generador de acta de entrega PDF**

Crear `src/app/lib/deliveryActaPdfGenerator.ts` usando `jspdf` (ya en dependencias):

Contenido del acta:
- Datos empresa (nombre, CIF, dirección)
- Datos cliente (nombre, DNI, dirección)
- Datos vehículo (marca, modelo, matrícula, VIN, km, combustible)
- Checklist de entrega completado (los 13 puntos con ✅/❌)
- Km y combustible al momento de entrega
- Observaciones de estado
- Firma digital del receptor (imagen base64) o espacio para firma manuscrita
- Firma del entregador
- Fecha y hora
- Texto legal de conformidad

**3. Vincular al módulo de Documentación**

Los documentos generados se crean también como `type: 'document'` en la DB de documentos (vía `documentsApi.ts`), vinculados a vehículo y cliente. Así aparecen en:
- `DocumentsPage.tsx` (módulo central)
- `ClientDetail.tsx` (pestaña documentos del cliente)

**4. Botón "Generar acta" en TabEntrega**

Disponible cuando la entrega se ha confirmado o el checklist está completo.

#### Criterios de aceptación
- [ ] Al cerrar venta, se generan automáticamente documentos faltantes (contrato, factura)
- [ ] Generador de acta de entrega en PDF con todos los datos
- [ ] Acta incluye firma digital del receptor si existe
- [ ] Acta incluye checklist completado
- [ ] Documentos generados también en módulo de documentación central
- [ ] Documentos vinculados al cliente y al vehículo
- [ ] Botón "Generar acta" en tab de entrega
- [ ] PDF descargable y previsualizable

---

### CV-07 — Sistema de alertas de cierre y entrega

**Tipo:** Backend (alertEngine.js)
**Prioridad:** Alta
**Dependencias:** CV-01

#### Contexto

El `alertEngine.js` no tiene alertas para el flujo de cierre y entrega. Se necesitan 4 alertas nuevas.

#### Qué hacer

**1. Alerta: Venta sin pago completo**

Detecta ventas en fase `reserved`/`documentation`/`sold` con cobro parcial y más de X días abiertas (default: 7). Nivel `warning` o `alert` si >30 días. Categoría: `sale_pending_payment`.

**2. Alerta: Entrega pendiente**

Detecta ventas en fase `sold` sin `deliveredAt` con más de X días desde cierre (default: 3). Si hay `expectedDelivery` pasada: nivel `alert` ("Entrega retrasada"). Categoría: `pending_delivery`.

**3. Alerta: Contrato pendiente de firma**

Detecta ventas en fase `documentation`/`sold` sin documento contrato con status `ok` tras X días (default: 3). Categoría: `unsigned_contract`.

**4. Alerta: Vehículo vendido no entregado**

Detecta ventas `sold` sin entrega tras umbral mayor (default: 15 días). Nivel siempre `alert`. Categoría: `sold_not_delivered`.

**5. Configuración**

Ampliar `getAlertConfig()`:

```javascript
salePendingPaymentEnabled: cfg.salePendingPaymentEnabled !== false,
salePendingPaymentDays: Number(cfg.salePendingPaymentDays || 7),
pendingDeliveryEnabled: cfg.pendingDeliveryEnabled !== false,
pendingDeliveryDays: Number(cfg.pendingDeliveryDays || 3),
unsignedContractEnabled: cfg.unsignedContractEnabled !== false,
unsignedContractDays: Number(cfg.unsignedContractDays || 3),
soldNotDeliveredEnabled: cfg.soldNotDeliveredEnabled !== false,
soldNotDeliveredDays: Number(cfg.soldNotDeliveredDays || 15),
```

**6. Integrar en `runAlertsForUser()`**

Cargar datos de ventas desde DB del usuario y ejecutar las 4 funciones.

#### Criterios de aceptación
- [ ] `checkSalesWithPendingPayment()` detecta ventas con cobro parcial
- [ ] `checkPendingDeliveries()` detecta ventas cerradas sin entregar
- [ ] `checkUnsignedContracts()` detecta ventas sin contrato firmado
- [ ] `checkSoldNotDelivered()` detecta vehículos vendidos sin entregar tras umbral
- [ ] Las 4 reglas integradas en el ciclo del `alertEngine`
- [ ] Configuración de activación/desactivación y umbrales por regla
- [ ] Notificaciones in-app + SSE + Web Push como las alertas existentes

---

### CV-08 — Conexión: Dashboard y métricas de cierre

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CV-02, CV-05

#### Contexto

Dashboard y SalesMetrics no reflejan datos de cierre: margen final real, velocidad de cierre, ratio de conversión, entregas pendientes. Estos datos son clave para la gestión.

#### Qué hacer

**1. Ampliar endpoint de KPIs**

Añadir al endpoint `/api/dashboard/kpis/:userId`:

```javascript
salesClosure: {
  closedThisMonth: 5,
  closedThisMonthValue: 72000,
  avgClosureMargin: 18.5,          // % medio
  avgClosureDays: 12,              // días medio hasta cierre
  pendingDeliveries: 2,
  deliveredThisMonth: 3,
  conversionRate: 68,              // % pipeline → cierre
  topAgent: { name: 'Pedro', closed: 3, value: 45000 },
  alerts: { pendingPayments: 1, pendingDeliveries: 2, unsignedContracts: 0 },
}
```

**2. Widget "Cierre y Entrega" en Dashboard**

Card con 4 KPIs (cerrados, volumen, margen medio, tiempo medio), entregas pendientes, y alertas.

**3. Ampliar `SalesMetrics.tsx` con sección de cierre**

Nueva sección/tab "Cierre y Margen" con:
- Margen medio por venta, margen total mes
- Tiempo medio de cierre y de entrega
- Ratio conversión pipeline → cierre
- Top comerciales por cierre y margen
- Gráfico: evolución margen (12 meses)
- Gráfico: funnel de conversión (pipeline → reserva → documentación → cierre → entrega)

**4. Feed de actividad reciente**

Últimas acciones de cierre/entrega en dashboard o landing de ventas.

#### Criterios de aceptación
- [ ] Endpoint KPIs ampliado con datos de cierre y entrega
- [ ] Widget "Cierre y Entrega" visible en Dashboard
- [ ] Sección "Cierre y Margen" en `SalesMetrics.tsx`
- [ ] Gráfico evolución margen (12 meses)
- [ ] Funnel de conversión visual
- [ ] Ranking de comerciales
- [ ] Feed de actividad reciente
- [ ] Responsive + dark mode

---

### CV-09 — Perfiles de acceso: gerente vs trabajador

**Tipo:** Frontend (permisos)
**Prioridad:** Alta
**Dependencias:** CV-02, CV-03

#### Contexto

El sistema de permisos existe (`TEAM_PERMISSION_KEYS`) pero el flujo de ventas no distingue roles. Un trabajador no debería cerrar con requisitos pendientes ni modificar precios.

#### Qué hacer

**1. Permisos granulares**

| Acción | Gerente | Trabajador |
|---|---|---|
| Ver ventas | ✅ | ✅ (solo suyas o de su centro) |
| Crear venta | ✅ | ✅ |
| Cambiar precio | ✅ | ❌ (requiere aprobación) |
| Precio por debajo del mínimo | ✅ (con log) | ❌ |
| Cerrar venta (requisitos OK) | ✅ | ✅ |
| Cerrar con requisitos pendientes | ✅ | ❌ |
| Confirmar entrega | ✅ | ✅ |
| Eliminar venta | ✅ | ❌ |
| Ver informes completos | ✅ | ✅ (métricas propias) |
| Validar cobros y contratos | ✅ | ❌ |

**2. Hook `useSalePermissions()`**

```typescript
export function useSalePermissions() {
  const { teamMember } = useApp();
  const isManager = teamMember?.role === 'admin' || teamMember?.role === 'manager';
  return {
    canClose: isManager || hasPermission(teamMember, 'sale_close'),
    canCloseWithExceptions: isManager,
    canChangePrice: isManager || hasPermission(teamMember, 'sale_price_change'),
    canPriceBelowMin: isManager,
    canDeliver: true,
    canDelete: isManager,
    canViewReports: isManager || hasPermission(teamMember, 'sale_reports'),
    isManager,
  };
}
```

**3. Integrar en flujos**

- `CloseSaleWizard`: bloquear si no tiene `canCloseWithExceptions` y hay pendientes
- `EditSaleModal`: precio solo lectura si no tiene `canChangePrice`
- `Sales.tsx`: ocultar tab "Objetivos" si no tiene `canViewReports`

**4. Configuración en Settings**

Sección "Permisos de ventas" en la pestaña de Equipo.

#### Criterios de aceptación
- [ ] Permisos granulares definidos para ventas
- [ ] Gerente cierra con excepciones, trabajador no
- [ ] Trabajador no puede cambiar precios ni eliminar ventas
- [ ] `useSalePermissions()` hook funcional y usado en todos los flujos
- [ ] Configuración de permisos en Settings
- [ ] Historial registra quién autorizó excepciones

---

### CV-10 — Conexión: Reservas y CRM

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** CV-02

#### Contexto

Pipeline, CRM y Ventas están desconectados. Al cerrar una venta, el lead no se actualiza. En la ficha de cliente no hay datos de ventas.

#### Qué hacer

**1. Pipeline → Venta:** Acción "Crear venta desde lead" en pipeline fase "won". Pre-rellena `CreateSaleModal`. Vincular `sale.leadId`.

**2. Venta → Pipeline:** Al cerrar venta con `leadId` → lead marcado como "won". Al cancelar → lead marcado como "lost".

**3. CRM — Ficha de cliente:** Sección "Operaciones de venta" en `ClientDetail.tsx` con lista de ventas, badges de estado, total gastado, vehículos comprados, última compra.

**4. Bidireccional desde SaleDetail:** Link al lead en pipeline si existe `leadId`. Link a ficha CRM completa del cliente.

#### Criterios de aceptación
- [ ] "Crear venta desde lead" en Pipeline pre-rellena el modal
- [ ] Al cerrar venta → lead "won" automáticamente
- [ ] Al cancelar → lead "lost"
- [ ] Sección "Operaciones de venta" en ficha de cliente
- [ ] Badges con estado de cada operación
- [ ] Links bidireccionales entre venta, lead y cliente
- [ ] Total gastado y vehículos comprados en ficha de cliente

---

### CV-11 — Panel de alertas de ventas en la UI

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** CV-07

#### Contexto

Las alertas de CV-07 se generan en el backend pero necesitan punto de visualización en la UI de ventas.

#### Qué hacer

**1. Banner de alertas en `Sales.tsx`**

Banner colapsable en la cabecera si hay alertas activas:
- 🔴 Entregas retrasadas
- 🟡 Cobros pendientes
- 🟡 Contratos sin firmar
- Click navega al detalle de la venta

**2. Indicadores en tabla de ventas**

Columna de alertas: 🔴 (crítica), 🟡 (warning), ✅ (sin alertas). Tooltip con detalle. Filtro rápido "Con alertas" / "Sin alertas".

**3. Badge en sidebar**

Junto al item "Ventas": badge con número de alertas activas. Color rojo si críticas, amber si warnings.

**4. Integrar con panel general**

Alertas de ventas visibles en el panel de alertas general (`CrmAlertsPanel.tsx`).

#### Criterios de aceptación
- [ ] Banner de alertas en cabecera de `Sales.tsx`
- [ ] Indicadores por fila en tabla
- [ ] Filtro "Con alertas" / "Sin alertas"
- [ ] Badge en sidebar
- [ ] Alertas visibles en panel general
- [ ] Click navega al detalle de la venta
- [ ] Alertas dismissables (localStorage)

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos
└── CV-01 Modelo de datos

Fase 2 — Flujos principales
├── CV-02 Flujo de cierre de venta
├── CV-03 Flujo de entrega formal
└── CV-04 Vehículo bloqueado y sincronizado

Fase 3 — Automatizaciones
├── CV-05 Generar ingreso en Finanzas
└── CV-06 Generación automática de documentos

Fase 4 — Alertas y métricas
├── CV-07 Sistema de alertas
└── CV-08 Dashboard y métricas

Fase 5 — Permisos e integraciones
├── CV-09 Perfiles gerente vs trabajador
├── CV-10 Conexión Reservas y CRM
└── CV-11 Panel de alertas en UI
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| CV-01 Modelo de datos | Media | 3-4h |
| CV-02 Flujo de cierre de venta | Muy Alta | 8-10h |
| CV-03 Flujo de entrega formal | Muy Alta | 8-10h |
| CV-04 Vehículo bloqueado y sincronizado | Alta | 5-6h |
| CV-05 Generar ingreso en Finanzas | Media-Alta | 4-5h |
| CV-06 Generación automática de documentos | Alta | 6-8h |
| CV-07 Sistema de alertas | Alta | 5-6h |
| CV-08 Dashboard y métricas | Alta | 6-8h |
| CV-09 Perfiles gerente vs trabajador | Alta | 5-6h |
| CV-10 Conexión Reservas y CRM | Media | 4-5h |
| CV-11 Panel de alertas en UI | Media | 3-4h |
| **Total** | | **~57-72h** |

---

## Notas técnicas

### Base de datos
Todos los cambios en `SaleRecord` son ampliaciones retrocompatibles. CouchDB no requiere migraciones. Los nuevos campos opcionales se acceden con fallback a `undefined`.

### Retrocompatibilidad
- Ventas existentes sin `closureData` siguen funcionando
- Checklist existentes (7 items) coexisten con nuevos (13 items)
- Automatizaciones (finanzas, documentos) son opt-in en Settings
- Rutas existentes (`/saas/sales`, `/saas/sales/:id`) no cambian
- `ChangeStageModal` sigue funcionando para fases que no sean `sold`/`delivered`

### Permisos
- `TEAM_PERMISSION_KEYS` se extiende con claves granulares de ventas
- Admin/gerente tiene todos los permisos por defecto
- Nuevos permisos son adicionales, no rompen nada

### Alertas
Mismo patrón del `alertEngine.js`: `emitAlert()` con dedup diario, notificaciones in-app + SSE + Web Push, configuración en `account.alertConfig`.

### PDF
Generadores de acta usan `jspdf` (ya en dependencias), mismo patrón que `invoicePdfGenerator.ts` y `contractPdfGenerator.ts`.

### Diseño visual
Todos los componentes siguen el sistema existente: `rounded-2xl`, `border-gray-200 dark:border-gray-700`, botones `bg-gray-900 hover:bg-black`, modales `rounded-3xl shadow-2xl` con backdrop blur, dark mode con `dark:` prefix.
