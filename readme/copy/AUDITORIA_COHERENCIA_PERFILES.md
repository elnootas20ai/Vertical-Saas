# 🔍 AUDITORÍA DE COHERENCIA ENTRE PERFILES GERENTE Y TRABAJADOR
## UDAR 360 - SaaS B2B Multiempresa y Multivertical

**Fecha:** 11 de enero de 2026
**Versión:** 1.0

---

## 📋 RESUMEN EJECUTIVO

Esta auditoría revisa la coherencia entre el **Perfil Gerente** y el **Perfil Trabajador** para asegurar que:
1. El Gerente tenga visibilidad de toda la información generada por los trabajadores
2. No existan funcionalidades huérfanas o datos sin relación lógica
3. El flujo de información sea jerárquico y coherente
4. Los datos mostrados sean consistentes entre ambos perfiles

---

## ✅ SECCIONES COHERENTES Y CORRECTAS

### 1. **OPERATIVA (Gerente) ↔ MI TRABAJO (Trabajador)**
**Estado:** ✅ COHERENTE

**Trabajador (Mi Trabajo):**
- Ve pedidos/órdenes/tareas asignados específicamente a él
- Adaptado por vertical (delivery, taller, construcción)
- Puede actualizar estado de sus tareas

**Gerente (Operativa):**
- Ve TODOS los pedidos/órdenes/obras de la empresa
- Métricas agregadas (pedidos activos, en progreso, completados)
- Tablas con todos los trabajos operativos
- Adaptado por vertical (igual que trabajador)

**✓ Flujo lógico:** El trabajador ve su trabajo individual → El gerente ve todo el trabajo operativo agregado

---

### 2. **CALENDARIO**
**Estado:** ✅ COHERENTE

**Ambos perfiles tienen calendario:**
- `/src/app/components/sections/gerente/Calendario.tsx`
- `/src/app/components/sections/trabajador/Calendario.tsx`

**✓ Coherencia confirmada:** Ambos tienen calendarios propios (el gerente probablemente ve eventos de equipo, el trabajador ve sus propios turnos/eventos)

---

### 3. **DOCUMENTACIÓN**
**Estado:** ✅ COHERENTE

**Trabajador:**
- `/src/app/components/sections/trabajador/DocumentacionTrabajador.tsx`
- Ve sus propios documentos (contratos, nóminas, certificados)
- Puede solicitar documentos

**Gerente:**
- `/src/app/components/sections/Documentacion.tsx`
- Gestión de documentación de empresa y trabajadores
- Vista global de todos los documentos

**✓ Flujo lógico:** Trabajador accede a sus documentos → Gerente gestiona todos los documentos

---

### 4. **ONBOARDING**
**Estado:** ✅ COHERENTE

**Trabajador:**
- `/src/app/components/sections/trabajador/MiOnboarding.tsx`
- Ve su propio proceso de onboarding
- Cursos, bienvenida, tareas iniciales

**Gerente:**
- `/src/app/components/sections/gerente/Onboarding.tsx`
- Gestiona onboarding de todos los trabajadores nuevos
- Asigna cursos, revisa progreso

**✓ Flujo lógico:** Trabajador completa su onboarding → Gerente supervisa todos los onboardings

---

### 5. **CHATS**
**Estado:** ✅ COHERENTE CON PRIVACIDAD

**Trabajador:**
- `/src/app/components/sections/trabajador/Chats.tsx`
- Chats privados con compañeros y gerente

**Gerente:**
- `/src/app/components/sections/gerente/ChatsGerente.tsx`
- Chats con todo el equipo (pero sin acceso a chats privados entre trabajadores)

**✓ Flujo lógico:** Privacidad respetada, el gerente NO debe ver chats privados entre trabajadores

---

## ⚠️ INCONSISTENCIAS DETECTADAS Y RECOMENDACIONES

### 🔴 **CRÍTICO 1: FICHAJE (Trabajador) SIN SUPERVISIÓN COMPLETA DEL GERENTE**

**Problema identificado:**

**Trabajador tiene:**
- `/src/app/components/sections/trabajador/Fichaje.tsx`
- Fichar entrada/salida
- Historial de fichajes (con dispositivo, geolocalización, horas)
- Horario semanal
- Solicitud de vacaciones
- KPIs: horas trabajadas, puntualidad, consumos

**Gerente tiene:**
- `/src/app/components/sections/Equipo.tsx` con subsecciones:
  - ✅ **Equipo > Horarios:** Gestión de horarios y turnos (CORRECTO)
  - ✅ **Equipo > Vacaciones:** Vista de vacaciones de todos (CORRECTO)
  - ❌ **FALTA:** Vista de fichajes individuales de cada trabajador
  - ❌ **FALTA:** Historial de entradas/salidas de cada trabajador
  - ❌ **FALTA:** KPIs de puntualidad individual por trabajador
  - ❌ **FALTA:** Aprobación de solicitudes de vacaciones

