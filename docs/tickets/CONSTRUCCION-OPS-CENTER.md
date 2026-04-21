# CENTRO OPERATIVO CONSTRUCCION — Tickets

**Pagina:** `/saas/vertical/construccion`
**Objetivo:** Concentrar en una sola pantalla la operativa diaria de la constructora.

## Estado actual del sistema

### Ya implementado (backend + frontend)

**Backend (API + datos CouchDB):**
- **Clientes** (`construction_client`): CRUD completo. Campos: nombre, CIF, telefono, email, direccion, documentos OCR, notas.
- **Gremios** (`construction_guild`): CRUD completo. Campos: nombre, tipo, contacto, precios desglosados.
- **Obras** (`construction_project`): CRUD completo. Estados: planificacion, en_obra, pausada, finalizada. Campos: nombre, tipo, ubicacion, cliente, fechas, presupuestoId, estado, progreso 0-100.
- **Presupuestos** (`construction_budget`): CRUD + aceptacion + pagos. Campos: partidas[], margen, metodoPago, pagos[], totalPagado, pendientePago.
- **Trabajadores** (`construction_worker`): CRUD completo. Campos: nombre, DNI, gremio, obraAsignada, documentos, activo.
- **Tareas** (`construction_task`): CRUD con filtros por workerId/projectId. Campos: titulo, obra, trabajador, prioridad, estado, fechaLimite, fotos.
- **SSE global**: broadcastToUser/broadcastToBusiness. Hook useSSE.
- **Alertas core**: alertEngine.js con DashboardAlert[].

**Frontend existente:**
- construction-projects, construction-budgets, construction-clients, construction-workers, construction-guilds, construction-tasks: con API real
- construction-machinery, construction-materials, construction-plans: SIN backend (estado local)
- ConstructionDashboard: esqueleto con KPIs a 0, sin datos reales

**Sidebar:** Faltan construction-clients, construction-workers, construction-tasks en el grupo.

### Brechas detectadas

1. No hay Centro Operativo ni pagina de operativa diaria
2. No hay actualizacion en tiempo real (sin SSE/polling para construccion)
3. No hay filtros transversales (obra, cliente, estado, responsable, trabajador, fechas)
4. No hay entidad de incidencias (construction_incident)
5. No hay documentos de obra (solo a nivel cliente/trabajador)
6. No hay metricas calculadas (margen, costes, avance medio)
7. No hay alertas especificas (obra sin responsable, cobro vencido, etc.)
8. No hay diferenciacion gerente/trabajador
9. No hay endpoint de datos agregados
10. No hay partes de trabajo
11. Sidebar incompleto

## TICKETS

### CO-01: Backend — Entidad de incidencias de obra

**Tipo:** Feature Backend | **Prioridad:** Alta | **Dep:** Ninguna

Crear `construction_incident` en CouchDB con CRUD.

**Modelo:** type, user_id, id, obraId, obraNombre, titulo, descripcion, tipo, gravedad, estado, reportadoPor, reportadoPorNombre, asignadoA, asignadoANombre, fechaDeteccion, fechaResolucion, costeEstimado, costeReal, fotos[], acciones[], notas, timestamps.
- **Tipos:** dano_infraestructura, accidente_laboral, defecto_material, retraso_proveedor, problema_permisos, queja_cliente, fallo_maquinaria, otro
- **Gravedades:** baja, media, alta, critica
- **Estados:** abierta, en_progreso, resuelta, cerrada

**API:** GET/POST/PUT/DELETE en /api/construction/incidents/:userId. Filtros: obraId, estado, gravedad.
**TS:** Interfaces ConstructionIncident, IncidentAction + funciones CRUD en constructionApi.ts.

### CO-02: Backend — Entidad de documentos de obra

**Tipo:** Feature Backend | **Prioridad:** Alta | **Dep:** Ninguna

Crear `construction_document` en CouchDB para documentacion obligatoria por obra.

