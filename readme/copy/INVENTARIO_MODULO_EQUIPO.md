# INVENTARIO COMPLETO - MÓDULO EQUIPO Y RRHH
**SaaS Vertial - Vista Gerente**

**Versión:** 1.0  
**Fecha:** 4 Febrero 2026  
**Contexto:** Sistema multiempresa, multivertical, multipaís  
**Alcance:** Módulo Equipo completo (gestión de trabajadores, horarios, fichajes, vacaciones, gastos, consumos)

---

## ESTRUCTURA GENERAL DEL MÓDULO

### Navegación por Pestañas (Tabs Principales)
1. **Equipo** (BASE - siempre visible)
2. **Horarios** (FLAG: schedules)
3. **Fichajes** (BASE - siempre visible)
4. **Vacaciones** (FLAG: vacations)
5. **Consumos** (FLAG: consumptions)
6. **Gastos** (FLAG: expenses)

### Panel Lateral de Detalle de Empleado
Al hacer clic en un empleado, se abre panel lateral con estas pestañas:
1. **Información** (siempre visible)
2. **Horarios** (FLAG: schedules)
3. **Fichajes** (siempre visible)
4. **Vacaciones** (FLAG: vacations)
5. **Documentos** (siempre visible)
6. **Permisos** (siempre visible)
7. **Puesto** (FLAG: jobdescription)
8. **Historial** (FLAG: audit)

---

## 1. PESTAÑA: EQUIPO (BASE)

### 1.1 LISTADO DE TRABAJADORES

#### 1.1.1 Visualización del Listado
**Función:** Mostrar todos los trabajadores de la empresa  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador (datos de empleados)  
- 🔗 Documentación (estado onboarding)  

**Funcionalidades incluidas:**
- Contador de trabajadores total
- Toggle vista: Tarjetas / Tabla
- Ordenamiento por: Nombre, Email, Rol, Estado
- Estado visual: Activo / Inactivo
- Avatar con inicial del nombre

**Validaciones:**
- ⚠ Usuario debe tener permiso "ver_equipo"
- Vista Global deshabilitada (requiere empresa específica)

**Configuraciones previas:**
- Empresa creada y seleccionada
- Permisos de usuario configurados

---

#### 1.1.2 Vista en Tarjetas (Cards)
**Función:** Visualización en formato tarjeta con información resumida  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Información mostrada por tarjeta:**
- Avatar / Inicial
- Nombre completo
- Rol del empleado
- Email
- Estado (badge visual)
- Botón "Enviar mensaje"
- Botón "Ver perfil completo"

**Interacciones:**
- Click en tarjeta → Abre panel de detalle
- Click en "Enviar mensaje" → Abre chat con empleado
- Hover → Efecto visual de elevación

**Responsive:**
- Mobile: 1 columna
- Tablet: 2 columnas
- Desktop: 3 columnas

---

#### 1.1.3 Vista en Tabla
**Función:** Visualización en formato tabla con ordenamiento  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Columnas de la tabla:**
- Trabajador (nombre + avatar)
- Email
- Rol
- Estado
- Acciones (ver perfil)

**Funcionalidades:**
- Click en header de columna → Ordenar ascendente/descendente
- Click en fila → Abre panel de detalle
- Indicador visual de ordenamiento activo

---

#### 1.1.4 Añadir Nuevo Empleado
**Función:** Crear registro de nuevo trabajador  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador (creación de registro)  
- 🔗 Documentación (inicio de onboarding si está activo)  
- 🌍 Dependencia por país (campos obligatorios de contrato)  

**Campos del formulario:**

**Datos Personales:**
- Nombre completo (obligatorio)
- Email personal (obligatorio)
- Email profesional (opcional)
- DNI/NIF (obligatorio)
- 🌍 Fecha de nacimiento (formato según país)
- Lugar de nacimiento
- Nacionalidad
- Dirección completa
- Ciudad
- Código postal
- 🌍 País
- Teléfono
- Contacto de emergencia (nombre + teléfono)

**Datos Laborales:**
- 🌍 Tipo de contrato (según legislación del país)
- 🌍 Jornada laboral (según convenio)
- Horas semanales
- 🌍 Salario (según convenio y país)
- Centro de trabajo (si multicenter está activo)
- Fecha de inicio
- 🌍 Convenio colectivo aplicable

**Datos Administrativos (España):**
- Número de la Seguridad Social
- Código de contrato SEPE
- Fecha alta Seguridad Social
- Grupo de cotización
- Tipo de cotización
- Mutua
- CCC de la empresa
- % IRPF

**Validaciones:**
- Email único en el sistema
- DNI/NIF válido según país
- Fecha de inicio no puede ser futura más de X días
- Campos obligatorios según legislación del país

**Acciones post-creación:**
- ⚠ DECISIÓN PENDIENTE: ¿Enviar invitación automática?
- ⚠ DECISIÓN PENDIENTE: ¿Iniciar proceso de onboarding automático?
- ⚠ DECISIÓN PENDIENTE: ¿Asignar permisos por defecto según rol?

**Alertas generadas:**
- Confirmación de creación exitosa
- Si FLAG onboarding activo: "Invitación enviada"
- Si falta documentación obligatoria: Alerta pendiente

---

### 1.2 PANEL DE DETALLE DEL EMPLEADO

#### 1.2.1 Pestaña: INFORMACIÓN

##### 1.2.1.1 Sección: Datos Personales
**Función:** Visualizar y editar información personal del trabajador  
**Rol:** Gerente (lectura y escritura), Trabajador (solo lectura propia)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (si hay cambios que requieren documentos)  
- 🌍 Validaciones según país  

**Campos visualizados:**
- DNI/NIF
- Fecha de nacimiento
- Lugar de nacimiento
- Nacionalidad
- Dirección completa
- Ciudad
- Código postal
- País
- Teléfono personal
- Email personal
- Email profesional
- IBAN (para nóminas)
- Contacto de emergencia (nombre y teléfono)

**Funcionalidad de edición:**
- Botón "Editar Datos Personales" → Abre modal contextual
- Modal específico muestra SOLO campos de datos personales
- Guardado → Genera entrada en historial (si FLAG audit activo)

**Validaciones:**
- Email único
- IBAN válido (según formato del país)
- Teléfono en formato correcto
- 🌍 DNI/NIF según legislación del país

**Alertas:**
- Si cambio de IBAN: Notificar a gestoría/nóminas
- Si cambio de dirección: ⚠ DECISIÓN PENDIENTE - ¿Actualizar documentación laboral?

**Configuraciones previas:**
- Permisos de edición: "editar_datos_personales"

---

##### 1.2.1.2 Sección: Datos Laborales
**Función:** Visualizar y editar información contractual del trabajador  
**Rol:** Gerente (lectura y escritura), Trabajador (solo lectura propia)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (cambios requieren documentación legal)  
- 🌍 Legislación laboral del país  

**Campos visualizados:**
- 🌍 Tipo de contrato (indefinido, temporal, formación, etc.)
- 🌍 Tipo de jornada (completa, parcial, etc.)
- Horas semanales contratadas
- 🌍 Salario bruto mensual
- Centro de trabajo (si multicenter activo)
- Fecha de inicio en la empresa
- 🌍 Convenio colectivo aplicable
- Estado del empleado: Activo / Inactivo

**Funcionalidad de edición:**
- Botón "Editar Datos Laborales" → Abre modal contextual
- Modal específico muestra SOLO campos laborales
- Opción especial: "Marcar como Inactivo"
- Si se marca inactivo: Retirar permisos de acceso

**Validaciones:**
- Salario debe ser >= salario mínimo del país
- Horas semanales no pueden exceder máximo legal
- 🌍 Convenio debe ser válido para el país/sector
- Si cambio de jornada: Validar compatibilidad con horarios asignados

**Alertas:**
- Cambios en tipo de contrato → Notificar a gestoría
- Cambios en salario → 🌍 Puede requerir comunicación legal
- Marcar inactivo → Confirmación + aviso de retirada de permisos

**Configuraciones previas:**
- Permisos: "editar_datos_laborales"
- Si multicenter: Centros de trabajo configurados

**Acciones relacionadas:**
- ⚠ DECISIÓN PENDIENTE: ¿Cambio de centro mueve horarios automáticamente?
- ⚠ DECISIÓN PENDIENTE: ¿Inactivar empleado cancela vacaciones futuras?

---

##### 1.2.1.3 Sección: Datos Administrativos
**Función:** Visualizar y editar información administrativa y fiscal  
**Rol:** Gerente (lectura y escritura), RRHH (lectura y escritura)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Gestoría (si FLAG activo, cambios notificados)  
- 🌍 Legislación fiscal del país  

**Campos visualizados (España):**
- Número de la Seguridad Social
- Código de contrato SEPE
- Fecha de alta en Seguridad Social
- Grupo de cotización
- Tipo de cotización
- Mutua asignada
- CCC de la empresa
- % IRPF

**Campos según otros países:**
- 🌍 Número de identificación fiscal local
- 🌍 Datos específicos de seguridad social/previsión
- 🌍 Retenciones fiscales aplicables

**Funcionalidad de edición:**
- Botón "Editar Datos Administrativos" → Abre modal contextual
- Modal específico muestra SOLO campos administrativos
- Cambios generan notificación a gestoría (si FLAG activo)

