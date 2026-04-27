# CLIENTES Y CRM CONSTRUCCIÓN — Tickets

**Página:** `/saas/vertical/construccion/clientes`  
**Ruta real (routes.tsx):** `/saas/vertical/construccion/clientes` (alias de `/saas/construction-clients`)  
**Objetivo:** Centralizar clientes, inmuebles y relación comercial dentro de la vertical de construcción. Convertir la ficha básica actual en un CRM completo especializado para constructoras con obras vinculadas, presupuestos, datos fiscales, histórico, documentación y estado comercial.  
**Perfiles:** Gerente (ve todos los clientes, estado comercial y relación económica) · Trabajador (solo datos operativos de clientes asignados si se autoriza)  
**Fecha:** 14 abril 2026

---

## Auditoría del estado actual

### Lo que YA existe

| Capa | Archivo | Qué hace | Limitaciones |
|------|---------|----------|--------------|
| **Backend — modelo** | `services/couchdb.js` → `buildConstructionClientDocument` | Documento CouchDB `construction_client` con: nombre, cif, telefono, email, direccion (string), documentos[] (OCR), notas | Solo 7 campos útiles. Sin datos fiscales completos, sin estado comercial, sin direcciones múltiples, sin contactos, sin vínculo a CRM Core, sin tags, sin interacciones |
| **Backend — sanitize** | `services/couchdb.js` → `sanitizeConstructionClient` | Sanitiza los 7 campos + documentos | No sanitiza campos nuevos porque no existen |
| **Backend — CRUD** | `controllers/constructionController.js` | GET/POST/PUT/DELETE en `/api/construction/clients/:userId` | Sin filtros, sin búsqueda server-side, sin detalle enriquecido, sin duplicados, sin estadísticas |
| **Backend — router** | `routers/constructionRouter.js` | Rutas CRUD clientes montadas | Sin endpoints de detalle, duplicados, notas, histórico |
| **Frontend — página** | `ConstructionClients.tsx` | Grid de tarjetas con búsqueda client-side, modal crear/editar (6 campos), OCR scan | Sin vista de detalle, sin tabs, sin obras/presupuestos vinculados, sin datos fiscales, sin estado comercial, sin notas múltiples, sin histórico, sin alertas |
| **Frontend — API** | `constructionApi.ts` → `ConstructionClient` | Interface TS con nombre, cif, telefono, email, direccion, documentos, notas | Sin campos nuevos |
| **Frontend — sidebar** | `Sidebar.tsx` | Grupo "Constructora" | `construction-clients` NO aparece en el sidebar |
| **CRM Core — modelo** | `buildClientDocument` | Documento `client` con 30+ campos: clientType, datos fiscales (legalName, fiscalId, fiscalAddress, fiscalCity, fiscalPostalCode, fiscalCountry), commercialStatus, addresses[], contacts[], interactions[], tags[], consents, responsible, socialLinks | Los clientes de obra y los del CRM Core son **entidades separadas** en DBs distintas. No hay puente entre ambos |
| **CRM Core — CRUD** | `clientsController.js` | 18 endpoints: CRUD, detalle, CLV, notas, promociones, duplicados, merge, actividad, portal | Nada de esto aplica a `construction_client` |
| **CRM Core — alertas** | `crmController.js` → `getCrmAlerts` | Alertas: leads sin contactar, presupuestos pendientes, clientes inactivos | Solo para clientes CRM Core, no para construcción |
| **Obras** | `constructionController.js` | `construction_project` con `clienteId` y `clienteNombre` | Vinculación unidireccional: la obra guarda el ID del cliente pero el cliente no tiene resumen de obras |
| **Presupuestos** | `constructionController.js` | `construction_budget` con `clienteId` y `clienteNombre` | Igual: vinculación unidireccional sin resumen en ficha de cliente |
| **Alertas construcción** | `constructionController.js` → `getConstructionAlerts` | Alertas de obras y presupuestos | Sin alertas específicas de clientes (duplicados, sin datos fiscales, impagos, etc.) |

### Lo que FALTA — Brechas detectadas

1. **Modelo de datos pobre** — Solo nombre, CIF, teléfono, email, dirección (texto libre), notas. Faltan datos fiscales completos, tipo de cliente, estado comercial, múltiples direcciones, múltiples contactos, tags, interacciones, responsable comercial, origen del lead, vínculo con CRM Core
2. **Sin estado comercial** — No hay pipeline (prospecto → contactado → presupuestado → en_obra → fidelizado → inactivo → perdido)
3. **Sin datos fiscales completos** — Solo CIF. Falta razón social, dirección fiscal, ciudad fiscal, CP fiscal, país fiscal, régimen IVA
4. **Sin múltiples direcciones** — Solo un string `direccion`. Falta array de direcciones (obra, fiscal, correspondencia) con estructura
5. **Sin personas de contacto** — Solo un teléfono/email del cliente. Falta array de contactos (nombre, cargo, teléfono, email, esContactoPrincipal)
6. **Sin obras vinculadas en la ficha** — El cliente no muestra sus obras; hay que ir a Obras y buscar
7. **Sin presupuestos vinculados** — Mismo problema: no se ven desde la ficha del cliente
8. **Sin resumen económico** — No se ve cuánto ha facturado, cuánto ha pagado, cuánto debe
9. **Sin histórico / timeline** — No hay registro de interacciones: llamadas, visitas, emails, cambios de estado
10. **Sin notas estructuradas** — Solo un campo `notas` (texto). Falta sistema de notas múltiples con autor y fecha
11. **Sin documentos categorizados** — Los documentos son genéricos (OCR). Falta categorización: contrato, escritura, poder, DNI/CIF, certificado, licencia
12. **Sin crear cliente desde obra/presupuesto** — No hay modal reutilizable para crear cliente rápido desde otros flujos
13. **Sin detección de duplicados** — Se puede crear el mismo cliente dos veces sin aviso
14. **Sin alertas de cliente** — No hay alertas para: cliente duplicado, sin datos fiscales, con impagos, con presupuesto pendiente
15. **Sin vínculo CRM Core** — No hay puente entre `construction_client` y `client` del CRM. Si el mismo cliente existe en ambos sistemas, no se conectan
16. **Sin conversión lead → cliente obra** — Un lead comercial del CRM no se convierte automáticamente en cliente de obra
17. **Sin diferenciación gerente/trabajador** — Todos ven lo mismo
18. **Sin sidebar** — La entrada `construction-clients` no aparece en el grupo Constructora del sidebar
19. **Sin vista de detalle** — Solo tarjetas con datos mínimos; no hay drawer/página de perfil completo
20. **Sin facturación vinculada** — No se ve la facturación desde la ficha del cliente
21. **Sin inmuebles/propiedades** — El requisito habla de inmuebles; no existe entidad de inmueble vinculado al cliente

---

## TICKETS

---

### CC-01 — Backend: Ampliar modelo de datos del cliente de construcción

**Tipo:** Backend  
**Prioridad:** Crítica  
**Esfuerzo:** 3-4h  
**Dependencias:** Ninguna

#### Contexto

El modelo actual `construction_client` tiene 7 campos útiles. Para un CRM de construcción necesitamos datos fiscales completos, estado comercial, múltiples direcciones, contactos, tags, responsable comercial, vínculo con CRM Core e inmuebles.

#### Cambios requeridos

**Archivo: `services/couchdb.js` → `buildConstructionClientDocument`**

Ampliar el documento añadiendo después de los campos existentes:

```js
// Tipo de cliente
tipoCliente: (['particular', 'empresa', 'autonomo', 'comunidad_propietarios', 'promotora', 'administracion_publica'].includes(String(data.tipoCliente))
  ? String(data.tipoCliente)
  : (existing?.tipoCliente || 'particular')),

// Datos fiscales completos
razonSocial: String(data.razonSocial || existing?.razonSocial || ''),
direccionFiscal: String(data.direccionFiscal || existing?.direccionFiscal || ''),
ciudadFiscal: String(data.ciudadFiscal || existing?.ciudadFiscal || ''),
cpFiscal: String(data.cpFiscal || existing?.cpFiscal || ''),
provinciaFiscal: String(data.provinciaFiscal || existing?.provinciaFiscal || ''),
paisFiscal: String(data.paisFiscal || existing?.paisFiscal || 'España'),
regimenIva: (['general', 'simplificado', 'recargo_equivalencia', 'exento', 'intracomunitario'].includes(String(data.regimenIva))
  ? String(data.regimenIva)
  : (existing?.regimenIva || 'general')),

// Estado comercial (pipeline)
estadoComercial: (['prospecto', 'contactado', 'presupuestado', 'en_obra', 'fidelizado', 'inactivo', 'perdido'].includes(String(data.estadoComercial))
  ? String(data.estadoComercial)
  : (existing?.estadoComercial || 'prospecto')),

// Responsable comercial
responsableId: String(data.responsableId || existing?.responsableId || ''),
responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),

// Origen / fuente
origenCliente: (['directo', 'referido', 'web', 'publicidad', 'inmobiliaria', 'arquitecto', 'otro'].includes(String(data.origenCliente))
  ? String(data.origenCliente)
  : (existing?.origenCliente || 'directo')),
referidoPor: String(data.referidoPor || existing?.referidoPor || ''),

// Múltiples direcciones
direcciones: Array.isArray(data.direcciones) ? data.direcciones.map((d, i) => ({
  id: d.id || `dir-${i}-${Date.now()}`,
  etiqueta: String(d.etiqueta || ''),        // "Obra principal", "Domicilio", "Fiscal"
  tipo: (['obra', 'domicilio', 'fiscal', 'correspondencia', 'otro'].includes(String(d.tipo)) ? String(d.tipo) : 'otro'),
  calle: String(d.calle || ''),
  numero: String(d.numero || ''),
  piso: String(d.piso || ''),
  codigoPostal: String(d.codigoPostal || ''),
  ciudad: String(d.ciudad || ''),
  provincia: String(d.provincia || ''),
  pais: String(d.pais || 'España'),
  esPrincipal: Boolean(d.esPrincipal),
  coordenadas: d.coordenadas || null,
})) : (existing?.direcciones || []),

// Personas de contacto
contactos: Array.isArray(data.contactos) ? data.contactos.map((c, i) => ({
  id: c.id || `cnt-${i}-${Date.now()}`,
  nombre: String(c.nombre || ''),
  cargo: String(c.cargo || ''),              // "Arquitecto", "Promotor", "Administrador de fincas"
  telefono: String(c.telefono || ''),
  email: String(c.email || ''),
  notas: String(c.notas || ''),
  esPrincipal: Boolean(c.esPrincipal),
})) : (existing?.contactos || []),

// Inmuebles / propiedades vinculadas
inmuebles: Array.isArray(data.inmuebles) ? data.inmuebles.map((inm, i) => ({
  id: inm.id || `inm-${i}-${Date.now()}`,
  tipo: (['vivienda', 'local_comercial', 'nave_industrial', 'terreno', 'garaje', 'oficina', 'edificio', 'otro'].includes(String(inm.tipo)) ? String(inm.tipo) : 'otro'),
  descripcion: String(inm.descripcion || ''),
  direccion: String(inm.direccion || ''),
  referenciaCatastral: String(inm.referenciaCatastral || ''),
  superficie: Number(inm.superficie || 0),    // m²
  obraId: String(inm.obraId || ''),
  obraNombre: String(inm.obraNombre || ''),
  estado: (['planificado', 'en_obra', 'finalizado', 'entregado'].includes(String(inm.estado)) ? String(inm.estado) : 'planificado'),
  notas: String(inm.notas || ''),
})) : (existing?.inmuebles || []),

// Tags y categorías
tags: Array.isArray(data.tags) ? data.tags.map(t => String(t)) : (existing?.tags || []),

// Vínculo con CRM Core
crmClientId: String(data.crmClientId || existing?.crmClientId || ''),
crmLeadId: String(data.crmLeadId || existing?.crmLeadId || ''),

// Consentimientos
consentimientos: {
  proteccionDatos: Boolean(data.consentimientos?.proteccionDatos ?? existing?.consentimientos?.proteccionDatos),
  comunicacionesComerciales: Boolean(data.consentimientos?.comunicacionesComerciales ?? existing?.consentimientos?.comunicacionesComerciales),
  cesionTerceros: Boolean(data.consentimientos?.cesionTerceros ?? existing?.consentimientos?.cesionTerceros),
},
```

**Archivo: `services/couchdb.js` → `sanitizeConstructionClient`**

Ampliar para sanitizar todos los campos nuevos (mismos campos que el builder).

#### Compatibilidad hacia atrás

Los documentos existentes sin los campos nuevos se normalizan con defaults vacíos. No se pierde ningún dato previo. Los campos `nombre`, `cif`, `telefono`, `email`, `direccion`, `documentos`, `notas` se mantienen tal cual.

#### Criterios de aceptación

- [ ] `buildConstructionClientDocument` incluye todos los campos nuevos con defaults seguros
- [ ] `sanitizeConstructionClient` normaliza docs viejos (sin campos nuevos) sin error
- [ ] Un cliente creado con solo `nombre` sigue funcionando (retrocompatible)
- [ ] Los campos de enum (`tipoCliente`, `estadoComercial`, `regimenIva`, etc.) rechazan valores fuera de la lista y usan default

---

### CC-02 — Backend: Endpoints enriquecidos de cliente (detalle, duplicados, notas, histórico)

**Tipo:** Backend  
**Prioridad:** Crítica  
**Esfuerzo:** 4-5h  
**Dependencias:** CC-01

#### Contexto

El CRUD actual es plano (list/create/update/delete). Para un CRM real necesitamos: detalle enriquecido con obras y presupuestos, detección de duplicados, notas estructuradas y registro de interacciones/histórico.

#### Endpoints nuevos

**1. Detalle enriquecido del cliente**

`GET /api/construction/clients/:userId/:clientId/detail`

Respuesta:
```json
{
  "client": { /* datos completos del cliente */ },
  "obras": [
    { "_id": "...", "nombre": "...", "estado": "...", "progreso": 30, "ubicacion": "..." }
  ],
  "presupuestos": [
    { "_id": "...", "referencia": "...", "estado": "...", "totalConMargen": 45000, "totalPagado": 15000, "pendientePago": 30000 }
  ],
  "resumenEconomico": {
    "totalPresupuestado": 120000,
    "totalAceptado": 85000,
    "totalCobrado": 45000,
    "totalPendienteCobro": 40000,
    "numObrasActivas": 2,
    "numObrasFinalizadas": 1,
    "numPresupuestosPendientes": 1
  },
  "ultimasInteracciones": [ /* últimas 20 interacciones */ ],
  "alertas": [ /* alertas específicas de este cliente */ ]
}
```

Lógica: consultar `construction_project` filtrando por `clienteId`, `construction_budget` filtrando por `clienteId`, calcular agregados económicos, generar alertas de cliente (ver CC-06).

**2. Notas de cliente**

`GET /api/construction/clients/:userId/:clientId/notes` — lista notas ordenadas por fecha desc  
`POST /api/construction/clients/:userId/:clientId/notes` — crear nota

Modelo de nota (embebida en array `notas[]` del cliente o como subdocumentos):
```js
{
  id: 'nota-uuid',
  texto: 'Llamada: confirma que quiere empezar la obra en septiembre',
  tipo: 'llamada',      // llamada | visita | email | reunion | nota_interna | otro
  autor: 'user-id',
  autorNombre: 'Juan Pérez',
  fecha: '2026-04-14T10:30:00Z',
  obraId: '',            // opcional: vincular nota a una obra
  obraNombre: '',
  adjuntos: [],          // opcionales
}
```

Tipos de nota: `llamada`, `visita`, `email`, `reunion`, `nota_interna`, `cambio_estado`, `otro`.

**3. Histórico / interacciones del cliente**

`GET /api/construction/clients/:userId/:clientId/history`

Retorna timeline unificada construida en servidor combinando:
- Notas del cliente (de `notas[]`)
- Obras creadas/cambios de estado (de `construction_project` con `clienteId`)
- Presupuestos enviados/aceptados/rechazados (de `construction_budget` con `clienteId`)
- Pagos registrados (de `construction_budget.pagos[]`)
- Cambios de `estadoComercial` del propio cliente
- Documentos subidos