**Modelo:** type, user_id, id, obraId, obraNombre, categoria, nombre, descripcion, estado, fechaEmision, fechaCaducidad, obligatorio, archivoUrl, archivoBase64, archivoMimeType, archivoNombre, notas, timestamps.
- **Categorias:** licencia_obra, permiso_municipal, seguro_rc, seguro_todo_riesgo, plan_seguridad_salud, evaluacion_riesgos, certificado_tecnico, acta_replanteo, contrato_obra, certificacion_obra, factura, albaran, plano, memoria_tecnica, otro
- **Estados:** pendiente, vigente, caducado, rechazado

**Auto-generacion:** Al crear obra, generar placeholders de docs obligatorios segun tipo:
- Obra nueva: licencia, plan seguridad, seguro RC, acta replanteo, cert. tecnico
- Reforma integral: licencia, plan seguridad, seguro RC, memoria tecnica
- Reforma parcial: permiso municipal, seguro RC, memoria tecnica
- Rehabilitacion: licencia, plan seguridad, seguro RC, cert. tecnico, eval. riesgos

**API:** GET/POST/PUT/DELETE en /api/construction/documents/:userId. Filtros: obraId, categoria, estado.
**TS:** Interfaz ConstructionDocument + funciones CRUD.

### CO-03: Backend — Entidad de partes de trabajo

**Tipo:** Feature Backend | **Prioridad:** Alta | **Dep:** Ninguna

Crear `construction_work_report` en CouchDB. Registro diario de horas, materiales y avance.

**Modelo:** type, user_id, id, obraId, obraNombre, trabajadorId, trabajadorNombre, fecha, horaEntrada, horaSalida, horasTotales, horasExtra, trabajoRealizado, materiales[] (nombre, cantidad, unidad, costeUnitario), maquinariaUsada[] (nombre, horas), avanceEstimado (%), fotos[], incidencias (texto), firmaTrabajador, firmaResponsable, estado, notas, timestamps.
- **Estados:** borrador, pendiente, aprobado, rechazado

**API:** GET/POST/PUT/DELETE en /api/construction/work-reports/:userId + POST approve. Filtros: obraId, trabajadorId, estado, dateFrom, dateTo.
**TS:** Interfaces ConstructionWorkReport, WorkReportMaterial, WorkReportMachinery + funciones CRUD + approve.

### CO-04: Backend — Endpoint de datos operativos agregados

**Tipo:** Feature Backend | **Prioridad:** Critica | **Dep:** CO-01, CO-02, CO-03

Endpoint unico que devuelve todo para el centro operativo con filtros.

**Endpoint:** `GET /api/construction/ops-center/:userId`

**Query params:** obraId, clienteId, estado, responsableId, trabajadorId, dateFrom, dateTo.

**Response incluye:**
- `resumen`: obrasActivas, obrasPlanificacion, obrasEnObra, obrasPausadas, obrasFinalizadasMes, presupuestoTotalAceptado, totalCobrado, totalPendienteCobro, totalPagadoProveedores, totalPendientePago, margenEstimadoGlobal, avanceMedioObras, totalTrabajadoresActivos, totalIncidenciasAbiertas, totalPartesPendientes, totalDocumentosFaltantes
- `obras[]`: nombre, estado, progreso, presupuesto, cobrado, pendienteCobro, margenEstimado, trabajadoresAsignados, tareasTotal/Completadas, incidenciasAbiertas, partesPendientes, documentosFaltantes, diasRestantes, enRetraso
- `clientes[]`: nombre, cif, obrasActivas, totalPresupuestado, totalCobrado, totalPendiente
- `presupuestos`: totales por estado + proximosCobros[] + cobrosVencidos[]
- `tareas`: totalPendientes, totalEnProgreso, totalCompletadasHoy, proximasVencer[]
- `incidencias[]`: abiertas con detalle
- `partesTrabajo`: pendientesAprobacion, aprobadosHoy, horasRegistradasHoy, ultimosPartes[]
- `documentos`: totalFaltantes, totalCaducados, faltantes[], proximosCaducar[]
- `alertas[]`: 8 tipos (obra_sin_responsable, cobro_vencido, pago_pendiente, incidencia_abierta, obra_parada, documento_faltante, parte_pendiente, documento_caduca)
- `trabajadores[]`: con tareasAsignadas, tareasCompletadas, partesHoy, horasHoy