**🔧 Recomendación:**
```
AÑADIR en /src/app/components/equipo/:
1. FichajesView.tsx → Ver fichajes de todos los trabajadores
2. En EmployeeDetailPanel.tsx → Añadir tab "Fichaje" con:
   - Historial de entradas/salidas del trabajador
   - KPIs de puntualidad
   - Horas trabajadas vs programadas
   - Gráfico de asistencia

3. En VacationsViewOptimized.tsx → Añadir:
   - Botón "Aprobar/Rechazar" para solicitudes pendientes
   - Notificaciones al trabajador cuando se apruebe/rechace
```

---

### 🟠 **CRÍTICO 2: GASTOS (Trabajador) SIN PROCESO DE APROBACIÓN COMPLETO**

**Problema identificado:**

**Trabajador tiene:**
- `/src/app/components/sections/trabajador/MisGastos.tsx`
- Crear gastos con categorías (transporte, comida, alojamiento, material, otros)
- Adjuntar justificantes (tickets, facturas)
- Ver estado: pendiente, aprobado, rechazado
- Ver motivo de rechazo

**Gerente tiene:**
- `/src/app/components/equipo/ExpensesViewOptimized.tsx`
- Vista de gastos de trabajadores
- Filtros por estado, tipo, empleado
- ❌ **FALTA:** Interfaz clara de APROBACIÓN/RECHAZO
- ❌ **FALTA:** Campo para añadir motivo de rechazo
- ❌ **FALTA:** Notificaciones al trabajador

**🔧 Recomendación:**
```
MODIFICAR /src/app/components/equipo/ExpensesViewOptimized.tsx:

1. Añadir para cada gasto pendiente:
   - Botón "Aprobar" (verde)
   - Botón "Rechazar" (rojo) → Abre modal para escribir motivo
   
2. Añadir vista previa del justificante adjunto

3. Añadir modal de confirmación:
   - "¿Estás seguro de aprobar este gasto de 45.50€?"
   - Al aprobar → Cambiar estado a "aprobado" y notificar al trabajador
   - Al rechazar → Guardar motivo y notificar al trabajador

4. Añadir KPIs en el header:
   - Total gastos pendientes de aprobación
   - Total aprobado este mes
   - Comparativa con mes anterior
```

---

### 🟡 **MEDIO: TAREAS INDIVIDUALES (Mi Trabajo) SIN VISTA DETALLADA EN GERENTE**

**Problema identificado:**

**Trabajador ve:** (en Mi Trabajo)
- Pedidos asignados específicamente a él
- Órdenes de trabajo en su nombre
- Tareas de obra asignadas

**Gerente ve:** (en Operativa)
- Vista general de TODOS los pedidos/órdenes/obras
- ❌ **FALTA:** Filtro "Ver solo tareas de [Trabajador X]"
- ❌ **FALTA:** Vista de carga de trabajo individual por trabajador

**🔧 Recomendación:**
```
MODIFICAR /src/app/components/sections/Operativa.tsx:

1. Añadir filtro dropdown "Ver tareas de:" con lista de trabajadores
2. Al seleccionar un trabajador → Mostrar solo sus tareas (igual que ve el trabajador)

AÑADIR en /src/app/components/equipo/EmployeeDetailPanel.tsx:
- Nuevo tab "Tareas Asignadas" que muestre:
  - Tareas activas del trabajador
  - Estado de cada tarea
  - Histórico de tareas completadas
  - Carga de trabajo actual
```

---

### 🟡 **MEDIO: CONSUMOS EN FICHAJE SIN DETALLE EN GERENTE**

**Problema identificado:**

**Trabajador ve:** (en Fichaje)
- KPI de "Consumos" → 42,50€ este mes
- (Probablemente consumiciones en cafetería/restaurante de empresa)

**Gerente:**
- ❌ **NO EXISTE** vista de consumos de trabajadores
- ❌ **FALTA:** Detalle de qué son estos consumos
- ❌ **FALTA:** Total de consumos por trabajador

**🔧 Recomendación:**
```
OPCIÓN 1: Si los consumos son gastos de empresa (cafetería interna)
- Añadir en Equipo > Gastos una categoría "Consumos internos"
- Vista separada de consumos vs gastos reembolsables

OPCIÓN 2: Si los consumos son ticket restaurante
- Crear subsección "Equipo > Consumos" con:
  - Total consumos por trabajador
  - Gráfico de uso de ticket restaurante
  - Límites y alertas
```

---

## 🔵 RECOMENDACIONES DE MEJORA ADICIONALES

### **1. NOTIFICACIONES BIDIRECCIONALES**

**Actualmente:** No existe sistema visible de notificaciones

**Recomendación:**
```
CREAR /src/app/components/notifications/NotificationCenter.tsx

CASOS DE USO:
Trabajador → Gerente:
- "Nueva solicitud de vacaciones de [Trabajador]"
- "Nuevo gasto subido por [Trabajador] - 45.50€"
- "Consulta urgente enviada por [Trabajador]"

Gerente → Trabajador:
- "Tu solicitud de vacaciones ha sido aprobada"
- "Tu gasto de 45.50€ ha sido rechazado: [motivo]"
- "Nuevo documento disponible: Nómina Diciembre 2025"
- "Nuevo turno asignado para mañana"
```

