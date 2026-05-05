# PARTIDAS, GREMIOS Y PRECIOS PREDEFINIDOS — Tickets

**Página:** `/saas/vertical/construccion/partidas-gremios`
**URL pública:** `https://vertialapp.com/saas/vertical/construccion/partidas-gremios`
**Objetivo:** Acelerar la creación de presupuestos usando un catálogo de gremios base configurables, partidas predefinidas por gremio con precios base editables, y plantillas de presupuesto reutilizables.
**Tipo:** Módulo dentro de la vertical Construcción.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Constante `CONSTRUCTION_GUILDS` con 11 tipos | Completo | `couchdb.js` — `['carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero', 'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro']` |
| Entidad `construction_guild` con precios desglosados (materiales, manoObra, estructural) | Completo | `couchdb.js` → `buildConstructionGuildDocument` — prefijo `cgld-` |
| CRUD de gremios vía API `/api/construction/guilds/:userId` | Completo | `constructionController.js` — list, create, update, delete |
| Endpoint `/api/construction/config` devuelve `projectTypes` y `guilds` | Completo | `constructionController.js` → `getConstructionConfig` |
| Presupuestos con `partidas[]` embebidas | Completo | `couchdb.js` → `buildConstructionBudgetDocument` — cada partida: `{ id, gremio, descripcion, materiales, manoObra, estructural, subtotal }` |
| Auto-relleno de precios al seleccionar gremio en partida | Completo | `ConstructionBudgets.tsx` → `autoFillFromGuild()` — busca `guild.tipo === gremioTipo` y copia los 3 precios |
| Cálculo automático de subtotal por partida y total con margen | Completo | `ConstructionBudgets.tsx` — `totalPartidas`, `totalConMargen` |
| Página de gremios/subcontratistas con grid de tarjetas | Completo | `ConstructionSubcontractors.tsx` — CRUD visual con precios desglosados |
| Interface TS `BudgetPartida` y `ConstructionGuild` | Completo | `constructionApi.ts` |
| Roles de equipo (Admin, Gerente, Comercial, Trabajador, etc.) | Completo | `roleCatalog.ts` — Admin/Gerente con `permissions: ['all']` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **Los gremios base están desactualizados** — La constante `CONSTRUCTION_GUILDS` tiene nombres incorrectos ('peletería', 'pradurista') y le faltan 10+ gremios esenciales del sector | Los selects no reflejan la realidad de obra; el usuario no puede crear presupuestos precisos |
| 2 | **No existen partidas predefinidas por gremio** — Cada partida se escribe a mano desde cero en cada presupuesto | Pérdida masiva de tiempo; inconsistencia entre presupuestos; errores en descripciones y precios |
| 3 | **No hay catálogo de precios base** — Los precios del gremio (`precioMateriales/ManoObra/Estructural`) son un valor global por gremio, no un precio por partida concreta | Imposible presupuestar "instalación eléctrica de cocina" a un precio diferente de "instalación eléctrica de baño" |
| 4 | **No hay campo de cantidad en las partidas** — La partida solo tiene importes fijos, sin `cantidad × precio unitario` | No se puede presupuestar "25 m² de alicatado" ni calcular automáticamente |
| 5 | **No hay unidad de medida en las partidas** — Sin m², m³, ml, ud, kg, h, pa (partida alzada) | Imposible hacer mediciones y presupuestos formales |
| 6 | **No existen plantillas de presupuesto** — No se puede guardar un presupuesto tipo (ej: "Reforma integral piso 80m²") para reutilizar | Cada presupuesto se empieza desde cero; no hay estandarización |
| 7 | **No hay control de permisos sobre precios** — Cualquier usuario autenticado puede modificar precios de gremios | Riesgo de que un trabajador modifique precios base sin autorización |
| 8 | **No hay versionado ni fecha de actualización de precios** — Sin `ultimaActualizacion` ni `historialPrecios` | Imposible detectar precios desactualizados ni auditar cambios |
| 9 | **No hay alertas de partidas/precios** — El motor de alertas (`alertConstants.js`) no incluye nada de construcción relativo a precios | No se detectan partidas sin precio, gremios vacíos, precios antiguos ni plantillas incompletas |
| 10 | **Los gremios no soportan personalización** — Solo se puede elegir de la lista fija; si el tipo no está, se asigna 'otro' | Empresas con gremios especializados no pueden categorizarlos correctamente |
| 11 | **No hay página dedicada de gestión de partidas y precios** — La gestión de precios está dispersa entre gremios y presupuestos | Falta un punto central para configurar la base de precios de la empresa |
| 12 | **No hay conexión entre partidas y Compras/Stock** — Los materiales de una partida no se vinculan al catálogo de compras | No se puede calcular el coste real de materiales ni generar pedidos desde un presupuesto |

---

## TICKETS

---

### PG-01 — Backend: Actualizar catálogo de gremios base

**Tipo:** Enhancement Backend
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

La constante `CONSTRUCTION_GUILDS` en `couchdb.js` tiene 11 valores con nombres incorrectos ('peletería' en vez de algo del sector, 'pradurista' en vez de 'pladur') y le faltan gremios esenciales del sector construcción. El usuario ha definido la lista completa que necesita.

#### Qué hacer

**1. Reemplazar `CONSTRUCTION_GUILDS` en `services/couchdb.js`**

```javascript
const CONSTRUCTION_GUILDS = [
  'albanileria',
  'carpinteria',
  'carpinteria_aluminio',
  'electricidad',
  'fontaneria',
  'lampisteria',
  'pladur',
  'yeso',
  'pintura',
  'herreria_cerrajeria',
  'pavimentos_revestimientos',
  'climatizacion',
  'cristaleria',
  'impermeabilizacion',
  'cubiertas_tejados',
  'excavaciones_derribos',
  'mobiliario_cocina_bano',
  'limpieza_final_obra',
  'personalizado',
];

const CONSTRUCTION_GUILD_LABELS = {
  albanileria: 'Albañilería',
  carpinteria: 'Carpintería',
  carpinteria_aluminio: 'Carpintería de aluminio',
  electricidad: 'Electricidad',
  fontaneria: 'Fontanería',
  lampisteria: 'Lampistería',
  pladur: 'Pladur',
  yeso: 'Yeso',
  pintura: 'Pintura',
  herreria_cerrajeria: 'Herrería / Cerrajería',
  pavimentos_revestimientos: 'Pavimentos y revestimientos',
  climatizacion: 'Climatización',
  cristaleria: 'Cristalería',
  impermeabilizacion: 'Impermeabilización',
  cubiertas_tejados: 'Cubiertas / Tejados',
  excavaciones_derribos: 'Excavaciones / Derribos',
  mobiliario_cocina_bano: 'Mobiliario de cocina / baño',
  limpieza_final_obra: 'Limpieza final de obra',
  personalizado: 'Personalizado',
};
```

**2. Exportar `CONSTRUCTION_GUILD_LABELS`** junto con `CONSTRUCTION_GUILDS`.

**3. Actualizar endpoint `/api/construction/config`**

Devolver además el mapa de labels:

```javascript
export async function getConstructionConfig(req, res) {
  return res.json({
    ok: true,
    projectTypes: CONSTRUCTION_PROJECT_TYPES,
    guilds: CONSTRUCTION_GUILDS,
    guildLabels: CONSTRUCTION_GUILD_LABELS,
  });
}
```

**4. Migración suave de datos existentes**

En `buildConstructionGuildDocument`: si `data.tipo` es un valor antiguo, mapearlo al nuevo:

```javascript
const GUILD_MIGRATION_MAP = {
  'carpintería': 'carpinteria',
  'peletería': 'personalizado',
  'lampistería': 'lampisteria',
  'pradurista': 'pladur',
  'yesero': 'yeso',
  'pintor': 'pintura',
  'herrero': 'herreria_cerrajeria',
  'electricista': 'electricidad',
  'fontanero': 'fontaneria',
  'albañil': 'albanileria',
  'otro': 'personalizado',
};
```

En `sanitizeConstructionGuild`: al leer un documento, si el `tipo` es un valor antiguo, traducirlo automáticamente (lazy migration).

**5. Actualizar `ConstructionSubcontractors.tsx` y `ConstructionBudgets.tsx`**

Reemplazar los arrays hardcodeados `['carpintería', 'peletería', ...]` por datos del endpoint `/api/construction/config`. Usar `guildLabels` para mostrar el nombre legible.

**6. Actualizar TS en `constructionApi.ts`**

```typescript
export interface ConstructionConfig {
  projectTypes: string[];
  guilds: string[];
  guildLabels: Record<string, string>;
}

export async function getConstructionConfig(): Promise<ConstructionConfig> {
  return request('/api/construction/config');
}
```

#### Criterios de aceptación