Cada entrada del timeline:
```js
{
  id: 'hist-uuid',
  tipo: 'nota' | 'obra_creada' | 'obra_estado' | 'presupuesto_enviado' | 'presupuesto_aceptado' | 'presupuesto_rechazado' | 'pago_registrado' | 'estado_comercial' | 'documento_subido',
  fecha: '2026-04-14T10:30:00Z',
  titulo: 'Presupuesto REF-001 aceptado',
  detalle: 'Total: 45.000€ — Pago en 3 plazos',
  entidadId: 'budget-id',
  entidadTipo: 'budget',
  autor: 'Juan Pérez',
}
```

Ordenado por fecha descendente. Paginado: `?limit=20&offset=0`.

**4. Detección de duplicados**

`POST /api/construction/clients/:userId/check-duplicates`

Body: `{ nombre, cif, telefono, email }`

Lógica:
- Buscar por CIF exacto (normalizado sin guiones/espacios)
- Buscar por teléfono (últimos 9 dígitos)
- Buscar por email (lowercase trim)
- Buscar por nombre similar (> 80% coincidencia Levenshtein o substring contenido)
- Excluir el propio cliente si se pasa `excludeId`

Respuesta: `{ duplicates: [{ client, matchField, matchScore }] }`

**5. Búsqueda y filtros server-side**

Ampliar `GET /api/construction/clients/:userId` con query params:

- `q` — búsqueda full-text (nombre, CIF, email, teléfono, razón social)
- `estadoComercial` — filtro por estado
- `tipoCliente` — filtro por tipo
- `conObrasActivas` — boolean, solo clientes con obras en estado `en_obra`
- `conImpagos` — boolean, solo clientes con `pendientePago > 0` en algún presupuesto
- `responsableId` — filtro por responsable
- `tags` — filtro por tags (comma-separated)
- `sortBy` — `nombre` | `updatedAt` | `estadoComercial` | `totalPresupuestado` (default: `updatedAt`)
- `sortOrder` — `asc` | `desc` (default: `desc`)

#### Criterios de aceptación

- [ ] Endpoint `/detail` retorna client + obras + presupuestos + resumen económico + alertas
- [ ] Endpoint de notas crea notas con tipo, autor y fecha
- [ ] Endpoint de histórico combina eventos de múltiples fuentes en timeline unificado
- [ ] Endpoint de duplicados detecta coincidencias por CIF, teléfono, email y nombre
- [ ] El listado soporta filtros y búsqueda server-side
- [ ] Cada endpoint valida `userId` y retorna 400 si falta
- [ ] Paginación en histórico funciona correctamente

---

### CC-03 — Backend: Sistema de alertas específicas de clientes de construcción

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 2-3h  
**Dependencias:** CC-01, CC-02

#### Contexto

Actualmente `getConstructionAlerts` genera alertas de obras y presupuestos pero no de clientes. Los requisitos piden 4 alertas específicas: cliente duplicado, cliente sin datos fiscales, cliente con impagos, cliente con presupuesto pendiente.

#### Cambios requeridos

**Archivo: `controllers/constructionController.js` → `getConstructionAlerts`**

Añadir al array de alertas existente las siguientes reglas:

| Tipo alerta | Regla | Severidad | Mensaje |
|-------------|-------|-----------|---------|
| `cliente_duplicado` | Clientes con mismo CIF no vacío o mismo teléfono (últimos 9 dígitos) | `warning` | "Posible cliente duplicado: {nombre} comparte {campo} con {otroCliente}" |
| `cliente_sin_datos_fiscales` | `tipoCliente === 'empresa'` y (`cif` vacío O `razonSocial` vacío O `direccionFiscal` vacío) | `warning` | "Cliente empresa sin datos fiscales completos: {nombre}" |
| `cliente_con_impagos` | Presupuestos aceptados del cliente con algún pago donde `fecha < hoy` y `pagado === false` | `high` | "Cliente con cobros vencidos: {nombre} — {importeVencido}€ pendientes" |
| `cliente_presupuesto_pendiente` | Presupuestos del cliente en estado `enviado` con `fecha` > 15 días sin respuesta | `warning` | "Presupuesto pendiente de respuesta: {referencia} para {nombre} ({diasPendiente} días)" |
| `cliente_inactivo` | `estadoComercial === 'en_obra'` pero sin obras activas (`en_obra` o `planificacion`) | `warning` | "Cliente marcado como en obra pero sin obras activas: {nombre}" |
| `cliente_sin_consentimiento` | `consentimientos.proteccionDatos === false` y tiene email o teléfono | `warning` | "Cliente sin consentimiento de datos: {nombre}" |

**Nuevo campo en `ConstructionAlert`** (interfaz TS en `constructionApi.ts`):

Ampliar `entityType` con valor `'client'` para estas alertas.

#### Criterios de aceptación

- [ ] Las 6 alertas se generan correctamente con datos reales
- [ ] El cálculo de duplicados es eficiente (no O(n²) con miles de clientes; agrupar por CIF y teléfono)
- [ ] Las alertas de impagos cruzan presupuestos con sus pagos
- [ ] La interfaz TS `ConstructionAlert` incluye `entityType: 'client'`
- [ ] Las alertas nuevas aparecen en `getConstructionAlerts` junto con las existentes
- [ ] El endpoint responde < 500ms con 100 clientes y 200 presupuestos

---

### CC-04 — Backend: Conversión lead/cliente CRM Core ↔ cliente de obra

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 3-4h  
**Dependencias:** CC-01

#### Contexto

El CRM Core (`/api/leads`, `/api/clients`) y la vertical construcción (`/api/construction/clients`) son silos separados. Un lead comercial que se convierte en cliente de obra requiere creación manual duplicada. Se necesita un puente bidireccional.

#### Endpoints nuevos

**1. Convertir lead CRM → cliente de obra**

`POST /api/construction/clients/:userId/from-lead`

Body: `{ leadId: 'lead-xyz' }`

Lógica:
1. Leer lead de `getLeadsDbName()` por `leadId`
2. Crear `construction_client` mapeando campos: `lead.name → nombre`, `lead.phone → telefono`, `lead.email → email`, `lead.company → razonSocial`
3. Guardar `crmLeadId: leadId` en el nuevo cliente
4. Actualizar lead con `convertedToConstructionClientId: nuevoClienteId` y estado `won`
5. Retornar el nuevo `construction_client`

**2. Vincular cliente CRM Core → cliente de obra**

`POST /api/construction/clients/:userId/link-crm`

Body: `{ constructionClientId: '...', crmClientId: '...' }`

Lógica:
1. Leer ambos documentos
2. Guardar `crmClientId` en `construction_client`
3. Guardar `constructionClientId` en el campo `linkedVerticalClients.construction` del cliente CRM (o campo equivalente)
4. Retornar ambos documentos actualizados

**3. Crear cliente de obra desde cliente CRM Core**

`POST /api/construction/clients/:userId/from-crm-client`

Body: `{ crmClientId: 'client-xyz' }`

Lógica:
1. Leer cliente CRM Core de `getClientsDbName()` por `crmClientId`
2. Crear `construction_client` mapeando: `name → nombre`, `fiscalId → cif`, `phone → telefono`, `email → email`, `address → direccion`, `legalName → razonSocial`, `fiscalAddress → direccionFiscal`, `fiscalCity → ciudadFiscal`, `fiscalPostalCode → cpFiscal`
3. Copiar `addresses[]` a `direcciones[]` mapeando campos
4. Copiar `contacts[]` a `contactos[]` mapeando campos
5. Guardar `crmClientId` en el nuevo cliente
6. Retornar el nuevo `construction_client`

**4. Autovinculación al crear presupuesto/obra**

En `constructionController.js`, al crear un `construction_budget` o `construction_project` con un `clienteId`, si ese cliente tiene `crmClientId`, registrar automáticamente una interacción en el cliente CRM Core:

```js
{
  type: 'obra_vinculada' | 'presupuesto_vinculado',
  date: new Date().toISOString(),
  description: 'Obra "Reforma local Calle Mayor" vinculada',
  entityId: project._id,
  source: 'construction'
}
```

#### Criterios de aceptación

- [ ] Lead CRM se convierte en cliente de obra con campos mapeados correctamente
- [ ] Cliente CRM Core se convierte en cliente de obra con datos fiscales completos
- [ ] El vínculo `crmClientId` / `crmLeadId` se guarda bidireccional
- [ ] Al crear obra/presupuesto, si hay vínculo CRM, se registra interacción
- [ ] Los endpoints validan que el lead/cliente CRM exista antes de convertir
- [ ] Se detecta si ya existe conversión previa y retorna error 409 (conflict)

