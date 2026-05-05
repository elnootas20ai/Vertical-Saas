# 📚 DOCUMENTACIÓN COMPLETA MÓDULO EQUIPO - Vertial

**Versión:** 1.0  
**Fecha:** 4 Febrero 2026  
**Estado:** ✅ COMPLETO Y LISTO PARA DESARROLLO

---

## 🎯 PROPÓSITO DE ESTA DOCUMENTACIÓN

Este paquete contiene **TODA LA INFORMACIÓN** necesaria para desarrollar el módulo Equipo y RRHH de Vertial:

1. ✅ **162 funcionalidades** documentadas con IDs únicos
2. ✅ **Clasificación BASE/FLAG** completa
3. ✅ **Especificaciones técnicas** para cada endpoint
4. ✅ **Esquemas de base de datos**
5. ✅ **Sistema de permisos** (71 permisos)
6. ✅ **Validaciones backend** detalladas
7. ✅ **Estructura de requests/responses**
8. ✅ **Priorización en 4 fases**

---

## 📋 DOCUMENTOS DISPONIBLES

### 1️⃣ **LISTADO_FUNCIONALIDADES_COMPLETO.html**

**📌 Para:** Gerentes de proyecto, Product Owners, Analistas de negocio  
**🎯 Objetivo:** Entender QUÉ funcionalidades tiene el módulo y clasificarlas

**Contenido:**
- ✅ 162 funcionalidades organizadas por pestañas
- ✅ Clasificación BASE vs FLAG para cada una
- ✅ IDs únicos (EQ-001, FIC-001, VAC-001, etc.)
- ✅ Descripción de cada funcionalidad
- ✅ Roles que pueden acceder
- ✅ Decisiones pendientes marcadas claramente
- ✅ Resumen por módulo

**Secciones principales:**
1. **Pestaña EQUIPO (BASE)** - 12 funcionalidades
2. **Panel detalle empleado:**
   - Información (14 funcionalidades)
   - Horarios (12 funcionalidades - FLAG: schedules)
   - Fichajes (9 funcionalidades - BASE)
   - Vacaciones (13 funcionalidades - FLAG: vacations)
   - Documentos (12 funcionalidades - BASE)
   - Permisos (8 funcionalidades - BASE)
   - Puesto (3 funcionalidades - FLAG: jobdescription)
   - Historial (3 funcionalidades - FLAG: audit)
3. **Pestaña HORARIOS (FLAG: schedules)** - 7 funcionalidades
4. **Pestaña FICHAJES (BASE)** - 11 funcionalidades
5. **Pestaña VACACIONES (FLAG: vacations)** - 9 funcionalidades
6. **Pestaña CONSUMOS (FLAG: consumptions)** - 8 funcionalidades
7. **Pestaña GASTOS (FLAG: expenses)** - 11 funcionalidades
8. **Funcionalidades adicionales:**
   - Onboarding (4 funcionalidades - FLAG: onboarding)
   - Gestoría (3 funcionalidades - FLAG: gestoria)
   - Multicentro (3 funcionalidades - FLAG: multicenter)
   - Comunicaciones (5 funcionalidades - BASE)
9. **Módulo Informes** - 6 funcionalidades

**Cómo usar este documento:**
1. Abrirlo en navegador
2. Usar Ctrl+F para buscar funcionalidades específicas
3. Usar IDs únicos para referenciar en reuniones
4. Imprimir o guardar como PDF para distribución
5. Usar para tomar decisiones sobre qué es BASE y qué es FLAG

---

### 2️⃣ **ESPECIFICACION_BACKEND_COMPLETA.html**

**📌 Para:** Programadores backend, Arquitectos de software, Tech Leads  
**🎯 Objetivo:** Implementar TODOS los endpoints y conectar con frontend

**Contenido:**
- ✅ Especificación técnica completa de APIs REST
- ✅ Endpoints con métodos HTTP (GET, POST, PUT, DELETE)
- ✅ Request body con JSON estructurado
- ✅ Response esperado con ejemplos reales
- ✅ Validaciones backend punto por punto
- ✅ Permisos requeridos para cada endpoint
- ✅ Esquemas de base de datos (CREATE TABLE)
- ✅ Middleware de permisos (código ejemplo)
- ✅ Códigos de error estándar
- ✅ Convenciones de API
- ✅ Notas de implementación
- ✅ Dependencias entre módulos