**Reglas de alertas:**
- obra_sin_responsable: obras en_obra sin trabajador asignado
- cobro_vencido: pagos con fecha < hoy y pagado === false
- pago_pendiente: costes de gremios sin factura
- incidencia_abierta: estado abierta o en_progreso
- obra_parada: pausada > 7 dias
- documento_faltante: obligatorios con estado pendiente
- documento_caduca: fechaCaducidad en proximos 30 dias
- parte_pendiente: estado pendiente sin aprobar

**Optimizacion:** Vistas CouchDB, response < 800ms con 20 obras.

### CO-05: Backend — Eventos SSE para tiempo real

**Tipo:** Feature Backend | **Prioridad:** Alta | **Dep:** CO-01, CO-03

Eventos SSE usando sseService.js existente.

**Eventos:** construction:project_updated, construction:budget_payment, construction:incident_created, construction:incident_updated, construction:task_updated, construction:work_report_created, construction:work_report_approved, construction:document_uploaded, construction:alert_triggered.

**Emision:** En cada write del constructionController, broadcastToBusiness con payload minimo.
**Motor periodico (120s):** Revisar obras sin trabajadores, cobros vencidos, pausadas > 7 dias, docs caducados. Deduplicar en ventana 10 min.
**Hook cliente:** `useConstructionSSE` basado en useSSE. Callbacks por evento + reconexion automatica.

### CO-06: Frontend — Shell de la pagina, routing y sidebar

**Tipo:** Feature Frontend | **Prioridad:** Critica | **Dep:** CO-04

Crear `ConstructionOpsCenter.tsx` y registrar en router.

**Estructura de la pagina:**
```
HEADER: "Centro Operativo" + "Construccion" + toggle Gerente/Trabajador + indicador tiempo real
FILTROS (CO-07): Obra | Cliente | Estado | Responsable | Trabajador | Fechas
ALERTAS colapsables (CO-10)
8 KPIs (CO-08): Obras activas | Cobros pend | Costes | Margen | Partes | Incidencias | Avance | Docs
ACCESOS RAPIDOS (CO-09): grid botones
OBRAS ACTIVAS (CO-11): tabla con progreso
COBROS/PAGOS (CO-12) | INCIDENCIAS (CO-13)
PLANIFICACION (CO-14) | PARTES (CO-15)
DOCUMENTACION (CO-16) | EQUIPO (CO-17)
GRAFICAS (CO-18)
```

**Estado:** filters, opsData (response CO-04), loading/error/lastUpdated, sseConnected, role (gerente/trabajador).
**Carga:** Fetch al montar + re-fetch al cambiar filtro (debounce 300ms) + re-fetch en evento SSE + polling 60s si SSE desconecta.
**Layout:** `Layout` de components/saas/Layout. Dark mode. Responsive (1 col movil).

**Routing:** `{ path: 'vertical/construccion', Component: ConstructionOpsCenter }` en saas children de routes.tsx.

**Sidebar:** Anadir `construction-ops` al inicio del grupo construction con icono LayoutDashboard, label "Centro Operativo", ruta /saas/vertical/construccion. Anadir tambien construction-clients, construction-workers, construction-tasks que faltan.

### CO-07: Frontend — Barra de filtros operativos

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06

Barra horizontal con selects/pills: Obra, Cliente, Estado (pills toggle), Responsable, Trabajador, Fechas (rango con datepicker + accesos rapidos Hoy/Semana/Mes/Trimestre). Boton limpiar.

**Cascada:** Obra seleccionada autocompleta cliente. Cliente seleccionado filtra obras.
**Persistencia:** localStorage + URL query params. Query params priorizan.
**Responsive:** Movil = boton "Filtros (N activos)" que abre sheet/drawer.