---

### CC-05 — Backend: Crear cliente rápido desde obra o presupuesto

**Tipo:** Backend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** CC-01

#### Contexto

Los requisitos piden poder crear un cliente nuevo directamente desde el flujo de creación de obra o presupuesto, sin salir de ese contexto.

#### Cambios requeridos

El endpoint `POST /api/construction/clients/:userId` ya permite crear clientes. Lo que falta es:

**1. Endpoint de creación rápida con vinculación**

`POST /api/construction/clients/:userId/quick`

Body:
```json
{
  "client": { "nombre": "...", "telefono": "...", "cif": "..." },
  "vincularA": {
    "tipo": "obra" | "presupuesto",
    "id": "project-id o budget-id"
  }
}
```

Lógica:
1. Crear el `construction_client` con los datos proporcionados
2. Si `vincularA.tipo === 'obra'`, actualizar el `construction_project` con `clienteId` y `clienteNombre`
3. Si `vincularA.tipo === 'presupuesto'`, actualizar el `construction_budget` con `clienteId` y `clienteNombre`
4. Ejecutar detección de duplicados post-creación (CC-02)
5. Retornar `{ client, duplicates, linkedEntity }`

**2. Autocompletado de clientes existentes**

`GET /api/construction/clients/:userId/search?q=texto`

Retorna máximo 10 clientes que coincidan por nombre, CIF o teléfono. Para usar en autocomplete al escribir el nombre del cliente en obra/presupuesto, evitando crear duplicados.

#### Criterios de aceptación

- [ ] El endpoint `/quick` crea cliente Y vincula a obra/presupuesto en una sola llamada
- [ ] Si hay duplicados, los retorna en la respuesta (sin bloquear la creación)
- [ ] El endpoint `/search` retorna ≤ 10 resultados con latencia < 200ms
- [ ] Si `vincularA.id` no existe, retorna 404

---

### CC-06 — Frontend: Ampliar interfaz TS `ConstructionClient` y API

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Esfuerzo:** 1-2h  
**Dependencias:** CC-01

#### Contexto

La interfaz TypeScript `ConstructionClient` en `constructionApi.ts` solo tiene los campos básicos. Debe reflejar el modelo ampliado.

#### Cambios requeridos

**Archivo: `src/app/lib/constructionApi.ts`**

**1. Nuevas interfaces:**

```ts
export interface ClienteDireccion {
  id: string;
  etiqueta: string;
  tipo: 'obra' | 'domicilio' | 'fiscal' | 'correspondencia' | 'otro';
  calle: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  ciudad: string;
  provincia: string;
  pais: string;
  esPrincipal: boolean;
  coordenadas: { lat: number; lng: number } | null;
}

export interface ClienteContacto {
  id: string;
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  notas: string;
  esPrincipal: boolean;
}

export interface ClienteInmueble {
  id: string;
  tipo: 'vivienda' | 'local_comercial' | 'nave_industrial' | 'terreno' | 'garaje' | 'oficina' | 'edificio' | 'otro';
  descripcion: string;
  direccion: string;
  referenciaCatastral: string;
  superficie: number;
  obraId: string;
  obraNombre: string;
  estado: 'planificado' | 'en_obra' | 'finalizado' | 'entregado';
  notas: string;
}

export interface ClienteNota {
  id: string;
  texto: string;
  tipo: 'llamada' | 'visita' | 'email' | 'reunion' | 'nota_interna' | 'cambio_estado' | 'otro';
  autor: string;
  autorNombre: string;
  fecha: string;
  obraId: string;
  obraNombre: string;
  adjuntos: { nombre: string; url: string; mimeType: string }[];
}

export interface ClienteHistorialEntry {
  id: string;
  tipo: 'nota' | 'obra_creada' | 'obra_estado' | 'presupuesto_enviado' | 'presupuesto_aceptado' | 'presupuesto_rechazado' | 'pago_registrado' | 'estado_comercial' | 'documento_subido';
  fecha: string;
  titulo: string;
  detalle: string;
  entidadId: string;
  entidadTipo: string;
  autor: string;
}

export interface ClienteResumenEconomico {
  totalPresupuestado: number;
  totalAceptado: number;
  totalCobrado: number;
  totalPendienteCobro: number;
  numObrasActivas: number;
  numObrasFinalizadas: number;
  numPresupuestosPendientes: number;
}

export interface ClienteDetalle {
  client: ConstructionClient;
  obras: ConstructionProject[];
  presupuestos: ConstructionBudget[];
  resumenEconomico: ClienteResumenEconomico;
  ultimasInteracciones: ClienteHistorialEntry[];
  alertas: ConstructionAlert[];
}

export interface ClienteDuplicado {
  client: ConstructionClient;
  matchField: 'cif' | 'telefono' | 'email' | 'nombre';
  matchScore: number;
}
```

**2. Ampliar `ConstructionClient`:**

Añadir todos los campos nuevos del modelo (CC-01): `tipoCliente`, `razonSocial`, `direccionFiscal`, `ciudadFiscal`, `cpFiscal`, `provinciaFiscal`, `paisFiscal`, `regimenIva`, `estadoComercial`, `responsableId`, `responsableNombre`, `origenCliente`, `referidoPor`, `direcciones: ClienteDireccion[]`, `contactos: ClienteContacto[]`, `inmuebles: ClienteInmueble[]`, `tags: string[]`, `crmClientId`, `crmLeadId`, `consentimientos`.

**3. Nuevas funciones API:**

```ts
export async function getClientDetail(userId: string, clientId: string): Promise<ClienteDetalle> { ... }
export async function getClientNotes(userId: string, clientId: string): Promise<ClienteNota[]> { ... }
export async function createClientNote(userId: string, clientId: string, nota: Partial<ClienteNota>): Promise<ClienteNota> { ... }
export async function getClientHistory(userId: string, clientId: string, limit?: number, offset?: number): Promise<ClienteHistorialEntry[]> { ... }
export async function checkClientDuplicates(userId: string, data: { nombre?: string; cif?: string; telefono?: string; email?: string; excludeId?: string }): Promise<ClienteDuplicado[]> { ... }
export async function quickCreateClient(userId: string, client: Partial<ConstructionClient>, vincularA?: { tipo: 'obra' | 'presupuesto'; id: string }): Promise<{ client: ConstructionClient; duplicates: ClienteDuplicado[]; linkedEntity?: any }> { ... }
export async function searchClients(userId: string, query: string): Promise<ConstructionClient[]> { ... }
export async function convertLeadToClient(userId: string, leadId: string): Promise<ConstructionClient> { ... }
export async function linkCrmClient(userId: string, constructionClientId: string, crmClientId: string): Promise<ConstructionClient> { ... }
export async function importFromCrmClient(userId: string, crmClientId: string): Promise<ConstructionClient> { ... }
```

#### Criterios de aceptación

- [ ] Todas las interfaces reflejan el modelo del backend
- [ ] Todas las funciones API apuntan a los endpoints correctos
- [ ] Los tipos de las funciones son estrictos (no `any` innecesarios)
- [ ] Compatibilidad con clientes existentes (campos opcionales con defaults)

---

### CC-07 — Frontend: Rediseño de la página de clientes — Vista lista + filtros + KPIs

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Esfuerzo:** 5-6h  
**Dependencias:** CC-06

#### Contexto

La página actual `ConstructionClients.tsx` es un grid de tarjetas básicas con búsqueda client-side. Debe transformarse en una página CRM completa con KPIs, filtros avanzados, tabla profesional y acceso a detalle.

#### Estructura de la nueva página