**Endpoints documentados (principales):**

**EMPLEADOS (BASE):**
- `GET /employees` - Listar empleados
- `POST /employees` - Crear empleado
- `GET /employees/{id}` - Ver detalle
- `PUT /employees/{id}/personal-data` - Editar datos personales
- `PUT /employees/{id}/labor-data` - Editar datos laborales
- `PUT /employees/{id}/deactivate` - Dar de baja

**FICHAJES (BASE):**
- `GET /employees/{id}/clock-ins/summary` - Resumen fichajes
- `POST /clock-ins/check-in` - Fichar entrada
- `POST /clock-ins/check-out` - Fichar salida
- `POST /clock-ins/{id}/adjustment-request` - Solicitar ajuste
- `PUT /clock-in-adjustments/{id}/review` - Aprobar/rechazar ajuste
- `PUT /clock-ins/{id}/manual-adjust` - Ajuste manual gerente

**VACACIONES (FLAG: vacations):**
- `GET /employees/{id}/vacations/balance` - Balance vacaciones
- `POST /employees/{id}/vacations/request` - Solicitar vacaciones
- `PUT /vacation-requests/{id}/approve` - Aprobar
- `PUT /vacation-requests/{id}/reject` - Rechazar
- `POST /employees/{id}/vacations/assign` - Asignar directo (gerente)

**HORARIOS (FLAG: schedules):**
- `GET /employees/{id}/schedules` - Ver horario
- `PUT /employees/{id}/schedules` - Editar horario
- `POST /shifts` - Crear turno
- `PUT /shifts/{id}` - Editar turno
- `DELETE /shifts/{id}` - Eliminar turno

**GASTOS (FLAG: expenses):**
- `POST /employees/{id}/expenses` - Subir gasto
- `PUT /expenses/{id}/approve` - Aprobar
- `PUT /expenses/{id}/reject` - Rechazar

**CONSUMOS (FLAG: consumptions):**
- `POST /employees/{id}/consumptions` - Registrar
- `PUT /consumptions/{id}/approve` - Aprobar

**DOCUMENTOS (BASE):**
- `GET /employees/{id}/documents` - Listar
- `POST /employees/{id}/documents` - Subir (multipart/form-data)
- `DELETE /documents/{id}` - Eliminar

**PERMISOS (BASE):**
- `GET /employees/{id}/permissions` - Ver permisos
- `PUT /employees/{id}/role` - Cambiar rol

**Esquemas de BD incluidos:**
- `employees` - Tabla principal empleados
- `clock_ins` - Tabla fichajes
- `vacation_requests` - Tabla solicitudes vacaciones
- `expenses` - Tabla gastos
- `consumptions` - Tabla consumos
- `documents` - Tabla documentos
- `schedules` - Tabla horarios
- `shifts` - Tabla turnos
- `audit_log` - Tabla auditoría

**Cómo usar este documento:**
1. Abrirlo en navegador
2. El programador debe leerlo de principio a fin
3. Implementar endpoints en el orden sugerido (4 fases)
4. Usar los request/response como contratos de API
5. Implementar validaciones exactas descritas
6. Crear esquemas de BD tal como se muestran
7. Implementar middleware de permisos según ejemplo
8. Usar IDs únicos para trackear implementación

---

## 🎯 SISTEMA DE IDs ÚNICOS

Cada funcionalidad tiene un ID único para trazabilidad:

| Prefijo | Módulo | Ejemplo |
|---------|--------|---------|
| **EQ-** | Equipo (listado) | EQ-001, EQ-008 |
| **INFO-** | Información empleado | INFO-001, INFO-002 |
| **HOR-** | Horarios (detalle) | HOR-001, HOR-004 |
| **HORGEN-** | Horarios (general) | HORGEN-001, HORGEN-004 |
| **FIC-** | Fichajes (detalle) | FIC-001, FIC-004 |
| **FICMOV-** | Fichaje móvil | FICMOV-001, FICMOV-002 |
| **FICGEN-** | Fichajes (general) | FICGEN-001, FICGEN-002 |
| **VAC-** | Vacaciones (detalle) | VAC-001, VAC-005 |
| **VACGEN-** | Vacaciones (general) | VACGEN-001, VACGEN-002 |
| **VACCONF-** | Configuración vacaciones | VACCONF-001 |
| **DOC-** | Documentos | DOC-001, DOC-007 |
| **PER-** | Permisos | PER-001, PER-005 |
| **PUESTO-** | Descripción puesto | PUESTO-001 |
| **HIST-** | Historial/Audit | HIST-001 |
| **CONS-** | Consumos | CONS-001, CONS-003 |
| **GAST-** | Gastos | GAST-001, GAST-004 |
| **ONB-** | Onboarding | ONB-001 |
| **GEST-** | Gestoría | GEST-001 |
| **MULTI-** | Multicentro | MULTI-001 |
| **COM-** | Comunicaciones | COM-001 |
| **INF-** | Informes | INF-001 |