### CO-08: Frontend — KPIs principales (8 tarjetas)

**Tipo:** Feature Frontend | **Prioridad:** Critica | **Dep:** CO-06

8 tarjetas KPI (patron KPICard del ButcherHub). Grid `grid-cols-2 lg:grid-cols-4`.

| # | Metrica | Fuente | Icono | Color |
|---|---------|--------|-------|-------|
| 1 | Obras activas | resumen.obrasActivas | HardHat | amber |
| 2 | Cobros pendientes | resumen.totalPendienteCobro (EUR) | Wallet | red/amber |
| 3 | Costes abiertos | resumen.totalPendientePago (EUR) | CreditCard | orange |
| 4 | Margen estimado | resumen.margenEstimadoGlobal + "%" | TrendingUp | emerald(>15%)/red(<10%) |
| 5 | Partes pendientes | resumen.totalPartesPendientes | ClipboardList | blue |
| 6 | Incidencias | resumen.totalIncidenciasAbiertas | AlertTriangle | red(>0)/gray(0) |
| 7 | Avance medio | resumen.avanceMedioObras + "%" | Activity | sky |
| 8 | Docs faltantes | resumen.totalDocumentosFaltantes | FileWarning | amber(>0)/gray(0) |

Cada tarjeta clicable (scroll a seccion). Sub-texto contextual. Animacion al cambiar valor via SSE.

### CO-09: Frontend — Panel de accesos rapidos

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06

Grid botones (patron ButcherHub QuickAccessBtn). `grid-cols-4 sm:grid-cols-6 lg:grid-cols-12`.

**Gerente (12):** Dashboard, Clientes, Presupuestos, Obras, Tareas, Trabajadores, Subcontratas, Materiales, Maquinaria, Planos, Finanzas, Equipo. Con badges de conteo.

**Trabajador (6):** Mis obras, Mis tareas, Nuevo parte (modal), Mis documentos, Fichar, Incidencia (modal).

### CO-10: Frontend — Panel de alertas inteligentes

**Tipo:** Feature Frontend | **Prioridad:** Critica | **Dep:** CO-06, CO-04

Panel colapsable (patron ButcherHub alertas). Datos de opsData.alertas.

| Tipo | Icono | Severidad |
|------|-------|-----------|
| obra_sin_responsable | UserX | warning/amber |
| cobro_vencido | Wallet | error/red |
| pago_pendiente | CreditCard | warning/amber |
| incidencia_abierta | AlertTriangle | error/red |
| obra_parada | PauseCircle | error/red |
| documento_faltante | FileWarning | warning/amber |
| parte_pendiente | ClipboardList | info/blue |
| documento_caduca | CalendarClock | warning/amber |

Header con Bell + "Alertas Construccion" + badge + desglose criticas/avisos. Lista con borde izquierdo coloreado + icono + mensaje + boton "Ver". Sin alertas: oculto con indicador verde.

### CO-11: Frontend — Tabla de obras activas con progreso

**Tipo:** Feature Frontend | **Prioridad:** Critica | **Dep:** CO-06

Card con tabla de obras. Header "Obras activas" + HardHat + badge + "Ver todas".

**Columnas desktop:** Obra (nombre+ubicacion+badge estado) | Cliente | Progreso (barra+%) | Presupuesto | Cobrado/Pendiente | Tareas (completadas/total) | Alertas (badges) | Acciones (dropdown).

**Badge estados:** planificacion=azul, en_obra=verde, pausada=amber, finalizada=gris.
**Barra progreso:** verde (>=50% sin retraso), amber (<50% fecha cercana), rojo (en retraso).
**Movil:** Cards apiladas expandibles. **Orden:** alertas primero, luego progreso desc.

### CO-12: Frontend — Widget de cobros y pagos

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06

Widget financiero. **Solo gerente.**

