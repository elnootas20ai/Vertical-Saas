# 📋 AUDITORÍA DE ARQUITECTURA UX & LÓGICA – RRHH AVANZADO

**Sistema:** Vertial  
**Módulo:** RRHH Avanzado (Multipaís)  
**Fecha:** 13 de Enero de 2026  
**Alcance:** Empleados, Horarios, Turnos, Fichajes, Coste, Relación Gerente↔Trabajador

---

## 1️⃣ MAPA DE PANTALLAS EXISTENTES

### **Perfil GERENTE**

| Pantalla | Rol | Acción Principal | Acción Secundaria |
|----------|-----|------------------|-------------------|
| **Equipo → Equipo** | Gerente | Ver lista de trabajadores (cards/tabla) | Añadir trabajador, Ver detalle, Ordenar |
| **Equipo → Horarios** | Gerente | Visualizar/editar horarios semanales por empleado | Cambiar centro de trabajo, Navegar semanas |
| **Equipo → Vacaciones** | Gerente | Aprobar/rechazar solicitudes de vacaciones | Ver balance anual, Asignar vacaciones, Filtrar por estado |
| **Equipo → Gastos** | Gerente | Aprobar/rechazar gastos de empleados | Ver justificantes, Filtrar por estado |
| **Equipo → Fichajes** | Gerente | Revisar fichajes diarios del equipo | Ver incidencias, Filtrar por estado, Ver KPIs |
| **Equipo → Consumos** | Gerente | Visualizar consumos de productos por empleado | Filtrar por fecha, Ver totales |
| **Detalle Empleado → General** | Gerente | Ver información completa del empleado | Editar datos, Enviar mensaje |
| **Detalle Empleado → Horarios** | Gerente | Ver horarios específicos del empleado | Editar turnos |
| **Detalle Empleado → Vacaciones** | Gerente | Ver vacaciones del empleado | Aprobar/rechazar pendientes |
| **Detalle Empleado → Historial** | Gerente | Ver historial de cambios del empleado | Filtrar por tipo |
| **Detalle Empleado → Gestoría** | Gerente | Ver/editar datos administrativos (NSS, CCC, etc.) | Subir documentos |
| **Detalle Empleado → Permisos** | Gerente | Ver permisos del empleado en el sistema | Asignar rol (solo UX, no funcional) |
| **Añadir Trabajador (Modal)** | Gerente | Alta rápida de nuevo trabajador | Enviar invitación por email |
| **Planificación Horaria General** | Gerente | Planificar horarios de todo el equipo semanalmente | Añadir turnos, Copiar horarios, Ver incidencias |
| **Calendario (Gerente)** | Gerente | Vista de calendario con eventos del equipo | Añadir evento, Filtrar por tipo |

### **Perfil TRABAJADOR**

| Pantalla | Rol | Acción Principal | Acción Secundaria |
|----------|-----|------------------|-------------------|
| **Inicio** | Trabajador | Ver resumen de hoy (tareas, horario, notificaciones) | Acceso rápido a fichaje |
| **Fichaje** | Trabajador | Fichar entrada/salida | Ver historial de fichajes, Solicitar vacaciones, Ver horario semanal |
| **Mi Trabajo** | Trabajador | Ver tareas asignadas y consumos | Registrar consumos |
| **Calendario** | Trabajador | Ver horarios planificados y vacaciones | - |
| **Mis Gastos** | Trabajador | Subir gastos con justificante | Ver estado de aprobación |
| **Mi Onboarding** | Trabajador | Completar datos personales requeridos | Subir documentación |
| **Documentación** | Trabajador | Ver documentos laborales (contratos, nóminas) | Descargar documentos |
| **Configuración** | Trabajador | Cambiar preferencias personales | Cambiar foto de perfil |
| **Chats** | Trabajador | Comunicarse con gerente/compañeros | - |

---

## 2️⃣ MAPA DE FLUJOS ACTUALES

### **FLUJO 1: Alta de Empleado (Gerente)**

**Inicio:** Click en "+ Añadir Trabajador"  
**Pasos:**
1. Modal de alta rápida se abre
2. Gerente introduce:
   - Nombre completo *
   - Email *
   - Teléfono (opcional)
   - Puesto/Función * (selector según vertical)
   - Tipo de contrato * (Indefinido, Temporal, Prácticas, Formación, Fijo Discontinuo)
   - Sueldo acordado * (€/mes)
   - Centro de trabajo / PDV *