- [ ] `CONSTRUCTION_GUILDS` contiene los 19 tipos (18 fijos + personalizado)
- [ ] `CONSTRUCTION_GUILD_LABELS` exportado con nombres legibles con tildes
- [ ] Endpoint `/config` devuelve `guildLabels`
- [ ] Documentos existentes con tipos antiguos se leen correctamente (lazy migration)
- [ ] `ConstructionSubcontractors.tsx` y `ConstructionBudgets.tsx` usan datos dinámicos del config
- [ ] No hay arrays hardcodeados de gremios en el frontend
- [ ] Los selects muestran el label legible, guardan el key técnico

---

### PG-02 — Backend: Entidad `construction_predefined_partida` (catálogo de partidas)

**Tipo:** Feature Backend
**Prioridad:** Crítica
**Dependencias:** PG-01

#### Contexto

No existe un catálogo de partidas predefinidas. Cada vez que se crea un presupuesto, el usuario escribe la descripción y los precios a mano. Necesitamos una entidad que almacene partidas tipo por gremio, con precios base desglosados en materiales, mano de obra y gastos estructurales, unidad de medida y precio unitario.

#### Qué hacer

**1. Builder en `services/couchdb.js`**

```javascript
export function buildConstructionPredefinedPartidaDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cppt-${uuidv4()}`;
  const ref = existing?.codigo || `PPT-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const precioMateriales = Number(data.precioMateriales ?? existing?.precioMateriales ?? 0);
  const precioManoObra = Number(data.precioManoObra ?? existing?.precioManoObra ?? 0);
  const precioEstructural = Number(data.precioEstructural ?? existing?.precioEstructural ?? 0);
  const precioUnitario = precioMateriales + precioManoObra + precioEstructural;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_predefined_partida',
    id,
    user_id: userId,

    // Identificación
    codigo: ref,
    nombre: String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),

    // Clasificación
    gremio: String(data.gremio || existing?.gremio || ''),
    categoria: String(data.categoria || existing?.categoria || ''),

    // Unidad de medida
    unidad: String(data.unidad || existing?.unidad || 'ud'),
    // 'ud' | 'm2' | 'm3' | 'ml' | 'kg' | 'h' | 'pa' (partida alzada) | 'global'

    // Precios base desglosados (por unidad)
    precioMateriales,
    precioManoObra,
    precioEstructural,
    precioUnitario,

    // Vínculo a catálogo de compras (materiales necesarios)
    materialesVinculados: Array.isArray(data.materialesVinculados)
      ? data.materialesVinculados
      : (existing?.materialesVinculados || []),
    // Cada elemento: { catalogItemId, nombre, cantidadPorUnidad, unidad }

    // Control de precios
    precioActualizado: String(data.precioActualizado || existing?.precioActualizado || now.slice(0, 10)),
    precioValidadoPor: String(data.precioValidadoPor || existing?.precioValidadoPor || ''),
    precioValidadoPorNombre: String(data.precioValidadoPorNombre || existing?.precioValidadoPorNombre || ''),
    historialPrecios: Array.isArray(data.historialPrecios)
      ? data.historialPrecios
      : (existing?.historialPrecios || []),
    // Cada elemento: { fecha, precioMateriales, precioManoObra, precioEstructural, precioUnitario, modificadoPor, modificadoPorNombre }

    // Estado
    activa: data.activa !== undefined ? Boolean(data.activa) : (existing?.activa !== undefined ? existing.activa : true),
    orden: Number(data.orden ?? existing?.orden ?? 0),
    notas: String(data.notas || existing?.notas || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Sanitizer**

```javascript
export function sanitizeConstructionPredefinedPartida(doc) {
  if (!doc) return null;
  return {
    _id: doc._id, _rev: doc._rev, type: 'construction_predefined_partida', id: doc._id,
    user_id: doc.user_id,
    codigo: doc.codigo || '',
    nombre: doc.nombre || '',
    descripcion: doc.descripcion || '',
    gremio: doc.gremio || '',
    categoria: doc.categoria || '',
    unidad: doc.unidad || 'ud',
    precioMateriales: Number(doc.precioMateriales || 0),
    precioManoObra: Number(doc.precioManoObra || 0),
    precioEstructural: Number(doc.precioEstructural || 0),
    precioUnitario: Number(doc.precioUnitario || 0),
    materialesVinculados: Array.isArray(doc.materialesVinculados) ? doc.materialesVinculados : [],
    precioActualizado: doc.precioActualizado || '',
    precioValidadoPor: doc.precioValidadoPor || '',
    precioValidadoPorNombre: doc.precioValidadoPorNombre || '',
    historialPrecios: Array.isArray(doc.historialPrecios) ? doc.historialPrecios : [],
    activa: doc.activa !== false,
    orden: Number(doc.orden || 0),
    notas: doc.notas || '',
    createdAt: doc.createdAt || '', updatedAt: doc.updatedAt || '', deletedAt: doc.deletedAt || null,
  };
}
```

**3. Constantes de unidades de medida**

```javascript
const CONSTRUCTION_UNITS = [
  { key: 'ud', label: 'Unidad (ud)' },
  { key: 'm2', label: 'Metro cuadrado (m²)' },
  { key: 'm3', label: 'Metro cúbico (m³)' },
  { key: 'ml', label: 'Metro lineal (ml)' },
  { key: 'kg', label: 'Kilogramo (kg)' },
  { key: 'h', label: 'Hora (h)' },
  { key: 'pa', label: 'Partida alzada (pa)' },
  { key: 'global', label: 'Global' },
];
```

Exportar junto con las demás constantes y en el endpoint `/api/construction/config`.

**4. Tipo TypeScript en `constructionApi.ts`**

```typescript
export interface PredefinedPartidaMaterial {
  catalogItemId: string;
  nombre: string;
  cantidadPorUnidad: number;
  unidad: string;
}

export interface PredefinedPartidaPrecioHistorial {
  fecha: string;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
  modificadoPor: string;
  modificadoPorNombre: string;
}

export interface ConstructionPredefinedPartida {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  gremio: string;
  categoria: string;
  unidad: string;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
  materialesVinculados: PredefinedPartidaMaterial[];
  precioActualizado: string;
  precioValidadoPor: string;
  precioValidadoPorNombre: string;
  historialPrecios: PredefinedPartidaPrecioHistorial[];
  activa: boolean;
  orden: number;
  notas: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento en CouchDB con `type: 'construction_predefined_partida'`, prefijo `cppt-`
- [ ] Código auto-generado `PPT-XXXXXX`
- [ ] Precios desglosados en 3 componentes + `precioUnitario` calculado como suma
- [ ] Unidad de medida con 8 opciones (ud, m², m³, ml, kg, h, pa, global)
- [ ] `materialesVinculados[]` permite vincular artículos del catálogo de compras
- [ ] `historialPrecios[]` registra cada cambio de precio con quién y cuándo
- [ ] `precioActualizado` guarda la fecha del último cambio de precios
- [ ] `activa` flag para desactivar partidas sin borrarlas
- [ ] `orden` para ordenar dentro del gremio
- [ ] Tipo TS completo exportado

---

### PG-03 — Backend: Mejorar modelo `construction_guild` con precios por partida y metadata

**Tipo:** Enhancement Backend
**Prioridad:** Alta
**Dependencias:** PG-01, PG-02

#### Contexto

El modelo actual de `construction_guild` tiene 3 precios globales (`precioMateriales`, `precioManoObra`, `precioEstructural`). Esto es insuficiente: un gremio de electricidad puede tener 20 partidas distintas, cada una con su precio. Los precios globales del gremio deben servir como **tarifas hora/día de referencia** (no como "precio de todo el gremio"). Además, necesitamos campos de control: margen por defecto, nº de partidas vinculadas, fecha de última actualización de precios.

#### Qué hacer

**1. Añadir campos al builder `buildConstructionGuildDocument`**

```javascript
// Nuevos campos a añadir:
margenDefecto: Number(data.margenDefecto ?? existing?.margenDefecto ?? 0),
tarifaHora: Number(data.tarifaHora ?? existing?.tarifaHora ?? 0),
totalPartidas: Number(data.totalPartidas ?? existing?.totalPartidas ?? 0),
preciosActualizados: String(data.preciosActualizados || existing?.preciosActualizados || ''),
esPersonalizado: Boolean(data.esPersonalizado ?? existing?.esPersonalizado ?? false),
color: String(data.color || existing?.color || ''),
icono: String(data.icono || existing?.icono || ''),
descripcion: String(data.descripcion || existing?.descripcion || ''),
```

**2. Actualizar sanitizer y TS**

Añadir los mismos campos a `sanitizeConstructionGuild` y a la interface `ConstructionGuild`.

**3. Campo `esPersonalizado`**

Si `tipo === 'personalizado'`, `esPersonalizado` se pone a `true` automáticamente. Esto permite distinguir gremios base (los 18 del sistema) de gremios creados por el usuario.

**4. Campo `totalPartidas`**

Se recalcula cada vez que se crea o elimina una partida predefinida vinculada a este gremio (PG-05 lo hará). Es un campo denormalizado para rendimiento (evita contar partidas cada vez).

**5. Campo `preciosActualizados`**

Fecha ISO del último cambio de precios en cualquier partida del gremio. Se actualiza desde PG-05 al modificar precios de partidas.

#### Criterios de aceptación

- [ ] `margenDefecto` configurable por gremio (porcentaje, default 0)
- [ ] `tarifaHora` como precio de referencia de mano de obra por hora
- [ ] `totalPartidas` campo denormalizado con el conteo de partidas activas del gremio
- [ ] `preciosActualizados` fecha del último cambio de precios en partidas del gremio
- [ ] `esPersonalizado` true si el gremio es de tipo personalizado
- [ ] `color` e `icono` para personalización visual en UI
- [ ] `descripcion` para contextualizar el gremio
- [ ] Retrocompatible: los campos nuevos son opcionales con defaults

---

### PG-04 — Backend: Entidad `construction_budget_template` (plantillas de presupuesto)

**Tipo:** Feature Backend
**Prioridad:** Alta
**Dependencias:** PG-02

#### Contexto

No se pueden guardar ni reutilizar presupuestos tipo. Cada vez que se hace un presupuesto para "Reforma integral piso 80 m²", se empieza desde cero. Necesitamos una entidad de plantilla que almacene un conjunto de partidas predefinidas agrupadas por gremio, con cantidades por defecto, para aplicar a un nuevo presupuesto con un clic.

#### Qué hacer

**1. Builder en `services/couchdb.js`**

```javascript
export function buildConstructionBudgetTemplateDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cbtpl-${uuidv4()}`;

