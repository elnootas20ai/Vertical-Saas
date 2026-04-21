# 🔍 ANÁLISIS ARQUITECTÓNICO DEL MÓDULO CRM

## Análisis realizado el: 16 de Enero 2026
**Objetivo:** Validar coherencia arquitectónica sin modificar UX ni diseño

---

## 1️⃣ ESTRUCTURA DEL CRM

### ✅ Ubicación exacta

**Ruta del módulo:**
```
/src/app/components/sections/Clientes.tsx
```

**Nivel de navegación:**
```
Módulo Principal: Clientes
├── Pestaña: Clientes
├── Pestaña: Promociones
├── Pestaña: Facturas
└── Pestaña: CRM (condicional) ← NUEVO
```

**Componente principal del CRM:**
```
/src/app/components/crm/CRMView.tsx
```

**Renderizado en:**
```typescript
// Línea 674 de Clientes.tsx
{activeTab === 'crm' && (
  <div className="space-y-4">
    <CRMView />
  </div>
)}
```

---

### ✅ Subpestañas creadas (4 totales)

Dentro de `CRMView.tsx`, líneas 16-16:

```typescript
const [activeSubTab, setActiveSubTab] = useState<'leads' | 'oportunidades' | 'pipeline' | 'tareas'>('leads');
```

**Estructura jerárquica:**
```
CRM (pestaña principal)
├── Leads (subpestaña)
├── Oportunidades (subpestaña)
├── Pipeline (subpestaña)
└── Tareas (subpestaña)
```

**Componentes implementados:**

| Subpestaña | Archivo | Líneas de código | Entidad/Vista |
|------------|---------|------------------|---------------|
| Leads | `/src/app/components/crm/LeadsView.tsx` | 302 | **ENTIDAD** |
| Oportunidades | `/src/app/components/crm/OportunidadesView.tsx` | 288 | **ENTIDAD** |
| Pipeline | `/src/app/components/crm/PipelineView.tsx` | 210 | **VISTA** (de Oportunidades) |
| Tareas | `/src/app/components/crm/TareasView.tsx` | 270 | **VISTA** (de Eventos) |

---

### ✅ Entidades vs Vistas

#### ENTIDADES REALES (necesitan tabla en BD):

**1. Lead** (`LeadsView.tsx`, línea 19-29)
```typescript
interface Lead {
  id: string;
  nombre: string;
  empresa?: string;
  email: string;
  telefono: string;
  origen: 'web' | 'telefono' | 'referido' | 'email' | 'otro';  // ← Campo origen presente
  estado: 'nuevo' | 'contactado' | 'calificado' | 'descartado';
  fechaCreacion: string;
  notas?: string;
}
```

**2. Oportunidad** (`OportunidadesView.tsx`, línea 18-29)
```typescript
interface Oportunidad {
  id: string;
  clienteLead: string;               // ← Referencia a cliente O lead
  tipo: 'cliente' | 'lead';          // ← Discriminador de tipo
  valorEstimado: number;
  estado: 'nueva' | 'contacto' | 'propuesta' | 'negociacion' | 'ganada' | 'perdida';
  responsable: string;               // ← Referencia a trabajador
  fechaCierre?: string;
  fechaCreacion: string;
  descripcion?: string;
  probabilidad: number;              // ← Campo calculado/editable
}
```

#### VISTAS (no son entidades):

**3. Pipeline** (`PipelineView.tsx`)
- Es una vista Kanban de `Oportunidad`
- Agrupa oportunidades por `estado`
- Calcula métricas agregadas (total, valor, etc.)
- **NO tiene entidad propia**

**4. Tareas CRM** (`TareasView.tsx`)
- Es una vista filtrada de `Evento` (entidad existente)
- Campos adicionales específicos de CRM pero almacenados en `Evento`
- **NO crea entidad nueva**

---

### ⚠️ INCOHERENCIA DETECTADA #1

**Problema:** Interface duplicada entre componentes

**Ubicación:**
- `OportunidadesView.tsx` (línea 18-29)
- `PipelineView.tsx` (línea 12-22)