**Uso en desarrollo:**
- Commits: `git commit -m "feat(EQ-008): Implementar endpoint crear empleado"`
- Tareas: "Implementar FIC-001: Resumen de fichajes"
- Code reviews: "Revisar validaciones de VAC-005"
- Testing: "Test unitario para GAST-004"

---

## 🚀 PRIORIZACIÓN DE DESARROLLO (4 FASES)

### **FASE 1 - BASE (Funcionalidades críticas)** ⭐⭐⭐⭐⭐
**Prioridad:** MÁXIMA  
**Tiempo estimado:** 4-6 semanas  
**Funcionalidades:**
- Gestión de empleados (EQ-001 a EQ-012)
- Fichajes completos (FIC-001 a FIC-009, FICMOV-001 a FICMOV-005)
- Documentos (DOC-001 a DOC-012)
- Permisos (PER-001 a PER-008)
- Comunicaciones básicas (COM-001 a COM-005)

**Total:** ~50 funcionalidades BASE

**Criterios de aceptación FASE 1:**
- ✅ Crear, editar, visualizar empleados
- ✅ Fichar entrada/salida desde móvil
- ✅ Solicitar y aprobar ajustes de fichaje
- ✅ Subir y gestionar documentos
- ✅ Sistema de permisos funcionando
- ✅ Notificaciones básicas

---

### **FASE 2 - FLAGS Básicos** ⭐⭐⭐⭐
**Prioridad:** ALTA  
**Tiempo estimado:** 3-4 semanas  
**Funcionalidades:**
- FLAG vacations (VAC-001 a VAC-013, VACGEN-001 a VACGEN-006, VACCONF-001 a VACCONF-003)
- FLAG schedules (HOR-001 a HOR-012, HORGEN-001 a HORGEN-007)

**Total:** ~35 funcionalidades

**Criterios de aceptación FASE 2:**
- ✅ Solicitar, aprobar, rechazar vacaciones
- ✅ Cálculo automático balance vacaciones
- ✅ Crear y asignar turnos
- ✅ Planificación horaria mensual/semanal
- ✅ Validaciones de descansos legales

---

### **FASE 3 - FLAGS Avanzados** ⭐⭐⭐
**Prioridad:** MEDIA  
**Tiempo estimado:** 3-4 semanas  
**Funcionalidades:**
- FLAG expenses (GAST-001 a GAST-011)
- FLAG consumptions (CONS-001 a CONS-008)
- FLAG onboarding (ONB-001 a ONB-004)

**Total:** ~23 funcionalidades

**Criterios de aceptación FASE 3:**
- ✅ Subir y aprobar gastos
- ✅ Gestión de consumos internos
- ✅ Proceso de onboarding automatizado
- ✅ Checklist de tareas onboarding

---

### **FASE 4 - Integraciones y Optimizaciones** ⭐⭐
**Prioridad:** BAJA  
**Tiempo estimado:** 2-3 semanas  
**Funcionalidades:**
- FLAG gestoria (GEST-001 a GEST-003)
- FLAG multicenter (MULTI-001 a MULTI-003)
- FLAG audit (HIST-001 a HIST-003)
- FLAG jobdescription (PUESTO-001 a PUESTO-003)
- Módulo Informes (INF-001 a INF-006)

**Total:** ~18 funcionalidades

**Criterios de aceptación FASE 4:**
- ✅ Integración con gestoría externa
- ✅ Soporte multicentro
- ✅ Auditoría completa de cambios
- ✅ Gestión de puestos de trabajo
- ✅ Informes avanzados

---

## 🔒 SISTEMA DE PERMISOS (71 permisos totales)

**Arquitectura:**
- ✅ Permisos SOLO se definen en roles
- ✅ Usuarios heredan TODOS los permisos del rol
- ✅ NO hay personalización individual
- ✅ 4 niveles jerárquicos: N1 → N2 → N3 → N4