3. Checkbox: "Enviar invitación al trabajador" (activado por defecto)
4. Click en "Añadir y Enviar Invitación"
**Final:** Empleado creado y recibe email para completar datos personales

**Observaciones:**
- Gerente solo introduce datos laborales imprescindibles
- Trabajador completa datos personales desde su perfil (onboarding)

---

### **FLUJO 2: Fichaje Diario (Trabajador)**

**Inicio:** Trabajador accede a pantalla "Fichaje"  
**Pasos:**
1. Sistema muestra botón "Fichar Entrada" o "Fichar Salida" según estado
2. Trabajador hace click en botón
3. Sistema registra:
   - Hora exacta
   - Dispositivo (móvil/tablet/web)
   - Geolocalización (si está activa)
4. Sistema muestra confirmación
**Final:** Fichaje registrado y visible en historial

**Observaciones:**
- Geolocalización capturada automáticamente (si hay permisos)
- Sistema detecta dispositivo usado
- No requiere validación manual del gerente en tiempo real

---

### **FLUJO 3: Edición de Horario (Gerente)**

**Inicio:** Gerente accede a "Equipo → Horarios" o detalle de empleado  
**Pasos:**
1. Selecciona centro de trabajo
2. Selecciona semana (navegación con flechas)
3. Selecciona día de la semana
4. Ve turnos existentes del empleado
5. Puede añadir nuevo turno:
   - Hora inicio
   - Hora fin
   - Nombre del turno (Turno 1, Turno 2)
6. Sistema calcula horas automáticamente
7. Puede marcar día como "Descanso"
**Final:** Horario actualizado para el empleado en esa semana

**Observaciones:**
- Soporte de turnos partidos (múltiples turnos por día)
- Vista por centro de trabajo
- Navegación semanal

---

### **FLUJO 4: Solicitud de Vacaciones (Trabajador → Gerente)**

**Inicio:** Trabajador accede a "Fichaje" → Click en "Solicitar Vacaciones"  
**Pasos:**
1. Modal de solicitud se abre
2. Trabajador introduce:
   - Fecha inicio *
   - Fecha fin *
   - Observaciones (opcional)
3. Sistema calcula días laborables
4. Sistema muestra balance disponible
5. Click en "Enviar Solicitud"
6. Sistema notifica al gerente
**Cambio de rol → Gerente:**
7. Gerente ve solicitud en "Equipo → Vacaciones"
8. Badge "Pendiente" visible
9. Gerente puede:
   - Aprobar (verde)
   - Rechazar (rojo)
10. Sistema notifica al trabajador
**Final:** Estado actualizado y visible para ambos

**Observaciones:**
- Balance de días se calcula automáticamente
- Filtrado por estado (pendiente, aprobado, rechazado)
- Vista de calendario mensual con vacaciones marcadas

---

### **FLUJO 5: Revisión de Fichajes por Gerente**

**Inicio:** Gerente accede a "Equipo → Fichajes"  
**Pasos:**
1. Ve KPIs del día:
   - Fichados hoy / Total empleados
   - % Puntualidad
   - Nº Incidencias
2. Ve tabla de fichajes:
   - Empleado
   - Fecha
   - Hora entrada
   - Hora salida
   - Horas totales
   - Dispositivo usado
   - Geolocalización (✓ o ✗)
   - Estado (Completo, Activo, Sin fichar)
   - Puntualidad (✓ o ✗)
3. Puede filtrar por:
   - Empleado
   - Estado (todos, activo, completo, sin fichar)
4. Puede buscar por nombre
**Final:** Gerente tiene vista completa de fichajes

**Observaciones:**
- No hay opción visible de "ajuste manual" en esta vista
- Existe componente `AjusteManualFichajeModal.tsx` (funcionalidad no implementada en UX)

---

## 3️⃣ MODELO DE ROLES (INFERIDO)

### **ROL: GERENTE**

**Acceso Total:**
- ✅ Ver todos los empleados de su empresa
- ✅ Añadir nuevos trabajadores
- ✅ Editar datos de empleados
- ✅ Ver/editar horarios de todos
- ✅ Aprobar/rechazar vacaciones
- ✅ Aprobar/rechazar gastos
- ✅ Ver fichajes de todos
- ✅ Ver consumos de todos
- ✅ Acceder a datos de gestoría (NSS, CCC, etc.)
- ✅ Subir documentos laborales
- ✅ Enviar mensajes a cualquier empleado
- ✅ Ver informes y KPIs
- ✅ Configurar empresa (marcas, PDV, calendario laboral)