1. **Resumen (3 bloques):** Total cobrado (emerald) | Pendiente cobro (red/amber) | Pendiente pago (orange)
2. **Proximos cobros (tabla, max 5):** Obra | Cliente | Concepto | Importe | Fecha | Estado badge
3. **Cobros vencidos (rojo):** Borde izquierdo rojo, fondo red-50. Sin vencidos = mensaje verde.

### CO-13: Frontend — Widget de incidencias abiertas

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06, CO-01

Header "Incidencias" + AlertTriangle + badge rojo.

**Lista (max 5):** Icono gravedad (baja=gray, media=amber, alta=orange, critica=red) + titulo + obra + tiempo + badge tipo + coste estimado + boton "Resolver". Ordenadas: critica primero. Sin incidencias: check verde.

**Modales:** Resolucion (descripcion, coste real, fotos). Creacion (obra, titulo, descripcion, tipo, gravedad, fotos).

### CO-14: Frontend — Widget de planificacion y ejecucion

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06

1. **3 KPIs:** Pendientes (amber) | En progreso (blue) | Completadas hoy (emerald)
2. **Proximas vencer (max 5):** titulo + obra + trabajador + fecha + badge prioridad. Vencidas con fondo rojo.
3. **Mini timeline por obra (solo gerente, max 5):** Barra horizontal con segmentos completado/progreso/pendiente.

**Trabajador:** Solo sus tareas, sin timeline global.

### CO-15: Frontend — Widget de partes de trabajo

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06, CO-03

1. **KPIs:** Pendientes aprobacion (amber) | Aprobados hoy (emerald) | Horas hoy (blue)
2. **Lista pendientes (max 5):** Trabajador + obra + fecha + horas + boton "Aprobar" (gerente) + "Ver detalle"
3. **Boton "Nuevo parte" (trabajador):** Modal con obra, horas, trabajo, materiales, fotos.

**Trabajador:** Solo sus partes + boton crear prominente, sin aprobar.

### CO-16: Frontend — Widget de documentacion

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06, CO-02

1. **KPIs:** Faltantes obligatorios (red) | Caducados (orange) | Proximos caducar (amber)
2. **Faltantes (max 5):** Obra + categoria + badge obligatorio + boton "Subir" (modal upload)
3. **Proximos caducar (max 3):** Obra + nombre + "Caduca en X dias"
4. **Todo OK:** Mensaje verde "Documentacion completa y vigente"

**Modal upload:** Archivo drag&drop, categoria, nombre, fechas, notas.

### CO-17: Frontend — Widget de equipo / trabajadores

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06

**Gerente (tabla):** Trabajador (avatar+nombre) | Gremio | Obra | Tareas (mini barra) | Horas hoy | Estado (Activo=verde, Sin parte=amber, Inactivo=gris). Max 8. Orden: sin parte primero.

**Trabajador:** Directorio simple: nombre + gremio + obra. Sin rendimiento.

### CO-18: Frontend — Graficas de metricas

**Tipo:** Feature Frontend | **Prioridad:** Media | **Dep:** CO-06

3 graficos con Recharts + ResponsiveContainer. Grid 2 cols desktop, 1 col movil.

1. **Distribucion obras por estado (Bar/Pie):** Conteos con colores por estado.
2. **Avance por obra (BarChart horizontal):** Nombre + progreso %. Max 8, menor a mayor.
3. **Cobros vs Pagos (BarChart, solo gerente):** cobrado (emerald), pendiente cobro (red), pendiente pago (orange).

**Trabajador:** Solo graficos 1 y 2.

### CO-19: Frontend — Diferenciacion gerente vs trabajador

**Tipo:** Feature Frontend | **Prioridad:** Alta | **Dep:** CO-06 a CO-18

**Deteccion:** useAuth().user.role. owner/admin/manager = gerente; worker/employee = trabajador. Toggle manual en header (patron ButcherHub) solo para gerentes.

**Gerente:** Todos los filtros, todos los widgets, metricas financieras, aprobar partes, resolver incidencias, 8 KPIs, 3 graficos, tabla obras completa, equipo rendimiento.