**Validaciones:**
- 🌍 NSS válido según formato del país
- Grupo de cotización coherente con tipo de contrato
- % IRPF dentro de rangos legales
- CCC válido (12 dígitos en España)

**Alertas:**
- Cambios en datos de SS → Notificar a gestoría obligatorio
- Cambios en % IRPF → Aviso para próxima nómina
- Datos incompletos → Bloqueo de generación de nómina

**Configuraciones previas:**
- Permisos: "editar_datos_administrativos"
- Gestoría configurada (si FLAG activo)
- CCC de empresa registrado

---

##### 1.2.1.4 Funcionalidad: Badge de Estado
**Función:** Indicador visual del estado del empleado  
**Rol:** Gerente, RRHH, Trabajador (solo lectura)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Estados posibles:**
- **Activo** (verde): Empleado activo con acceso completo
- **Inactivo** (gris): Empleado dado de baja o suspendido
- **Pendiente** (naranja): Onboarding no completado (si FLAG onboarding)
- **Invitado** (azul): Invitación enviada, pendiente aceptación

**Lógica del badge:**
- Aparece en header del panel de detalle
- Color y texto según estado
- Click en badge no realiza acción (solo visual)

**Cambios de estado:**
- Solo desde modal "Editar Datos Laborales"
- Activo → Inactivo: Requiere confirmación
- Inactivo → Activo: Restaura permisos anteriores

---

#### 1.2.2 Pestaña: HORARIOS (FLAG: schedules)

##### 1.2.2.1 Visualización de Horario Asignado
**Función:** Mostrar horario semanal asignado al trabajador  
**Rol:** Gerente (lectura y escritura), Trabajador (solo lectura)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Fichajes (para validar cumplimiento)  

**Información mostrada:**
- Horario semanal en formato visual (calendarios)
- Turnos asignados por día
- Horas totales semanales
- Centro de trabajo (si multicenter)
- Días libres/descanso

**Funcionalidades:**
- Vista semanal con navegación mes a mes
- Color coding por tipo de turno
- Indicador de días libres
- Resumen de horas totales del mes

**Validaciones:**
- Horas semanales no exceden contratadas
- Descansos mínimos según legislación
- 🌍 Cumplimiento de convenio colectivo

**Configuraciones previas:**
- Turnos creados en sistema
- Plantilla horaria definida

---

##### 1.2.2.2 Edición de Horario Individual
**Función:** Modificar horario de un trabajador específico  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Fichajes (ajustar expectativas de fichaje)  

**Funcionalidades:**
- Seleccionar semana/mes
- Asignar turno por día
- Copiar semana anterior
- Aplicar plantilla predefinida
- Marcar días libres/vacaciones

**Validaciones:**
- No solapar con vacaciones aprobadas
- Respetar horas contratadas
- 🌍 Descansos mínimos legales
- Avisar si cambio afecta fichajes futuros

**Alertas:**
- Cambio notificado al trabajador
- Si cambio próximo (< 48h): Alerta especial
- Si excede horas: ⚠ DECISIÓN PENDIENTE - ¿Permitir o bloquear?

---

##### 1.2.2.3 Historial de Cambios de Horario
**Función:** Registro de modificaciones de horario (si FLAG audit)  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (auditoría)  

**Información registrada:**
- Fecha y hora del cambio
- Usuario que realizó el cambio
- Horario anterior
- Horario nuevo
- Razón del cambio (opcional)

---

#### 1.2.3 Pestaña: FICHAJES

##### 1.2.3.1 Resumen de Fichajes del Empleado
**Función:** Vista consolidada de fichajes del trabajador  
**Rol:** Gerente (lectura completa), Trabajador (solo lectura propia)  
**Dependencias:**  
- 🔗 Fichajes (datos de entradas/salidas)  
- 🔗 RRHH / Trabajador (horario asignado)  

**KPIs mostrados:**
- Fichajes totales del mes
- % Puntualidad
- Incidencias (retrasos, ausencias)
- Horas trabajadas vs horas esperadas
- Dispositivo de fichaje más usado

**Vista de fichajes:**
- Lista cronológica de fichajes
- Entrada y salida por día
- Horas totales
- Estado: Completo / En curso / Sin fichar
- Puntualidad: A tiempo / Tarde
- Geolocalización (si activo)
- Dispositivo usado (móvil/tablet/web)

**Filtros disponibles:**
- Por rango de fechas
- Por estado (completo, activo, sin fichar)
- Por puntualidad

---

##### 1.2.3.2 Solicitud de Ajuste de Fichaje
**Función:** Trabajador solicita corrección de fichaje erróneo  
**Rol:** Trabajador (crea solicitud), Gerente (aprueba/rechaza)  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Trabajador selecciona fichaje a corregir
2. Indica nuevo horario correcto
3. Añade justificación obligatoria
4. Envía solicitud

**Información de solicitud:**
- Fichaje original (entrada/salida)
- Fichaje propuesto
- Justificación del trabajador
- Fecha de solicitud
- Estado: Pendiente / Aprobado / Rechazado

**Validaciones:**
- Solo se pueden solicitar ajustes de fichajes propios
- ⚠ DECISIÓN PENDIENTE: ¿Límite de días atrás para solicitar?
- ⚠ DECISIÓN PENDIENTE: ¿Límite de solicitudes por mes?

**Alertas:**
- Notificación a gerente de nueva solicitud
- Notificación a trabajador de aprobación/rechazo

---

##### 1.2.3.3 Ajuste Manual de Fichaje (Gerente)
**Función:** Gerente modifica fichaje directamente  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (auditoría si FLAG audit)  

**Funcionalidades:**
- Seleccionar empleado y fecha
- Modificar entrada y/o salida
- Añadir comentario obligatorio del motivo
- Guardar cambio

**Validaciones:**
- Horarios dentro de rangos lógicos
- No solapar con otros fichajes del día
- Generar registro en historial (si FLAG audit)

**Alertas:**
- Confirmación de cambio realizado
- ⚠ DECISIÓN PENDIENTE: ¿Notificar al trabajador?

**Configuraciones previas:**
- Permiso: "ajustar_fichajes" o "aprobar_correcciones"

---

##### 1.2.3.4 Exportación de Fichajes
**Función:** Descargar registros de fichajes en formato editable  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**Formatos disponibles:**
- Excel (.xlsx)
- CSV
- PDF (resumen)

**Filtros de exportación:**
- Rango de fechas
- Empleado específico o todos
- Centro de trabajo (si multicenter)

**Datos incluidos:**
- Empleado
- Fecha
- Entrada
- Salida
- Horas totales
- Estado
- Dispositivo
- Geolocalización (si activo)
- Ajustes manuales (marcados)

---

#### 1.2.4 Pestaña: VACACIONES (FLAG: vacations)

##### 1.2.4.1 Balance de Vacaciones
**Función:** Mostrar días disponibles y consumidos  
**Rol:** Gerente (ver todo), Trabajador (ver propio)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🌍 Legislación laboral (días por convenio)  

**Información mostrada:**
- Días totales anuales (según convenio)
- Días disfrutados
- Días pendientes
- Días solicitados (pendientes aprobación)
- Próximas vacaciones aprobadas

**Cálculo automático:**
- 🌍 Días según convenio y país
- Proporcional según fecha de alta
- Días del año anterior (si procede)

**Validaciones:**
- No permitir solicitar más días de los disponibles
- ⚠ DECISIÓN PENDIENTE: ¿Permitir solicitar sin días si hay aprobación gerencial?

---

##### 1.2.4.2 Calendario Visual de Vacaciones
**Función:** Vista mensual de vacaciones del empleado  
**Rol:** Gerente, Trabajador (propio)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Funcionalidades:**
- Navegación mes a mes
- Color coding por estado:
  - Aprobadas (verde)
  - Pendientes (naranja)
  - Rechazadas (rojo)
  - Propuestas por gerente (azul)
- Click en día → Detalle de solicitud

---

##### 1.2.4.3 Solicitar Vacaciones (Trabajador)
**Función:** Trabajador solicita días de vacaciones  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (historial de solicitudes)  

**Proceso:**
1. Trabajador selecciona rango de fechas
2. Sistema calcula días laborables
3. Trabajador añade comentario opcional
4. Envía solicitud

**Validaciones:**
- Días disponibles suficientes
- No solapar con vacaciones ya aprobadas
- No solapar con festivos ya marcados
- ⚠ DECISIÓN PENDIENTE: ¿Días mínimos de anticipación?

**Alertas:**
- Notificación a gerente de nueva solicitud
- Confirmación de envío al trabajador

---

##### 1.2.4.4 Proponer Vacaciones (Gerente)
**Función:** Gerente propone fechas de vacaciones a trabajador  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Gerente selecciona empleado
2. Selecciona rango de fechas
3. Añade mensaje para el trabajador
4. Envía propuesta

**Acciones del trabajador:**
- Aceptar propuesta → Se marca como aprobada
- Rechazar propuesta → Se marca como rechazada
- Contraproponerr otras fechas

**Validaciones:**
- Trabajador tiene días disponibles
- No solapar con otras vacaciones

**Alertas:**
- Notificación al trabajador de propuesta
- Notificación a gerente de aceptación/rechazo

---

##### 1.2.4.5 Asignar Vacaciones Directamente (Gerente)
**Función:** Gerente asigna vacaciones sin solicitud previa  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Gerente selecciona empleado y fechas
2. Marca como "aprobadas directamente"
3. Añade motivo
4. Guarda

