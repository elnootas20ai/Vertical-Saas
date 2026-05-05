# 🔒 ARQUITECTURA CERRADA - MÓDULO RRHH
**Sistema:** Vertial  
**Fecha de cierre:** 17 Enero 2026  
**Versión:** 1.0.0  
**Estado:** ARQUITECTURA FINALIZADA ✅

---

## 📋 DECLARACIÓN OFICIAL

Este documento certifica que el módulo RRHH de Vertial ha completado su fase de arquitectura y diseño funcional. A partir de esta fecha:

✅ **Los flujos están CERRADOS y VALIDADOS**  
✅ **No se admiten nuevas pantallas sin revisión de arquitectura**  
✅ **Las reglas de negocio están documentadas y no modificables sin aprobación**  
✅ **El sistema está preparado para integración con backend (Supabase)**

---

## 🎯 FLUJOS CERRADOS Y APROBADOS

### 1️⃣ INCIDENCIAS / AUSENCIAS

#### Definición:
**Ausencia/Incidencia NO es un evento. Es un flujo RRHH independiente.**

#### Puntos de entrada:
1. **Fichajes (Trabajador)** → Botón "Reportar Incidencia"
2. **Calendario (Gerente)** → Crear Evento → Categoría "Ausencia/Incidencia"
3. **Calendario (Trabajador)** → Crear Evento → Categoría "Ausencia/Incidencia"

#### Flujo cerrado:
```
Usuario selecciona "Ausencia / Incidencia"
  ↓
EventModal detecta flujo RRHH (NO crea evento)
  ↓
Cierra EventModal
  ↓
Abre ReportarIncidenciaModal
  ↓
Usuario completa formulario (tipo, fechas, documentos)
  ↓
Submit → Crear incidencia con metadatos
  ↓
Notificación automática al gerente
```

#### Reglas de negocio implementadas:
- ✅ Origen registrado: `fichaje | calendario | sistema`
- ✅ Solo UNA incidencia activa por trabajador por día
- ✅ Incidencia bloquea fichaje en la fecha afectada
- ✅ Notificación automática al gerente
- ✅ Visibilidad: solo trabajador y gerente
- ✅ NO admite invitados
- ✅ NO admite repetición

#### Archivo de reglas:
`/src/app/utils/rrhhRules.ts` → `RRHHRules.incidencias`

---

### 2️⃣ VACACIONES

#### Flujos aprobados (SOLO 2):

**FLUJO A: Trabajador propone → Gerente decide**
```
Trabajador: Fichajes → "Solicitar Vacaciones"
  ↓
ProponerVacacionesModal
  ↓
Submit → status: 'pending' | origen: 'trabajador_propone'
  ↓
Gerente: Equipo > Vacaciones > "Aprobar"
  ↓
status: 'approved' ✅ o 'rejected' ❌
```

**FLUJO B: Gerente asigna directamente**
```
Gerente: Equipo > Vacaciones > "Asignar"
  ↓
AsignarVacacionesModal
  ↓
Submit → status: 'approved' | origen: 'gerente_asigna'
  ↓
Sin necesidad de aprobación (asignación directa)
```

#### ❌ FLUJO ELIMINADO:
- **"Gerente propone vacaciones"** → No tiene cierre lógico
- El botón "Proponer" ha sido ELIMINADO del panel de Vacaciones
- Razón: Proposición del gerente sin aprobación del trabajador genera inconsistencia

#### Reglas de negocio implementadas:
- ✅ Validación de días disponibles
- ✅ Fecha fin > fecha inicio
- ✅ Balance anual: 22 días por defecto
- ✅ Estados: `pending | approved | rejected`
- ✅ Orígenes: `trabajador_propone | gerente_asigna`

#### Archivo de reglas:
`/src/app/utils/rrhhRules.ts` → `RRHHRules.vacaciones`

---

### 3️⃣ FICHAJES

#### Flujo trabajador:
```
Trabajador: Fichajes → "Fichar Entrada/Salida"
  ↓
Registrar: hora, dispositivo, geolocalización
  ↓
Estado: 'activo' | 'completo' | 'sin-fichar'
  ↓
Validación: incidencia activa → bloqueo fichaje
```

#### Flujo gerente:
```
Gerente: Equipo > Fichajes
  ↓
Vista KPIs: Fichados hoy | Puntualidad | Incidencias
  ↓
Ajuste manual (si necesario)
```

#### Reglas de negocio implementadas:
- ✅ Solo UNA entrada activa por trabajador
- ✅ Bloqueo automático si existe incidencia
- ✅ Registro de dispositivo y geolocalización
- ✅ Cálculo automático de horas trabajadas

#### Archivo de reglas:
`/src/app/utils/rrhhRules.ts` → `RRHHRules.fichajes`

---

### 4️⃣ HORARIOS