**Restricciones:**
- ❌ No puede eliminar empleados (no hay botón visible)
- ❌ No puede cambiar permisos de sistema (UX presente pero no funcional)

---

### **ROL: TRABAJADOR**

**Acceso Limitado:**
- ✅ Ver su propio perfil
- ✅ Completar sus datos personales (onboarding)
- ✅ Fichar entrada/salida
- ✅ Ver su historial de fichajes
- ✅ Ver su horario semanal planificado
- ✅ Solicitar vacaciones
- ✅ Ver sus vacaciones (aprobadas, pendientes)
- ✅ Subir gastos con justificante
- ✅ Ver estado de aprobación de gastos
- ✅ Ver documentos laborales (contratos, nóminas)
- ✅ Ver tareas asignadas
- ✅ Registrar consumos
- ✅ Enviar mensajes al gerente

**Restricciones:**
- ❌ No puede ver otros empleados
- ❌ No puede editar horarios
- ❌ No puede aprobar nada
- ❌ No puede acceder a configuración de empresa
- ❌ No puede ver datos de gestoría propios (NSS, CCC)
- ❌ No puede ver KPIs generales

---

## 4️⃣ REGLAS IMPLÍCITAS DETECTADAS

### **A. FICHAJES**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Fichaje obligatorio** | Sistema asume que todos los empleados deben fichar | Vista "Fichajes" con estado "Sin fichar" como incidencia |
| **Geolocalización capturada** | Sistema registra coordenadas GPS en cada fichaje | Campo `geo: true/false` en mock data |
| **Dispositivo registrado** | Sistema identifica móvil/tablet/web | Campo `device: 'mobile' | 'tablet' | 'web'` |
| **Entrada y salida requeridas** | Día completo = entrada + salida | Badge "Completo" vs "Activo" (solo entrada) |
| **Puntualidad calculada automáticamente** | Sistema compara hora real vs planificada | Campo `puntual: true/false` |
| **KPI de puntualidad global** | % de fichajes puntuales del equipo | Cálculo en FichajesView.tsx línea 106 |

---

### **B. HORARIOS Y TURNOS**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Horarios por centro de trabajo** | Cada empleado tiene horarios en un PDV específico | Selector de centro en SchedulesViewPRO.tsx |
| **Turnos partidos permitidos** | Un día puede tener múltiples turnos | `shifts: []` array en dailySchedules |
| **Planificación semanal** | Horarios se gestionan por semana completa | Navegación de semanas con ChevronLeft/Right |
| **Horas totales calculadas automáticamente** | Sistema suma horas de todos los turnos | `totalHours` calculado en SchedulesViewPRO |
| **Día de descanso explícito** | Se marca como "Descanso", no ausencia de horario | `isRest: true` en dailySchedules |
| **Semana de L-D** | Vista semanal siempre empieza en Lunes | Array días: `['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']` |

---

### **C. VACACIONES**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Balance anual fijo: 22 días** | Todos los empleados tienen 22 días anuales | `totalAnnualDays = 22` en VacationsViewOptimized |
| **Solicitud requiere aprobación** | Trabajador propone, gerente aprueba | Estado: `pending`, `approved`, `rejected` |
| **Cálculo de días automático** | Sistema calcula días laborables entre fechas | Funcionalidad presente en modal |
| **Balance descontado al aprobar** | Días aprobados restan del balance | `usedDays` calculado con `status === 'approved'` |
| **Notificación bidireccional** | Trabajador notificado de decisión gerente | Campo `notifyWorker` en configuración |

---

### **D. CONFIGURACIÓN DE FICHAJES (Empresa)**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Margen de cortesía configurable** | 0, 5, 10 o 15 minutos antes de hora planificada | Opciones en ConfiguracionFichajes.tsx línea 89 |
| **Comportamiento entrada temprana** | "Ajustar a planificado" o "Usar hora real" | `entryBehavior: 'adjust' | 'real'` línea 18 |
| **Margen salida configurable** | 0, 5, 10 o 15 minutos después de hora planificada | Opciones línea 89 |
| **Comportamiento salida tardía** | "Ajustar" o "Contar horas extra" | `exitBehavior: 'adjust' | 'overtime'` línea 20 |
| **Cierre automático fichajes incompletos** | Si no se ficha salida tras X horas | `maxTimeWithoutExit` línea 21 (60 min default) |
| **Acción por fichaje incompleto** | "Auto-cerrar" o "Crear incidencia" | `incompleteAction: 'auto-close' | 'incident'` |
| **Notificaciones configurables** | A trabajador y/o gerente | `notifyWorker`, `notifyManager` líneas 23-24 |