**Validaciones:**
- Trabajador tiene días disponibles
- No solapar con otras vacaciones
- ⚠ DECISIÓN PENDIENTE: ¿Permitir forzar sin días disponibles?

**Alertas:**
- Notificación al trabajador de vacaciones asignadas

---

##### 1.2.4.6 Aprobar/Rechazar Solicitudes de Vacaciones
**Función:** Gerente gestiona solicitudes pendientes  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (historial)  

**Proceso aprobación:**
1. Gerente revisa solicitud
2. Click en "Aprobar"
3. Confirmación

**Proceso rechazo:**
1. Gerente revisa solicitud
2. Click en "Rechazar"
3. Añade motivo obligatorio
4. Confirma rechazo

**Validaciones:**
- ⚠ DECISIÓN PENDIENTE: ¿Permitir aprobar si causa conflictos de horarios?
- ⚠ DECISIÓN PENDIENTE: ¿Revisar impacto en plantilla antes de aprobar?

**Alertas:**
- Notificación al trabajador de aprobación/rechazo
- Si rechazo: Incluir motivo en notificación

---

#### 1.2.5 Pestaña: DOCUMENTOS

##### 1.2.5.1 Listado de Documentos del Empleado
**Función:** Repositorio de documentación laboral del trabajador  
**Rol:** Gerente (lectura y escritura), Trabajador (lectura propia y subir documentos)  
**Dependencias:**  
- 🔗 Documentación  
- 🔗 RRHH / Trabajador  
- 🌍 Documentación legal según país  

**Tipos de documentos:**
- **Contrato laboral** (obligatorio)
- **DNI/Pasaporte** (obligatorio)
- **Títulos académicos** (opcional)
- **Certificados formación** (opcional)
- **Nóminas** (generadas por sistema si FLAG nóminas)
- **Partes de IT** (baja médica)
- **Certificados médicos**
- **Otros documentos** (categoría libre)

**Información por documento:**
- Nombre del archivo
- Tipo de documento
- Fecha de subida
- Subido por (usuario)
- Tamaño del archivo
- Estado: Pendiente revisión / Aprobado / Rechazado

**Funcionalidades:**
- Descargar documento
- Previsualizar (si formato compatible)
- Eliminar documento (solo gerente)
- Filtrar por tipo de documento

---

##### 1.2.5.2 Subir Nuevo Documento
**Función:** Añadir documento al expediente del empleado  
**Rol:** Gerente (cualquier documento), Trabajador (documentos propios permitidos)  
**Dependencias:**  
- 🔗 Documentación  

**Proceso:**
1. Click en "Subir documento"
2. Seleccionar tipo de documento
3. Arrastrar o seleccionar archivo
4. Añadir descripción opcional
5. Guardar

**Validaciones:**
- Formatos permitidos: PDF, JPG, PNG, DOCX
- Tamaño máximo: ⚠ DECISIÓN PENDIENTE (¿10MB? ¿20MB?)
- Nombre de archivo no duplicado

**Alertas:**
- Confirmación de subida exitosa
- Si documento obligatorio: Marca como completado en checklist de onboarding

**Configuraciones previas:**
- Tipos de documentos configurados en sistema
- Almacenamiento cloud configurado

---

##### 1.2.5.3 Gestión de Documentación Obligatoria
**Función:** Checklist de documentación legal requerida  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 Documentación  
- 🔗 RRHH / Trabajador  
- 🌍 Legislación del país  

**Documentos obligatorios típicos:**
- 🌍 Contrato firmado (según tipo de contrato del país)
- 🌍 DNI/NIF o documento de identidad
- 🌍 Alta en Seguridad Social (España)
- 🌍 Certificado de antecedentes (según sector)
- 🌍 Reconocimiento médico (según convenio)

**Estados:**
- ✅ Completo: Todos los documentos subidos
- ⚠️ Incompleto: Faltan documentos obligatorios
- ❌ Rechazado: Algún documento no válido

**Alertas:**
- Empleado con documentación incompleta: Alerta en listado
- ⚠ DECISIÓN PENDIENTE: ¿Bloquear fichaje si falta documentación crítica?

---

#### 1.2.6 Pestaña: PERMISOS

##### 1.2.6.1 Visualización de Permisos Asignados
**Función:** Mostrar permisos de acceso y operación del empleado  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Sistema de permisos global  
- 🔗 RRHH / Trabajador  

**Estructura de permisos:**
- **Arquitectura fija:** Permisos solo se definen en roles
- **Herencia:** Usuarios heredan permisos del rol asignado
- **Niveles jerárquicos:** 4 niveles (N1 a N4)
- **71 permisos totales** organizados en 6 módulos

**Información mostrada:**
- Rol asignado
- Permisos heredados del rol
- Agrupación por módulo:
  - Negocio / F1
  - Clientes
  - Almacén / Proveedores
  - Facturación / Contabilidad
  - Informes
  - RRHH / Equipo

**Funcionalidades:**
- Vista en árbol de permisos
- Búsqueda/filtro de permisos
- Indicador visual de nivel requerido (N1-N4)
- Descripción de cada permiso

---

##### 1.2.6.2 Cambio de Rol del Empleado
**Función:** Modificar rol y por tanto permisos heredados  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Sistema de permisos global  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Gerente click en "Cambiar rol"
2. Selecciona nuevo rol de lista predefinida
3. Sistema muestra comparativa de permisos:
   - Permisos que se añadirán (verde)
   - Permisos que se quitarán (rojo)
   - Permisos que se mantienen (gris)
4. Gerente confirma cambio

**Validaciones:**
- ⚠ DECISIÓN PENDIENTE: ¿Requiere autorización adicional para roles críticos?
- Verificar que empleado cumple nivel requerido

**Alertas:**
- Confirmación de cambio exitoso
- Notificación al empleado de cambio de permisos
- Si FLAG audit: Registrar cambio en historial

**Configuraciones previas:**
- Roles predefinidos en sistema
- Matriz de permisos configurada

---

##### 1.2.6.3 Módulo: Negocio / F1
**Permisos incluidos:**
1. Consulta de caja (N1)
2. Apertura/cierre de caja (N2)
3. Gestión de formas de pago (N3)
4. Movimientos de caja y justificantes (N2)
5. Anulación y edición de ventas (N3)
6. Gestión de ventas y pedidos (N1)
7. Gestión de categorías de productos/servicios (N3)
8. Gestión de productos (N2)
9. Aplicación de descuentos (N2)
10. Consulta de KPIs de negocio (N1)
11. Análisis avanzado de ventas (N4)

---

##### 1.2.6.4 Módulo: Clientes
**Permisos incluidos:**
1. Consulta de clientes (N1)
2. Creación de clientes (N2)
3. Edición de clientes (N2)
4. Eliminación de clientes (N3)
5. Gestión de grupos de clientes (N3)
6. Consulta de historial de clientes (N1)
7. Exportación de datos de clientes (N3)

---

##### 1.2.6.5 Módulo: Almacén / Proveedores
**Permisos incluidos:**
1. Consulta de stock (N1)
2. Entradas de stock (N2)
3. Salidas de stock (N2)
4. Transferencias entre almacenes (N2)
5. Ajustes de inventario (N3)
6. Gestión de proveedores (N2)
7. Creación de órdenes de compra (N3)
8. Recepción de mercancía (N2)
9. Gestión de alertas de stock (N2)
10. Consulta de valoración de stock (N3)

---

##### 1.2.6.6 Módulo: Facturación / Contabilidad
**Permisos incluidos:**
1. Consulta de facturas emitidas (N1)
2. Emisión de facturas (N2)
3. Modificación de facturas (N3)
4. Anulación de facturas (N4)
5. Consulta de facturas recibidas (N1)
6. Registro de facturas de proveedores (N2)
7. Gestión de impuestos (N3)
8. Consulta de informes contables (N2)
9. Exportación contable (N3)
10. Conciliación bancaria (N4)

---

##### 1.2.6.7 Módulo: Informes
**Permisos incluidos:**
1. Acceso a informes básicos (N1)
2. Acceso a informes intermedios (N2)
3. Acceso a informes avanzados (N3)
4. Acceso a informes PRO (N4)
5. Creación de informes personalizados (N4)
6. Exportación de informes (N2)
7. Programación de informes automáticos (N3)

---

##### 1.2.6.8 Módulo: RRHH / Equipo
**Permisos incluidos:**
1. Ver equipo completo (N2)
2. Añadir empleados (N3)
3. Editar datos personales de empleados (N3)
4. Editar datos laborales de empleados (N4)
5. Eliminar empleados (N4)
6. Fichar entrada/salida (N1)
7. Consulta de fichajes propios (N1)
8. Consulta de fichajes del equipo (N2)
9. Solicitar corrección de fichaje (N1)
10. Aprobar correcciones de fichaje (N3)
11. Ajuste manual de fichajes (N3)
12. Ver horas trabajadas propias (N1)
13. Ver horas trabajadas del equipo (N2)
14. Aprobar horas extra (N3)
15. Gestión de horarios (N3)
16. Solicitar vacaciones (N1)
17. Consultar vacaciones propias (N1)
18. Ver vacaciones del equipo (N2)
19. Aprobar vacaciones (N3)
20. Proponer vacaciones (N3)
21. Asignar vacaciones directamente (N4)
22. Subir gastos personales (N1)
23. Ver gastos propios (N1)
24. Ver gastos del equipo (N2)
25. Aprobar gastos del equipo (N3)
26. Registrar consumos internos (N2)
27. Ver consumos del equipo (N2)
28. Aprobar consumos (N3)
29. Subir documentos laborales (N1)
30. Ver documentos propios (N1)
31. Ver documentos del equipo (N3)
32. Gestión de permisos de usuarios (N4)