**Módulo RRHH/Equipo (32 permisos):**

| Código | Descripción | Nivel |
|--------|-------------|-------|
| `ver_equipo` | Ver equipo completo | N2 |
| `añadir_empleados` | Añadir nuevos empleados | N3 |
| `editar_datos_personales` | Editar datos personales | N3 |
| `editar_datos_laborales` | Editar datos laborales | N4 |
| `eliminar_empleados` | Eliminar/dar de baja | N4 |
| `fichar_entrada_salida` | Fichar entrada/salida | N1 |
| `consulta_fichajes_propios` | Ver fichajes propios | N1 |
| `consulta_fichajes_equipo` | Ver fichajes equipo | N2 |
| `solicitar_correccion_fichaje` | Solicitar corrección | N1 |
| `aprobar_correcciones_fichaje` | Aprobar correcciones | N3 |
| `ajustar_fichajes_manual` | Ajustar manualmente | N3 |
| `gestion_horarios` | Gestión completa horarios | N3 |
| `solicitar_vacaciones` | Solicitar vacaciones | N1 |
| `consultar_vacaciones_propias` | Ver vacaciones propias | N1 |
| `ver_vacaciones_equipo` | Ver vacaciones equipo | N2 |
| `aprobar_vacaciones` | Aprobar/rechazar vacaciones | N3 |
| `asignar_vacaciones_directamente` | Asignar sin solicitud | N4 |
| `subir_gastos_personales` | Subir gastos | N1 |
| `ver_gastos_propios` | Ver gastos propios | N1 |
| `ver_gastos_equipo` | Ver gastos equipo | N2 |
| `aprobar_gastos_equipo` | Aprobar/rechazar gastos | N3 |
| `registrar_consumos_internos` | Registrar consumos | N2 |
| `ver_consumos_equipo` | Ver consumos equipo | N2 |
| `aprobar_consumos` | Aprobar consumos | N3 |
| `subir_documentos_laborales` | Subir documentos | N1 |
| `ver_documentos_propios` | Ver documentos propios | N1 |
| `ver_documentos_equipo` | Ver documentos equipo | N3 |
| `gestion_permisos_usuarios` | Gestionar roles/permisos | N4 |

---

## 🚨 DECISIONES PENDIENTES CRÍTICAS

Antes de comenzar el desarrollo, es necesario definir:

### **1. Fichajes:**
- ❓ Límite días atrás para solicitar ajustes: **¿7 días? ¿15 días?**
- ❓ Notificar al trabajador cuando gerente ajusta manualmente: **¿Sí o no?**

### **2. Vacaciones:**
- ❓ Anticipación mínima para solicitar: **¿15 días? ¿30 días?**
- ❓ Permitir forzar asignación sin días disponibles: **¿Sí o no?**

### **3. Gastos:**
- ❓ Justificante obligatorio: **¿Obligatorio u opcional?**
- ❓ Tamaño máximo archivo: **¿10MB? ¿20MB?**
- ❓ Integración automática con nóminas: **¿Implementar?**

### **4. Documentos:**
- ❓ Tamaño máximo archivo: **¿10MB? ¿20MB?**
- ❓ Bloquear fichaje si documentación incompleta: **¿Sí o no?**

### **5. Onboarding:**
- ❓ Enviar invitación automática al crear empleado: **¿Sí o no?**
- ❓ Iniciar proceso de onboarding automático: **¿Sí o no?**

### **6. Gestoría:**
- ❓ API directa con software gestoría: **¿Qué software? ¿A3? ¿Sage?**
- ❓ Formato de exportación: **¿Excel? ¿CSV? ¿API REST?**

---

## 📊 RESUMEN POR CLASIFICACIÓN

| Clasificación | Cantidad | Descripción |
|---------------|----------|-------------|
| **BASE** | ~85 funcionalidades | Incluidas en plan base, siempre visibles |
| **FLAG** | ~65 funcionalidades | Condicionadas a flags activos |
| **PENDIENTE** | ~12 decisiones | Funcionalidades con decisiones pendientes |