---

### **E. DATOS LABORALES**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Tipo de contrato español** | Indefinido, Temporal, Prácticas, Formación, Fijo Discontinuo | Opciones en AddEmployeeModal.tsx líneas 149-154 |
| **Sueldo en €/mes** | Siempre mensual, moneda euro | Campo con sufijo "€/mes" línea 170 |
| **Centro de trabajo obligatorio** | Empleado siempre asignado a un PDV | Campo requerido línea 177 |
| **Puestos según vertical** | Lista diferente para delivery/taller/construcción | `rolesByVertical` líneas 16-37 |
| **Email profesional separado** | Dos emails: personal y corporativo | Campos `email` y `professionalEmail` en mockData |

---

### **F. DATOS DE GESTORÍA (ESPAÑA)**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **NSS (Número Seguridad Social)** | 12 dígitos | Campo `nss: '123456789012'` mockData línea 76 |
| **Grupo de Cotización** | Número de grupo SS | Campo `cotizationGroup: '7'` línea 77 |
| **CCC Empresa** | 20 dígitos, Código Cuenta Cotización | Campo `cccEmpresa` línea 82 |
| **% IRPF** | Retención fiscal | Campo `irpfPercentage: 15` línea 83 |
| **Código de contrato** | Código numérico SS | Campo `contractCode: '100'` línea 78 |
| **Coeficiente parcialidad** | Para contratos tiempo parcial | Campo `partialityCoefficient: '1.0'` línea 79 |
| **Mutua** | Entidad aseguradora AT/EP | Campo `mutua: 'Mutua Universal - MAZ'` línea 81 |
| **Fecha alta SS** | Fecha registro Seguridad Social | Campo `ssStartDate: '01/01/2023'` línea 80 |

---

### **G. ONBOARDING**

| Regla | Descripción | Evidencia en Código |
|-------|-------------|---------------------|
| **Invitación por email** | Trabajador recibe link para completar datos | Checkbox "Enviar invitación" en AddEmployeeModal |
| **Datos mínimos por gerente** | Solo datos laborales obligatorios | Modal de alta rápida (no wizard completo) |
| **Datos personales por trabajador** | DNI, dirección, IBAN, etc. lo completa él mismo | Referencia a "onboarding" en MiOnboarding.tsx |
| **Estado de onboarding** | Campo `onboardingStatus: 'activo' | 'pendiente'` | Campo en Employee type |

---

## 5️⃣ ANÁLISIS MULTIPAÍS

### **A. DATOS PERSONALES**

| Campo | ¿Neutral? | Motivo | Tipo |
|-------|-----------|--------|------|
| **Nombre completo** | ✅ Sí | Universal | - |
| **Email** | ✅ Sí | Universal | - |
| **Teléfono** | ⚠️ Parcial | Formato español (+34) hardcoded en UX | UX |
| **DNI** | ❌ No | Exclusivo de España (NIF/NIE). Otros países: ID, CPF, SSN, etc. | Legal |
| **Lugar de nacimiento** | ✅ Sí | Universal | - |
| **Nacionalidad** | ✅ Sí | Universal | - |
| **Dirección** | ✅ Sí | Universal | - |
| **Código Postal** | ⚠️ Parcial | Formato varía (5 dígitos ES, ZIP+4 USA, etc.) | Técnica |
| **País** | ✅ Sí | Universal | - |
| **IBAN** | ⚠️ Parcial | Europeo. USA usa routing + account number | Legal |

---

### **B. DATOS LABORALES**

| Campo | ¿Neutral? | Motivo | Tipo |
|-------|-----------|--------|------|
| **Puesto/Función** | ✅ Sí | Configurable por vertical | - |
| **Tipo de contrato** | ❌ No | Tipos españoles (Indefinido, Fijo Discontinuo, etc.) | Legal |
| **Sueldo** | ⚠️ Parcial | Siempre "€/mes". Otros países: USD, semanal, hora, etc. | UX + Legal |
| **Centro de trabajo** | ✅ Sí | Universal (PDV/sucursal) | - |
| **Jornada** | ⚠️ Parcial | Campo genérico pero ligado a horas semanales | Legal |
| **Horas semanales** | ⚠️ Parcial | España: 40h máx. Otros: 48h (UK), 35h (Francia), etc. | Legal |
| **Categoría profesional** | ⚠️ Parcial | Terminología de convenios españoles | Legal |
| **Convenio** | ❌ No | Exclusivo España (Convenios Colectivos) | Legal |
| **Fecha de inicio** | ✅ Sí | Universal | - |