---

#### 1.2.7 Pestaña: PUESTO (FLAG: jobdescription)

##### 1.2.7.1 Descripción del Puesto de Trabajo
**Función:** Definir funciones y responsabilidades del empleado  
**Rol:** Gerente (lectura y escritura), Trabajador (solo lectura)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación  

**Secciones de la descripción:**
- **Nombre del puesto:** Título oficial
- **Departamento:** Área de trabajo
- **Reporta a:** Superior directo
- **Supervisa a:** Empleados a cargo (si aplica)
- **Misión del puesto:** Objetivo principal
- **Funciones principales:** Lista de responsabilidades
- **Competencias requeridas:** Habilidades necesarias
- **Formación requerida:** Titulación o certificaciones
- **Experiencia requerida:** Años de experiencia

**Funcionalidades:**
- Botón "Editar descripción" → Abre modal de edición
- Campo de texto enriquecido para descripción detallada
- Plantillas predefinidas por puesto
- Historial de versiones (si FLAG audit)

**Validaciones:**
- Al menos funciones principales deben estar definidas
- ⚠ DECISIÓN PENDIENTE: ¿Obligatorio para todos los empleados?

**Alertas:**
- Si puesto vacío: Recordatorio en panel de empleado
- Cambios notificados al empleado

**Configuraciones previas:**
- Estructura organizativa definida
- Plantillas de puestos creadas (opcional)

---

##### 1.2.7.2 Objetivos del Puesto
**Función:** Definir y hacer seguimiento de objetivos del empleado  
**Rol:** Gerente (definir y evaluar), Trabajador (consultar y actualizar progreso)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Informes (para métricas)  

**Información por objetivo:**
- Descripción del objetivo
- Métrica de medición
- Valor objetivo
- Valor actual
- Plazo
- Estado: En progreso / Completado / Retrasado

**Funcionalidades:**
- Añadir nuevo objetivo
- Editar objetivo existente
- Marcar como completado
- Actualizar progreso
- Vincular a KPIs de informes

**⚠ DECISIÓN PENDIENTE:**
- ¿Integrar con sistema de evaluación de desempeño?
- ¿Objetivos individuales o por equipo?

---

#### 1.2.8 Pestaña: HISTORIAL (FLAG: audit)

##### 1.2.8.1 Registro de Cambios del Empleado
**Función:** Auditoría completa de modificaciones en el expediente  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación  
- 🔗 Sistema de auditoría global  

**Eventos registrados:**
- Cambios en datos personales
- Cambios en datos laborales
- Cambios en datos administrativos
- Cambios de rol/permisos
- Ajustes de fichajes
- Aprobación/rechazo de vacaciones
- Subida de documentos
- Cambios en horarios
- Cambios en descripción de puesto

**Información por evento:**
- Fecha y hora del cambio
- Usuario que realizó el cambio
- Tipo de cambio
- Campo modificado
- Valor anterior
- Valor nuevo
- Comentario/razón (si aplica)

**Funcionalidades:**
- Filtrar por tipo de evento
- Filtrar por rango de fechas
- Filtrar por usuario que realizó cambio
- Exportar historial completo

**Validaciones:**
- Historial no modificable (solo lectura)
- Registro automático de todos los cambios

---

### 1.3 FUNCIONALIDADES TRANSVERSALES DE LA PESTAÑA EQUIPO

#### 1.3.1 Búsqueda de Empleados
**Función:** Localizar empleado por nombre, email o DNI  
**Rol:** Gerente  
**⚠ DECISIÓN PENDIENTE:** Implementación futura

---

#### 1.3.2 Filtros de Empleados
**Función:** Filtrar listado por criterios  
**Rol:** Gerente  
**Filtros disponibles:**
- Estado (activo/inactivo)
- Rol
- Centro de trabajo (si multicenter)
- Departamento
**⚠ DECISIÓN PENDIENTE:** Implementación futura

---

#### 1.3.3 Exportación de Listado de Empleados
**Función:** Descargar listado completo  
**Rol:** Gerente  
**⚠ DECISIÓN PENDIENTE:** Implementación futura

---

## 2. PESTAÑA: HORARIOS (FLAG: schedules)

### 2.1 VISTA GENERAL DE PLANIFICACIÓN HORARIA

#### 2.1.1 Calendario Mensual de Horarios
**Función:** Visualización mensual de la planificación de horarios de todo el equipo  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Fichajes (para validar cumplimiento)  

**Funcionalidades:**
- Navegación mes a mes
- Vista por semanas
- Filtro por centro de trabajo (si multicenter)
- Color coding por turno
- Indicador de conflictos (solapamientos, falta de personal)

**Información mostrada:**
- Empleados en filas
- Días del mes en columnas
- Turno asignado por día
- Horas totales por empleado
- Horas totales por día

**Interacciones:**
- Click en celda → Asignar/cambiar turno
- Arrastrar para copiar turno a múltiples días
- Click derecho → Opciones de turno

---

#### 2.1.2 Gestión de Turnos
**Función:** Crear, editar y eliminar tipos de turnos  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🌍 Legislación laboral (jornadas máximas)  

**Información de un turno:**
- Nombre del turno (ej: "Mañana", "Tarde", "Noche")
- Hora de inicio
- Hora de fin
- Descanso (duración y si es remunerado)
- Color identificativo
- Centro de trabajo (si multicenter)

**Validaciones:**
- Hora de fin posterior a hora de inicio
- Duración del turno no excede máximo legal
- 🌍 Descanso mínimo obligatorio incluido

**Funcionalidades:**
- Crear nuevo turno
- Editar turno existente
- Eliminar turno (si no está en uso)
- Duplicar turno

**Configuraciones previas:**
- 🌍 Jornada máxima legal configurada
- 🌍 Descansos obligatorios según país/convenio

---

#### 2.1.3 Plantillas de Horario Semanal
**Función:** Crear patrones repetibles de horarios semanales  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Funcionalidades:**
- Crear plantilla nueva
- Definir turnos por día de la semana
- Nombrar plantilla (ej: "Semana estándar", "Semana intensiva")
- Aplicar plantilla a uno o varios empleados
- Aplicar plantilla a un mes completo

**Uso típico:**
- Crear plantilla "Mañanas L-V"
- Asignar a empleados con horario fijo
- Replicar por semanas/meses

**Validaciones:**
- Horas semanales totales coherentes con contratos
- No exceder jornada máxima legal

---

#### 2.1.4 Asignación Masiva de Horarios
**Función:** Asignar turno a múltiples empleados simultáneamente  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Seleccionar empleados (múltiples)
2. Seleccionar fecha o rango de fechas
3. Seleccionar turno a asignar
4. Confirmar

**Validaciones:**
- Empleados seleccionados tienen contrato compatible
- No solapamientos con vacaciones
- Horas no exceden contratadas

**Alertas:**
- Confirmación de asignación masiva
- Si algún empleado tiene conflicto: Mostrar alerta específica

---

#### 2.1.5 Copiar Semana Anterior
**Función:** Replicar horarios de una semana a la siguiente  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Click en "Copiar semana anterior"
2. Seleccionar semana origen
3. Seleccionar semana destino
4. Confirmar

**Validaciones:**
- Semana destino no tiene horarios asignados (o confirmar sobrescritura)
- Empleados siguen activos en semana destino

**Alertas:**
- Confirmación de copia exitosa
- Si hay conflictos: Listar empleados afectados

---

#### 2.1.6 Alertas de Planificación
**Función:** Detectar y mostrar conflictos en la planificación  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Fichajes  

**Tipos de alertas:**
- **Falta de personal:** Día con menos empleados del mínimo requerido
- **Solapamiento:** Empleado con dos turnos simultáneos
- **Exceso de horas:** Empleado supera horas contratadas
- **Sin horario:** Empleado sin turno asignado en día laboral
- **Conflicto con vacaciones:** Turno asignado en día de vacaciones
- **Descansos insuficientes:** 🌍 No cumple descanso mínimo legal

**Funcionalidades:**
- Panel de alertas destacado
- Contador de alertas pendientes
- Click en alerta → Navega a día/empleado específico
- Marcar alerta como "ignorada" con justificación

**Configuraciones previas:**
- Mínimo de personal por turno/día configurado
- 🌍 Normativa de descansos configurada

---

### 2.2 VISTA INDIVIDUAL DE HORARIOS (desde panel de empleado)
Ver sección 1.2.2 (Pestaña Horarios en panel de detalle)

---

## 3. PESTAÑA: FICHAJES (BASE)

### 3.1 VISTA GENERAL DE FICHAJES

#### 3.1.1 KPIs de Fichajes
**Función:** Resumen visual del estado de fichajes del día/período  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**KPIs mostrados:**
- **Fichados hoy:** Número y % de empleados que han fichado
- **Puntualidad:** % de empleados que llegaron a tiempo
- **Incidencias:** Número de fichajes con problemas (sin salida, sin entrada, fuera de área)
- **Horas trabajadas hoy:** Total acumulado
- **Empleados activos:** Trabajando en este momento