```
HEADER
├── Título: "Clientes — Constructora" + badge con total
├── Botón "Nuevo cliente" (prominente)
├── Botón "Importar desde CRM" (secundario)
└── Toggle Gerente / Trabajador (si aplica)

KPIs (4 tarjetas, grid-cols-2 lg:grid-cols-4)
├── Total clientes (Users, gray)
├── Clientes en obra (HardHat, emerald) — con estadoComercial 'en_obra'
├── Pendiente de cobro (Wallet, red/amber) — suma de pendientePago de presupuestos
└── Presupuestos pendientes (FileText, blue) — presupuestos estado 'enviado'

FILTROS (barra horizontal colapsable en móvil)
├── Búsqueda (texto libre: nombre, CIF, email, teléfono)
├── Estado comercial (pills toggle: Todos | Prospecto | Contactado | Presupuestado | En obra | Fidelizado | Inactivo | Perdido)
├── Tipo cliente (select: Todos | Particular | Empresa | Autónomo | Comunidad | Promotora | Admin. pública)
├── Responsable (select con lista de responsables)
├── Con impagos (checkbox)
├── Con obras activas (checkbox)
└── Botón limpiar filtros

ALERTAS DE CLIENTES (panel colapsable, CC-03)
├── Solo si hay alertas
├── Agrupadas por severidad (high primero)
└── Cada alerta con botón de acción (ir al cliente)

TABLA DE CLIENTES (vista principal)
├── Columnas desktop: Nombre (+ tipo badge) | CIF | Estado comercial (badge color) | Obras activas | Total presupuestado | Cobrado / Pendiente | Responsable | Última actividad | Acciones
├── Columnas móvil: Cards apiladas con nombre, estado, obras, pendiente
├── Orden por defecto: última actividad desc
├── Click en fila → abre drawer de detalle (CC-08)
└── Acciones por fila: Ver detalle | Editar | Nuevo presupuesto | Nueva obra | Eliminar

PIE
└── Paginación (si > 25 clientes)
```

#### Badges de estado comercial

| Estado | Color | Label |
|--------|-------|-------|
| `prospecto` | gray | Prospecto |
| `contactado` | blue | Contactado |
| `presupuestado` | indigo | Presupuestado |
| `en_obra` | emerald | En obra |
| `fidelizado` | amber | Fidelizado |
| `inactivo` | gray/striped | Inactivo |
| `perdido` | red | Perdido |

#### Diferenciación por perfil

**Gerente:** Ve todos los clientes, todos los filtros, KPIs completos con métricas económicas, columnas financieras en tabla, botón importar CRM, toggle perfil.

**Trabajador:** Ve solo clientes de sus obras asignadas. Sin filtro de responsable, sin KPIs económicos, sin columnas Cobrado/Pendiente, sin botón importar CRM. KPIs reducidos: Total clientes (suyos), Obras asignadas, Tareas pendientes, Incidencias abiertas.

#### Convenciones UI

- Layout de `components/saas/Layout`
- Dark mode obligatorio
- Iconos `lucide-react`
- `rounded-xl`/`2xl`, `border-2 border-gray-200 dark:border-gray-700`
- `shadow-sm` en hover, `transition-all 150-200ms`
- EUR: `toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })`
- Fechas: `dd/MM/yyyy`
- Tabla con `hover:bg-gray-50 dark:hover:bg-gray-800/50` en filas

#### Criterios de aceptación

- [ ] 4 KPIs con datos reales calculados del listado y presupuestos
- [ ] 6+ filtros con persistencia en URL query params + localStorage
- [ ] Tabla responsiva: tabla desktop, cards móvil
- [ ] Badges de estado comercial con colores correctos
- [ ] Panel de alertas de clientes (colapsable, solo si hay alertas)
- [ ] Click en cliente abre drawer de detalle
- [ ] Acciones por fila funcionales (editar, nuevo presupuesto, nueva obra)
- [ ] Diferenciación gerente/trabajador implementada
- [ ] Búsqueda server-side con debounce 300ms
- [ ] Paginación si > 25 clientes

---

### CC-08 — Frontend: Drawer / panel de detalle del cliente con tabs

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Esfuerzo:** 6-8h  
**Dependencias:** CC-06, CC-07

#### Contexto

Actualmente no hay vista de detalle. Al hacer click en un cliente se debe abrir un drawer lateral (o panel expandido) con toda la información organizada en tabs.

#### Estructura del drawer

```
DRAWER (ancho 50% desktop, full-screen móvil)
├── HEADER
│   ├── Avatar (iniciales del nombre, color por tipoCliente)
│   ├── Nombre + Razón social
│   ├── Badge estado comercial (editable inline: click → dropdown para cambiar)
│   ├── Badge tipo cliente
│   ├── Botones: Editar | Llamar (tel:) | Email (mailto:) | Cerrar
│   └── Tags (inline, editables)
│
├── RESUMEN RÁPIDO (3-4 bloques en fila)
│   ├── Obras activas (número + icono HardHat)
│   ├── Total presupuestado (€)
│   ├── Cobrado (€ emerald)
│   └── Pendiente (€ red si > 0)
│
├── TABS
│   ├── General
│   ├── Obras
│   ├── Presupuestos
│   ├── Económico
│   ├── Documentos
│   ├── Notas
│   └── Histórico
```

#### Tab "General"

```
DATOS DE CONTACTO
├── Teléfono (con botón llamar)
├── Email (con botón enviar)
├── Contactos adicionales (tabla: nombre, cargo, teléfono, email)
└── Botón "Añadir contacto"

DATOS FISCALES
├── CIF/NIF | Razón social
├── Dirección fiscal completa
├── Régimen IVA
└── Indicador visual ⚠️ si faltan datos fiscales

DIRECCIONES
├── Lista de direcciones con etiquetas y badges de tipo
├── Mapa (si hay coordenadas)
└── Botón "Añadir dirección"

INMUEBLES / PROPIEDADES
├── Grid de inmuebles: tipo, descripción, dirección, superficie, ref. catastral
├── Enlace a obra vinculada (si existe)
└── Botón "Añadir inmueble"

ORIGEN Y COMERCIAL
├── Origen: directo | referido | web | etc.
├── Referido por (si aplica)
├── Responsable comercial
└── Vínculo CRM Core (si existe, botón para ir al cliente CRM)

CONSENTIMIENTOS (GDPR)
├── Protección de datos: ✓ / ✗
├── Comunicaciones comerciales: ✓ / ✗
└── Cesión a terceros: ✓ / ✗
```

#### Tab "Obras"

```
LISTA DE OBRAS VINCULADAS
├── Cards o tabla: Nombre | Estado (badge) | Ubicación | Progreso (barra) | Fechas
├── Click → navega a la obra
├── Botón "Nueva obra para este cliente"
└── Si no hay obras: estado vacío con CTA "Crear primera obra"
```

#### Tab "Presupuestos"

```
LISTA DE PRESUPUESTOS
├── Tabla: Referencia | Obra | Estado (badge) | Total | Pagado | Pendiente | Fecha
├── Estados: borrador (gray), enviado (blue), aceptado (emerald), rechazado (red)
├── Click → navega al presupuesto
├── Botón "Nuevo presupuesto para este cliente"
└── Si no hay presupuestos: estado vacío con CTA
```

#### Tab "Económico" (solo gerente)

```
RESUMEN FINANCIERO
├── 4 bloques: Presupuestado | Aceptado | Cobrado | Pendiente
├── Gráfico de barras: cobrado vs pendiente por obra (Recharts)
├── Tabla de cobros:
│   ├── Próximos cobros (fecha, obra, importe)
│   ├── Cobros vencidos (rojo, con días de retraso)
│   └── Últimos cobros recibidos (verde)
└── Indicador de morosidad (días medios de pago)
```

#### Tab "Documentos"

```
DOCUMENTOS DEL CLIENTE
├── Grid/lista: Nombre | Tipo (badge) | Fecha | Acciones (ver, descargar, eliminar)
├── Tipos: contrato, escritura, poder, DNI/CIF, certificado, licencia, factura, otro
├── Botón "Subir documento" (modal drag&drop)
├── Botón "Escanear con OCR" (reutilizar modal existente)
└── Indicador de documentos obligatorios faltantes (si es empresa: CIF, poder notarial)
```

#### Tab "Notas"

```
NOTAS DEL CLIENTE
├── Input de nueva nota: textarea + selector tipo (llamada/visita/email/reunión/nota) + botón Guardar
├── Timeline de notas: fecha, autor, tipo (icono), texto, obra vinculada (si aplica)
├── Orden: más reciente primero
├── Cada nota con acciones: editar, eliminar
└── Si no hay notas: estado vacío
```

#### Tab "Histórico"