---

### **C. DATOS DE GESTORÍA**

| Campo | ¿Neutral? | Motivo | Tipo |
|-------|-----------|--------|------|
| **NSS (Nº Seg. Social)** | ❌ No | Específico España. Otros: SSN (USA), NI (UK), etc. | Legal |
| **Grupo Cotización** | ❌ No | Sistema español Seguridad Social (grupos 1-11) | Legal |
| **Código de contrato** | ❌ No | Códigos SEPE España (100, 200, etc.) | Legal |
| **CCC Empresa** | ❌ No | Código Cuenta Cotización español (20 dígitos) | Legal |
| **Coeficiente parcialidad** | ⚠️ Parcial | Concepto existe pero formato varía | Legal |
| **Mutua** | ❌ No | Sistema español mutuas laborales | Legal |
| **% IRPF** | ❌ No | Retención fiscal española. Otros: Tax bracket, etc. | Legal |

---

### **D. FICHAJES**

| Regla/Campo | ¿Neutral? | Motivo | Tipo |
|-------------|-----------|--------|------|
| **Fichaje obligatorio** | ⚠️ Parcial | Obligatorio en España (RD 2019). No en todos los países | Legal |
| **Geolocalización** | ⚠️ Parcial | Legal en España con consentimiento. Prohibido en algunos países | Legal |
| **Registro dispositivo** | ✅ Sí | Técnico, universal | - |
| **Margen cortesía (5-15 min)** | ⚠️ Parcial | Tolerado en ES. Ilegal en países con control estricto (Alemania) | Legal |
| **Ajuste automático hora** | ⚠️ Parcial | Legalidad varía. Prohibido ajustar sin consentimiento (Francia) | Legal |
| **Cierre automático tras X horas** | ⚠️ Parcial | Permitido en ES. Puede ser ilegal sin aviso (UK) | Legal |
| **Horas extra automáticas** | ❌ No | Regulación diferente por país (límites, compensación) | Legal |

---

### **E. HORARIOS Y TURNOS**

| Regla/Campo | ¿Neutral? | Motivo | Tipo |
|-------------|-----------|--------|------|
| **Planificación semanal** | ✅ Sí | Universal | - |
| **Semana L-D** | ⚠️ Parcial | España y UE: Lunes. USA/Latam: Domingo | Cultural |
| **Turnos partidos** | ⚠️ Parcial | Legal en España (hostelería). Prohibido en Francia sin compensación | Legal |
| **Horas semanales 40h** | ❌ No | Varía: 35h Francia, 40h España, 48h UK máx., sin límite USA | Legal |
| **Día de descanso obligatorio** | ⚠️ Parcial | Universal pero días y reglas varían (domingo religioso, etc.) | Legal + Cultural |

---

### **F. VACACIONES**

| Regla/Campo | ¿Neutral? | Motivo | Tipo |
|-------------|-----------|--------|------|
| **22 días anuales** | ❌ No | España: 22 días mínimo. UK: 28 días. USA: 0 legal (voluntario empresa) | Legal |
| **Solicitud con aprobación** | ✅ Sí | Universal en empresas | - |
| **Balance anual fijo** | ⚠️ Parcial | España acumula anual. USA puede acumular ilimitado o perderlo | Legal |
| **Días laborables** | ⚠️ Parcial | Cálculo depende de festivos nacionales/religiosos | Legal + Cultural |

---

### **G. CONFIGURACIÓN REGIONAL**

| Campo | ¿Neutral? | Motivo | Tipo |
|-------|-----------|--------|------|
| **Separador decimal (,)** | ❌ No | España: 1.234,56 / USA: 1,234.56 | UX |
| **Símbolo moneda (€)** | ❌ No | Hardcoded euro. Otros: $, £, MXN, etc. | UX |
| **Posición moneda (después)** | ⚠️ Parcial | España: "12,50 €" / USA: "$12.50" | UX |
| **Inicio semana (Lunes)** | ⚠️ Parcial | Variable por país (ver apartado E) | Cultural |

---

### **H. GASTOS**

| Regla/Campo | ¿Neutral? | Motivo | Tipo |
|-------------|-----------|--------|------|
| **Subida con justificante** | ✅ Sí | Universal (buena práctica) | - |
| **Aprobación gerente** | ✅ Sí | Universal | - |
| **Formato justificante** | ⚠️ Parcial | España: factura/ticket. Otros: receipt, invoice, etc. | Legal |
| **Moneda** | ❌ No | Hardcoded euros | UX |