**Actualización:**
- En tiempo real (cada X minutos)
- Actualización manual con botón de refresh

---

#### 3.1.2 Tarjetas Desplegables de Resumen
**Función:** Cajas interactivas con información agregada  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**Tarjetas disponibles:**

**A) Fichajes de Hoy**
- Total de fichajes realizados hoy
- Click → Despliega lista de todos los fichajes del día
- Información por fichaje:
  - Empleado (nombre + avatar)
  - Hora de entrada
  - Hora de salida (o "En curso")
  - Estado: Completo / Activo / Sin fichar
  - Puntualidad: A tiempo / Tarde
  - Dispositivo usado
  - Geolocalización (si activo)

**B) Puntualidad**
- % de empleados puntuales en el período
- Click → Despliega ranking de puntualidad
- Información mostrada:
  - Top empleados más puntuales
  - Empleados con más retrasos
  - Promedio de retraso en minutos

**C) Incidencias**
- Número de fichajes con problemas
- Click → Despliega lista de incidencias
- Tipos de incidencias:
  - Sin fichaje de salida
  - Sin fichaje de entrada
  - Fichaje fuera de área geográfica
  - Fichaje en día no laboral
  - Solicitudes de ajuste pendientes

---

#### 3.1.3 Botón: Ver Listado Completo de Fichajes
**Función:** Acceder a vista detallada con filtros y búsqueda  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**⚠ DECISIÓN PENDIENTE:** Implementación futura

**Funcionalidades esperadas:**
- Tabla completa de todos los fichajes
- Filtros por:
  - Empleado
  - Centro de trabajo
  - Rango de fechas
  - Estado
  - Puntualidad
  - Dispositivo
- Búsqueda por nombre de empleado
- Ordenamiento por columnas
- Exportación a Excel/CSV
- Selección múltiple para acciones masivas

---

#### 3.1.4 Ranking de Puntualidad
**Función:** Gamificación y reconocimiento de empleados puntuales  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

**Información mostrada:**
- Posición en ranking
- Nombre del empleado
- % de puntualidad en el período
- Días trabajados
- Días puntuales
- Días tarde
- Promedio de retraso (en minutos)
- Medallas/insignias (1º, 2º, 3º lugares)

**Filtros:**
- Período: Hoy / Semana / Mes / Año
- Centro de trabajo (si multicenter)
- Ordenar: Mejor a peor / Peor a mejor

**Funcionalidades:**
- Click en empleado → Abre panel de detalle
- Botón "Ver ranking completo" → Modal o nueva vista

**⚠ DECISIÓN PENDIENTE:**
- ¿Mostrar ranking a los trabajadores?
- ¿Premios o reconocimientos automáticos?

---

#### 3.1.5 Ajuste Manual de Fichaje (Vista General)
**Función:** Gerente modifica fichaje desde la vista general  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

Ver detalles en sección 1.2.3.3

---

#### 3.1.6 Exportación de Fichajes
**Función:** Descargar registros de fichajes  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  

Ver detalles en sección 1.2.3.4

---

### 3.2 CONFIGURACIÓN DE FICHAJES

#### 3.2.1 Configuración de Geolocalización
**Función:** Definir áreas permitidas para fichaje  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador (centros de trabajo)  

**Funcionalidades:**
- Activar/desactivar validación de geolocalización
- Definir radio permitido desde centro de trabajo
- Configurar centros de trabajo con coordenadas
- Permitir fichaje fuera de área con justificación

**Validaciones:**
- Coordenadas geográficas válidas
- Radio mínimo y máximo lógico

**Alertas:**
- Fichaje fuera de área → Notificación a gerente
- ⚠ DECISIÓN PENDIENTE: ¿Bloquear fichaje o solo alertar?

**🌍 Dependencia de país:**
- Legislación de privacidad y geolocalización
- Consentimiento del trabajador requerido

---

#### 3.2.2 Configuración de Dispositivos Permitidos
**Función:** Controlar desde qué dispositivos se puede fichar  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  

**Opciones:**
- Permitir fichaje desde móvil
- Permitir fichaje desde tablet
- Permitir fichaje desde web (PC)
- Requiere autenticación biométrica (si dispositivo compatible)

**Validaciones:**
- Al menos un tipo de dispositivo debe estar permitido

---

#### 3.2.3 Horarios de Fichaje
**Función:** Definir ventanas de tiempo válidas para fichar  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador (horarios asignados)  

**Configuraciones:**
- **Anticipación máxima:** Minutos antes de inicio de turno que se puede fichar
- **Retraso máximo:** Minutos después de inicio que aún se considera puntual
- **Ventana de salida:** Minutos antes/después de fin de turno para fichar salida

**Ejemplo:**
- Turno: 9:00 - 17:00
- Anticipación: 15 min → Puede fichar desde 8:45
- Retraso: 5 min → Hasta 9:05 se considera puntual
- Ventana salida: 30 min → Puede salir entre 16:30 y 17:30

**⚠ DECISIÓN PENDIENTE:**
- ¿Configuración global o por empleado/turno?
- ¿Qué pasa si ficha fuera de ventana?

---

### 3.3 FICHAJE DESDE APLICACIÓN MÓVIL (Trabajador)

#### 3.3.1 Fichar Entrada
**Función:** Trabajador registra inicio de jornada  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador (horario asignado)  

**Proceso:**
1. Trabajador abre app
2. Click en "Fichar Entrada"
3. Sistema captura:
   - Hora actual
   - Geolocalización (si activo)
   - Dispositivo usado
   - IP (si web)
4. Confirmación visual

**Validaciones:**
- Trabajador no tiene fichaje de entrada abierto
- Dentro de ventana permitida (si configurada)
- Dentro de área geográfica (si configurada)

**Alertas:**
- Confirmación de fichaje exitoso
- Si fuera de horario: Aviso visual
- Si fuera de área: Solicitar justificación

---

#### 3.3.2 Fichar Salida
**Función:** Trabajador registra fin de jornada  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 Fichajes  

**Proceso:**
1. Trabajador abre app
2. Click en "Fichar Salida"
3. Sistema captura mismos datos que entrada
4. Calcula horas trabajadas
5. Confirmación visual con resumen

**Validaciones:**
- Trabajador tiene fichaje de entrada abierto
- Hora de salida posterior a entrada
- ⚠ DECISIÓN PENDIENTE: ¿Mínimo de horas para considerar válido?

**Alertas:**
- Confirmación con total de horas trabajadas
- Si jornada incompleta: Aviso

---

#### 3.3.3 Olvidé Fichar
**Función:** Trabajador solicita ajuste por olvido de fichaje  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 Fichajes  
- 🔗 RRHH / Trabajador  

Ver detalles en sección 1.2.3.2

---

## 4. PESTAÑA: VACACIONES (FLAG: vacations)

### 4.1 VISTA GENERAL DE VACACIONES

#### 4.1.1 Vista por Centros de Trabajo (si multicenter)
**Función:** Organizar vacaciones por centro de trabajo  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 FLAG: multicenter  

**Estructura:**
- Acordeones por centro
- Cada centro muestra:
  - Tarjetas de resumen
  - Calendario mensual
  - Solicitudes pendientes

**Funcionalidades:**
- Expandir/colapsar centros
- Navegación independiente de mes por centro
- Filtro para mostrar solo centros con solicitudes pendientes

---

#### 4.1.2 Tarjetas de Resumen por Centro

**Tarjeta A: Total Días Mes**
- Total de días de vacaciones consumidos en el mes actual
- Click → Despliega lista de empleados con vacaciones este mes
- Información por empleado:
  - Nombre
  - Avatar
  - Días de vacaciones en el mes
  - Total gastado en el año

**Tarjeta B: Solicitudes Pendientes**
- Número de solicitudes de vacaciones pendientes de aprobación
- Click → Despliega lista de solicitudes pendientes
- Información por solicitud:
  - Empleado
  - Período solicitado
  - Días solicitados
  - Fecha de solicitud
  - Comentario del empleado
  - Botones: Aprobar / Rechazar

**Tarjeta C: Total Año**
- Total de días de vacaciones consumidos en el año
- Click → Despliega resumen anual de vacaciones
- Comparativa por meses

---

#### 4.1.3 Calendario Mensual de Vacaciones
**Función:** Vista visual de vacaciones de todo el equipo  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Funcionalidades:**
- Navegación mes a mes por centro
- Código de colores:
  - Verde: Vacaciones aprobadas
  - Naranja: Solicitudes pendientes
  - Azul: Propuestas del gerente
  - Rojo: Solicitudes rechazadas (temporal)
- Click en día → Muestra quién está de vacaciones ese día
- Indicador de capacidad:
  - ✅ Capacidad OK
  - ⚠️ Capacidad ajustada
  - ❌ Capacidad insuficiente

**Validaciones:**
- ⚠ DECISIÓN PENDIENTE: ¿Bloquear aprobación si capacidad insuficiente?

---

#### 4.1.4 Botón: Proponer Vacaciones
**Función:** Gerente propone fechas a empleados  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

Ver detalles en sección 1.2.4.4

---

#### 4.1.5 Botón: Asignar Vacaciones
**Función:** Gerente asigna vacaciones directamente  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

Ver detalles en sección 1.2.4.5

---