#### Flujo gerente:
```
Gerente: Equipo > Horarios
  ↓
PlanificacionHorariaGeneralMejorada
  ↓
Seleccionar semana y centro de trabajo
  ↓
Asignar turnos (mañana/tarde)
  ↓
Auto-guardado cada 3 segundos
  ↓
Estado: 'borrador' | 'publicado'
  ↓
Publicar → visible para trabajadores
```

#### Flujo trabajador:
```
Trabajador: Fichajes | Calendario
  ↓
Visualizar horario semanal asignado (solo lectura)
```

#### Reglas de negocio implementadas:
- ✅ Turnos partidos permitidos
- ✅ Validación de horas contratadas vs planificadas
- ✅ Estado publicado bloquea edición
- ✅ Auto-guardado para prevenir pérdida de datos

---

## 🏗️ ARQUITECTURA TÉCNICA

### Componentes principales:

**Paneles:**
- `/src/app/components/sections/Equipo.tsx` (Gerente)
- `/src/app/components/sections/trabajador/Fichaje.tsx` (Trabajador)
- `/src/app/components/sections/gerente/Calendario.tsx` (Gerente)
- `/src/app/components/sections/trabajador/Calendario.tsx` (Trabajador)

**Modales:**
- `/src/app/components/modals/EventModal.tsx` ← Detecta flujo RRHH
- `/src/app/components/modals/ReportarIncidenciaModal.tsx` ← Flujo incidencias
- `/src/app/components/modals/ProponerVacacionesModal.tsx` ← Trabajador
- `/src/app/components/modals/AsignarVacacionesModal.tsx` ← Gerente

**Vistas especializadas:**
- `/src/app/components/equipo/FichajesView.tsx`
- `/src/app/components/equipo/VacationsViewOptimized.tsx`
- `/src/app/components/equipo/PlanificacionHorariaGeneralMejorada.tsx`

**Reglas de negocio:**
- `/src/app/utils/rrhhRules.ts` ← **ARCHIVO CRÍTICO**

### Interfaces de datos:

```typescript
// Incidencia
{
  id: string
  employeeId: string
  tipo: 'ausencia' | 'enfermedad' | 'retraso' | 'falta_justificada' | 'otro'
  fechaInicio: string
  fechaFin: string | null
  comentario: string
  documento: File | null
  origen: 'fichaje' | 'calendario' | 'sistema'
  estado: 'activa' | 'resuelta' | 'rechazada'
  notificadoGerente: boolean
  visiblePara: ['trabajador', 'gerente']
  admiteInvitados: false
}

// Solicitud de Vacaciones
{
  id: string
  employeeId: string
  startDate: string
  endDate: string
  days: number
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  origen: 'trabajador_propone' | 'gerente_asigna'
  fechaCreacion: string
  fechaRespuesta?: string
  respondidoPor?: string
}

// Fichaje
{
  id: string
  employeeId: string
  fecha: string
  entrada: string | null
  salida: string | null
  horas: string
  device: 'mobile' | 'tablet' | 'web' | null
  geo: boolean
  estado: 'activo' | 'completo' | 'sin-fichar'
  bloqueado: boolean
  motivoBloqueo?: 'incidencia' | 'vacaciones'
  incidenciaId?: string
}
```

---

## 🔐 REGLAS DE MODIFICACIÓN

### ✅ Permitido SIN revisión:
- Ajustes de UI/UX (colores, espaciados, responsive)
- Corrección de bugs que no afecten flujos
- Optimizaciones de rendimiento
- Mejoras de accesibilidad

### ⚠️ Requiere REVISIÓN:
- Nuevos campos en formularios
- Cambios en validaciones
- Modificación de estados de datos
- Nuevos flujos de aprobación

### ❌ PROHIBIDO sin aprobación de arquitectura:
- Crear nuevas pantallas RRHH
- Modificar `/src/app/utils/rrhhRules.ts`
- Cambiar los flujos cerrados
- Agregar nuevos roles o permisos
- Modificar la estructura de datos

---

## 🚀 PREPARACIÓN PARA BACKEND

### Estado actual:
- ✅ Flujos definidos y validados en frontend
- ✅ Reglas de negocio documentadas
- ✅ Interfaces de datos estandarizadas
- ✅ Validaciones implementadas
- ⏳ Persistencia: localStorage (temporal)
- ⏳ Notificaciones: console.log/alert (temporal)

### Integración Supabase (siguiente fase):

