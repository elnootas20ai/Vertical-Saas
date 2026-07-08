# Revisión de verticales — estado y pendientes para cerrarlas

> Actualizado: 08/07/2026. Revisión de código real (frontend, backend, tests) contrastada con los tickets de `docs/tickets/`.
>
> **Ojo con los tickets**: casi todos tienen 0 checkboxes marcados aunque gran parte del trabajo YA está hecho en código. Tratar los checkboxes como backlog de QA/verificación, no como estado real. El código va por delante de la documentación.

---

## Tabla resumen (% estimado de completitud)

| Vertical | Frontend | Backend | Global | Estado |
|----------|----------|---------|--------|--------|
| **Limpieza** | ~85% | ~88% | **~86%** | La más madura junto a construcción |
| **Construcción** | ~82% | ~90% | **~86%** | Muy avanzada; 3 páginas maqueta |
| **Delivery** | ~78% | ~82% | **~80%** | Núcleo operativo completo; faltan satélites |
| **Compraventa** | ~72% | ~78% | **~75%** | Operativa diaria usable; falta cierre comercial |
| **Carnicería** | ~68% | ~74% | **~71%** | Falta báscula hardware y trabajadores |
| **Bar/Restaurante** | ~62% | ~72% | **~67%** | TPV-mesa funciona; falta unificar cocina y limpiar legacy |
| **Desguaces** | ~62% | ~70% | **~66%** | Despiece fuerte; informes mock, doble modelo de datos |
| **Menores** (gym, hotel, clinic, vet, pharmacy, taxi, salon, nightclub, events, realEstate, lawyer, academy, tobacco, carWash) | ~70% | CRUD genérico | **Semi** | CRUD real vía factory genérico, sin lógica de negocio avanzada |
| **Taller (workshop)** | — | — | **Funcional** | Stack dedicado propio (`/api/workshop/*`) |

Gap transversal a todas: **casi cero tests dedicados** (salvo delivery/restaurant/compraventa) y **tickets desincronizados** con el código.

---

## Pendientes por vertical (lo que falta para cerrar cada una)

### Delivery (~80%)
El día a día (pedidos → cocina → montaje → reparto → TPV → ops center → informes básicos) funciona con código real. Falta:
1. **Stock/recetas** — página `/saas/vertical/delivery/stock`, entidad `recipe`, descuento automático de ingredientes (`STOCK-RECETAS-DELIVERY.md`).
2. **Informes PRO** — patrón Base/Normal/Pro completo (`INFORMES-DELIVERY.md`).
3. **Alertas backend avanzadas** — motor rápido, alertas por fase, saturación cocina/riders (`ALERTAS-DELIVERY-BACKEND.md`).
4. **Reparto avanzado** — asignación automática, vista trabajador, ETA (`REPARTO-PROPIO-TICKETS.md`).
5. **Flotante repartidor** — `DriverCashModal.tsx` existe pero sin integrar en Reparto/Caja (`FLOTANTE-REPARTIDOR.md`).
6. Perfiles gerente/trabajador en Ops Center (DL-18) y métricas de cocina vía API (KDS-06).

### Bar/Restaurante (~67%)
El flujo mesa → comanda → cobro funciona (`RestaurantTpvPage` + `TpvRapidoPage` + backend sala). Falta:
1. **Cocina unificada** — las comandas de sala NO aparecen en el KDS (`DeliveryKitchen` solo consume pedidos delivery). Es la brecha crítica (SALA-06).
2. **Página de sala operativa** (mapa + listado + drawer mesa) y deprecar `TpvTab` legacy con `localStorage` (SALA-04, SALA-15).
3. **Módulo/permiso `sala`** — toggle `modules.sala` y permiso en roles y endpoints (SALA-03, SALA-10).
4. **Cierre de mesa robusto** — split por ítem, movimiento financiero automático al cobrar (SALA-07, SALA-08).
5. Recogidas en sala + endpoint deliver (SALA-09), alertas sala en UI (SALA-11/14), CRM historial consumo (SALA-13).

### Compraventa (~75%)
Vehículos, ventas, pipeline, hub, fiscal (calculadora nueva) funcionan. Falta la capa de "cierre comercial":
1. **Publicación multicanal** con estado real por portal (`PUBLICACION-VENTA-TICKETS.md`).
2. **Cierre de venta y entrega** — wizard, validación pre-cierre, sync vehículo/finanzas (`CIERRE-VENTA-ENTREGA.md`).
3. **Expediente documental** por vehículo con auto-vinculación OCR (`DOCUMENTACION-OCR-COMPRAVENTA.md`).
4. Informes: filtros marca/comercial/proveedor, permisos, alertas de margen (`INFORMES-RENTABILIDAD-COMPRAVENTA.md`).
5. Wizard de entrada de vehículo conectado al menú (`ENTRADA-VEHICULO-TICKETS.md`).
6. Reglas de alerta específicas restantes y refinar firma digital.
- Stub conocido: `Quotes.tsx` tiene "Próximamente: presupuestos con IA".