#### 4.1.6 Modal de Solicitudes Pendientes
**Función:** Gestión rápida de todas las solicitudes pendientes  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Funcionalidades:**
- Lista completa de solicitudes pendientes (todos los centros)
- Ordenar por: Fecha de solicitud / Fecha de inicio / Empleado
- Filtrar por centro
- Aprobar/rechazar individual
- Aprobar/rechazar múltiples simultáneamente

**Información por solicitud:**
- Empleado
- Centro de trabajo
- Período solicitado
- Días laborables afectados
- Días disponibles del empleado
- Comentario del empleado
- Impacto en capacidad del equipo

**Alertas:**
- Si aprobación causa capacidad insuficiente: Advertencia
- Si empleado no tiene días suficientes: Alerta

---

### 4.2 CONFIGURACIÓN DE VACACIONES

#### 4.2.1 Configuración de Días por Año
**Función:** Definir días de vacaciones según convenio  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🌍 Legislación laboral del país  
- 🌍 Convenio colectivo  

**Configuraciones:**
- Días base por año natural (ej: 22 días en España)
- Días por antigüedad (incrementos automáticos)
- Días del año anterior (si se arrastra saldo)
- Fecha de corte (ej: 31 diciembre)

**Cálculo automático:**
- Proporcional por meses trabajados (si alta durante el año)
- Incremento por antigüedad

**⚠ DECISIÓN PENDIENTE:**
- ¿Configuración global o por convenio/centro?
- ¿Permitir excepcionalmente más días del saldo?

---

#### 4.2.2 Configuración de Períodos Bloqueados
**Función:** Definir fechas en las que no se pueden solicitar vacaciones  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Configuraciones:**
- Fechas bloqueadas (ej: temporada alta, eventos especiales)
- Bloqueo total o parcial (% máximo de plantilla)
- Bloqueo por centro de trabajo

**Validaciones:**
- Sistema no permite solicitar vacaciones en períodos bloqueados
- Opción de "forzar" con autorización especial

---

#### 4.2.3 Configuración de Anticipación Mínima
**Función:** Definir días de antelación para solicitar vacaciones  
**Rol:** Gerente  
**Dependencias:**  
- 🌍 Legislación / convenio  

**Configuración:**
- Días mínimos de anticipación (ej: 15 días)
- Excepciones por motivo (ej: urgencia familiar)

**Validaciones:**
- Sistema valida anticipación al solicitar
- ⚠ DECISIÓN PENDIENTE: ¿Permitir solicitar con menos anticipación con justificación?

---

## 5. PESTAÑA: CONSUMOS (FLAG: consumptions)

### 5.1 VISTA GENERAL DE CONSUMOS

#### 5.1.1 Tarjetas de Resumen

**Tarjeta A: Total Este Mes**
- Importe total de consumos internos del mes
- Número de consumos registrados
- Click → Despliega lista detallada de todos los consumos del mes
- Información por consumo:
  - Fecha y hora
  - Concepto (ej: Menú del día, Café, Bocadillo)
  - Empleado
  - Importe
  - Categoría

**Tarjeta B: Aprobaciones Pendientes**
- Número de consumos pendientes de aprobación
- Importe total pendiente
- Click → Despliega lista de consumos pendientes
- Información por consumo pendiente:
  - Empleado
  - Concepto
  - Importe
  - Fecha
  - Tipo: Consumo o Gasto
  - Botones: Aprobar / Rechazar

**Tarjeta C: Límites Excedidos**
- Número de empleados que han excedido su límite mensual
- Click → Despliega lista de empleados excedidos
- Información por empleado:
  - Nombre
  - Consumido este mes
  - Límite asignado
  - Exceso
  - Barra de progreso visual

---

#### 5.1.2 Botón: Ver Listado Completo de Consumos
**Función:** Acceder a vista detallada con filtros y búsqueda  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**⚠ DECISIÓN PENDIENTE:** Implementación futura

**Funcionalidades esperadas:**
- Tabla completa de todos los consumos
- Filtros por:
  - Empleado
  - Rango de fechas
  - Categoría
  - Estado (pendiente/aprobado/rechazado)
  - Centro de trabajo
- Búsqueda por concepto
- Ordenamiento por columnas
- Exportación a Excel/CSV
- Selección múltiple para aprobar/rechazar en lote

---

#### 5.1.3 Modal de Detalle de Consumo Pendiente
**Función:** Revisar solicitud de consumo y aprobar/rechazar  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Información mostrada:**
- Empleado (nombre + avatar)
- Fecha y hora del consumo
- Concepto
- Importe
- Categoría
- Tipo: Consumo interno / Gasto personal
- Estado del límite del empleado

**Acciones:**
- Botón "Aprobar"
- Botón "Rechazar" → Abre modal para indicar motivo
- Campo de motivo de rechazo obligatorio

**Validaciones:**
- Si aprobación excede límite: Mostrar advertencia
- ⚠ DECISIÓN PENDIENTE: ¿Permitir aprobar si excede límite?

**Alertas:**
- Notificación al empleado de aprobación/rechazo
- Si rechazo: Incluir motivo en notificación

---

### 5.2 GESTIÓN DE CONSUMOS

#### 5.2.1 Registrar Consumo (Trabajador)
**Función:** Empleado registra consumo interno realizado  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Trabajador accede a "Mis consumos"
2. Click en "Registrar consumo"
3. Completa formulario:
   - Fecha
   - Concepto
   - Importe
   - Categoría
4. Envía solicitud

**Validaciones:**
- Importe mayor que 0
- Fecha no futura
- ⚠ DECISIÓN PENDIENTE: ¿Límite máximo por consumo?

**Alertas:**
- Confirmación de registro
- Notificación a gerente de nueva solicitud
- Si cerca de límite: Aviso al trabajador

---

#### 5.2.2 Aprobar/Rechazar Consumos
**Función:** Gerente gestiona solicitudes de consumos  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso aprobación:**
1. Gerente revisa solicitud
2. Click en "Aprobar"
3. Consumo se suma al total del mes del empleado
4. Se descuenta del límite disponible

**Proceso rechazo:**
1. Gerente revisa solicitud
2. Click en "Rechazar"
3. Indica motivo obligatorio
4. Confirma rechazo

**Alertas:**
- Notificación al empleado
- Registro en historial (si FLAG audit)

---

### 5.3 CONFIGURACIÓN DE CONSUMOS

#### 5.3.1 Configurar Límites por Empleado
**Función:** Definir tope mensual de consumos internos  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Configuraciones:**
- Límite mensual en € por empleado
- Límite global o por categoría
- Sin límite (ilimitado)

**Validaciones:**
- ⚠ DECISIÓN PENDIENTE: ¿Qué pasa si se excede límite?
  - Bloquear nuevos consumos
  - Permitir pero alertar
  - Requerir aprobación especial

---

#### 5.3.2 Categorías de Consumos
**Función:** Definir tipos de consumos internos permitidos  
**Rol:** Gerente  
**Dependencias:**  
- Ninguna (configuración local)  

**Categorías típicas:**
- Comida (menú del día)
- Bebidas
- Snacks
- Material personal
- Otros

**Funcionalidades:**
- Crear nueva categoría
- Editar categoría existente
- Desactivar categoría

---

## 6. PESTAÑA: GASTOS (FLAG: expenses)

### 6.1 VISTA GENERAL DE GASTOS

#### 6.1.1 Tarjetas de Resumen

**Tarjeta A: Total Gastos**
- Importe total de gastos del período
- Número de gastos registrados
- Click → Despliega lista detallada de todos los gastos
- Información por gasto:
  - Fecha
  - Empleado
  - Concepto
  - Importe
  - Categoría
  - Estado: Aprobado / Pendiente / Rechazado
  - Justificante (si tiene)

**Tarjeta B: Aprobaciones Pendientes**
- Número de gastos pendientes de aprobación
- Importe total pendiente
- Click → Despliega lista de gastos pendientes
- Información por gasto pendiente:
  - Empleado (avatar + nombre)
  - Concepto
  - Importe
  - Fecha
  - Categoría
  - Justificación (texto)
  - Tiene factura/ticket adjunto
  - Botones: Aprobar / Rechazar

**Tarjeta C: Límites Excedidos**
- Número de empleados que han excedido su límite mensual de gastos
- Click → Despliega lista de empleados excedidos
- Información por empleado:
  - Nombre
  - Total de gastos del mes
  - Límite asignado
  - Exceso en €
  - Número de gastos registrados
  - Barra de progreso visual

---

#### 6.1.2 Botón: Ver Listado Completo de Gastos
**Función:** Acceder a vista detallada con filtros y búsqueda  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**⚠ DECISIÓN PENDIENTE:** Implementación futura

**Funcionalidades esperadas:**
- Tabla completa de todos los gastos
- Filtros por:
  - Empleado
  - Rango de fechas
  - Categoría
  - Estado (pendiente/aprobado/rechazado)
  - Con/sin justificante
  - Centro de trabajo
- Búsqueda por concepto
- Ordenamiento por columnas
- Exportación a Excel/CSV para contabilidad
- Selección múltiple para aprobar/rechazar en lote

---

#### 6.1.3 Modal de Detalle de Gasto
**Función:** Revisar solicitud de gasto con toda la información  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación (justificante)  

**Información mostrada:**
- **Header:**
  - Empleado (avatar + nombre)
  - Estado actual