  const partidas = Array.isArray(data.partidas) ? data.partidas.map((p, i) => ({
    id: p.id || `tpl-${i + 1}`,
    partidaPredefinidaId: String(p.partidaPredefinidaId || ''),
    gremio: String(p.gremio || ''),
    nombre: String(p.nombre || ''),
    descripcion: String(p.descripcion || ''),
    unidad: String(p.unidad || 'ud'),
    cantidadDefecto: Number(p.cantidadDefecto ?? 1),
    precioMateriales: Number(p.precioMateriales ?? 0),
    precioManoObra: Number(p.precioManoObra ?? 0),
    precioEstructural: Number(p.precioEstructural ?? 0),
    precioUnitario: Number(p.precioMateriales ?? 0) + Number(p.precioManoObra ?? 0) + Number(p.precioEstructural ?? 0),
  })) : (existing?.partidas || []);

  const totalEstimado = partidas.reduce((s, p) => s + (p.cantidadDefecto * p.precioUnitario), 0);

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_budget_template',
    id,
    user_id: userId,

    nombre: String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    tipoObra: String(data.tipoObra || existing?.tipoObra || ''),
    categoria: String(data.categoria || existing?.categoria || ''),

    partidas,
    totalEstimado,
    margenDefecto: Number(data.margenDefecto ?? existing?.margenDefecto ?? 15),
    totalConMargen: totalEstimado * (1 + Number(data.margenDefecto ?? existing?.margenDefecto ?? 15) / 100),

    // Gremios incluidos (denormalizado para filtrado rápido)
    gremiosIncluidos: [...new Set(partidas.map(p => p.gremio).filter(Boolean))],

    // Estado
    activa: data.activa !== undefined ? Boolean(data.activa) : (existing?.activa !== undefined ? existing.activa : true),
    vecesUsada: Number(data.vecesUsada ?? existing?.vecesUsada ?? 0),
    ultimoUso: String(data.ultimoUso || existing?.ultimoUso || ''),
    notas: String(data.notas || existing?.notas || ''),