---

### **2. DASHBOARD DEL GERENTE CON ALERTAS**

**Actualmente:** Dashboard existe pero sin alertas críticas

**Recomendación:**
```
MODIFICAR /src/app/components/sections/Dashboard.tsx

AÑADIR sección "Acciones Pendientes":
- [ ] 3 gastos pendientes de aprobar (157,60€ total)
- [ ] 2 solicitudes de vacaciones pendientes
- [ ] 1 consulta urgente sin responder
- [ ] 5 trabajadores con puntualidad <90%
```

---

### **3. LOGS DE ACTIVIDAD**

**Actualmente:** No existe historial de acciones

**Recomendación:**
```
CREAR subsección en Equipo > "Actividad"

Mostrar log de actividad del trabajador:
- 10/01/2026 18:30 - Subió gasto: Taxi a obra (24.50€)
- 10/01/2026 16:45 - Fichó salida
- 10/01/2026 08:02 - Fichó entrada
- 08/01/2026 21:00 - Solicitó vacaciones (15-19 Feb)
- 05/01/2026 10:30 - Completó curso "Seguridad en Obra"
```

---

## 📊 TABLA DE COHERENCIA FINAL

| FUNCIONALIDAD | TRABAJADOR | GERENTE | COHERENCIA | ACCIÓN REQUERIDA |
|---------------|------------|---------|------------|------------------|
| **Operativa / Mi Trabajo** | ✅ Ve sus tareas | ✅ Ve todas las tareas | ✅ CORRECTO | Añadir filtro por trabajador |
| **Calendario** | ✅ Su calendario | ✅ Calendario general | ✅ CORRECTO | Ninguna |
| **Fichaje** | ✅ Completo | ⚠️ Solo horarios y vacaciones | 🔴 **CRÍTICO** | **Añadir vista de fichajes** |
| **Gastos** | ✅ Puede crear | ⚠️ Solo visualiza | 🔴 **CRÍTICO** | **Añadir aprobación/rechazo** |
| **Vacaciones** | ✅ Puede solicitar | ⚠️ Solo visualiza | 🟠 **MEDIO** | **Añadir aprobación** |
| **Documentación** | ✅ Ve sus docs | ✅ Gestiona todos | ✅ CORRECTO | Ninguna |
| **Onboarding** | ✅ Su proceso | ✅ Gestiona todos | ✅ CORRECTO | Ninguna |
| **Chats** | ✅ Chats privados | ✅ Chats con equipo | ✅ CORRECTO | Ninguna |
| **Consumos** | ✅ Ve sus consumos | ❌ No existe | 🟡 **MEDIO** | **Crear vista de consumos** |
| **Notificaciones** | ❌ No existe | ❌ No existe | 🟡 **MEJORA** | **Crear sistema notificaciones** |

---

## 🎯 PRIORIDADES DE IMPLEMENTACIÓN

### **🔴 PRIORIDAD ALTA (Implementar YA)**
1. **Gestión de Fichajes en Gerente**
   - Añadir `FichajesView.tsx` en equipo
   - Historial de fichajes por trabajador
   - KPIs de puntualidad

2. **Aprobación de Gastos**
   - Añadir botones Aprobar/Rechazar en `ExpensesViewOptimized.tsx`
   - Modal para motivo de rechazo
   - Actualización de estado en tiempo real

3. **Aprobación de Vacaciones**
   - Añadir botones Aprobar/Rechazar en `VacationsViewOptimized.tsx`
   - Notificación al trabajador

### **🟠 PRIORIDAD MEDIA (Próximas 2 semanas)**
4. **Sistema de Notificaciones**
   - Centro de notificaciones
   - Notificaciones en tiempo real
   - Badge con contador

5. **Vista de Consumos**
   - Gestión de consumos de trabajadores
   - Total por trabajador
   - Límites y alertas

### **🟡 PRIORIDAD BAJA (Mejora futura)**
6. **Logs de Actividad**
   - Historial de acciones del trabajador
   - Trazabilidad completa

7. **Filtros Avanzados en Operativa**
   - Filtro por trabajador en todas las vistas
   - Carga de trabajo individual

---

## 📝 CONCLUSIÓN

El sistema tiene una **base muy sólida** con buena coherencia en la mayoría de secciones. Los puntos críticos detectados son:

1. ✅ **Lo que funciona bien:** Operativa, Documentación, Onboarding, Calendarios, Chats
2. ⚠️ **Lo que necesita mejoras urgentes:** Fichajes, Gastos, Vacaciones (todos necesitan aprobación del gerente)
3. 💡 **Lo que mejoraría la UX:** Notificaciones, Logs de actividad, Filtros avanzados

**Recomendación final:** Implementar las 3 prioridades ALTAS antes de continuar con nuevas funcionalidades, para asegurar que el flujo de información jerárquico sea completo y coherente.

---

**Preparado por:** Asistente de Auditoría UDAR 360
**Fecha:** 11 de enero de 2026