---

## 6️⃣ PUNTOS DE RIESGO

### **🔴 ALTO RIESGO (Bloqueantes multipaís)**

| Nº | Punto de Riesgo | Impacto | Descripción |
|----|-----------------|---------|-------------|
| **R1** | **Tipos de contrato hardcoded** | 🔴 Alto | Lista fija española (Indefinido, Fijo Discontinuo) no aplica a otros países |
| **R2** | **Datos de gestoría españoles** | 🔴 Alto | NSS, CCC, Grupo Cotización, Código contrato, Mutua son exclusivos de España |
| **R3** | **22 días vacaciones fijo** | 🔴 Alto | Hardcoded. UK requiere 28, USA no tiene mínimo legal |
| **R4** | **Moneda euro hardcoded** | 🔴 Alto | Símbolo "€" y posición aparecen en múltiples componentes sin abstracción |
| **R5** | **IBAN obligatorio** | 🔴 Alto | Sistema europeo. USA usa routing + account number |
| **R6** | **DNI como identificador único** | 🔴 Alto | Campo llamado "DNI", específico España. Otros: ID, CPF, SSN, etc. |
| **R7** | **Horas semanales 40h asumidas** | 🔴 Alto | Lógica de cálculo asume 40h/semana española |

---

### **🟡 MEDIO RIESGO (Requieren adaptación)**

| Nº | Punto de Riesgo | Impacto | Descripción |
|----|-----------------|---------|-------------|
| **R8** | **Margen cortesía fichaje** | 🟡 Medio | Permitido en España, puede ser ilegal en Alemania o Francia |
| **R9** | **Ajuste automático hora fichaje** | 🟡 Medio | Legalidad varía. Francia prohíbe ajustar sin consentimiento explícito |
| **R10** | **Turnos partidos permitidos** | 🟡 Medio | Legal en España (hostelería). Prohibido en Francia sin compensación adicional |
| **R11** | **Semana inicia Lunes** | 🟡 Medio | España/UE: Lunes. USA/México/Brasil: Domingo. Hardcoded en vistas |
| **R12** | **Geolocalización en fichaje** | 🟡 Medio | Legal en España con consentimiento. Prohibido en algunos países sin proceso especial |
| **R13** | **Formato teléfono +34** | 🟡 Medio | Placeholder muestra formato español. No valida otros prefijos |
| **R14** | **Convenio colectivo** | 🟡 Medio | Campo exclusivo España. No existe en USA, UK, Latam |
| **R15** | **Separador decimal (,)** | 🟡 Medio | Hardcoded coma. USA usa punto. Confusión en inputs numéricos |

---

### **🟢 BAJO RIESGO (Mejoras UX)**

| Nº | Punto de Riesgo | Impacto | Descripción |
|----|-----------------|---------|-------------|
| **R16** | **Código postal formato** | 🟢 Bajo | Campo libre pero sin validación. Formatos varían (5 dígitos ES, ZIP+4 USA) |
| **R17** | **Puestos según vertical** | 🟢 Bajo | Configurable, pero nombresespañoles (Camarero, Albañil). Traducción necesaria |
| **R18** | **Fecha formato DD/MM/AAAA** | 🟢 Bajo | España. USA usa MM/DD/YYYY. Potencial confusión |
| **R19** | **Idioma interfaz** | 🟢 Bajo | Todo en español. No hay internacionalización (i18n) |
| **R20** | **Festivos en cálculo vacaciones** | 🟢 Bajo | No hay gestión de festivos por país. Calendario laboral existe pero es genérico |

---

## 7️⃣ DECISIONES RÍGIDAS DETECTADAS

### **Decisiones de Arquitectura:**

1. **Moneda como string literal** → No hay abstracción. "€" aparece directamente en JSX.
2. **Tipos de contrato en array fijo** → Definido en componente, no en configuración.
3. **Balance vacaciones hardcoded (22 días)** → Constante en código, no en settings.
4. **Datos gestoría en schema Employee** → Campos españoles en type base, no extensibles.
5. **Margen cortesía con opciones fijas** → [0, 5, 10, 15] hardcoded, no configurable por país.
6. **Semana L-D en arrays** → `['Lun', 'Mar', ...]` definido directamente, no configurable.

### **Decisiones de UX:**

1. **Modal de alta "rápida"** → Diseñado para flujo español (gerente introduce mínimo).
2. **Pestaña "Gestoría"** → Nombre y campos asumen contexto español.
3. **Etiquetas en español** → No hay sistema i18n. Traducción requeriría refactor completo.
4. **Inputs sin validación de formato** → Teléfono, código postal, IBAN aceptan cualquier texto.