- **Detalles del gasto:**
  - Fecha del gasto
  - Concepto (descripción)
  - Importe (destacado)
  - Categoría (badge visual)
  - Justificación (texto completo del empleado)

- **Documentación:**
  - Factura/ticket adjunto (previsualización)
  - Botón descargar justificante
  - Indicador si falta documentación

- **Contexto:**
  - Total de gastos del empleado este mes
  - Límite asignado
  - Gastos anteriores aprobados/rechazados

**Acciones:**
- Botón "Aprobar" (verde, destacado)
- Botón "Rechazar" → Abre modal para motivo
- Botón "Solicitar más información"
- Botón "Descargar justificante"

**Validaciones:**
- Si falta justificante: Advertencia
- Si excede límite: Alerta visible
- ⚠ DECISIÓN PENDIENTE: ¿Permitir aprobar sin justificante?

**Alertas:**
- Notificación al empleado de decisión
- Si rechazo: Incluir motivo obligatorio

---

### 6.2 GESTIÓN DE GASTOS

#### 6.2.1 Subir Gasto (Trabajador)
**Función:** Empleado registra gasto profesional para reembolso  
**Rol:** Trabajador  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación  

**Proceso:**
1. Trabajador accede a "Mis gastos"
2. Click en "Subir gasto"
3. Completa formulario:
   - Fecha del gasto
   - Concepto (descripción)
   - Importe
   - Categoría
   - Justificación detallada (obligatoria)
4. Adjunta factura/ticket (PDF o imagen)
5. Envía solicitud

**Validaciones:**
- Importe mayor que 0
- Fecha no futura
- Justificación mínima de X caracteres
- ⚠ DECISIÓN PENDIENTE: ¿Justificante obligatorio o opcional?

**Alertas:**
- Confirmación de envío
- Notificación a gerente de nueva solicitud
- Si cerca de límite: Aviso al trabajador

**Categorías de gasto típicas:**
- Transporte (combustible, peajes, taxis)
- Alojamiento (hoteles)
- Manutención (comidas con clientes)
- Material (compras para la empresa)
- Otros

---

#### 6.2.2 Aprobar/Rechazar Gastos
**Función:** Gerente gestiona solicitudes de gastos  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Facturación / Contabilidad (para registro contable)  

**Proceso aprobación:**
1. Gerente revisa solicitud y documentación
2. Click en "Aprobar"
3. Gasto se suma al total del mes del empleado
4. Se registra para reembolso en nómina
5. ⚠ DECISIÓN PENDIENTE: ¿Integración con contabilidad automática?

**Proceso rechazo:**
1. Gerente revisa solicitud
2. Click en "Rechazar"
3. Indica motivo obligatorio
4. Confirma rechazo

**Alertas:**
- Notificación al empleado
- Registro en historial (si FLAG audit)
- ⚠ DECISIÓN PENDIENTE: ¿Notificar a contabilidad/gestoría?

---

#### 6.2.3 Solicitar Más Información
**Función:** Gerente pide aclaraciones antes de aprobar/rechazar  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Proceso:**
1. Gerente revisa gasto
2. Click en "Solicitar más información"
3. Escribe mensaje con dudas
4. Envía al trabajador

**Trabajador recibe:**
- Notificación de solicitud de información
- Puede editar justificación
- Puede añadir más documentos
- Reenvía para revisión

**Estado del gasto:**
- Marcado como "Información solicitada"
- No cuenta en pendientes hasta que trabajador responda

---

### 6.3 CONFIGURACIÓN DE GASTOS

#### 6.3.1 Configurar Límites de Gastos
**Función:** Definir tope mensual de gastos reembolsables  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Configuraciones:**
- Límite mensual en € por empleado
- Límite por categoría (opcional)
- Sin límite (ilimitado)
- Límite especial por rol (ej: comerciales mayor límite)

**Validaciones:**
- ⚠ DECISIÓN PENDIENTE: ¿Qué pasa si se excede límite?
  - Bloquear nuevos gastos
  - Permitir pero requerir aprobación especial
  - Solo alertar

---

#### 6.3.2 Categorías de Gastos
**Función:** Definir tipos de gastos profesionales permitidos  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 Facturación / Contabilidad (categorías contables)  

**Categorías típicas:**
- **Transporte:**
  - Combustible
  - Peajes
  - Aparcamiento
  - Taxi/VTC
  - Transporte público

- **Alojamiento:**
  - Hotel
  - Apartamento

- **Manutención:**
  - Comida con clientes
  - Comida en desplazamiento

- **Material:**
  - Material de oficina
  - Herramientas
  - Equipamiento

- **Otros:**
  - Formación
  - Suscripciones
  - Otros gastos

**Funcionalidades:**
- Crear nueva categoría
- Editar categoría existente
- Asociar a categoría contable
- Desactivar categoría

---

#### 6.3.3 Políticas de Gastos
**Función:** Definir reglas y límites por tipo de gasto  
**Rol:** Gerente  
**Dependencias:**  
- 🌍 Legislación fiscal (gastos deducibles)  

**⚠ DECISIÓN PENDIENTE:** Implementación futura

**Políticas típicas:**
- Máximo por comida
- Máximo por noche de hotel
- Kilómetros: precio por km
- Justificante obligatorio si > X €
- Anticipación requerida para viajes

---

#### 6.3.4 Integración con Nóminas
**Función:** Vincular gastos aprobados con reembolso en nómina  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 Gestoría (si FLAG activo)  
- 🔗 Facturación / Contabilidad  

**⚠ DECISIÓN PENDIENTE:** Implementación futura

**Funcionalidades esperadas:**
- Exportar gastos aprobados del mes
- Formato compatible con gestoría
- Marcado de gastos ya reembolsados

---

## 7. FUNCIONALIDADES ADICIONALES

### 7.1 SISTEMA DE ONBOARDING (FLAG: onboarding)

#### 7.1.1 Invitar Empleado
**Función:** Enviar invitación a empleado para completar datos y aceptar condiciones  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación  

**⚠ DECISIÓN PENDIENTE:** Implementación completa

**Proceso:**
1. Gerente crea empleado con datos básicos
2. Sistema envía email de invitación
3. Empleado accede con link temporal
4. Empleado completa datos faltantes
5. Empleado sube documentación obligatoria
6. Empleado acepta condiciones y políticas
7. Estado cambia a "Activo"

**Estados de onboarding:**
- **Invitado:** Invitación enviada, pendiente aceptación
- **Pendiente datos:** Aceptó invitación, faltan datos
- **Pendiente gestoría:** Datos completos, pendiente alta legal
- **Activo:** Proceso completo
- **Inactivo:** Dado de baja

---

#### 7.1.2 Checklist de Onboarding
**Función:** Lista de tareas para completar alta del empleado  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Documentación  
- 🌍 Legislación del país  

**Tareas típicas:**
- ✅ Datos personales completos
- ✅ Datos laborales completos
- ✅ Datos administrativos completos
- ✅ Contrato firmado subido
- ✅ DNI/Pasaporte subido
- ✅ Cuenta bancaria (IBAN) registrada
- ✅ Alta en Seguridad Social (España)
- ✅ Reconocimiento médico (si obligatorio)
- ✅ Formación PRL completada
- ✅ Permisos de sistema asignados
- ✅ Horario asignado
- ✅ Acceso a app móvil configurado

**Indicador visual:**
- Progreso en % del checklist
- Tareas pendientes destacadas
- Alertas si tarea crítica pendiente

---

### 7.2 INTEGRACIÓN CON GESTORÍA (FLAG: gestoria)

#### 7.2.1 Notificaciones a Gestoría
**Función:** Informar automáticamente a gestoría de cambios relevantes  
**Rol:** Sistema (automático)  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Gestoría (partner externo)  

**⚠ DECISIÓN PENDIENTE:** Implementación completa

**Eventos que generan notificación:**
- Alta de nuevo empleado
- Baja de empleado
- Cambio de datos administrativos (NSS, grupo cotización, etc.)
- Cambio de tipo de contrato
- Cambio de salario
- Cambio de jornada
- IT (baja médica)

**Formato de notificación:**
- Email automático
- ⚠ DECISIÓN PENDIENTE: ¿API directa con software de gestoría?

---

#### 7.2.2 Exportación para Gestoría
**Función:** Generar archivos con datos de nóminas para gestoría  
**Rol:** Gerente, RRHH  
**Dependencias:**  
- 🔗 RRHH / Trabajador  
- 🔗 Fichajes  
- 🔗 Gastos  
- 🔗 Gestoría  

**⚠ DECISIÓN PENDIENTE:** Implementación completa

**Datos exportados:**
- Listado de empleados activos
- Horas trabajadas del mes (desde fichajes)
- Horas extra aprobadas
- Gastos aprobados para reembolso
- Ausencias (bajas, vacaciones)
- Cambios contractuales

**Formato:**
- Excel
- CSV
- ⚠ DECISIÓN PENDIENTE: ¿Formato A3 (estándar nóminas España)?

---

### 7.3 MULTICENTRO (FLAG: multicenter)

#### 7.3.1 Gestión de Centros de Trabajo
**Función:** Crear y configurar múltiples centros de trabajo  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 RRHH / Trabajador  

**Información por centro:**
- Nombre del centro
- Dirección completa
- Coordenadas geográficas (para fichajes)
- Color identificativo
- Icono
- Empleados asignados
- Activo/Inactivo