### Carnicería (~71%)
Hub, pedidos, ventas, compras, merma, trazabilidad, informes y TPV conectados a API real. Falta:
1. **Báscula hardware** — Web Serial/Bluetooth; hoy solo ping backend y peso manual (`BASCULA-INTEGRACION-TICKETS.md`, el bloque más grande pendiente).
2. **`ButcherWorkers.tsx` es mock completo** — sustituir por API real.
3. Kanban de pedidos y vínculo fuerte cliente↔venta (`CLIENTES-PEDIDOS-CARNICERIA.md`).
4. Verificar y marcar tickets de merma/alertas/informes (el código ya existe pero los tickets dicen lo contrario).
5. Tests (hoy: cero).

### Desguaces (~66%)
Despiece, piezas y compras de vehículos con API dedicada real. Falta:
1. **Unificar el doble modelo de datos** — piezas en `/api/scrapyard` vs inventario/ventas en factory `scrapyard-ops` (riesgo de inconsistencias).
2. **`ScrapyardReports.tsx` es 100% mock** — conectar a datos reales.
3. Cablear tareas de trabajadores — `listScrapyardTasks` existe en backend pero `ScrapyardWorkers` no lo usa (`TRABAJADORES-OPERATIVA-DESGUACES.md`).
4. Expediente de baja DGT y alertas documentales (`DOCUMENTACION-OCR-DESGUACES.md`).
5. Retiradas/grúa end-to-end (`COMPRAS-RETIRADAS-DESGUACES.md`).
6. Integrar recambios (spareParts) con piezas de despiece — hoy son verticales separados sin flujo entre ellos.

### Limpieza (~86%)
13 páginas conectadas a 6 routers dedicados + motores de alertas y facturación. Falta:
1. UI de generación masiva de servicios desde contratos (backend ya existe).
2. Integración CRM Core bidireccional (CLI-10) y permisos trabajador vs gerente.
3. Drag-and-drop de asignación y timeline de jornada.
4. Exports completos en informes y unificar rutas legacy `cleaning-*` bajo `/saas/vertical/limpieza/*`.
5. Tests (el ticket de fichaje cita tests que no existen).

### Construcción (~86%)
18 de 21 páginas con backend real (~100+ endpoints). Falta:
1. **3 páginas maqueta sin backend**: `ConstructionMaterials`, `ConstructionMachinery`, `ConstructionPlans` (CRUD local efímero — se pierde al recargar).
2. Conectar `material-needs` de planificación (tiene backend) con la página de materiales (no lo tiene).
3. Catálogo de gremios con nombres corregidos y partidas con cantidad × unidad.
4. `ClienteAutocomplete` en obras/presupuestos (CC-11) y vista trabajador filtrada en CRM.
5. Validar los 15 tipos de alerta del motor. Tests: cero.

### Verticales menores
Todas son CRUD real persistido en CouchDB vía `verticalCrudFactory` + `verticalConfigs/all.js`, pero sin lógica de negocio profunda (sin TPV integrado, sin dispatch, sin flujos clínicos...). Excepciones:
- **Taller**: funcional con stack dedicado.
- **Events**: `EventsWorkstationPage` es maqueta local sin persistencia.

---

## Orden sugerido para cerrar (según la regla: delivery v1 primero)

1. **Delivery** — es la prioridad declarada y está al 80%: stock/recetas + alertas + reparto avanzado la cierran.
2. **Bar/Restaurante** — comparte motor con delivery; la pieza crítica es cocina unificada (SALA-06) y limpiar el TPV legacy.
3. **Compraventa** — cierre comercial (publicación + cierre venta + expediente).
4. **Carnicería / Desguaces** — carnicería: báscula + workers; desguaces: unificar modelo + informes reales.
5. **Limpieza / Construcción** — las más cerca del 100%: rematar las 3 páginas maqueta de construcción y las integraciones de limpieza.
6. **Menores** — decidir cuáles se "visten" con el motor operativo (config) y cuáles se quedan como CRUD.

## Tarea de higiene recomendada
Actualizar los tickets de `docs/tickets/`: marcar los checkboxes de lo ya implementado (merma, alertas carnicería, pagos gremios, planificación obra, despiece...) para que reflejen la realidad y la próxima revisión no tenga que re-auditar el código.