---

## 8️⃣ SUPUESTOS LEGALES IMPLÍCITOS

| Supuesto | Origen | Evidencia |
|----------|--------|-----------|
| **Fichaje obligatorio por ley** | España RD 2019 | Vista "Sin fichar" como incidencia crítica |
| **Trabajador tiene NSS siempre** | España (Seg. Social) | Campo obligatorio en gestoría |
| **Empresa tiene CCC único** | España (TGSS) | Campo CCC en datos gestoría |
| **Vacaciones mínimo 22 días** | España (ET Art. 38) | Constante `totalAnnualDays = 22` |
| **Sueldo mensual en euros** | España (convenios) | Campo "€/mes" hardcoded |
| **Convenio colectivo aplica** | España (ET) | Campo "convenio" obligatorio |
| **Mutua obligatoria** | España (AT y EP) | Campo mutua en gestoría |
| **Retención IRPF** | España (fiscal) | Campo % IRPF en gestoría |
| **Jornada máxima 40h semanales** | España (ET Art. 34) | Validación implícita en cálculos |
| **Turnos partidos permitidos** | España (hostelería) | Soporte de múltiples turnos/día |

---

## 9️⃣ ACOPLAMIENTOS PELIGROSOS

### **🔗 Acoplamiento 1: Datos Gestoría ↔ Employee Type**

**Problema:** Campos específicos de España están en el type base `Employee`.  
**Riesgo:** Añadir empleados de otros países genera campos vacíos/inválidos.  
**Evidencia:** 
```typescript
interface Employee {
  nss: string;           // Solo España
  cotizationGroup: string; // Solo España
  cccEmpresa: string;    // Solo España
  mutua: string;         // Solo España
  irpfPercentage: number; // Solo España
}
```

---

### **🔗 Acoplamiento 2: Moneda ↔ Componentes de Precio**

**Problema:** Símbolo "€" hardcoded en múltiples archivos sin abstracción.  
**Riesgo:** Cambiar moneda requiere modificar decenas de componentes.  
**Evidencia:**
- `AddEmployeeModal.tsx` línea 170: `"€/mes"`
- `formatCurrency()` en `utils.ts`: `return "${value.toFixed(2)} €"`
- Múltiples componentes con `€` literal

---

### **🔗 Acoplamiento 3: Tipos Contrato ↔ AddEmployeeModal**

**Problema:** Lista de contratos definida en componente, no en configuración.  
**Riesgo:** Añadir país requiere modificar componente, no solo config.  
**Evidencia:** `AddEmployeeModal.tsx` líneas 149-154 → Opciones hardcoded.

---

### **🔗 Acoplamiento 4: Balance Vacaciones ↔ VacationsView**

**Problema:** 22 días como constante en componente.  
**Riesgo:** Empresas en UK (28 días) o USA (sin mínimo) no pueden usar sistema.  
**Evidencia:** `VacationsViewOptimized.tsx` línea 67: `const totalAnnualDays = 22;`

---

### **🔗 Acoplamiento 5: Semana L-D ↔ Múltiples Componentes**

**Problema:** Arrays de días hardcoded con inicio en Lunes.  
**Riesgo:** USA/México requieren Domingo. Cambio implica tocar múltiples archivos.  
**Evidencia:**
- `SchedulesViewPRO.tsx` línea 47-54
- `PlanificacionHorariaGeneralMejorada.tsx`
- `FichajeTrabajador.tsx` línea 44-52

---

### **🔗 Acoplamiento 6: Vertical ↔ Puestos**

**Problema:** Puestos ligados a vertical pero con nombres españoles.  
**Riesgo:** Multiidioma requiere traducción + lógica país.  
**Evidencia:** `AddEmployeeModal.tsx` líneas 16-37 → Objeto `rolesByVertical`.

---

## 🔟 CONCLUSIONES

### **✅ LO QUE FUNCIONA (Neutral)**

1. **Flujo de alta rápida** → Concepto transferible a otros países
2. **Separación Gerente/Trabajador** → Modelo de roles universal
3. **Sistema de aprobaciones** → Vacaciones y gastos con flujo aprobación
4. **Planificación horaria visual** → UX de calendario y turnos escalable
5. **Fichaje con device + geo** → Captura técnica neutral
6. **Multiempresa y PDV** → Arquitectura soporta múltiples centros
7. **Onboarding delegado** → Trabajador completa datos personales