```
TIMELINE COMPLETO
├── Timeline vertical con iconos por tipo de evento
├── Eventos: notas + cambios de estado + obras + presupuestos + pagos + documentos
├── Cada entrada: fecha relativa ("hace 2 días") + fecha absoluta al hover + icono + título + detalle
├── Filtro por tipo de evento (pills)
├── Lazy load (20 por carga + "Cargar más")
└── Colores: notas (gray), obras (amber), presupuestos (indigo), pagos (emerald), alertas (red)
```

#### Criterios de aceptación

- [ ] Drawer abre al click en cliente desde la tabla (CC-07)
- [ ] 7 tabs funcionales con datos reales
- [ ] Tab General muestra todos los datos del cliente organizados
- [ ] Tab Obras muestra obras vinculadas con estado y progreso
- [ ] Tab Presupuestos muestra presupuestos con estado y pagos
- [ ] Tab Económico (solo gerente) muestra resumen financiero con gráfico
- [ ] Tab Documentos con upload, OCR y gestión
- [ ] Tab Notas con creación, timeline y tipos
- [ ] Tab Histórico con timeline unificado y filtro por tipo
- [ ] Estado comercial editable inline desde el header del drawer
- [ ] Tags editables inline
- [ ] Responsive: full-screen en móvil
- [ ] Dark mode completo
- [ ] Datos cargados desde endpoint `/detail` (CC-02)

---

### CC-09 — Frontend: Modal de crear/editar cliente completo

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Esfuerzo:** 4-5h  
**Dependencias:** CC-06

#### Contexto

El modal actual tiene 6 campos (nombre, CIF, teléfono, email, dirección, notas). Debe ampliarse a un formulario completo con todos los campos nuevos, detección de duplicados en tiempo real y secciones colapsables.

#### Estructura del modal

```
MODAL (max-w-2xl, max-h-[90vh] overflow-y-auto)
├── HEADER: "Nuevo cliente" / "Editar cliente" + botón cerrar
│
├── SECCIÓN: Datos básicos (siempre visible)
│   ├── Tipo de cliente (select: particular, empresa, autónomo, comunidad, promotora, admin. pública)
│   ├── Nombre / Razón social (*) — con búsqueda de duplicados al blur (debounce 500ms)
│   ├── CIF / NIF — con validación formato (dniCifValidator.ts) + búsqueda duplicados al blur
│   ├── Teléfono (*) — con búsqueda duplicados al blur
│   ├── Email — con búsqueda duplicados al blur
│   └── Estado comercial (select con colores)
│
├── AVISO DUPLICADOS (condicional)
│   ├── Banner amarillo: "Se han encontrado posibles duplicados"
│   ├── Lista de coincidencias con campo que coincide
│   └── Botones: "Usar existente" (cierra modal y selecciona) | "Crear de todos modos"
│
├── SECCIÓN: Datos fiscales (colapsable, abierta por defecto si tipo = empresa)
│   ├── Razón social (si ≠ nombre)
│   ├── Dirección fiscal
│   ├── Ciudad fiscal | CP fiscal | Provincia fiscal
│   ├── País fiscal (default: España)
│   └── Régimen IVA (select)
│
├── SECCIÓN: Dirección principal (colapsable)
│   ├── Calle | Número | Piso
│   ├── CP | Ciudad | Provincia
│   └── País
│
├── SECCIÓN: Contactos adicionales (colapsable)
│   ├── Lista de contactos existentes (editable)
│   └── Botón "Añadir contacto" → fila editable: nombre, cargo, teléfono, email
│
├── SECCIÓN: Origen y comercial (colapsable)
│   ├── Origen (select: directo, referido, web, publicidad, inmobiliaria, arquitecto, otro)
│   ├── Referido por (texto, si origen = referido)
│   └── Responsable comercial (select de miembros del equipo)
│
├── SECCIÓN: Notas
│   └── Textarea
│
├── SECCIÓN: Consentimientos
│   ├── ☐ Protección de datos
│   ├── ☐ Comunicaciones comerciales
│   └── ☐ Cesión a terceros
│
└── FOOTER
    ├── Botón "Cancelar"
    └── Botón "Guardar cliente"
```

#### Validaciones en tiempo real

| Campo | Validación | Feedback |
|-------|-----------|----------|
| Nombre | Obligatorio, min 2 chars | Borde rojo + mensaje |
| CIF/NIF | Formato válido (usar `dniCifValidator.ts`) | ✓ verde / ✗ rojo + mensaje |
| Teléfono | ≥ 9 dígitos | Borde rojo + mensaje |
| Email | Formato email válido | Borde rojo + mensaje |
| Duplicados | Al blur de nombre/CIF/teléfono/email, llamar a `/check-duplicates` con debounce 500ms | Banner amarillo con coincidencias |

#### Modo rápido vs completo

- **Rápido** (invocado desde obra/presupuesto con prop `quickMode`): Solo muestra Datos básicos + Datos fiscales. Sin secciones colapsables. Botón "Guardar y vincular".
- **Completo** (invocado desde la página de clientes): Todas las secciones.

#### Criterios de aceptación

- [ ] Modal con todas las secciones colapsables
- [ ] Sección fiscal abierta por defecto si tipo = empresa/autónomo
- [ ] Detección de duplicados en tiempo real al salir del campo (blur)
- [ ] Banner de duplicados con opciones "Usar existente" / "Crear de todos modos"
- [ ] Validación CIF/NIF con `dniCifValidator.ts`
- [ ] Validación teléfono ≥ 9 dígitos
- [ ] Modo rápido con campos reducidos para usar desde obra/presupuesto
- [ ] Componente exportable como `<CreateEditClientModal>` para reutilizar
- [ ] Al guardar en modo rápido, retorna el cliente para vincularlo (callback `onClientCreated`)
- [ ] Dark mode completo
- [ ] Responsive

---

### CC-10 — Frontend: Integración "Crear cliente" desde Obras y Presupuestos

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 2-3h  
**Dependencias:** CC-05, CC-09

#### Contexto

Los requisitos piden poder crear un cliente directamente desde el flujo de obra o presupuesto. Actualmente en `ConstructionProjects.tsx` y `ConstructionBudgets.tsx` el campo "cliente" es un select de clientes existentes o texto libre, sin opción de crear uno nuevo.

#### Cambios requeridos

**Archivo: `ConstructionProjects.tsx`**

En el modal de crear/editar obra, en el campo de selección de cliente:

1. Convertir el campo `clienteId` en un combo autocomplete (input + dropdown)
2. Al escribir: buscar entre clientes existentes (usar `searchClients` de CC-05)
3. Si no encuentra: mostrar opción "＋ Crear nuevo cliente «{texto}»" al final del dropdown
4. Al click en "Crear nuevo": abrir `<CreateEditClientModal quickMode />` (CC-09)
5. Al guardar el nuevo cliente: autorellenar `clienteId` y `clienteNombre` en el formulario de obra

**Archivo: `ConstructionBudgets.tsx`**

Mismo patrón que obras:

1. Combo autocomplete en campo de cliente
2. Opción de crear nuevo con modal rápido
3. Al guardar: autorellenar `clienteId` y `clienteNombre`

**Componente reutilizable: `ClienteAutocomplete.tsx`**

Crear componente `<ClienteAutocomplete>` que encapsule:
- Input con icono de búsqueda
- Dropdown con resultados (nombre, CIF, teléfono en cada fila)
- Opción "Crear nuevo" al final
- Props: `value`, `onChange(clienteId, clienteNombre)`, `onCreateNew()`

#### Criterios de aceptación

- [ ] En Obras: al crear/editar, el campo cliente es autocomplete con búsqueda
- [ ] En Presupuestos: igual que obras
- [ ] Opción "Crear nuevo cliente" visible si la búsqueda no encuentra coincidencia exacta
- [ ] El modal de creación rápida se abre sin salir del formulario de obra/presupuesto
- [ ] Al crear el nuevo cliente, los campos `clienteId` y `clienteNombre` se rellenan automáticamente
- [ ] Si se cierra el modal sin crear, se vuelve al formulario de obra/presupuesto intacto
- [ ] `<ClienteAutocomplete>` es componente reutilizable exportado

---

### CC-11 — Frontend: Sidebar, routing y conexiones bidireccionales

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 1-2h  
**Dependencias:** CC-07

#### Contexto

`construction-clients` no aparece en el grupo Constructora del sidebar. Además, necesitamos conexiones bidireccionales: desde Clientes acceder a Obras/Presupuestos/Dashboard y viceversa.