**Tablas requeridas:**
```sql
-- employees (ya existe en mockData)
-- incidencias
CREATE TABLE incidencias (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  tipo VARCHAR(50),
  fecha_inicio DATE,
  fecha_fin DATE,
  comentario TEXT,
  documento_url TEXT,
  origen VARCHAR(20),
  estado VARCHAR(20),
  fecha_creacion TIMESTAMP,
  notificado_gerente BOOLEAN
);

-- solicitudes_vacaciones
CREATE TABLE solicitudes_vacaciones (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  start_date DATE,
  end_date DATE,
  days INTEGER,
  reason TEXT,
  status VARCHAR(20),
  origen VARCHAR(30),
  fecha_creacion TIMESTAMP,
  fecha_respuesta TIMESTAMP,
  respondido_por UUID REFERENCES employees(id)
);

-- fichajes
CREATE TABLE fichajes (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  fecha DATE,
  entrada TIME,
  salida TIME,
  device VARCHAR(20),
  geo BOOLEAN,
  estado VARCHAR(20),
  bloqueado BOOLEAN,
  motivo_bloqueo VARCHAR(30),
  incidencia_id UUID REFERENCES incidencias(id)
);

-- horarios
CREATE TABLE horarios (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  semana VARCHAR(20),
  dia_index INTEGER,
  turno_inicio TIME,
  turno_fin TIME,
  horas DECIMAL,
  estado VARCHAR(20)
);
```

### Endpoints a implementar:

**Incidencias:**
- `POST /api/incidencias` → Crear incidencia
- `GET /api/incidencias?employeeId={id}` → Listar por trabajador
- `GET /api/incidencias?fecha={date}` → Validar día ocupado
- `PATCH /api/incidencias/{id}` → Resolver/rechazar

**Vacaciones:**
- `POST /api/vacaciones` → Crear solicitud
- `GET /api/vacaciones?employeeId={id}` → Listar por trabajador
- `PATCH /api/vacaciones/{id}/aprobar` → Aprobar solicitud
- `PATCH /api/vacaciones/{id}/rechazar` → Rechazar solicitud
- `GET /api/vacaciones/balance/{employeeId}` → Balance anual

**Fichajes:**
- `POST /api/fichajes` → Registrar entrada/salida
- `GET /api/fichajes?employeeId={id}&fecha={date}` → Fichajes del día
- `GET /api/fichajes/bloqueados?employeeId={id}` → Días bloqueados

**Horarios:**
- `POST /api/horarios` → Crear/actualizar horario
- `GET /api/horarios?employeeId={id}&semana={week}` → Horario semanal
- `PATCH /api/horarios/{id}/publicar` → Publicar horario

---

## 📊 MÉTRICAS Y KPIs

### KPIs implementados:

**Fichajes (Gerente):**
- Fichados hoy / Total empleados
- % Puntualidad
- Incidencias detectadas

**Vacaciones (Gerente):**
- Días usados / disponibles / pendientes
- Solicitudes pendientes de aprobación
- Balance por trabajador

**Horarios (Gerente):**
- % Progreso de planificación
- Horas planificadas vs contratadas
- Incidencias de cobertura

---

## 🎓 FORMACIÓN Y DOCUMENTACIÓN

### Documentos relacionados:
1. **Análisis previo:** Documento de análisis arquitectura RRHH (entregado previamente)
2. **Reglas de negocio:** `/src/app/utils/rrhhRules.ts` (con comentarios extensos)
3. **Este documento:** Cierre oficial de arquitectura

### Onboarding para nuevos desarrolladores:
1. Leer este documento completo
2. Revisar `/src/app/utils/rrhhRules.ts`
3. Probar flujos en la aplicación:
   - Crear incidencia desde calendario
   - Solicitar vacaciones
   - Fichar entrada/salida
   - Planificar horarios
4. No modificar flujos cerrados sin consultar arquitectura

---

## ✅ CHECKLIST DE CIERRE

- [x] Flujos de incidencias validados y cerrados
- [x] Flujos de vacaciones simplificados (2 flujos únicamente)
- [x] Botón "Proponer" del gerente eliminado
- [x] Reglas de negocio documentadas en código
- [x] EventModal detecta flujo RRHH correctamente
- [x] Calendario trabajador conectado a ReportarIncidenciaModal
- [x] Interfaces de datos estandarizadas
- [x] Validaciones implementadas
- [x] Documento de cierre creado
- [x] Preparación para Supabase documentada

---

## 📝 REGISTRO DE CAMBIOS

| Fecha | Versión | Cambio | Autor |
|-------|---------|--------|-------|
| 17/01/2026 | 1.0.0 | Cierre inicial de arquitectura RRHH | Sistema Vertial |
| 17/01/2026 | 1.0.0 | Eliminación flujo "Gerente propone" en vacaciones | Sistema Vertial |
| 17/01/2026 | 1.0.0 | Implementación reglas negocio en rrhhRules.ts | Sistema Vertial |
| 17/01/2026 | 1.0.0 | Conexión Calendario Trabajador con incidencias | Sistema Vertial |

---

## 📞 CONTACTO Y SOPORTE

Para consultas sobre la arquitectura cerrada del módulo RRHH:
- Revisar este documento primero
- Consultar `/src/app/utils/rrhhRules.ts`
- Si persisten dudas, escalar a arquitectura de sistema

---

**FIN DEL DOCUMENTO**

*Arquitectura cerrada y validada para producción.*  
*Última actualización: 17 de Enero de 2026*