### **⚠️ LO QUE NO ESCALA**

1. **Datos de gestoría** → 100% específicos España
2. **Tipos de contrato** → Lista española hardcoded
3. **Balance vacaciones** → 22 días fijo
4. **Moneda y formato numérico** → Euro y coma decimal hardcoded
5. **Configuración fichajes** → Reglas basadas en legislación española
6. **Campos legales** → NSS, CCC, IRPF, Convenio, Mutua exclusivos ES
7. **Nomenclatura** → "Gestoría" es término español, no universal

### **🎯 ARQUITECTURA RECOMENDADA (No implementar, solo documentar)**

**Para escalar a multipaís se requeriría:**

1. **Abstracción de campos legales** → `legalData: { [country]: { ... } }`
2. **Configuración por país** → Tipos contrato, balance vacaciones, reglas fichaje
3. **Internacionalización (i18n)** → Sistema de traducciones
4. **Moneda configurable** → Currency abstraction layer
5. **Formatos regionales** → Fecha, número, teléfono según país
6. **Validaciones por país** → IBAN (UE), SSN (USA), CPF (Brasil), etc.
7. **Calendario laboral por país** → Festivos nacionales/religiosos
8. **Horas semanales configurables** → No asumir 40h
9. **Inicio semana configurable** → Lunes vs Domingo
10. **Nomenclatura genérica** → "Gestoría" → "Legal & Admin"

---

## 📌 RESUMEN EJECUTIVO

### **Estado Actual:**
El módulo RRHH de Vertial está **diseñado y optimizado para España** con reglas laborales, fiscales y administrativas específicas del mercado español. La arquitectura funciona correctamente dentro de este contexto.

### **Capacidad Multipaís:**
**Baja.** Requeriría refactorización significativa en:
- Modelo de datos (tipos, validaciones)
- Configuración (externalizar reglas hardcoded)
- UX (i18n, formatos regionales)
- Lógica de negocio (cálculos, validaciones)

### **Puntos Fuertes:**
- Flujos de trabajo claros y probados
- Separación rol Gerente/Trabajador efectiva
- UX de planificación horaria visual y usable
- Arquitectura multiempresa escalable

### **Puntos Críticos:**
- 7 riesgos ALTOS bloqueantes
- 8 riesgos MEDIOS que requieren adaptación
- 6 acoplamientos peligrosos identificados
- 10 supuestos legales específicos de España

---

**Fecha de auditoría:** 13 de Enero de 2026  
**Versión del sistema:** Vertial (SVA 3 - RRHH Avanzado)  
**Auditor:** Sistema de Análisis de Arquitectura  
**Alcance cumplido:** ✅ 100%

---

## 📎 ANEXOS

### **Archivos Auditados:**

- `/src/app/components/sections/Equipo.tsx`
- `/src/app/components/equipo/AddEmployeeModal.tsx`
- `/src/app/components/equipo/FichajesView.tsx`
- `/src/app/components/equipo/SchedulesViewPRO.tsx`
- `/src/app/components/equipo/VacationsViewOptimized.tsx`
- `/src/app/components/equipo/EmployeeDetailPanel.tsx`
- `/src/app/components/equipo/PermissionsView.tsx`
- `/src/app/components/equipo/PlanificacionHorariaGeneralMejorada.tsx`
- `/src/app/components/sections/trabajador/Fichaje.tsx`
- `/src/app/components/sections/ConfiguracionEmpresa.tsx`
- `/src/app/components/sections/configuracion/ConfiguracionFichajes.tsx`
- `/src/app/data/mockData.ts`

### **Types Analizados:**

```typescript
interface Employee {
  id: string;
  name: string;
  email: string;
  professionalEmail: string;
  role: string; // Puesto
  status: 'activo' | 'inactivo';
  companyId: string;
  
  // Datos personales
  dni: string; // ⚠️ España
  phone: string;
  birthDate: string;
  nationality: string;
  address: string;
  iban: string; // ⚠️ Europa
  
  // Datos laborales
  contractType: string; // ⚠️ España
  salary: number; // ⚠️ Moneda asumida
  workCenter: string;
  weeklyHours: number; // ⚠️ 40h asumidas
  agreement: string; // ⚠️ España (convenio)
  
  // Datos gestoría (⚠️ TODO España)
  nss: string;
  cotizationGroup: string;
  contractCode: string;
  cccEmpresa: string;
  mutua: string;
  irpfPercentage: number;
}
```

---

**FIN DEL DOCUMENTO**