**Trabajador:**
- Filtros: solo obra (sus asignadas) y fechas
- 4 KPIs: Mis obras, Mis tareas, Partes del mes, Incidencias en mis obras
- 6 accesos rapidos: Mis obras, Mis tareas, Nuevo parte, Mis docs, Fichar, Incidencia
- Widgets: Obras (suyas, sin financiero), Tareas (suyas), Partes (suyos + crear), Docs (sus obras), Incidencias (sus obras + reportar)
- NO ve: Cobros/Pagos, Grafico financiero, Equipo rendimiento
- Header: "Hola, [nombre]" + gremio + obra actual

### CO-20: Frontend — Conexiones bidireccionales

**Tipo:** Enhancement Frontend | **Prioridad:** Media | **Dep:** CO-06

**Desde centro operativo:** Enlaces a Dashboard, Clientes, Presupuestos, Obras, Tareas, Trabajadores, Subcontratas, Finanzas, Equipo via accesos rapidos y links en widgets.

**Desde otros modulos:** Boton "Centro Operativo" en ConstructionDashboard (prominente), ConstructionProjects, ConstructionBudgets, ConstructionTasks, ConstructionWorkers, ConstructionClients.

## RESUMEN Y ORDEN DE EJECUCION

### Fase 1 — Datos y API (semana 1-2)
| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| CO-01 | Incidencias de obra | Backend | Alta |
| CO-02 | Documentos de obra | Backend | Alta |
| CO-03 | Partes de trabajo | Backend | Alta |
| CO-04 | Endpoint agregado | Backend | Critica |
| CO-05 | SSE tiempo real | Backend | Alta |

### Fase 2 — Shell y estructura (semana 3)
| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| CO-06 | Shell, routing, sidebar | Frontend | Critica |
| CO-07 | Filtros operativos | Frontend | Alta |
| CO-08 | KPIs (8 tarjetas) | Frontend | Critica |
| CO-09 | Accesos rapidos | Frontend | Alta |
| CO-10 | Alertas inteligentes | Frontend | Critica |

### Fase 3 — Widgets (semanas 4-5)
| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| CO-11 | Tabla obras activas | Frontend | Critica |
| CO-12 | Cobros y pagos | Frontend | Alta |
| CO-13 | Incidencias | Frontend | Alta |
| CO-14 | Planificacion/Ejecucion | Frontend | Alta |
| CO-15 | Partes de trabajo | Frontend | Alta |
| CO-16 | Documentacion | Frontend | Alta |
| CO-17 | Equipo/Trabajadores | Frontend | Alta |

### Fase 4 — Graficas, perfiles, conexiones (semana 6)
| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| CO-18 | Graficas metricas | Frontend | Media |
| CO-19 | Gerente vs trabajador | Frontend | Alta |
| CO-20 | Conexiones bidireccionales | Frontend | Media |

## NOTAS DE DISENO

### Paleta de colores
- Obras: amber | Presupuestos/Cobros: emerald/red | Tareas: sky/blue | Incidencias: red | Partes: indigo | Documentacion: violet | Equipo: teal | Metricas: gris/azul

### Convenciones UI
- Layout de components/saas/Layout | Dark mode obligatorio | Iconos lucide-react | rounded-xl/2xl | border-2 border-gray-200 dark:border-gray-700 | shadow-sm en hover | transition-all 150-200ms | Recharts para graficos | EUR: toLocaleString es-ES | Fechas: dd/MM/yyyy

### Patron estado/fetching
- useState + useMemo + useCallback (sin Redux/Zustand) | constructionApi.ts | useConstructionSSE (nuevo hook) | Polling 60s fallback | useAuth() para userId/role

### Referencia visual
Mismo patron que ButcherHub.tsx: Header con rol + filtros + tiempo real, KPIs, Accesos rapidos, Alertas, Widgets grid, Graficas. Diferencia: construccion tiene widgets mas densos (tablas obras, financieros) vs delivery (flujo operativo cocina/montaje/reparto).