### **FLAGS del módulo (9 total):**
1. ✅ `schedules` - Planificación horaria avanzada
2. ✅ `vacations` - Gestión de vacaciones
3. ✅ `expenses` - Gestión de gastos
4. ✅ `consumptions` - Consumos internos
5. ✅ `onboarding` - Proceso de alta automatizado
6. ✅ `gestoria` - Integración con gestoría
7. ✅ `multicenter` - Soporte multicentro
8. ✅ `audit` - Auditoría de cambios
9. ✅ `jobdescription` - Descripción de puestos

---

## ✅ CHECKLIST DE ENTREGA AL PROGRAMADOR

### **Antes de empezar:**
- [ ] Leer `ESPECIFICACION_BACKEND_COMPLETA.html` completo
- [ ] Revisar `LISTADO_FUNCIONALIDADES_COMPLETO.html` para entender el alcance
- [ ] Confirmar decisiones pendientes con Product Owner
- [ ] Configurar entorno de desarrollo
- [ ] Crear esquemas de base de datos
- [ ] Implementar middleware de autenticación y permisos

### **Durante el desarrollo:**
- [ ] Usar IDs únicos en commits (ej: `feat(EQ-008): ...`)
- [ ] Seguir estructura de request/response documentada
- [ ] Implementar TODAS las validaciones descritas
- [ ] Crear tests unitarios para cada endpoint
- [ ] Documentar cambios o desviaciones del spec
- [ ] Revisar FLAGS antes de cada implementación

### **Priorización:**
- [ ] FASE 1: Implementar funcionalidades BASE primero
- [ ] FASE 2: Implementar FLAGS básicos (vacations, schedules)
- [ ] FASE 3: Implementar FLAGS avanzados (expenses, consumptions)
- [ ] FASE 4: Implementar integraciones y optimizaciones

### **Al finalizar cada endpoint:**
- [ ] Validar con frontend que estructura sea correcta
- [ ] Probar permisos (N1, N2, N3, N4)
- [ ] Verificar validaciones backend
- [ ] Documentar en Postman/Swagger
- [ ] Actualizar estado en gestor de tareas

---

## 🎯 CONVENCIONES API

**Base URL:**
```
https://api.vertialapp.com/v1
```

**Headers requeridos:**
```
Authorization: Bearer {token}
X-Company-Id: {companyId}
```

**Formato de fechas:**
```
ISO 8601: YYYY-MM-DDTHH:mm:ssZ
Ejemplo: 2026-02-04T10:30:00Z
```

**Formato de moneda:**
```
Decimal con 2 decimales
Ejemplo: 1500.50
```

**Estructura de respuesta exitosa:**
```json
{
  "success": true,
  "data": { /* payload */ },
  "message": "Operación exitosa",
  "meta": {
    "timestamp": "2026-02-04T10:30:00Z",
    "requestId": "uuid-v4"
  }
}
```

**Estructura de respuesta con error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email ya existe en el sistema",
    "field": "email"
  },
  "meta": {
    "timestamp": "2026-02-04T10:30:00Z",
    "requestId": "uuid-v4"
  }
}
```

**Códigos de error:**
| HTTP | Código | Descripción |
|------|--------|-------------|
| 400 | `VALIDATION_ERROR` | Error de validación |
| 401 | `UNAUTHORIZED` | Token inválido/expirado |
| 403 | `FORBIDDEN` | Sin permisos |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT` | Conflicto (duplicado) |
| 422 | `BUSINESS_RULE_ERROR` | Regla de negocio violada |
| 500 | `INTERNAL_ERROR` | Error interno servidor |

---

## 📞 CONTACTO Y SOPORTE

**Para dudas técnicas:**
- Revisar documento técnico completo
- Buscar por ID de funcionalidad
- Consultar con Tech Lead

**Para decisiones de negocio:**
- Revisar sección "Decisiones Pendientes"
- Consultar con Product Owner
- Documentar decisión y actualizar spec

---

## 📝 NOTAS FINALES

✅ **Estos documentos son el contrato entre frontend y backend**  
✅ **Cualquier cambio debe documentarse y notificarse**  
✅ **Los IDs únicos son permanentes, no cambiarlos**  
✅ **La clasificación BASE/FLAG es crítica para el modelo de negocio**  
✅ **Las validaciones descritas son obligatorias**  
✅ **El sistema de permisos es fijo y no personalizable por usuario**  

---

**Versión del documento:** 1.0  
**Última actualización:** 4 Febrero 2026  
**Autor:** Equipo Vertial  
**Estado:** ✅ COMPLETO Y APROBADO PARA DESARROLLO