#### Cambios requeridos

**1. Sidebar (`Sidebar.tsx`)**

Añadir al grupo `construction` (después de "Centro Operativo" si existe, o como segundo item):

```
{ icon: Users, label: 'Clientes', path: '/saas/construction-clients' }
```

Orden del grupo Constructora en sidebar:
1. Centro Operativo (si existe)
2. **Clientes** ← NUEVO
3. Obras
4. Presupuestos
5. Trabajadores
6. Tareas
7. Subcontratas
8. Maquinaria
9. Materiales
10. Planos

**2. Conexiones desde otras páginas**

| Página | Cambio |
|--------|--------|
| `ConstructionProjects.tsx` | En cada obra, si tiene `clienteId`, añadir chip clickable con nombre del cliente que navega a `/saas/construction-clients?open={clienteId}` |
| `ConstructionBudgets.tsx` | En cada presupuesto, chip clickable del cliente |
| `ConstructionDashboard.tsx` | Si hay widget de clientes o KPIs de clientes, enlazar |
| `ConstructionClients.tsx` | Desde la tabla/drawer de clientes, botones que navegan a obras y presupuestos filtrados por ese cliente |

**3. Deep linking**

URL query params en `/saas/construction-clients`:
- `?open={clienteId}` → abre drawer de detalle de ese cliente al cargar
- `?tab={general|obras|presupuestos|economico|documentos|notas|historico}` → abre el drawer en esa tab
- `?crear=1` → abre modal de creación al cargar
- `?estado={estadoComercial}` → pre-filtra por estado

#### Criterios de aceptación

- [ ] `construction-clients` aparece en el sidebar del grupo Constructora
- [ ] Orden de items del sidebar correcto
- [ ] Desde Obras y Presupuestos se puede navegar al cliente
- [ ] Desde ficha de cliente se puede navegar a obras y presupuestos
- [ ] Deep linking por query params funcional
- [ ] `?open=clienteId` abre el drawer al cargar la página

---

### CC-12 — Frontend: Diferenciación perfil gerente vs trabajador

**Tipo:** Frontend  
**Prioridad:** Alta  
**Esfuerzo:** 2-3h  
**Dependencias:** CC-07, CC-08

#### Contexto

Los requisitos especifican dos perfiles distintos. El gerente ve todo; el trabajador solo datos operativos de clientes asignados.

#### Detección del perfil

```ts
const { user } = useAuth();
const isGerente = ['owner', 'admin', 'manager'].includes(user?.role);
const isTrabajador = !isGerente;
```

Si es gerente: toggle manual en header para previsualizar vista trabajador (patrón del ButcherHub).

#### Matriz de visibilidad

| Elemento | Gerente | Trabajador |
|----------|---------|------------|
| **Listado de clientes** | Todos | Solo clientes de obras asignadas al trabajador |
| **KPIs económicos** (pendiente cobro, presupuestado) | ✓ | ✗ — Reemplazar por: Mis obras, Tareas pendientes |
| **Filtro responsable** | ✓ | ✗ |
| **Filtro "Con impagos"** | ✓ | ✗ |
| **Columna "Cobrado / Pendiente"** en tabla | ✓ | ✗ |
| **Columna "Responsable"** en tabla | ✓ | ✗ |
| **Botón "Importar desde CRM"** | ✓ | ✗ |
| **Tab "Económico"** en drawer | ✓ | ✗ |
| **Datos fiscales** en drawer | ✓ | Solo lectura |
| **Crear / editar cliente** | ✓ (completo) | ✓ (solo datos básicos, sin fiscal ni comercial) |
| **Eliminar cliente** | ✓ | ✗ |
| **Cambiar estado comercial** | ✓ | ✗ |
| **Panel de alertas** | ✓ (todas) | Solo alertas de sus clientes |
| **Notas** | ✓ (crear, ver todas) | ✓ (crear, ver solo las suyas y las de sus obras) |

#### Filtrado de clientes para trabajador

Para el trabajador, necesitamos saber qué obras tiene asignadas. Dos opciones:
1. Buscar `construction_worker` con el ID del usuario → obtener `obraAsignada` → buscar `construction_project` de esas obras → extraer `clienteId` → filtrar clientes.
2. Nuevo endpoint `GET /api/construction/clients/:userId/my-clients?workerId={workerId}` que haga la lógica en servidor.

Opción 2 (preferida): se implementa un nuevo query param `workerId` en el listado de clientes (CC-02) que filtra por obras asignadas.

#### Criterios de aceptación

- [ ] Gerente ve todos los clientes y todas las columnas/tabs
- [ ] Trabajador ve solo clientes de sus obras asignadas
- [ ] KPIs se adaptan al perfil
- [ ] Filtros económicos ocultos para trabajador
- [ ] Tab "Económico" oculta para trabajador
- [ ] Trabajador no puede eliminar clientes
- [ ] Trabajador no puede cambiar estado comercial
- [ ] Toggle "vista trabajador" visible solo para gerente
- [ ] El filtrado server-side por `workerId` funciona correctamente

---

### CC-13 — Backend + Frontend: Vinculación automática con facturación

**Tipo:** Full-stack  
**Prioridad:** Media  
**Esfuerzo:** 3-4h  
**Dependencias:** CC-01, CC-02

#### Contexto

La facturación (`/api/invoices`, `ClientBillingPage.tsx`) y los presupuestos de construcción (`construction_budget` con pagos) son sistemas separados. El requisito pide que la ficha de cliente muestre la relación económica completa.

#### Cambios requeridos

**Backend:**

1. En el endpoint de detalle (CC-02), si el cliente tiene `crmClientId`, consultar también las facturas del CRM (`getCrmInvoicesDbName()`) filtrando por ese `crmClientId` y añadir al resumen económico:

```js
resumenEconomico: {
  // ...campos existentes de CC-02...
  totalFacturado: 0,        // suma de facturas emitidas
  totalFacturasCobradas: 0,  // facturas con estado 'paid'
  totalFacturasPendientes: 0, // facturas con estado 'pending' o 'overdue'
  facturas: []                // últimas 10 facturas
}
```

2. Al registrar un pago en un presupuesto de construcción (`acceptConstructionBudget` / `registerConstructionPayment`), si el cliente tiene `crmClientId`, crear o actualizar la factura correspondiente en el sistema de facturación.

**Frontend:**

1. En el Tab "Económico" del drawer (CC-08), añadir sección "Facturación" si hay facturas:
   - Tabla de facturas: Nº factura | Concepto | Importe | Estado | Fecha
   - Enlace "Ver en facturación" → navega a `ClientBillingPage` filtrado por cliente

2. En la tabla de la lista (CC-07), la columna "Cobrado / Pendiente" incluye datos de facturas si existen.

#### Criterios de aceptación

- [ ] El detalle del cliente incluye facturas del CRM si hay vínculo
- [ ] El resumen económico combina presupuestos de obra + facturas CRM
- [ ] Al registrar pago en presupuesto, se refleja en facturación si hay vínculo CRM
- [ ] Tab Económico muestra facturas si existen
- [ ] Enlace funcional a `ClientBillingPage`

---

### CC-14 — Frontend: Panel de documentación del cliente categorizado

**Tipo:** Frontend  
**Prioridad:** Media  
**Esfuerzo:** 2-3h  
**Dependencias:** CC-08

#### Contexto

Los documentos del cliente actualmente son genéricos (OCR scan). Para construcción necesitamos categorías específicas y documentos obligatorios según tipo de cliente.

#### Documentos obligatorios según tipo de cliente

| Tipo cliente | Documentos obligatorios |
|-------------|------------------------|
| `empresa` | CIF (tarjeta), Escritura de constitución, Poder de representación |
| `autonomo` | DNI/NIE, Alta autónomos (036/037) |
| `comunidad_propietarios` | Acta constitución, CIF comunidad, Acta nombramiento presidente |
| `promotora` | CIF, Escritura, Licencia promotora |
| `administracion_publica` | CIF, Documento de adjudicación |
| `particular` | DNI/NIE (opcional) |

#### Cambios en el Tab "Documentos" del drawer (CC-08)