    creadoPor: String(data.creadoPor || existing?.creadoPor || ''),
    creadoPorNombre: String(data.creadoPorNombre || existing?.creadoPorNombre || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Sanitizer y tipo TS** siguiendo el patrón de PG-02.

```typescript
export interface BudgetTemplatePartida {
  id: string;
  partidaPredefinidaId: string;
  gremio: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  cantidadDefecto: number;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
}

export interface ConstructionBudgetTemplate {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  descripcion: string;
  tipoObra: string;
  categoria: string;
  partidas: BudgetTemplatePartida[];
  totalEstimado: number;
  margenDefecto: number;
  totalConMargen: number;
  gremiosIncluidos: string[];
  activa: boolean;
  vecesUsada: number;
  ultimoUso: string;
  notas: string;
  creadoPor: string;
  creadoPorNombre: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento con `type: 'construction_budget_template'`, prefijo `cbtpl-`
- [ ] Partidas con referencia a `partidaPredefinidaId` para vincular al catálogo
- [ ] `cantidadDefecto` por partida (cantidad por defecto al aplicar la plantilla)
- [ ] `totalEstimado` y `totalConMargen` calculados automáticamente
- [ ] `gremiosIncluidos[]` denormalizado para consultas rápidas
- [ ] `vecesUsada` y `ultimoUso` para tracking de uso
- [ ] `margenDefecto` heredable al crear presupuesto desde plantilla
- [ ] Tipo TS completo exportado

---

### PG-05 — Backend: Mejorar modelo de partidas en presupuestos

**Tipo:** Enhancement Backend
**Prioridad:** Crítica
**Dependencias:** PG-02

#### Contexto

La partida actual del presupuesto (`BudgetPartida`) solo tiene: `{ id, gremio, descripcion, materiales, manoObra, estructural, subtotal }`. Necesita soportar **cantidad × precio unitario**, **unidad de medida**, **referencia a partida predefinida** y **desglose más rico** para ser compatible con el catálogo de partidas y permitir presupuestación profesional.

#### Qué hacer

**1. Actualizar la estructura de partida en `buildConstructionBudgetDocument`**

```javascript
const partidas = Array.isArray(data.partidas) ? data.partidas.map((p, i) => ({
  id: p.id || `bp-${i + 1}-${Date.now()}`,
  partidaPredefinidaId: String(p.partidaPredefinidaId || ''),
  gremio: String(p.gremio || ''),
  nombre: String(p.nombre || ''),
  descripcion: String(p.descripcion || ''),
  unidad: String(p.unidad || 'ud'),
  cantidad: Number(p.cantidad ?? 1),

  // Precios unitarios
  precioUnitarioMateriales: Number(p.precioUnitarioMateriales ?? p.materiales ?? 0),
  precioUnitarioManoObra: Number(p.precioUnitarioManoObra ?? p.manoObra ?? 0),
  precioUnitarioEstructural: Number(p.precioUnitarioEstructural ?? p.estructural ?? 0),
  precioUnitario: Number(p.precioUnitarioMateriales ?? p.materiales ?? 0)
    + Number(p.precioUnitarioManoObra ?? p.manoObra ?? 0)
    + Number(p.precioUnitarioEstructural ?? p.estructural ?? 0),

  // Importes calculados (cantidad × precio unitario)
  materiales: Number(p.cantidad ?? 1) * Number(p.precioUnitarioMateriales ?? p.materiales ?? 0),
  manoObra: Number(p.cantidad ?? 1) * Number(p.precioUnitarioManoObra ?? p.manoObra ?? 0),
  estructural: Number(p.cantidad ?? 1) * Number(p.precioUnitarioEstructural ?? p.estructural ?? 0),
  subtotal: Number(p.cantidad ?? 1) * (
    Number(p.precioUnitarioMateriales ?? p.materiales ?? 0)
    + Number(p.precioUnitarioManoObra ?? p.manoObra ?? 0)
    + Number(p.precioUnitarioEstructural ?? p.estructural ?? 0)
  ),
})) : (existing?.partidas || []);
```

**2. Retrocompatibilidad**

Los presupuestos existentes no tienen `cantidad`, `unidad` ni `precioUnitario*`. El builder usa fallbacks (`p.materiales`, `p.manoObra`, `p.estructural`) para que los datos antiguos se lean como `cantidad: 1` con precio unitario = importe total. Al guardar, se normalizan al nuevo formato.

**3. Cálculos nuevos en el presupuesto**

Añadir campos calculados al documento de presupuesto:

```javascript
// Subtotales agrupados por gremio
subtotalesPorGremio: Object.entries(
  partidas.reduce((acc, p) => {
    const key = p.gremio || 'sin_gremio';
    acc[key] = (acc[key] || 0) + p.subtotal;
    return acc;
  }, {})
).map(([gremio, subtotal]) => ({ gremio, subtotal })),
```

**4. Actualizar tipo TS `BudgetPartida`**

```typescript
export interface BudgetPartida {
  id: string;
  partidaPredefinidaId: string;
  gremio: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitarioMateriales: number;
  precioUnitarioManoObra: number;
  precioUnitarioEstructural: number;
  precioUnitario: number;
  materiales: number;
  manoObra: number;
  estructural: number;
  subtotal: number;
}

export interface SubtotalPorGremio {
  gremio: string;
  subtotal: number;
}
```

Añadir `subtotalesPorGremio: SubtotalPorGremio[]` a `ConstructionBudget`.

#### Criterios de aceptación

- [ ] Partidas tienen `cantidad`, `unidad`, `precioUnitario*` (3 componentes) y `precioUnitario` total
- [ ] `subtotal = cantidad × precioUnitario`
- [ ] `materiales = cantidad × precioUnitarioMateriales` (igual para manoObra y estructural)
- [ ] `subtotalesPorGremio` se calcula automáticamente al guardar
- [ ] Los presupuestos existentes sin los campos nuevos se leen con `cantidad: 1` sin romper nada
- [ ] `partidaPredefinidaId` vincula la línea al catálogo de partidas predefinidas
- [ ] Tipo TS actualizado con todos los campos nuevos

---

### PG-06 — Backend: API REST de partidas predefinidas

**Tipo:** Feature Backend
**Prioridad:** Crítica
**Dependencias:** PG-02

#### Contexto

Necesitamos endpoints CRUD para gestionar el catálogo de partidas predefinidas, con filtros por gremio y control de permisos. Solo gerentes y administradores deben poder crear/editar/eliminar partidas y modificar precios.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listPredefinedPartidas(req, res)` | Leer `type === 'construction_predefined_partida'`. Filtrar por `query.gremio`, `query.activa`, `query.search` (buscar en nombre/descripcion/codigo). Devolver `{ ok: true, partidas: [...] }` |
| `createPredefinedPartida(req, res)` | Verificar rol gerente/admin. `buildConstructionPredefinedPartidaDocument(userId, data)`. Incrementar `totalPartidas` del gremio asociado. |
| `updatePredefinedPartida(req, res)` | Verificar rol gerente/admin. Merge. Si cambiaron precios, añadir entrada a `historialPrecios` con los valores anteriores + `modificadoPor` + `fecha`. Actualizar `precioActualizado`. |
| `removePredefinedPartida(req, res)` | Verificar rol gerente/admin. Soft delete (`activa: false`). Decrementar `totalPartidas` del gremio. |
| `bulkImportPartidas(req, res)` | Verificar rol gerente/admin. Recibe array de partidas, crea todas de golpe. Para carga inicial masiva. |
| `getPartidasByGremio(req, res)` | Endpoint optimizado: recibe `gremio` como param, devuelve solo partidas activas de ese gremio ordenadas por `orden`. Para cargar en el formulario de presupuesto. |

**2. Control de permisos**

```javascript
function requireManagerRole(req, res) {
  const role = req.authUser?.role || '';
  const MANAGER_ROLES = ['owner', 'admin', 'manager', 'gerente'];
  if (!MANAGER_ROLES.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Solo gerentes pueden modificar partidas y precios' });
  }
  return null;
}
```

Aplicar en `create`, `update`, `remove`, `bulkImport`. Los endpoints de lectura (`list`, `getByGremio`) son accesibles para todos.

**3. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/predefined-partidas/:userId', listPredefinedPartidas);
constructionRouter.get('/predefined-partidas/:userId/by-gremio/:gremio', getPartidasByGremio);
constructionRouter.post('/predefined-partidas/:userId', createPredefinedPartida);
constructionRouter.post('/predefined-partidas/:userId/bulk-import', bulkImportPartidas);
constructionRouter.put('/predefined-partidas/:userId/:id', updatePredefinedPartida);
constructionRouter.delete('/predefined-partidas/:userId/:id', removePredefinedPartida);
```

**4. Funciones en `constructionApi.ts`**

```typescript
export async function listPredefinedPartidas(
  userId: string,
  filters?: { gremio?: string; activa?: boolean; search?: string }
): Promise<ConstructionPredefinedPartida[]>;

export async function getPredefinedPartidasByGremio(
  userId: string,
  gremio: string
): Promise<ConstructionPredefinedPartida[]>;

export async function createPredefinedPartida(
  userId: string,
  data: Partial<ConstructionPredefinedPartida>
): Promise<ConstructionPredefinedPartida>;

export async function updatePredefinedPartida(
  userId: string,
  partida: ConstructionPredefinedPartida
): Promise<ConstructionPredefinedPartida>;

export async function deletePredefinedPartida(
  userId: string,
  partidaId: string
): Promise<void>;

export async function bulkImportPartidas(
  userId: string,
  partidas: Partial<ConstructionPredefinedPartida>[]
): Promise<{ imported: number; errors: string[] }>;
```

#### Criterios de aceptación

- [ ] CRUD completo en `/api/construction/predefined-partidas/:userId`
- [ ] Endpoint `/by-gremio/:gremio` devuelve partidas filtradas y ordenadas por `orden`
- [ ] Create/Update/Delete solo para roles gerente/admin (403 para otros)
- [ ] List y GetByGremio accesibles para todos los roles autenticados
- [ ] Al crear partida, se incrementa `totalPartidas` del gremio
- [ ] Al eliminar partida, se decrementa `totalPartidas` del gremio
- [ ] Al cambiar precios, se registra en `historialPrecios` y se actualiza `precioActualizado` del gremio
- [ ] Bulk import funcional para carga masiva
- [ ] Filtro `search` busca en nombre, descripción y código
- [ ] Funciones tipadas en client TS

---

### PG-07 — Backend: API REST de plantillas de presupuesto

**Tipo:** Feature Backend
**Prioridad:** Alta
**Dependencias:** PG-04

#### Contexto

Necesitamos endpoints para gestionar las plantillas de presupuesto: CRUD + aplicación de plantilla a un presupuesto nuevo + creación de plantilla desde un presupuesto existente.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listBudgetTemplates(req, res)` | Leer `type === 'construction_budget_template'`. Filtrar por `query.tipoObra`, `query.activa`, `query.search`. |
| `createBudgetTemplate(req, res)` | Verificar rol gerente/admin. Crear template con partidas. |
| `updateBudgetTemplate(req, res)` | Verificar rol gerente/admin. Merge. |
| `removeBudgetTemplate(req, res)` | Verificar rol gerente/admin. Soft delete. |
| `applyTemplate(req, res)` | `POST .../budget-templates/:userId/:id/apply`. Devuelve un objeto `budget` prellenado (NO lo guarda): partidas de la plantilla con precios actualizados del catálogo, cantidades por defecto, margen. El frontend lo recibe y lo inyecta en el formulario de presupuesto. |
| `createTemplateFromBudget(req, res)` | `POST .../budget-templates/:userId/from-budget/:budgetId`. Lee un presupuesto existente y crea una plantilla con sus partidas. |

**2. Lógica de `applyTemplate`**

```javascript
async function applyTemplate(req, res) {
  const { userId, id } = req.params;
  const template = await ensureOwner(req, userId, id, 'construction_budget_template');
  if (!template) return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });

  // Para cada partida de la plantilla, buscar precio actualizado del catálogo
  const db = getConstructionDbName();
  const allDocs = await getAllDocsByType(req, db, userId, 'construction_predefined_partida');

  const partidas = template.partidas.map(tp => {
    const catalogo = allDocs.find(d => d._id === tp.partidaPredefinidaId);
    return {
      ...tp,
      precioMateriales: catalogo?.precioMateriales ?? tp.precioMateriales,
      precioManoObra: catalogo?.precioManoObra ?? tp.precioManoObra,
      precioEstructural: catalogo?.precioEstructural ?? tp.precioEstructural,
      precioUnitario: (catalogo?.precioUnitario ?? tp.precioUnitario),
    };
  });

  // Incrementar vecesUsada
  template.vecesUsada = (template.vecesUsada || 0) + 1;
  template.ultimoUso = new Date().toISOString();
  await putDocument(req, db, template._id, { ...template, vecesUsada: template.vecesUsada, ultimoUso: template.ultimoUso });

  return res.json({
    ok: true,
    budgetData: {
      partidas,
      margen: template.margenDefecto,
      tipoObra: template.tipoObra,
      templateId: template._id,
      templateNombre: template.nombre,
    },
  });
}
```

**3. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/budget-templates/:userId', listBudgetTemplates);
constructionRouter.post('/budget-templates/:userId', createBudgetTemplate);
constructionRouter.put('/budget-templates/:userId/:id', updateBudgetTemplate);
constructionRouter.delete('/budget-templates/:userId/:id', removeBudgetTemplate);
constructionRouter.post('/budget-templates/:userId/:id/apply', applyTemplate);
constructionRouter.post('/budget-templates/:userId/from-budget/:budgetId', createTemplateFromBudget);
```

**4. Funciones en `constructionApi.ts`**

```typescript
export async function listBudgetTemplates(userId: string, filters?: { tipoObra?: string; activa?: boolean; search?: string }): Promise<ConstructionBudgetTemplate[]>;
export async function createBudgetTemplate(userId: string, data: Partial<ConstructionBudgetTemplate>): Promise<ConstructionBudgetTemplate>;
export async function updateBudgetTemplate(userId: string, template: ConstructionBudgetTemplate): Promise<ConstructionBudgetTemplate>;
export async function deleteBudgetTemplate(userId: string, templateId: string): Promise<void>;
export async function applyBudgetTemplate(userId: string, templateId: string): Promise<{ budgetData: ApplyTemplateResult }>;
export async function createTemplateFromBudget(userId: string, budgetId: string, nombre: string): Promise<ConstructionBudgetTemplate>;
```

#### Criterios de aceptación

- [ ] CRUD completo en `/api/construction/budget-templates/:userId`
- [ ] Create/Update/Delete solo para roles gerente/admin
- [ ] `applyTemplate` devuelve partidas con precios actualizados del catálogo (no de la plantilla guardada)
- [ ] `createTemplateFromBudget` crea plantilla desde un presupuesto existente
- [ ] `vecesUsada` y `ultimoUso` se actualizan al aplicar
- [ ] Filtros por `tipoObra`, `activa`, `search`
- [ ] Funciones tipadas en client TS

---

### PG-08 — Backend: Alertas de partidas, gremios y precios

**Tipo:** Feature Backend
**Prioridad:** Alta
**Dependencias:** PG-02, PG-04, PG-06

#### Contexto

El motor de alertas (`alertConstants.js`) no incluye alertas relativas a partidas, precios ni gremios. Se necesitan 4 tipos de alerta que ayuden al gerente a mantener el catálogo sano.

#### Qué hacer

**1. Nuevas constantes en `services/alertConstants.js`**

```javascript
CONSTRUCTION_PARTIDA_SIN_PRECIO: {
  id: 'construction_partida_sin_precio',
  label: 'Partida sin precio',
  description: 'Una partida predefinida activa tiene precio unitario igual a 0',
  severity: 'warning',
  category: 'construction',
},
CONSTRUCTION_GREMIO_SIN_PARTIDAS: {
  id: 'construction_gremio_sin_partidas',
  label: 'Gremio sin partidas',
  description: 'Un gremio de la lista base no tiene ninguna partida predefinida asociada',
  severity: 'info',
  category: 'construction',
},
CONSTRUCTION_PRECIO_DESACTUALIZADO: {
  id: 'construction_precio_desactualizado',
  label: 'Precio desactualizado',
  description: 'Una partida predefinida no ha actualizado sus precios en más de X días (configurable, default 180)',
  severity: 'warning',
  category: 'construction',
},
CONSTRUCTION_PLANTILLA_INCOMPLETA: {
  id: 'construction_plantilla_incompleta',
  label: 'Plantilla incompleta',
  description: 'Una plantilla de presupuesto activa contiene partidas cuyo precio unitario es 0 o cuya partida predefinida fue desactivada',
  severity: 'warning',
  category: 'construction',
},
```

**2. Evaluadores**

| Alerta | Lógica |
|---|---|
| Partida sin precio | Para cada `construction_predefined_partida` con `activa === true`: si `precioUnitario === 0`, generar alerta con código, nombre y gremio |
| Gremio sin partidas | Para cada tipo en `CONSTRUCTION_GUILDS` (excepto 'personalizado'): contar `construction_predefined_partida` con `gremio === tipo` y `activa === true`. Si count === 0, generar alerta |
| Precio desactualizado | Para cada `construction_predefined_partida` activa: si `precioActualizado` es anterior a `Date.now() - DIAS_UMBRAL` (default 180 días), generar alerta. Umbral configurable en settings de cuenta |
| Plantilla incompleta | Para cada `construction_budget_template` activa: verificar que cada partida tiene `precioUnitario > 0` y que `partidaPredefinidaId` sigue activa. Si alguna falla, generar alerta |

**3. Endpoint de alertas**

```
GET /api/construction/partida-alerts/:userId
```

Devuelve `{ ok: true, alerts: [...], summary: { sinPrecio: N, sinPartidas: N, desactualizados: N, incompletas: N } }`.

**4. Configuración**

Añadir campo en la configuración de cuenta (o en el endpoint config):

```javascript
precioDesactualizadoDias: 180, // días antes de considerar un precio desactualizado
```

#### Criterios de aceptación

- [ ] 4 tipos de alerta definidos en `alertConstants.js`
- [ ] Evaluadores consultan DB `*-construction` correctamente
- [ ] Endpoint devuelve alertas activas con contexto (IDs y nombres)
- [ ] El umbral de "precio desactualizado" es configurable (default 180 días)
- [ ] Las alertas incluyen `summary` con conteos rápidos

---

### PG-09 — Frontend: Página principal, routing y sidebar

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PG-06, PG-07, PG-08

#### Contexto

No existe una página dedicada a la gestión de partidas, gremios y precios. Necesitamos crear `ConstructionPartidasGremios.tsx` como hub central.

#### Qué hacer

**1. Crear `src/app/pages/saas/ConstructionPartidasGremios.tsx`**

**2. Registrar en `routes.tsx`**

```typescript
{ path: 'vertical/construccion/partidas-gremios', Component: ConstructionPartidasGremios }
```

**3. Estructura de la página**

```
HEADER:
  Título: "Partidas, Gremios y Precios"
  Subtítulo: "Configura tu catálogo de partidas y precios base para acelerar presupuestos"
  Indicador de rol (Gerente/Trabajador)
  Botón "Ir a Presupuestos" (link rápido)

ALERTAS (PG-14):
  Panel colapsable con las 4 alertas de PG-08

KPIs (4 tarjetas):
  | # | Métrica             | Fuente                     | Icono         | Color  |
  |---|---------------------|----------------------------|---------------|--------|
  | 1 | Gremios configurados | Count guilds activos       | HardHat       | amber  |
  | 2 | Partidas totales     | Count partidas activas     | ClipboardList | blue   |
  | 3 | Precios actualizados | % partidas con precio > 0  | CheckCircle   | emerald|
  | 4 | Plantillas           | Count templates activas    | FileTemplate  | purple |

NAVEGACIÓN POR PESTAÑAS:
  Tab 1: Gremios (PG-10)
  Tab 2: Partidas (PG-11)
  Tab 3: Precios (PG-12)
  Tab 4: Plantillas (PG-13)
  Tab 5: Alertas (PG-14)

URL params: ?tab=gremios|partidas|precios|plantillas|alertas
```

**4. Estado global de la página**

```typescript
const [config, setConfig] = useState<ConstructionConfig | null>(null);
const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
const [partidas, setPartidas] = useState<ConstructionPredefinedPartida[]>([]);
const [templates, setTemplates] = useState<ConstructionBudgetTemplate[]>([]);
const [alerts, setAlerts] = useState<PartidaAlert[]>([]);
const [activeTab, setActiveTab] = useState<string>('gremios');
const [loading, setLoading] = useState(true);
const [isManager, setIsManager] = useState(false);
```

**5. Carga de datos al montar**

Fetch en paralelo: `getConstructionConfig()`, `listConstructionGuilds()`, `listPredefinedPartidas()`, `listBudgetTemplates()`, alertas.

**6. Sidebar**

Añadir item en `Sidebar.tsx` dentro del grupo `construction`:

```typescript
{
  id: 'construction-partidas-gremios',
  navKey: 'constructionPartidasGremios',
  icon: <Layers className="w-5 h-5" />,
  path: '/saas/vertical/construccion/partidas-gremios'
}
```

Posición: después de presupuestos (es configuración de base de precios).

**7. Layout y diseño**

- Layout `components/saas/Layout`
- Dark mode completo
- Responsive: en móvil, tabs se convierten en scroll horizontal
- Iconos: lucide-react
- `rounded-xl`, `border-2`, `shadow-sm` en hover, transitions

#### Criterios de aceptación

- [ ] Página renderiza en `/saas/vertical/construccion/partidas-gremios`
- [ ] 5 pestañas funcionales con deep linking por URL param
- [ ] 4 KPIs calculados desde los datos cargados
- [ ] Panel de alertas colapsable
- [ ] Detección de rol gerente/trabajador
- [ ] Item visible en sidebar bajo grupo Construcción
- [ ] Responsive y dark mode

---

### PG-10 — Frontend: Pestaña Gremios

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PG-01, PG-09

#### Contexto

La pestaña Gremios reemplaza y mejora lo que actualmente hace `ConstructionSubcontractors.tsx`, integrando los 18 gremios base + personalizados, con información de partidas vinculadas y estado de precios.

#### Qué hacer

**1. Vista grid de gremios**

Grid de tarjetas `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.

**Cada tarjeta de gremio:**

```
┌──────────────────────────────────┐
│ [Icono] Albañilería     [⋯ menú]│
│ ─────────────────────────────────│
│ Contacto: Juan Pérez            │
│ Tel: 612 345 678                 │
│ ─────────────────────────────────│
│ Materiales      1.200,00 €      │
│ Mano de obra      800,00 €      │
│ G. estructurales  300,00 €      │
│ ─────────────── ────────────────│
│ TOTAL            2.300,00 €     │
│ ─────────────────────────────────│
│ 12 partidas    │ Tarifa: 25 €/h │
│ Precios: ✓ Actualizados         │
│ ──── o bien ─────────────────── │
│ ⚠ Sin partidas                  │
└──────────────────────────────────┘
```

**Datos por tarjeta:**
- Header: icono + nombre + badge tipo + menú (editar, eliminar, ver partidas)
- Contacto: nombre, teléfono, email
- Precios de referencia del gremio (3 desglosados + total)
- Footer: conteo partidas (`totalPartidas`), tarifa hora (`tarifaHora`), estado precios (verde si `preciosActualizados` < 180 días, amber si > 180, rojo si sin partidas)

**2. Barra de acciones (solo gerente)**

- Buscador por nombre/tipo
- Filtro por tipo de gremio
- Botón **"+ Nuevo gremio"** → abre modal (PG-10.3)
- Botón **"Gremio personalizado"** → modal de creación con tipo 'personalizado'

**3. Modal de creación/edición de gremio**

Campos:
| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Tipo | Selector (de `CONSTRUCTION_GUILDS` + `guildLabels`) | Sí | Solo lectura si no es personalizado |
| Nombre empresa | Input texto | Sí | Nombre del subcontratista/gremio |
| Descripción | Textarea | No | Contexto del gremio |
| Contacto | Input texto | No | Nombre persona contacto |
| Teléfono | Input tel | No | |
| Email | Input email | No | |
| Materiales (ref.) | Input numérico | No | Precio de referencia global del gremio |
| Mano de obra (ref.) | Input numérico | No | |
| G. estructurales (ref.) | Input numérico | No | |
| Tarifa hora | Input numérico | No | €/h de mano de obra |
| Margen defecto | Input numérico | No | % de margen por defecto |
| Color | Color picker | No | Para visualización |
| Notas | Textarea | No | |

**4. Click en tarjeta**

Navega a la pestaña Partidas con el gremio preseleccionado como filtro: `?tab=partidas&gremio=electricidad`.

**5. Vista trabajador**

Solo puede ver las tarjetas (sin crear, editar ni eliminar). No ve precios de referencia del gremio (solo el conteo de partidas y el nombre). Sin botones de acción.

#### Criterios de aceptación

- [ ] Grid de tarjetas con los 18 gremios base + personalizados
- [ ] Badge de estado de precios (actualizado, desactualizado, sin partidas)
- [ ] Conteo de partidas por gremio
- [ ] Modal de creación/edición con todos los campos
- [ ] Gremios personalizados con `esPersonalizado: true`
- [ ] Click navega a partidas del gremio
- [ ] Solo gerente puede crear/editar/eliminar
- [ ] Trabajador ve tarjetas sin precios de referencia ni acciones de escritura

---

### PG-11 — Frontend: Pestaña Partidas predefinidas

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PG-06, PG-09

#### Contexto

La pestaña de partidas es el corazón del módulo: aquí el gerente configura todas las partidas tipo agrupadas por gremio, con precios base desglosados, unidad de medida y vinculación a materiales del catálogo.

#### Qué hacer

**1. Layout de la pestaña**

```
FILTROS:
  Gremio (selector con conteo) | Búsqueda (nombre/código/descripción) | Estado (activa/inactiva) | Limpiar

ACCIONES GERENTE:
  "+ Nueva partida" | "Importar partidas" (bulk CSV/Excel) | "Exportar"

AGRUPACIÓN:
  Las partidas se muestran agrupadas por gremio con un header de sección colapsable
```

**2. Header de grupo por gremio**

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ 🔨 Albañilería                          12 partidas │ 15.200 € │
└─────────────────────────────────────────────────────────────────┘
```

- Icono + nombre del gremio
- Conteo de partidas activas
- Suma de precios unitarios (referencia informativa)
- Colapsable: click expande/contrae

**3. Tabla de partidas dentro de cada grupo**

| Columna | Descripción | Ancho |
|---|---|---|
| Código | `PPT-XXXXXX` | 100px |
| Nombre | Nombre de la partida | flex |
| Unidad | m², ml, ud... | 80px |
| Mat. (€/ud) | Precio unitario materiales | 100px |
| M.O. (€/ud) | Precio unitario mano de obra | 100px |
| Estr. (€/ud) | Precio unitario estructural | 100px |
| P.U. Total | Precio unitario total (suma 3) | 120px |
| Actualizado | Fecha última actualización | 100px |
| Estado | Badge activa/inactiva | 80px |
| Acciones | Editar / Duplicar / Desactivar | 100px |

**Colores en columna "Actualizado":**
- Verde: < 90 días
- Amber: 90-180 días
- Rojo: > 180 días

**4. Modal/Drawer de partida predefinida**

Tabs internas:

**Tab Datos:**
| Campo | Tipo | Obligatorio |
|---|---|---|
| Código | Auto-generado (editable) | Sí |
| Nombre | Input texto | Sí |
| Descripción | Textarea | No |
| Gremio | Selector | Sí |
| Categoría | Input texto (con sugerencias) | No |
| Unidad de medida | Selector (8 opciones) | Sí |
| Precio materiales (€/ud) | Input numérico | No |
| Precio mano obra (€/ud) | Input numérico | No |
| Precio estructural (€/ud) | Input numérico | No |
| Precio unitario total | Calculado (readonly) | Auto |
| Orden dentro del gremio | Input numérico | No |
| Notas | Textarea | No |

**Tab Materiales vinculados:**
- Tabla de materiales del catálogo vinculados a esta partida
- Cada fila: Artículo (selector búsqueda en catálogo de compras), Cantidad por unidad, Unidad
- Botón "+ Vincular material"
- Esto permite calcular el coste real de materiales desde el catálogo de compras

**Tab Historial de precios:**
- Timeline de cambios de precios
- Cada entrada: fecha, quién cambió, precios anteriores vs nuevos
- Gráfico mini opcional: evolución del precio unitario en el tiempo

**5. Importación masiva**

Modal de importación CSV/Excel:
- Template descargable con columnas: gremio, nombre, descripción, unidad, precioMateriales, precioManoObra, precioEstructural
- Preview de datos antes de importar
- Validación en cliente (gremio válido, precios numéricos)
- Llama a `bulkImportPartidas`

**6. Vista trabajador**

Solo puede ver la tabla de partidas (nombre, descripción, unidad, gremio). No ve precios (columnas de precios ocultas). No tiene botones de acción.

#### Criterios de aceptación

- [ ] Partidas agrupadas por gremio con headers colapsables
- [ ] Tabla con 10 columnas funcionales
- [ ] Filtro por gremio, búsqueda y estado
- [ ] Modal/Drawer con 3 tabs (Datos, Materiales vinculados, Historial)
- [ ] Campos de precio solo editables por gerente (disabled para trabajador)
- [ ] Indicador visual de antigüedad del precio (verde/amber/rojo)
- [ ] Importación masiva CSV con preview y validación
- [ ] Vinculación de materiales del catálogo de compras
- [ ] Historial de precios visible
- [ ] Responsive: en móvil la tabla se convierte en cards
- [ ] Trabajador solo ve nombre/descripción/unidad/gremio (sin precios)

---

### PG-12 — Frontend: Pestaña Precios (vista analítica y edición masiva)

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PG-06, PG-09

#### Contexto

La pestaña Precios ofrece una vista transversal de todos los precios del catálogo: comparativa entre gremios, edición masiva, detección de anomalías y actualización por lotes. Es la herramienta clave del gerente para mantener los precios al día.

#### Qué hacer

**1. Vista resumen de precios por gremio**

Tabla resumen en la parte superior:

| Gremio | Partidas | P.U. medio | P.U. mín | P.U. máx | Último actualizado | Estado |
|---|---|---|---|---|---|---|
| Albañilería | 12 | 45,00 € | 12,00 € | 120,00 € | 12/03/2026 | ✅ |
| Electricidad | 8 | 65,00 € | 25,00 € | 180,00 € | 15/09/2025 | ⚠️ |

**Estado:** ✅ Todos actualizados, ⚠️ Alguno > 180 días, ❌ Sin partidas o todos sin precio.

Click en fila → scroll a la sección de edición masiva filtrada por ese gremio.

**2. Edición masiva de precios**

Tabla editable con todas las partidas:

| Código | Nombre | Gremio | Ud | Mat. €/ud | M.O. €/ud | Estr. €/ud | P.U. Total | Acción |
|---|---|---|---|---|---|---|---|---|

- Los campos de precio son inputs editables inline
- Al cambiar un valor, la fila se marca como "modificada" (borde azul)
- Botón flotante **"Guardar cambios (N)"** aparece cuando hay modificaciones pendientes
- Al guardar: para cada partida modificada, llama a `updatePredefinedPartida` y registra en historial

**3. Acciones masivas**

- **"Actualizar precios +X%"**: aplica un porcentaje de incremento a todas las partidas filtradas (con preview antes de confirmar)
- **"Marcar como actualizados"**: pone `precioActualizado: hoy` en todas las partidas seleccionadas sin cambiar importes
- **"Exportar precios"**: CSV/Excel con todos los precios

**4. Gráfico de distribución**

- Gráfico de barras horizontales: precio unitario medio por gremio
- Gráfico scatter: dispersión de precios por gremio (detectar outliers)

**5. Solo gerente**

Toda la pestaña Precios solo es accesible para gerente/admin. El trabajador no ve esta pestaña en la navegación.

#### Criterios de aceptación

- [ ] Tabla resumen de precios por gremio con estadísticas
- [ ] Edición masiva inline con guardado por lotes
- [ ] Incremento porcentual con preview
- [ ] Exportación CSV/Excel
- [ ] Gráficos de distribución de precios
- [ ] Solo accesible para gerente/admin
- [ ] Al guardar, se registra historial de precios en cada partida

---

### PG-13 — Frontend: Pestaña Plantillas de presupuesto

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PG-07, PG-09

#### Contexto

La pestaña Plantillas permite al gerente crear, editar y gestionar plantillas de presupuesto reutilizables. Cada plantilla es una colección de partidas predefinidas con cantidades por defecto.

#### Qué hacer

**1. Grid de tarjetas de plantillas**

Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

**Cada tarjeta:**

```
┌──────────────────────────────────────────┐
│ Reforma integral piso 80m²    [⋯ menú]  │
│ ──────────────────────────────────────── │
│ Tipo: Reforma integral                   │
│ 24 partidas · 6 gremios                 │
│ ──────────────────────────────────────── │
│ Estimado: 32.500 €                       │
│ Margen 15%: 37.375 €                     │
│ ──────────────────────────────────────── │
│ Usada 8 veces · Último: 02/04/2026      │
│ [Aplicar a presupuesto]  [Editar]        │
└──────────────────────────────────────────┘
```

**2. Barra de acciones (solo gerente)**

- Buscador
- Filtro por tipo de obra
- Botón **"+ Nueva plantilla"**
- Botón **"Crear desde presupuesto"** → selector de presupuesto existente

**3. Drawer de plantilla**

**Tab Datos generales:**
| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre | Input texto | Sí |
| Descripción | Textarea | No |
| Tipo de obra | Selector | No |
| Categoría | Input texto | No |
| Margen por defecto | Input numérico (%) | No |
| Notas | Textarea | No |

**Tab Partidas de la plantilla:**
- Tabla con las partidas incluidas
- Columnas: Gremio | Partida (selector del catálogo) | Ud | Cantidad defecto | P.U. | Subtotal
- Botón **"+ Añadir partida"** → selector de partida predefinida (búsqueda por gremio y nombre)
- Botón **"+ Añadir gremio completo"** → añade todas las partidas activas de un gremio
- Drag & drop para reordenar
- Subtotal por gremio visible
- Total estimado y total con margen en footer

**Tab Estadísticas:**
- Veces usada
- Último uso
- Presupuestos creados desde esta plantilla

**4. Acción "Aplicar a presupuesto"**

Botón prominente que:
1. Llama a `applyBudgetTemplate(userId, templateId)`
2. Recibe el `budgetData` con precios actualizados del catálogo
3. Abre el modal de nuevo presupuesto de `ConstructionBudgets.tsx` con los datos prellenados
4. El usuario solo ajusta cantidades, cliente, obra y guarda

**5. Acción "Crear desde presupuesto"**

1. Selector de presupuesto existente (buscador)
2. Nombre para la plantilla
3. Llama a `createTemplateFromBudget(userId, budgetId, nombre)`
4. La plantilla se crea con las partidas del presupuesto

**6. Vista trabajador**

Puede ver las plantillas (nombre, tipo, gremios, estimado) pero no puede crear, editar ni aplicar.

#### Criterios de aceptación

- [ ] Grid de tarjetas de plantillas con toda la información
- [ ] Drawer con 3 tabs (Datos, Partidas, Estadísticas)
- [ ] Selector de partidas predefinidas al añadir a la plantilla
- [ ] "Añadir gremio completo" funcional
- [ ] Subtotales por gremio y total con margen
- [ ] "Aplicar a presupuesto" abre formulario prellenado con precios actualizados
- [ ] "Crear desde presupuesto" funcional
- [ ] Solo gerente puede crear/editar/eliminar/aplicar
- [ ] Drag & drop para reordenar partidas

---

### PG-14 — Frontend: Panel de alertas en la página

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PG-08, PG-09

#### Contexto

Las alertas de PG-08 deben mostrarse de forma prominente en la página para que el gerente las resuelva proactivamente.

#### Qué hacer

**1. Panel colapsable de alertas (arriba de los KPIs)**

Patrón del ButcherHub/Centro Operativo: header con icono Bell + "Alertas de catálogo" + badge conteo + desglose por tipo.

| Tipo alerta | Icono | Severidad | Acción |
|---|---|---|---|
| `partida_sin_precio` | DollarSign | warning/amber | Botón "Editar precios" → navega a pestaña Precios |
| `gremio_sin_partidas` | FolderOpen | info/blue | Botón "Añadir partidas" → navega a pestaña Partidas con gremio filtrado |
| `precio_desactualizado` | CalendarClock | warning/amber | Botón "Revisar precios" → navega a pestaña Precios con filtro de antiguos |
| `plantilla_incompleta` | FileWarning | warning/amber | Botón "Revisar plantilla" → navega a pestaña Plantillas con la plantilla |

**2. Cada alerta muestra:**
- Icono de severidad con borde izquierdo coloreado
- Mensaje descriptivo (ej: "Gremio Electricidad no tiene partidas predefinidas")
- Botón de acción que lleva a la solución
- Fecha de detección

**3. Sin alertas:**
Ocultar panel y mostrar indicador verde sutil: "✓ Catálogo completo y actualizado".

**4. Badge en el sidebar**
Si hay alertas de tipo warning/high, mostrar badge numérico junto al item del sidebar.

**5. Solo gerente**
El trabajador no ve el panel de alertas.

#### Criterios de aceptación

- [ ] Panel colapsable con las 4 categorías de alertas
- [ ] Cada alerta tiene icono, mensaje, acción y fecha
- [ ] Acciones navegan a la pestaña/filtro correcto
- [ ] Sin alertas: indicador verde
- [ ] Badge en sidebar con conteo
- [ ] Solo visible para gerente/admin

---

### PG-15 — Frontend: Diferenciación gerente vs trabajador

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PG-09 a PG-14

#### Contexto

Perfil gerente: configura precios, plantillas y márgenes. Perfil trabajador: consulta si necesita ver partidas asignadas, sin modificar precios.

#### Qué hacer

**1. Detección de rol**

```typescript
const { user } = useAuth();
const MANAGER_ROLES = ['owner', 'admin', 'manager', 'gerente'];
const isManager = MANAGER_ROLES.includes(user?.role || '');
```

**2. Gerente ve:**
- Todas las 5 pestañas (Gremios, Partidas, Precios, Plantillas, Alertas)
- 4 KPIs completos con importes
- Todos los precios visibles y editables
- Botones de crear/editar/eliminar
- Alertas y panel de gestión
- Acciones masivas (import/export, incremento %)
- Aplicar plantillas a presupuestos

**3. Trabajador ve:**
- Solo 2 pestañas: Gremios (vista reducida) y Partidas (sin precios)
- 2 KPIs: Gremios configurados (sin importes) y Partidas totales
- Gremios: nombre, tipo, contacto, conteo partidas. Sin precios de referencia
- Partidas: nombre, descripción, unidad, gremio. Sin columnas de precios
- Sin botones de acción
- Sin alertas
- Sin plantillas
- Sin pestaña de precios

**4. Header diferenciado**

- Gerente: "Gestión de partidas y precios" + badge "Gerente"
- Trabajador: "Consulta de partidas" + badge "Consulta" + texto "Solo lectura"

#### Criterios de aceptación

- [ ] Rol detectado desde `useAuth()`
- [ ] Gerente: 5 pestañas, todos los datos, todas las acciones
- [ ] Trabajador: 2 pestañas, datos limitados, sin precios, sin acciones de escritura
- [ ] Header diferenciado con badge de rol
- [ ] Componentes usan `isManager` para condicionar renderizado

---

### PG-16 — Frontend: Mejoras en ConstructionBudgets para usar catálogo de partidas

**Tipo:** Enhancement Frontend
**Prioridad:** Crítica
**Dependencias:** PG-05, PG-06, PG-07

#### Contexto

El formulario actual de presupuestos en `ConstructionBudgets.tsx` tiene partidas manuales con un select de gremio hardcodeado. Debe evolucionar para usar el catálogo de partidas predefinidas, las plantillas y el nuevo modelo con cantidad × precio unitario.

#### Qué hacer

**1. Botón "Usar plantilla" en el modal de nuevo presupuesto**

- Al crear un presupuesto nuevo, botón prominente "Usar plantilla" en la parte superior
- Abre selector de plantillas (lista con buscador)
- Al seleccionar: llama a `applyBudgetTemplate`, inyecta partidas con precios actualizados
- El usuario puede ajustar cantidades y añadir/quitar partidas

**2. Nuevo selector de partida**

Reemplazar el select de gremio + inputs manuales por:

```
[Selector de gremio] → [Selector de partida predefinida (filtrada por gremio)]
```

Al seleccionar una partida predefinida:
- Se autocompleta: nombre, descripción, unidad, precioMateriales, precioManoObra, precioEstructural
- Se muestra el campo de **cantidad** (nuevo)
- El `subtotal = cantidad × precioUnitario`

**3. Tabla de partidas mejorada**

Nueva estructura de columnas:

| Gremio | Partida | Descripción | Ud | Cantidad | Mat. €/ud | M.O. €/ud | Estr. €/ud | P.U. | Subtotal | ⋯ |
|---|---|---|---|---|---|---|---|---|---|---|

- El gremio sigue siendo selectable (ahora desde config)
- La partida es un selector que busca en el catálogo del gremio seleccionado
- Cantidad editable (default 1)
- Precios cargados del catálogo, editables en el presupuesto (override local)
- Subtotal = cantidad × (mat + mo + estr)

**4. Subtotales por gremio**

Debajo de la tabla, mostrar un resumen agrupado por gremio:

```
Albañilería: 4 partidas ............... 12.500,00 €
Electricidad: 3 partidas ............... 8.200,00 €
Fontanería: 2 partidas ................. 3.100,00 €
────────────────────────────────────────────────────
Subtotal partidas ..................... 23.800,00 €
Margen 15% ............................. 3.570,00 €
TOTAL ................................. 27.370,00 €
```

**5. Añadir partida manual**

Mantener la opción de escribir una partida manualmente (sin seleccionar del catálogo) para casos excepcionales. Botón "Partida libre" o "Partida manual".

**6. Guardar como plantilla**

Botón "Guardar como plantilla" al final del formulario de presupuesto que llama a `createTemplateFromBudget`.

**7. Retrocompatibilidad**

Los presupuestos existentes (sin `cantidad`, `unidad`, `precioUnitario*`) se muestran correctamente: cantidad 1, unidad 'ud', precios unitarios = importes actuales.

#### Criterios de aceptación

- [ ] Botón "Usar plantilla" funcional en nuevo presupuesto
- [ ] Selector de partida predefinida por gremio con autocompletado
- [ ] Campo de cantidad funcional con cálculo subtotal = cantidad × precioUnitario
- [ ] Columna de unidad de medida visible
- [ ] Subtotales agrupados por gremio
- [ ] Partida manual sigue siendo posible
- [ ] "Guardar como plantilla" funcional
- [ ] Presupuestos existentes se cargan sin errores
- [ ] Selects de gremio usan datos dinámicos del config (no arrays hardcodeados)

---

### PG-17 — Backend + Frontend: Conexiones bidireccionales

**Tipo:** Enhancement
**Prioridad:** Media
**Dependencias:** PG-09, PG-16

#### Contexto

La página de Partidas, Gremios y Precios debe conectar con los módulos relacionados: Presupuestos, Compras y Stock, Finanzas y Dashboard.

#### Qué hacer

**1. Conexión con Presupuestos (`ConstructionBudgets`)**

- Desde la página de partidas: botón "Ir a Presupuestos" en el header
- Desde un presupuesto: link "Gestionar precios base" que navega a `/saas/vertical/construccion/partidas-gremios?tab=precios`
- Desde la tabla de partidas del presupuesto: icono de link junto a cada partida predefinida que navega a su ficha en el catálogo

**2. Conexión con Compras y Stock**

- Desde la tab Materiales vinculados de una partida predefinida: link al artículo en `/saas/compras-stock?tab=catalogo&itemId=X`
- Desde el catálogo de compras: indicador "Usado en N partidas de construcción" en la ficha del artículo
- Al crear un presupuesto con partidas que tienen materiales vinculados: botón "Generar lista de materiales" que calcula la cantidad total de cada material necesaria y permite crear pedidos de compra

**3. Conexión con Finanzas**

- Desde el resumen de precios por gremio: link a costes por gremio en finanzas (si existe la vista)
- KPI de "Margen estimado vs real" cruzando precios base con costes reales de partes validados

**4. Conexión con Dashboard**

- Widget en `ConstructionDashboard.tsx`:
  - "Catálogo de precios" con: partidas totales, % con precio, alertas activas
  - Link directo a la página de partidas
- En el Centro Operativo (si existe): acceso rápido a "Precios y Partidas"

**5. Conexión con Centro Operativo (`/saas/vertical/construccion`)**

- En CO-09 (accesos rápidos del gerente): añadir botón "Partidas y Precios" con icono Layers

#### Criterios de aceptación

- [ ] Links bidireccionales entre partidas ↔ presupuestos
- [ ] Links a artículos del catálogo de compras desde materiales vinculados
- [ ] "Generar lista de materiales" funcional desde presupuesto
- [ ] Widget en Dashboard de construcción
- [ ] Acceso rápido desde Centro Operativo

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos de datos (semana 1)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| PG-01 | Actualizar catálogo de gremios base | Enhancement Backend | Crítica |
| PG-02 | Entidad partida predefinida | Feature Backend | Crítica |
| PG-05 | Mejorar modelo partidas en presupuestos | Enhancement Backend | Crítica |

### Fase 2 — APIs y lógica (semanas 2-3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| PG-03 | Mejorar modelo de gremio | Enhancement Backend | Alta |
| PG-04 | Entidad plantilla de presupuesto | Feature Backend | Alta |
| PG-06 | API de partidas predefinidas | Feature Backend | Crítica |
| PG-07 | API de plantillas de presupuesto | Feature Backend | Alta |
| PG-08 | Alertas de partidas/precios | Feature Backend | Alta |

### Fase 3 — Página frontend (semanas 4-5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| PG-09 | Página principal, routing, sidebar | Feature Frontend | Crítica |
| PG-10 | Pestaña Gremios | Feature Frontend | Crítica |
| PG-11 | Pestaña Partidas predefinidas | Feature Frontend | Crítica |
| PG-12 | Pestaña Precios | Feature Frontend | Alta |

### Fase 4 — Plantillas y mejoras (semana 6)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| PG-13 | Pestaña Plantillas de presupuesto | Feature Frontend | Alta |
| PG-14 | Panel de alertas en la página | Feature Frontend | Alta |
| PG-15 | Diferenciación gerente vs trabajador | Feature Frontend | Alta |

### Fase 5 — Integración con presupuestos y conexiones (semana 7)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| PG-16 | Mejoras en ConstructionBudgets | Enhancement Frontend | Crítica |
| PG-17 | Conexiones bidireccionales | Enhancement | Media |

---

## NOTAS DE DISEÑO

### Paleta de colores del módulo
- Gremios: amber/orange (trabajos manuales, construcción)
- Partidas: blue/indigo (catálogo, estructura)
- Precios: emerald/green (dinero, validación)
- Plantillas: purple/violet (reutilización, plantillas)
- Alertas: red/amber según severidad

### Convenciones UI
- Layout: `components/saas/Layout`
- Dark mode obligatorio
- Iconos: lucide-react
- Bordes: `rounded-xl` / `rounded-2xl`
- Borders: `border-2 border-gray-200 dark:border-gray-700`
- Hover: `shadow-sm` en hover
- Transitions: `transition-all 150-200ms`
- Moneda: `EUR toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })`
- Fechas: `dd/MM/yyyy`

### Patrón estado/fetching
- `useState` + `useMemo` + `useCallback` (sin Redux/Zustand)
- `constructionApi.ts` para todas las llamadas
- `useAuth()` para userId y role
- Debounce 300ms en filtros/buscador

### Referencia visual
- Patrón de pestañas: similar a `ComprasStockPage` (CS-10) con header de KPIs + tabs
- Patrón de tarjetas: similar a `ConstructionSubcontractors.tsx` pero mejorado con más datos
- Patrón de tabla editable: similar a la tabla de partidas actual de `ConstructionBudgets.tsx` pero con más columnas
- Patrón de alertas: mismo que Centro Operativo (CO-10)

### Unidades de medida estándar del sector
| Key | Label | Uso típico |
|---|---|---|
| `ud` | Unidad | Piezas, aparatos, elementos |
| `m2` | Metro cuadrado | Superficies: alicatado, pintura, pladur |
| `m3` | Metro cúbico | Excavación, hormigón |
| `ml` | Metro lineal | Tuberías, cables, rodapiés |
| `kg` | Kilogramo | Estructuras metálicas |
| `h` | Hora | Mano de obra directa |
| `pa` | Partida alzada | Trabajos sin medición precisa |
| `global` | Global | Precio cerrado por concepto |