**Funcionalidades:**
- Crear nuevo centro
- Editar centro existente
- Desactivar centro
- Transferir empleados entre centros

---

#### 7.3.2 Filtros por Centro
**Función:** Filtrar todas las vistas por centro de trabajo  
**Rol:** Gerente  
**Dependencias:**  
- 🔗 FLAG: multicenter  

**Aplicable en:**
- Listado de empleados
- Fichajes
- Horarios
- Vacaciones
- Gastos
- Consumos

---

### 7.4 COMUNICACIONES

#### 7.4.1 Chat con Empleado
**Función:** Abrir chat directo con un empleado desde el módulo Equipo  
**Rol:** Gerente, Trabajador (ambos)  
**Dependencias:**  
- 🔗 Módulo de Comunicación  

**Funcionalidades:**
- Click en botón "Enviar mensaje" en tarjeta de empleado
- Abre chat en módulo de Comunicación
- Conversación 1 a 1
- Historial de mensajes

---

#### 7.4.2 Notificaciones Internas
**Función:** Sistema de notificaciones para eventos del módulo  
**Rol:** Sistema (automático)  
**Dependencias:**  
- 🔗 Sistema de notificaciones global  

**Eventos que generan notificación:**
- Nueva solicitud de ajuste de fichaje
- Nueva solicitud de vacaciones
- Aprobación/rechazo de vacaciones
- Nuevo gasto subido
- Aprobación/rechazo de gasto
- Cambio de horario
- Cambio de datos personales/laborales
- Nueva propuesta de vacaciones
- Documentación pendiente

**Tipos de notificación:**
- Push (app móvil)
- Email
- Badge en app web
- Panel de notificaciones

---

## 8. MÓDULO DE INFORMES - EQUIPO

### 8.1 Informe: Fichajes
**Nivel:** BASE  
**Categoría:** Equipo  
**Fuente:** Fichajes + Geolocalización  

Ver inventario completo en documento de Informes.

**Contenido:**
- KPIs: Fichajes totales, Puntuales, Tardíos, Ausentes
- Evolución de fichajes (gráfico)
- Detalle de fichajes por empleado
- Alertas y excepciones
- Insights (NORMAL/PRO)

---

### 8.2 Informe: Horas Trabajadas
**Nivel:** BASE  
**Categoría:** Equipo  
**Fuente:** Fichajes + Registros de horas  

**Contenido:**
- Total de horas trabajadas
- Horas por empleado
- Horas extra
- Comparativa vs horas contratadas
- Tendencias

---

### 8.3 Informe: Asistencia y Absentismo
**Nivel:** BASE  
**Categoría:** Equipo  
**Fuente:** Fichajes + Registros de presencia  

**Contenido:**
- % de asistencia
- Días de ausencia
- Motivos de ausencia
- Empleados con más ausencias
- Impacto en operación

---

### 8.4 Informe: Consumos Internos
**Nivel:** BASE  
**Categoría:** Equipo  
**Fuente:** Registros de consumos  

**⚠ DECISIÓN PENDIENTE:** Implementación completa

---

## 9. RESUMEN DE DEPENDENCIAS Y DECISIONES PENDIENTES

### 9.1 DEPENDENCIAS DE OTROS MÓDULOS

#### Con RRHH / Trabajador:
- Creación y gestión de empleados
- Datos personales, laborales y administrativos
- Estados de empleados
- Permisos y roles

#### Con Fichajes:
- Registro de entradas y salidas
- Validación de horarios
- Geolocalización
- Datos para informes

#### Con Documentación:
- Almacenamiento de documentos laborales
- Checklist de onboarding
- Contratos y certificados
- Justificantes de gastos

#### Con Facturación / Contabilidad:
- Registro contable de gastos
- Categorías contables
- Exportación para contabilidad

#### Con Gestoría (si FLAG activo):
- Notificación de altas/bajas
- Cambios contractuales
- Datos para nóminas
- Comunicación legal

#### Con Informes:
- Generación de informes de equipo
- KPIs y métricas
- Exportación de datos

---

### 9.2 DEPENDENCIAS DE PAÍS

#### España:
- Número de Seguridad Social
- CCC de empresa
- Código de contrato SEPE
- Grupo de cotización
- Convenios colectivos
- Días de vacaciones según convenio
- Descansos mínimos legales
- Alta en Seguridad Social
- Mutua laboral

#### Otros países:
- Identificación fiscal local
- Sistema de seguridad social equivalente
- Convenios y legislación laboral local
- Días de vacaciones según ley
- Formatos de contrato
- Retenciones fiscales

---

### 9.3 DECISIONES PENDIENTES CRÍTICAS

1. **Onboarding:**
   - ¿Enviar invitación automática al crear empleado?
   - ¿Proceso obligatorio o opcional?
   - ¿Qué pasa si trabajador no completa onboarding?

2. **Fichajes:**
   - ¿Límite de días atrás para solicitar ajuste?
   - ¿Límite de solicitudes de ajuste por mes?
   - ¿Notificar a trabajador de ajuste manual?
   - ¿Bloquear fichaje si documentación incompleta?
   - ¿Qué pasa si ficha fuera de ventana horaria?
   - ¿Qué pasa si ficha fuera de área geográfica?

3. **Horarios:**
   - ¿Permitir horas extra sin límite?
   - ¿Cambio de centro mueve horarios automáticamente?

4. **Vacaciones:**
   - ¿Bloquear aprobación si capacidad insuficiente?
   - ¿Permitir forzar vacaciones sin días disponibles?
   - ¿Inactivar empleado cancela vacaciones futuras?
   - ¿Días mínimos de anticipación?
   - ¿Permitir solicitar con menos anticipación con justificación?

5. **Consumos y Gastos:**
   - ¿Justificante obligatorio o opcional?
   - ¿Tamaño máximo de archivo?
   - ¿Permitir aprobar si excede límite?
   - ¿Permitir aprobar sin justificante?
   - ¿Qué pasa si se excede límite mensual?
   - ¿Integración automática con contabilidad?
   - ¿Notificar a gestoría de gastos aprobados?

6. **Permisos:**
   - ¿Cambio de rol requiere autorización adicional para roles críticos?

7. **Gestión de Personal:**
   - ¿Actualizar documentación laboral al cambiar dirección?
   - ¿Objetivos individuales o por equipo?
   - ¿Integrar con sistema de evaluación de desempeño?

8. **Descripción de puesto:**
   - ¿Obligatorio para todos los empleados?

9. **Integración con Gestoría:**
   - ¿API directa con software de gestoría?
   - ¿Formato A3 para nóminas?

10. **Gamificación:**
    - ¿Mostrar ranking de puntualidad a trabajadores?
    - ¿Premios o reconocimientos automáticos?

---

### 9.4 CONFIGURACIONES PREVIAS NECESARIAS

#### Para poner en marcha el módulo Equipo:
1. Empresa creada y seleccionada
2. Sistema de permisos configurado (roles y permisos)
3. Flags de RRHH activadas según plan contratado
4. Estructura organizativa básica (departamentos, centros)
5. 🌍 Configuración legal del país seleccionado
6. 🌍 Convenios colectivos aplicables cargados
7. Almacenamiento cloud para documentos
8. Tipos de documentos obligatorios definidos
9. Categorías de consumos y gastos creadas
10. Turnos básicos creados (si FLAG schedules)
11. Centros de trabajo creados (si FLAG multicenter)
12. Gestoría partner configurada (si FLAG gestoria)
13. Configuración de geolocalización (si fichaje con geo)
14. Dispositivos permitidos para fichaje
15. Políticas de vacaciones configuradas

---

## ESTADÍSTICAS FINALES

**Total de funcionalidades inventariadas:** 150+

**Pestañas principales:** 6  
- Equipo (BASE)
- Horarios (FLAG)
- Fichajes (BASE)
- Vacaciones (FLAG)
- Consumos (FLAG)
- Gastos (FLAG)

**Pestañas en panel de detalle de empleado:** 8  
- Información (BASE)
- Horarios (FLAG)
- Fichajes (BASE)
- Vacaciones (FLAG)
- Documentos (BASE)
- Permisos (BASE)
- Puesto (FLAG)
- Historial (FLAG)

**Flags totales del módulo:** 9  
- onboarding
- schedules
- clockin.advanced
- vacations
- expenses
- consumptions
- jobdescription
- audit
- gestoria
- multicenter

**Dependencias con otros módulos:** 5  
- RRHH / Trabajador
- Fichajes
- Documentación
- Facturación / Contabilidad
- Informes

**Dependencias de país identificadas:** 20+

**Decisiones pendientes críticas:** 10 áreas principales

**Roles que intervienen:** 3  
- Gerente (gestión completa)
- Trabajador (gestión propia limitada)
- RRHH (gestión de personal)

---

## NOTAS FINALES

Este inventario refleja el estado ACTUAL del módulo Equipo tal como está implementado en la interfaz.

**NO incluye:**
- Propuestas de nuevas funcionalidades
- Rediseños de UX
- Clasificación BASE/FLAG (se indica solo lo ya definido)

**Próximos pasos sugeridos:**
1. Revisar y aprobar decisiones pendientes
2. Completar configuraciones de país
3. Definir integraciones con gestoría
4. Implementar funcionalidades marcadas como "pendientes"
5. Realizar pruebas de flujos completos
6. Documentar APIs para backend

