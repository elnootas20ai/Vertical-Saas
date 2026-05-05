# HORARIOS - Documentación Técnica

## Contexto General

El módulo de Horarios está diseñado para gestionar la planificación de turnos de trabajadores en Vertial, un SaaS B2B multiempresa y multivertical.

## Información Importante para el Programador

### ⚠️ Incidencias de Último Momento

**Definición:**
Las **incidencias de último momento** son eventos no planificados que afectan horarios ya publicados. Son **informativas** y **no bloquean** la planificación horaria.

**Tipos de incidencias:**
- **Baja médica**: Presentada por el trabajador, registrada automáticamente
- **Cambio de turno**: Modificación tras publicación de horarios (origen: Gerente)
- **Ausencia**: Solicitud por asunto personal (origen: Trabajador)

**Comportamiento:**
- Las incidencias NO impiden que el gerente planifique nuevos turnos
- Son elementos informativos que ayudan al gerente a tomar decisiones
- Todas quedan registradas con trazabilidad completa (usuario, fecha, origen)

### 🔄 Estados de Horarios

**Borrador:**
- Horarios guardados pero no notificados
- Pueden modificarse libremente sin generar registro de auditoría
- No se envían notificaciones a trabajadores

**Publicado:**
- Horarios confirmados y notificados a los trabajadores
- Cualquier cambio posterior se marca como "Cambio de último momento"
- Genera registro de auditoría legal
- Los trabajadores deben confirmar recepción según normativa

### 🏢 Centro de Trabajo

**Campo obligatorio:**
- Cada planificación debe estar asociada a un centro de trabajo específico
- Restricción automática: los turnos no pueden exceder el horario de apertura del centro
- El sistema debe mostrar advertencia si se intenta superar el horario

### 📊 Vista del Empleado Individual

**Componente: `SchedulesViewPRO`**

Cuando se visualiza desde el detalle de un trabajador individual:
- Mostrar vista diaria con carrusel
- NO mostrar contador de "X trabajadores" (es redundante para vista individual)
- Mostrar solo las horas totales del día
- Permitir navegación día a día con indicadores visuales

### 🔐 Permisos y Roles

**Gerente:**
- Puede crear, modificar y publicar horarios
- Puede realizar cambios de último momento
- Ve todas las incidencias

**Trabajador:**
- Solo visualiza sus propios horarios
- Puede reportar incidencias (ausencias, bajas)
- Debe confirmar recepción de horarios publicados

**Gestoría/RRHH:**
- Acceso completo a todos los horarios
- Puede gestionar incidencias complejas

### 📱 Responsive Design

**Breakpoints obligatorios:**
- ≤768px: Vista móvil con navegación simplificada
- 768-1024px: Vista tablet
- ≥1024px: Vista desktop completa

### 🎨 Componentes UI

**Gradient Card:**
- Fondo: `bg-gradient-to-br from-blue-500 to-purple-600`
- Border radius: `rounded-2xl`
- Indicadores de días: líneas blancas con opacidad

**Tarjetas de Turno:**
- Fondo blanco con borde gris
- Hover: `shadow-md`
- Icono de reloj en círculo azul claro

**Botón Añadir Turno:**
- Border dashed azul
- Hover: fondo azul claro + border sólido

### 🔗 Integración Futura con Supabase

**Tablas necesarias:**
```sql
-- Horarios
schedules (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  work_center_id UUID REFERENCES work_centers(id),
  date DATE,
  shifts JSONB, -- Array de turnos con start, end, hours
  status TEXT CHECK (status IN ('borrador', 'publicado')),
  published_at TIMESTAMP,
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
)

-- Incidencias
incidents (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  schedule_id UUID REFERENCES schedules(id),
  type TEXT CHECK (type IN ('sick-leave', 'shift-change', 'absence')),
  date DATE,
  origin TEXT CHECK (origin IN ('Sistema', 'Gerente', 'Trabajador')),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
)
```

### 📝 Validaciones Necesarias

1. **Horario del centro**: Los turnos no pueden estar fuera del horario de apertura
2. **Horas máximas**: Validar límites legales de horas semanales (40h estándar España)
3. **Descansos**: Mínimo 12h entre jornadas
4. **Publicación**: Confirmar que se notificará a todos los trabajadores

### 🚀 Próximos Pasos Recomendados

1. Implementar edición real de turnos (actualmente solo alerts)
2. Conectar con backend Supabase
3. Añadir sistema de notificaciones push/email
4. Implementar confirmación de recepción por trabajadores
5. Añadir exportación de horarios (PDF, Excel)
6. Dashboard de estadísticas de horas trabajadas

---

**Última actualización**: Enero 2025  
**Versión**: 1.0  
**Desarrollado para**: Vertial - SaaS B2B Multiempresa