**Descripción:**
Ambos archivos definen `interface Oportunidad` con los mismos campos. Esto viola el principio DRY (Don't Repeat Yourself).

**Impacto:**
- Si se modifica un campo, hay que hacerlo en 2 sitios
- Riesgo de inconsistencia de datos

**Solución requerida:**
Crear archivo `/src/app/types/crm.ts` con interfaces compartidas:
```typescript
export interface Lead { ... }
export interface Oportunidad { ... }
export interface TareaCRM extends Evento { ... }
```

---

## 2️⃣ LÓGICA LEAD → CLIENTE

### ✅ Creación de un lead

**Ubicación:** `LeadsView.tsx`, línea 143
```typescript
<Button>
  <UserPlus className="size-4 mr-2 hidden md:inline-block" />
  <span className="md:hidden">+</span>
  <span className="hidden md:inline">Añadir</span>
  {' '}Lead
</Button>
```

**Estado actual:** 
- Botón presente pero sin handler implementado
- No hay formulario de creación de lead

**Campos clave del Lead:**

```typescript
// Campos obligatorios
nombre: string;
email: string;
telefono: string;
origen: 'web' | 'telefono' | 'referido' | 'email' | 'otro'; // ✅ Campo origen presente
estado: 'nuevo' | 'contactado' | 'calificado' | 'descartado';
fechaCreacion: string;

// Campos opcionales
empresa?: string;
notas?: string;
```

**✅ CONFIRMADO:** El campo `origen` existe y está implementado

---

### ⚠️ CONVERSIÓN LEAD → CLIENTE

**Handler definido:** `CRMView.tsx`, línea 21-24
```typescript
const handleConvertToClient = (leadId: string) => {
  console.log('Convertir lead a cliente:', leadId);
  // Aquí iría la lógica para convertir el lead a cliente
};
```

**Estado actual:** 
- ❌ No hay lógica implementada
- ❌ No crea cliente en base de datos
- ❌ No actualiza estado del lead
- ❌ No hay validación de datos requeridos

**Flujo esperado (documentado pero no implementado):**
```
1. Usuario hace click en "Convertir a Cliente" (botón existe, línea 217 LeadsView)
2. Handler recibe leadId
3. [FALTA] Copiar datos de lead a nueva entidad cliente
4. [FALTA] Marcar lead como "convertido" o cambiar estado
5. [FALTA] Crear relación lead_id en tabla clientes
6. [FALTA] Redirigir o mostrar confirmación
```

---

### ❌ VACÍO CRÍTICO #1: Historial del lead tras conversión

**Pregunta sin responder:**
- ¿Se mantiene el lead original?
- ¿Se marca como "convertido"?
- ¿Se archiva?
- ¿Se elimina?

**Campos de Lead no contemplan estado "convertido":**
```typescript
estado: 'nuevo' | 'contactado' | 'calificado' | 'descartado';
// ❌ Falta: 'convertido'
```

**Decisión arquitectónica no documentada:**
- No hay campo `convertidoAClienteId`
- No hay campo `fechaConversion`
- No hay relación explícita lead → cliente

**Impacto:**
- Pérdida de trazabilidad comercial
- No se puede medir tasa de conversión
- No hay histórico de origen del cliente

---

### ⚠️ INCOHERENCIA DETECTADA #2

**Conversión Lead → Oportunidad**

**Handler:** `CRMView.tsx`, línea 26-30
```typescript
const handleConvertToOportunidad = (leadId: string) => {
  console.log('Convertir lead a oportunidad:', leadId);
  setActiveSubTab('oportunidades');  // ← Solo cambia de pestaña
  // Aquí iría la lógica para crear una oportunidad desde el lead
};
```

**Problema:**
- Cambia a la pestaña Oportunidades pero NO crea la oportunidad
- No pre-rellena ningún formulario
- No pasa contexto del lead

**Flujo esperado vs implementado:**

| Esperado | Implementado |
|----------|--------------|
| 1. Click en "Convertir a Oportunidad" | ✅ |
| 2. Abrir formulario con datos del lead | ❌ |
| 3. Crear oportunidad tipo='lead' | ❌ |
| 4. Vincular oportunidad al lead | ❌ |
| 5. Mostrar confirmación | ❌ |

---

## 3️⃣ OPORTUNIDADES Y PIPELINE

### ✅ Estados definidos para oportunidades

**Ubicación:** `OportunidadesView.tsx`, línea 45-52
```typescript
const estadoColors = {
  nueva: 'bg-blue-100 text-blue-700',
  contacto: 'bg-cyan-100 text-cyan-700',
  propuesta: 'bg-purple-100 text-purple-700',
  negociacion: 'bg-yellow-100 text-yellow-700',
  ganada: 'bg-green-100 text-green-700',
  perdida: 'bg-red-100 text-red-700'
};
```

**Flujo de estados:**
```
nueva → contacto → propuesta → negociacion → ganada
                                            ↘ perdida
```

**Estados finales:** `ganada`, `perdida`
**Estados intermedios:** `nueva`, `contacto`, `propuesta`, `negociacion`

---

### ✅ Pipeline es una VISTA, no entidad

**Confirmado:** `PipelineView.tsx`, línea 100-104
```typescript
const getOportunidadesByEstado = (estado: string) => {
  return mockOportunidades.filter(o => o.estado === estado);
};

const getTotalValueByEstado = (estado: string) => {
  return mockOportunidades
    .filter(o => o.estado === estado)
    .reduce((sum, o) => sum + o.valorEstimado, 0);
};
```

**Arquitectura correcta:**
- Pipeline consume datos de `Oportunidad`
- Agrupa por campo `estado`
- Calcula métricas derivadas
- No tiene estado propio

---

### ⚠️ ACCIONES QUE CAMBIAN ESTADO DE OPORTUNIDAD

**Definidas en UI pero sin implementación:**

1. **Drag & drop en Pipeline** (preparado pero no funcional)
   - `PipelineView.tsx`, línea 203-205:
   ```typescript
   <Card 
     key={oportunidad.id} 
     className="hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
   >
   ```
   - ❌ No hay handler `onDragStart`, `onDrop`
   - ❌ No actualiza estado al arrastrar

2. **Botón "Cambiar estado"** 
   - ❌ No existe en UI actual
   - Mencionado en requisitos pero no implementado

3. **Asignar responsable**
   - ❌ No existe selector
   - Campo `responsable` es string literal en mock

---

### ❌ VACÍO CRÍTICO #2: Ciclo de vida de oportunidad

**Preguntas sin responder:**

1. ¿Puede una oportunidad volver de `negociacion` a `propuesta`?
2. ¿Los estados finales (`ganada`/`perdida`) son inmutables?
3. ¿Se puede reabrir una oportunidad perdida?
4. ¿Qué ocurre con las tareas asociadas cuando se gana/pierde?

**Validaciones faltantes:**
- No hay reglas de transición de estado
- No hay campos de auditoría (modificadoPor, fechaModificacion)
- No hay motivo de pérdida para estado `perdida`

---

## 4️⃣ EVENTOS Y TAREAS (CONEXIÓN CLAVE)

### ✅ Reutilización de EventModal

**Confirmado:** `CRMView.tsx`, línea 155-160
```typescript
<EventModal 
  isOpen={showEventModal}
  onClose={() => setShowEventModal(false)}
  userRole="gerente"
  onSubmit={handleEventSubmit}
/>
```

**Importación correcta:** Línea 13
```typescript
import { EventModal, EventData } from '../modals/EventModal';
```

**✅ ARQUITECTURA CORRECTA:**
- No se duplica el modal
- Se reutiliza entidad `Evento` existente
- Interfaz `EventData` compartida

---

### ✅ Tipos de evento permitidos desde CRM

**Estado del tipo:** `CRMView.tsx`, línea 18
```typescript
const [eventType, setEventType] = useState<'tarea' | 'cita' | 'reunion'>('tarea');
```

**Handlers específicos:**

1. **Tarea** (línea 32-36)
```typescript
const handleCreateTask = (context?: string) => {
  setEventType('tarea');
  setSelectedContext(context || null);
  setShowEventModal(true);
};
```

2. **Cita** (línea 38-42)
```typescript
const handleCreateCita = (context?: string) => {
  setEventType('cita');
  setSelectedContext(context || null);
  setShowEventModal(true);
};
```

3. **Reunión** (línea 44-48)
```typescript
const handleCreateReunion = (context?: string) => {
  setEventType('reunion');
  setSelectedContext(context || null);
  setShowEventModal(true);
};
```

**✅ Tipos permitidos:** TAREA, CITA, REUNIÓN (coherente con requisitos)

---

### ⚠️ VINCULACIÓN DE EVENTOS

**Handler de submit:** `CRMView.tsx`, línea 50-55
```typescript
const handleEventSubmit = (eventData: EventData) => {
  console.log('Evento creado desde CRM:', eventData);
  console.log('Contexto:', selectedContext);
  setShowEventModal(false);
  // Aquí iría la lógica para guardar el evento asociado al cliente/lead/oportunidad
};
```

**Variable de contexto:** Línea 19
```typescript
const [selectedContext, setSelectedContext] = useState<string | null>(null);
```

**Problema detectado:**
- ✅ Se captura el contexto (leadId, oportunidadId, etc.)
- ❌ NO se pasa al EventModal
- ❌ EventModal no recibe información de contexto CRM
- ❌ No se vincula el evento creado a la entidad origen

---

### ❌ VACÍO CRÍTICO #3: Vinculación evento → contexto CRM

**EventData no contempla campos CRM:**

Revisar interfaz en `EventModal.tsx`, línea 16-34:
```typescript
export interface EventData {
  titulo: string;
  tipo: string;
  categoria: string;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string;
  horaFin: string;
  ubicacion: string;
  descripcion: string;
  invitadosTrabajadores: string[];
  invitadosEmail: string[];
  repeticion: string;
  intervaloRepeticion: number;
  // Campos específicos para incidencias
  tipoIncidencia?: string;
  comentarioIncidencia?: string;
  documentoIncidencia?: File | null;
}
```

**❌ Campos faltantes para CRM:**
```typescript
// Necesarios pero NO presentes:
leadId?: string;
oportunidadId?: string;
clienteId?: string;
contextoOrigen?: 'crm_lead' | 'crm_oportunidad' | 'cliente';
```

**Impacto:**
- Los eventos creados desde CRM no quedan vinculados
- No se puede filtrar "eventos de CRM"
- No se puede ver historial de actividad de un lead/oportunidad
- Rompe el flujo comercial

---

### ✅ Eventos aparecen en calendario

**Asunción documentada pero no verificada:**

La documentación indica que los eventos creados desde CRM:
1. ✅ Deberían aparecer en Calendario Gerente
2. ✅ Deberían aparecer en Calendario Trabajador (si asignado)

**Verificación:**
- EventModal existe y funciona para crear eventos
- Los eventos se guardan (presumiblemente)
- Los calendarios consumen eventos de la misma fuente

**✅ COHERENTE en teoría, pero sin trazabilidad**

---

## 5️⃣ VISIBILIDAD POR ROL

### ✅ Gerente - Vista completa

**Control de acceso:** `Clientes.tsx`, línea 188, 293
```typescript
// Línea 188: Extrae userRole del contexto
const { viewMode, userRole } = useApp();

// Línea 293: Pestaña CRM condicional
{crmModuleActive && (
  <button onClick={() => setActiveTab('crm')}>
    <Target className="size-4" />
    <span className="font-medium">CRM</span>
  </button>
)}
```

**⚠️ PROBLEMA DETECTADO:**
- NO hay validación de `userRole === 'gerente'`
- Solo valida `crmModuleActive`
- Un trabajador podría ver la pestaña si `crmModuleActive = true`

**Código actual:**
```typescript
{crmModuleActive && (
  <button>CRM</button>  // ❌ No valida rol
)}
```

**Debería ser:**
```typescript
{crmModuleActive && userRole === 'gerente' && (
  <button>CRM</button>  // ✅ Valida módulo Y rol
)}
```

---

### ✅ Trabajador - Vista operativa

**Ubicación:** `TrabajadorCRMView.tsx`

**Integración:** `MiTrabajo.tsx`, línea 9
```typescript
type DeliveryFilterType = 'pedidos' | 'cocina' | 'reparto' | 'tpv' | 'turnos' | 'crm';
```

**Renderizado:** `MiTrabajo.tsx`, línea 171 (aproximado)
```typescript
{activeFilter === 'crm' && (
  <TrabajadorCRMView />
)}
```

**✅ Qué ve el trabajador:**

Según `TrabajadorCRMView.tsx`, línea 15-86:
```typescript
const mockTareasAsignadas: TareaCRM[] = [
  {
    id: '2',
    titulo: 'Reunión de presentación con Patricia López',
    clienteAsociado: 'Patricia López',  // ← Solo lectura
    responsable: 'Carlos Martín',       // ← Filtrado por trabajador actual
    // ... solo tareas asignadas a él
  }
]
```

**Campos visibles:**
- ✅ Título de tarea
- ✅ Cliente asociado (solo lectura)
- ✅ Fecha límite
- ✅ Estado
- ✅ Tipo (tarea/cita/reunión)
- ✅ Descripción

---

### ✅ Acciones bloqueadas para trabajador

**En TrabajadorCRMView:**
- ❌ NO puede crear leads
- ❌ NO puede ver listado completo de leads
- ❌ NO puede ver oportunidades
- ❌ NO puede ver pipeline
- ❌ NO puede asignar tareas a otros
- ❌ NO puede editar datos de cliente
- ❌ NO puede convertir lead a cliente

**Acciones permitidas:**
- ✅ Ver sus tareas asignadas
- ✅ Marcar tareas como completadas
- ✅ Filtrar por estado
- ✅ Ver datos de cliente asociado (solo lectura)

**✅ COHERENTE con requisitos**

---

### ⚠️ INCOHERENCIA DETECTADA #3

**Problema:** Filtrado de tareas no está implementado

**En `TrabajadorCRMView.tsx`:**
- Mock data tiene campo `responsable: 'Carlos Martín'`
- No hay lógica para filtrar por usuario actual
- Mock muestra tareas de diferentes responsables

**Código actual:** Línea 14-86
```typescript
const mockTareasAsignadas: TareaCRM[] = [
  { responsable: 'Carlos Martín', ... },
  { responsable: 'María García', ... },  // ← NO debería aparecer si el trabajador es Carlos
];
```

**Debería filtrar por:**
```typescript
const tareasDelTrabajador = mockTareasAsignadas.filter(
  t => t.responsable === currentUser.name
);
```

---

## 6️⃣ CONEXIONES CON OTROS MÓDULOS

### ✅ Conexión con Clientes

**Nivel de integración:**

1. **Módulo contenedor**
   - ✅ CRM vive dentro de Clientes
   - ✅ Se accede como pestaña adicional
   - ✅ No sustituye ficha de cliente

2. **Conversión Lead → Cliente**
   - ⚠️ Handler definido pero sin implementación
   - ❌ No crea registro en tabla `customers`
   - ❌ No hay relación en base de datos

3. **Oportunidades de clientes existentes**
   - ✅ Campo `tipo: 'cliente' | 'lead'` diferencia origen
   - ✅ Campo `clienteLead` referencia nombre
   - ❌ No es FK real (es string literal)

4. **Ficha de cliente**
   - ❌ NO hay pestaña "Actividad CRM" en CustomerDetailModal
   - ❌ Cliente no muestra oportunidades asociadas
   - ❌ Cliente no muestra historial de tareas

**Estado actual:** Conexión conceptual pero no funcional

---

### ⚠️ Conexión con Facturación

**En requisitos originales:**
- "No mover facturación al CRM"

**Implementado:**
- ✅ No hay referencias a facturas en CRM
- ✅ Facturas siguen en pestaña independiente
- ✅ Facturas siguen en CustomerDetailModal

**Vacío detectado:**
- ❌ Cuando oportunidad pasa a `ganada`, no se crea factura automáticamente
- ❌ No hay vínculo oportunidad → pedido → factura

---

### ✅ Conexión con Calendario

**EventModal compartido:**
- ✅ CRM usa el mismo EventModal
- ✅ Eventos creados desde CRM son eventos normales
- ✅ Deberían aparecer en Calendario

**Verificación de tipos de evento:**

`EventModal.tsx` permite crear eventos con categorías. Los tipos `tarea`, `cita`, `reunion` son categorías válidas.

**✅ Conexión correcta en teoría**

**⚠️ Problema:** Sin campo de vinculación CRM
- Los eventos no tienen manera de saber que vienen de CRM
- No se pueden filtrar "eventos CRM" en el calendario
- No se puede hacer clic en un evento y ver la oportunidad relacionada

---

### ❌ Conexión con Comunicación / Chats

**Estado:** No implementada

**Esperado:**
- Poder abrir chat con cliente desde oportunidad
- Ver historial de conversaciones en ficha de lead

**Actual:**
- ❌ No hay botón "Abrir chat" en ninguna vista CRM
- ❌ Chats no muestran si el contacto es lead/cliente

**Impacto:** Funcionalidad comercial incompleta

---

### ❌ Conexión con RRHH

**Estado:** Sin dependencias

**Verificado:**
- ✅ No hay lógica de permisos RRHH en CRM
- ✅ No usa RRHHRules
- ✅ Campo `responsable` es string, no empleado validado

**Problema futuro:**
- ¿Cómo asignar tareas a trabajadores que no existen?
- ¿Cómo validar que el responsable está activo?

**Decisión implícita:** Se asume que el responsable existe

---

## 7️⃣ INCOHERENCIAS O VACÍOS DETECTADOS

### 🔴 CRÍTICOS (Bloquean funcionalidad)

#### #1: Interface duplicada `Oportunidad`
- **Ubicación:** `OportunidadesView.tsx` y `PipelineView.tsx`
- **Impacto:** Riesgo de inconsistencia
- **Solución:** Crear `/src/app/types/crm.ts`

#### #2: Conversión Lead → Cliente sin implementar
- **Ubicación:** `CRMView.tsx`, línea 21-24
- **Impacto:** Funcionalidad core no funciona
- **Falta:**
  - Crear cliente en BD
  - Marcar lead como convertido
  - Copiar datos
  - Mantener trazabilidad

#### #3: Eventos sin vinculación a contexto CRM
- **Ubicación:** `EventModal.tsx` (interface EventData)
- **Impacto:** Pérdida de trazabilidad comercial
- **Falta:**
  - Campos `leadId`, `oportunidadId`, `clienteId`
  - Campo `contextoOrigen`
  - Filtros en calendario

#### #4: Validación de rol Gerente faltante
- **Ubicación:** `Clientes.tsx`, línea 293
- **Impacto:** Trabajador podría acceder a CRM
- **Solución:** Añadir `&& userRole === 'gerente'`

---

### 🟡 IMPORTANTES (Afectan UX)

#### #5: Estado "convertido" no existe en Lead
- **Ubicación:** `LeadsView.tsx`, línea 26
- **Impacto:** No hay forma de marcar lead convertido
- **Falta:**
  ```typescript
  estado: 'nuevo' | 'contactado' | 'calificado' | 'descartado' | 'convertido';
  ```

#### #6: Drag & drop preparado pero no funcional
- **Ubicación:** `PipelineView.tsx`, línea 203
- **Impacto:** UX prometida pero no cumplida
- **Estado:** Clase CSS `cursor-grab` pero sin handlers

#### #7: Filtrado de tareas por trabajador no implementado
- **Ubicación:** `TrabajadorCRMView.tsx`
- **Impacto:** Trabajador ve tareas de otros
- **Falta:** Filtro por `responsable === currentUser.name`

#### #8: Referencias por nombre (string) en vez de ID
- **Ubicación:** Todos los componentes
- **Impacto:** Imposible hacer JOIN en BD
- **Ejemplos:**
  ```typescript
  clienteLead: 'Tech Solutions SL'  // ❌ Debería ser clienteLeadId: '123'
  responsable: 'María García'       // ❌ Debería ser responsableId: '456'
  ```

---

### 🟢 MENORES (Mejoras deseables)

#### #9: No hay formularios de creación
- Botón "Añadir Lead" sin handler
- Botón "Añadir Oportunidad" sin handler
- Botón "Añadir Tarea" redirige a EventModal genérico

#### #10: Mock data duplicado
- `mockOportunidades` definido en `OportunidadesView.tsx` y `PipelineView.tsx`
- Deberían compartir la misma fuente de datos

#### #11: No hay mensajes de confirmación
- Convertir lead → sin feedback
- Marcar tarea completada → sin confirmación
- Crear evento → sin notificación

#### #12: Probabilidad sin validación
- Campo `probabilidad: number` acepta cualquier valor
- Debería estar entre 0-100

---

### ❓ DECISIONES IMPLÍCITAS NO DOCUMENTADAS

#### D1: ¿Se eliminan los leads convertidos?
- **No especificado en código**
- **No hay estado "archivado"**
- **No hay soft delete**

#### D2: ¿Oportunidades perdidas se pueden reabrir?
- **No hay validación de transición de estados**
- **No hay campo fechaCierre real (es fecha estimada)**

#### D3: ¿Múltiples oportunidades por cliente/lead?
- **Asumido que SÍ (no hay unique constraint)**
- **No documentado explícitamente**

#### D4: ¿Responsable puede ser cualquier trabajador?
- **No hay validación contra tabla empleados**
- **String libre admite cualquier valor**

#### D5: ¿Tareas CRM son diferentes de tareas normales?
- **En teoría NO (reutilizan EventModal)**
- **En práctica SÍ (tienen campos distintos en interface)**

---

## 8️⃣ CONCLUSIÓN

### ✅ QUÉ ESTÁ CORRECTAMENTE ALINEADO

#### Arquitectura general
- ✅ CRM vive dentro de Clientes (no es módulo independiente)
- ✅ No sustituye ficha de cliente
- ✅ Pipeline es vista de Oportunidades (no entidad propia)
- ✅ Reutiliza EventModal existente
- ✅ No crea eventos nuevos
- ✅ No duplica facturación

#### Separación de roles
- ✅ Gerente tiene acceso completo (en teoría)
- ✅ Trabajador solo ve tareas asignadas
- ✅ Trabajador no gestiona leads ni oportunidades

#### Estructura de datos
- ✅ Lead tiene campo `origen` (requerido)
- ✅ Oportunidad diferencia `tipo: cliente | lead`
- ✅ Estados de oportunidad bien definidos
- ✅ Tipos de evento limitados a TAREA, CITA, REUNIÓN

#### UX y diseño
- ✅ Responsive implementado
- ✅ Vistas Grid/Tabla/Kanban coherentes
- ✅ Badges y colores consistentes con el sistema
- ✅ Scroll horizontal en pestañas

---

### 🔴 QUÉ REQUIERE AJUSTE ANTES DE CERRAR EL CRM

#### BLOQUEANTES (Prioridad 1)

**1. Implementar conversión Lead → Cliente**
```typescript
// En CRMView.tsx, línea 21
const handleConvertToClient = (leadId: string) => {
  // TODO: Implementar lógica real
  // - Copiar datos a tabla customers
  // - Marcar lead como convertido
  // - Crear relación
};
```

**2. Añadir campos CRM a EventData**
```typescript
// En EventModal.tsx, interface EventData
export interface EventData {
  // ... campos existentes
  // AÑADIR:
  leadId?: string;
  oportunidadId?: string;
  clienteId?: string;
  contextoOrigen?: 'crm_lead' | 'crm_oportunidad' | 'cliente' | null;
}
```

**3. Validar rol de gerente en visibilidad CRM**
```typescript
// En Clientes.tsx, línea 293
{crmModuleActive && userRole === 'gerente' && (
  <button onClick={() => setActiveTab('crm')}>CRM</button>
)}
```

**4. Consolidar interfaces en archivo compartido**
```typescript
// Crear /src/app/types/crm.ts
export interface Lead { ... }
export interface Oportunidad { ... }
export interface TareaCRM { ... }
```

---

#### IMPORTANTES (Prioridad 2)

**5. Cambiar referencias string → ID**
```typescript
// En todos los componentes, cambiar:
clienteLead: string        → clienteLeadId: string
responsable: string        → responsableId: string
clienteAsociado?: string   → clienteAsociadoId?: string
```

**6. Añadir estado "convertido" a Lead**
```typescript
estado: 'nuevo' | 'contactado' | 'calificado' | 'descartado' | 'convertido';
```

**7. Implementar filtrado de tareas por trabajador**
```typescript
// En TrabajadorCRMView.tsx
const tareasAsignadas = mockTareasAsignadas.filter(
  t => t.responsableId === currentUser.id
);
```

**8. Añadir campos de auditoría**
```typescript
interface Lead {
  // ... campos existentes
  creadoPor: string;
  modificadoPor?: string;
  fechaModificacion?: string;
  convertidoAClienteId?: string;
  fechaConversion?: string;
}

interface Oportunidad {
  // ... campos existentes
  creadoPor: string;
  modificadoPor?: string;
  fechaModificacion?: string;
  motivoPerdida?: string; // Si estado = perdida
}
```

---

#### DESEABLES (Prioridad 3)

**9. Implementar formularios de creación**
- Formulario Lead
- Formulario Oportunidad
- Pre-rellenado en conversiones

**10. Implementar drag & drop en Pipeline**
- Handlers onDragStart, onDrop
- Actualización de estado

**11. Añadir validaciones**
- Probabilidad entre 0-100
- Transiciones de estado válidas
- Campos requeridos

**12. Integrar con ficha de cliente**
- Pestaña "Actividad CRM" en CustomerDetailModal
- Mostrar oportunidades del cliente
- Mostrar historial de tareas

---

### 📊 RESUMEN NUMÉRICO

**Componentes creados:** 6
- CRMView.tsx
- LeadsView.tsx
- OportunidadesView.tsx
- PipelineView.tsx
- TareasView.tsx
- TrabajadorCRMView.tsx

**Entidades nuevas:** 2
- Lead
- Oportunidad

**Vistas (no entidades):** 2
- Pipeline (de Oportunidades)
- TareasCRM (de Eventos)

**Incoherencias detectadas:** 12
- Críticas: 4
- Importantes: 4
- Menores: 4

**Decisiones implícitas:** 5

**Flujos sin implementar:** 3
- Conversión Lead → Cliente
- Conversión Lead → Oportunidad
- Vinculación Evento → Contexto CRM

**Validaciones faltantes:** 7
- Rol gerente
- Filtro tareas por trabajador
- Referencias por ID
- Estados de lead
- Probabilidad 0-100
- Transiciones de estado
- Campos requeridos

---

### 🎯 VEREDICTO FINAL

**Estado arquitectónico:** ⚠️ PARCIALMENTE COHERENTE

**Diseño estructural:** ✅ CORRECTO
- La decisión de CRM dentro de Clientes es acertada
- Reutilización de EventModal es correcta
- Separación Gerente/Trabajador es adecuada

**Implementación funcional:** ❌ INCOMPLETA
- Handlers clave sin implementar (conversiones)
- Campos de vinculación ausentes
- Validaciones críticas faltantes

**Preparación para backend:** ⚠️ REQUIERE AJUSTES
- Interfaces necesitan consolidación
- Referencias deben ser por ID, no string
- Falta campos de auditoría y trazabilidad

---

### 📋 CHECKLIST ANTES DE CERRAR CRM

**Para considerarlo arquitectónicamente completo:**

- [ ] Implementar handleConvertToClient con lógica real
- [ ] Implementar handleConvertToOportunidad con lógica real
- [ ] Añadir campos CRM a interface EventData
- [ ] Validar userRole === 'gerente' en visibilidad
- [ ] Consolidar interfaces en /src/app/types/crm.ts
- [ ] Cambiar todas las referencias string → ID
- [ ] Añadir estado 'convertido' a Lead
- [ ] Implementar filtrado por trabajador actual
- [ ] Añadir campos de auditoría (creadoPor, fechaModificacion)
- [ ] Añadir campos de trazabilidad (convertidoAClienteId, motivoPerdida)
- [ ] Compartir mockData entre OportunidadesView y PipelineView
- [ ] Documentar decisiones sobre ciclo de vida de entidades

**Total:** 12 ajustes requeridos antes de integración con backend

---

**Análisis completado:** 16 Enero 2026  
**Analista:** Asistente IA  
**Método:** Revisión exhaustiva de código fuente  
**Archivos revisados:** 8