1. **Sección "Documentos obligatorios"** — Grid de cards por cada doc obligatorio según `tipoCliente`:
   - Estado: ✓ Subido (verde) | ⚠ Pendiente (amber) | ✗ Faltante (rojo con CTA "Subir")
   - Al click en "Subir": modal de upload con categoría preseleccionada

2. **Sección "Otros documentos"** — Lista de documentos adicionales subidos por el usuario
   - Categorías para el select de tipo: `contrato`, `escritura`, `poder`, `dni_cif`, `certificado`, `licencia`, `factura`, `albaran`, `plano`, `memoria`, `seguro`, `otro`
   - Cada doc: nombre, tipo (badge), fecha, acciones (ver/descargar/eliminar)

3. **Indicador en la tarjeta del cliente** (CC-07): Si faltan documentos obligatorios, mostrar badge rojo "X docs pendientes"

4. **Modal de upload** (reutilizar y ampliar el existente):
   - Drag & drop
   - Categoría (select)
   - Nombre del documento
   - Fecha de emisión (opcional)
   - Fecha de caducidad (opcional)
   - Notas
   - Botón "Escanear con OCR" (reutilizar flujo existente)

#### Criterios de aceptación

- [ ] Los documentos obligatorios se muestran según `tipoCliente`
- [ ] Indicador visual claro de documentos subidos vs pendientes vs faltantes
- [ ] Modal de upload con categorías y metadatos
- [ ] Badge "X docs pendientes" en la tarjeta del cliente
- [ ] OCR sigue funcionando integrado en el nuevo flujo
- [ ] Dark mode correcto en todo el panel

---

### CC-15 — Frontend: Importar clientes desde CRM Core

**Tipo:** Frontend  
**Prioridad:** Media  
**Esfuerzo:** 2-3h  
**Dependencias:** CC-04, CC-06

#### Contexto

Las empresas que ya usan el CRM Core tendrán clientes ahí que quieren usar en construcción. Necesitan un flujo de importación.

#### Flujo

1. **Botón "Importar desde CRM"** en la página de clientes (solo gerente)
2. Al click → Modal de importación:
   - Buscador de clientes del CRM Core (consulta `/api/clients/:userId` con `?q=texto`)
   - Lista de resultados con: nombre, teléfono, email, tipo, estado
   - Badge "Ya vinculado" si ese cliente CRM ya tiene un `constructionClientId` vinculado
   - Checkbox de selección múltiple
3. **Botón "Importar seleccionados"**:
   - Para cada seleccionado: llamar a `/api/construction/clients/:userId/from-crm-client` (CC-04)
   - Progress bar
   - Al terminar: "X clientes importados correctamente" + recargar listado
4. **Alternativa: Importar desde lead**:
   - Tab "Leads" en el mismo modal
   - Buscar leads del CRM con estado `won` o `negotiation`
   - Mismo flujo de importación

#### Criterios de aceptación

- [ ] Modal de importación con búsqueda de clientes CRM Core
- [ ] Indicador "Ya vinculado" para evitar duplicados
- [ ] Importación múltiple con progress bar
- [ ] Tab de leads disponible
- [ ] Campos mapeados correctamente (nombre, CIF, fiscal, direcciones, contactos)
- [ ] Mensaje de éxito/error tras importación
- [ ] Solo visible para gerente

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Modelo de datos y API (semanas 1-2)

| Ticket | Nombre | Tipo | Prioridad | Esfuerzo |
|--------|--------|------|-----------|----------|
| CC-01 | Ampliar modelo datos cliente | Backend | Crítica | 3-4h |
| CC-02 | Endpoints enriquecidos (detalle, duplicados, notas, histórico) | Backend | Crítica | 4-5h |
| CC-03 | Alertas específicas de clientes | Backend | Alta | 2-3h |
| CC-04 | Conversión lead/CRM Core ↔ cliente de obra | Backend | Alta | 3-4h |
| CC-05 | Crear cliente rápido desde obra/presupuesto | Backend | Alta | 1-2h |

### Fase 2 — Tipos y página principal (semana 3)

| Ticket | Nombre | Tipo | Prioridad | Esfuerzo |
|--------|--------|------|-----------|----------|
| CC-06 | Ampliar interfaz TS y API frontend | Frontend | Crítica | 1-2h |
| CC-07 | Rediseño página clientes (lista + filtros + KPIs) | Frontend | Crítica | 5-6h |
| CC-09 | Modal crear/editar cliente completo | Frontend | Crítica | 4-5h |
| CC-11 | Sidebar, routing y conexiones | Frontend | Alta | 1-2h |

### Fase 3 — Detalle y drawer (semanas 4-5)

| Ticket | Nombre | Tipo | Prioridad | Esfuerzo |
|--------|--------|------|-----------|----------|
| CC-08 | Drawer de detalle con tabs | Frontend | Crítica | 6-8h |
| CC-10 | Integración crear cliente desde Obras/Presupuestos | Frontend | Alta | 2-3h |
| CC-12 | Diferenciación gerente vs trabajador | Frontend | Alta | 2-3h |

### Fase 4 — Integraciones y enriquecimiento (semana 6)

| Ticket | Nombre | Tipo | Prioridad | Esfuerzo |
|--------|--------|------|-----------|----------|
| CC-13 | Vinculación con facturación | Full-stack | Media | 3-4h |
| CC-14 | Documentación categorizada | Frontend | Media | 2-3h |
| CC-15 | Importar clientes desde CRM Core | Frontend | Media | 2-3h |

**Esfuerzo total estimado: ~45-55 horas**

---

## NOTAS DE DISEÑO

### Paleta de colores clientes

| Concepto | Color |
|----------|-------|
| Estado: prospecto | `gray-100/500` |
| Estado: contactado | `blue-100/500` |
| Estado: presupuestado | `indigo-100/500` |
| Estado: en_obra | `emerald-100/500` |
| Estado: fidelizado | `amber-100/500` |
| Estado: inactivo | `gray-100/400` (striped) |
| Estado: perdido | `red-100/500` |
| KPI cobros | `emerald` (cobrado) / `red` (pendiente) |
| Documentos OK | `emerald` |
| Documentos pendientes | `amber` |
| Documentos faltantes | `red` |
| Alertas high | `red` |
| Alertas warning | `amber` |

### Convenciones UI

- Layout: `components/saas/Layout`
- Dark mode obligatorio en todos los componentes
- Iconos: `lucide-react` (Users, Building2, HardHat, Wallet, FileText, Phone, Mail, MapPin, Tag, Clock, AlertTriangle, CheckCircle2, PenLine, Trash2, Plus, Search, Filter, ChevronDown, ChevronRight, ExternalLink)
- Bordes: `rounded-xl` / `rounded-2xl`, `border-2 border-gray-200 dark:border-gray-700`
- Sombras: `shadow-sm` en hover
- Transiciones: `transition-all duration-150`
- Moneda: `toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })`
- Fechas: `dd/MM/yyyy` con `Intl.DateTimeFormat('es-ES')`
- Drawer: `fixed right-0 top-0 h-full w-full md:w-1/2 xl:w-2/5`

### Patrón estado/fetching

- `useState` + `useMemo` + `useCallback` (sin Redux/Zustand)
- `constructionApi.ts` para todas las llamadas
- Búsqueda server-side con debounce 300ms
- Filtros persistidos en URL query params (prioridad) + localStorage (fallback)
- `useAuth()` para userId y role
- Polling no necesario en esta página (no es centro operativo)

### Referencia visual

Mismo patrón que `ClientsPage.tsx` del CRM Core (tabla, filtros, detalle), adaptado al estilo de la vertical construcción. Drawer de detalle similar al patrón del `ButcherHub` (tabs, timeline).

### Mapa de conexiones

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   CRM Core      │────▶│  CLIENTES OBRA   │◀────│  Presupuestos      │
│  (leads/clients)│     │  (esta página)    │     │  (construction)    │
└─────────────────┘     └──────┬───────────┘     └────────────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
             ┌──────────┐ ┌────────┐ ┌──────────────┐
             │  Obras   │ │Facturas│ │Documentación │
             │(projects)│ │(CRM)   │ │  (docs obra) │
             └──────────┘ └────────┘ └──────────────┘
                    │                        │
                    ▼                        ▼
             ┌──────────────────────────────────┐
             │         Dashboard                 │
             │    (ConstructionDashboard)        │
             └──────────────────────────────────┘
```
