# 🔍 AUDITORÍA COMPLETA - MÓDULO SISTEMA (UDAR EDGE)

**Fecha:** 27 de Enero de 2026  
**Tipo:** Auditoría técnica-funcional  
**Alcance:** Multiempresa, Multipunto de venta, Planes comerciales, Multipaís, Multiidioma

---

## 📋 RESUMEN EJECUTIVO

El módulo Sistema de UDAR EDGE proporciona la capa base de gestión de cuenta, empresas, centros, usuarios y configuración general. La auditoría identifica:

**✅ IMPLEMENTADO EN UX:**
- Selector de empresa (single/global)
- Vista Global con restricciones de acceso
- Gestión de Puntos de Venta/Centros (CRUD)
- Configuración de empresa (información general, datos legales)
- Sistema de usuarios y roles (UX completa)
- Feature Flags (solo para módulo RRHH)
- Preparación para multipaís (países, monedas, idiomas, zonas horarias)
- Persistencia en localStorage

**⚠️ PARCIAL:**
- Multiidioma (preparación UX, sin i18n funcional)
- Feature Flags (solo RRHH, no generalizado)
- Permisos granulares (UX existe, sin vinculación funcional)
- Invitación de usuarios (UX existe, sin backend)

**❌ NO TRABAJADO:**
- Concepto de Cuenta/Tenant (no existe separación account-company)
- Sistema de suscripción/plan comercial estructurado
- Multiidioma i18n (todo hardcoded en español)
- Permisos por centro/PDV funcionales
- Seguridad avanzada (2FA, logs de acceso, políticas de contraseña)

---

## 📊 TABLA 1: INVENTARIO DE FUNCIONALIDADES

| Área | Funcionalidad | Descripción corta | Estado actual | Dónde existe | Alcance | Soporte Multiempresa | Soporte Multipunto de venta | Soporte Multipaís | Soporte Multiidioma | Dependencias | Riesgos |
|------|---------------|-------------------|---------------|--------------|---------|---------------------|---------------------------|------------------|-------------------|--------------|---------|
| **Cuenta/Tenant** | Gestión de cuenta | Nivel superior que agrupa empresas | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe separación lógica Account-Company. Todo está en Company[] del User. |
| **Cuenta/Tenant** | Suscripción/Plan | Plan comercial con límites y features | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe modelo estructurado de planes. Solo RRHHFlags. |
| **Empresas** | Modelo Company | Definición de empresa con vertical y color | ✅ Implementado | `/src/app/types.ts` líneas 21-31 | Empresa | Sí (array en User) | No | Parcial (preparación) | No | User | Company no tiene país, moneda ni idioma propio. |
| **Empresas** | Selector de empresa | Dropdown para cambiar empresa activa | ✅ Implementado | `/src/app/components/layout/HeaderResponsive.tsx` líneas 58-200 | Usuario | Sí | No | No | No | AppContext, User.companies | Persiste en localStorage. Si se borra, reset. |
| **Empresas** | Vista Global | Modo que muestra datos consolidados | ✅ Implementado | AppContext, HeaderResponsive, módulos que bloquean | Usuario | Sí | N/A | N/A | N/A | AppContext | Solo Gerente accede. Algunos módulos bloqueados en global. |
| **Empresas** | Restricción por empresa | Bloqueo de módulos sin empresa activa | ✅ Implementado | RestrictedSection en múltiples módulos | Módulo | Sí | N/A | N/A | N/A | AppContext.currentCompany | Si no hay currentCompany, RestrictedSection. |
| **Centros/PDV** | Modelo WorkCenter | Definición de centro/PDV con ubicación y estado | ✅ Implementado | `/src/app/components/sections/configuracion/PuntosDeVenta.tsx` líneas 39-48 | Centro | Sí (por empresa) | Sí (nativo) | Parcial (campo country) | No | Company | Mock hardcoded, no en tipos globales. |
| **Centros/PDV** | Alta de centro/PDV | Creación de nuevo punto de venta | ✅ Implementado UX | PuntosDeVenta.tsx, modal de creación | Centro | Sí | Sí | Sí (campo country) | No | Company | UX completa, sin backend. No persiste. |
| **Centros/PDV** | Edición de centro | Modificar datos de centro existente | ✅ Implementado UX | PuntosDeVenta.tsx | Centro | Sí | Sí | Sí | No | Company | UX completa, sin backend. |
| **Centros/PDV** | Desactivación de centro | Cerrar centro con gestión de stock/personal | ✅ Implementado UX | DeactivatePDVModal | Centro | Sí | Sí | No | No | Stock, RRHH | Modal con opciones transferir/ajustar. Sin backend. |
| **Centros/PDV** | Estado activo/inactivo | Control de centros operativos | ✅ Implementado | WorkCenter.status | Centro | Sí | Sí | No | No | N/A | Solo visual, no afecta flujos. |
| **Centros/PDV** | Centro de coste | Flag para contabilidad | ✅ Implementado UX | WorkCenter.isCostCenter | Centro | Sí | Sí | No | No | Finanzas | Flag booleano, sin lógica contable. |
| **Usuarios** | Modelo User | Usuario con rol y empresas asignadas | ✅ Implementado | `/src/app/types.ts` líneas 33-40 | Usuario | Sí (User.companies[]) | No | No | No | Company | User.companies permite multiempresa. |
| **Usuarios** | Roles de sistema | Gerente, Trabajador | ✅ Implementado | types.ts, AppContext | Usuario | Sí | No | No | No | N/A | Solo 2 roles hardcoded. No personalizable. |
| **Usuarios** | Alta de usuario trabajador | Crear trabajador interno | ✅ Implementado UX | AddEmployeeModal | Empresa | Sí | Parcial (asigna 1 centro) | No | No | Employee, Company | Modal completo, sin backend. |
| **Usuarios** | Invitación de usuario | Invitar por email con onboarding | ⚠️ Parcial | AddEmployeeModal, onboardingStatus | Empresa | Sí | No | No | No | RRHH.onboarding flag | UX existe, sin envío de email real. |
| **Usuarios** | Gestión de usuarios externos | Clientes, proveedores, gestoría | ✅ Implementado UX | ConfiguracionAccesos.tsx, ModalCliente | Empresa | Sí | No | No | No | N/A | Mock data, 3 tipos: trabajadores, clientes, agentes. |
| **Usuarios** | Permisos por rol | Admin, Gerente, Encargado, Trabajador | ✅ Implementado UX | ConfiguracionUsuariosPermisos.tsx | Empresa | Sí | Parcial (asignación PDV) | No | No | N/A | UX completa con niveles (ninguno/ver/operar/administrar). Sin backend. |
| **Usuarios** | Asignación a centros | Vincular usuario a PDV específicos | ✅ Implementado UX | ConfiguracionUsuariosPermisos.tsx, Employee.workCenter | Centro | Sí | Sí | No | No | WorkCenter | Array de PDV asignados. Sin validación funcional. |
| **Feature Flags** | RRHHFlags | 10 flags para módulo RRHH | ✅ Implementado | types.ts líneas 8-19, Company.rrhhFlags | Empresa | Sí | Parcial (multicenter flag) | No | No | Módulo RRHH | Único módulo con flags. No generalizado. |
| **Feature Flags** | Sistema general de flags | Flags para todos los módulos | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Solo existe RRHHFlags. Otros módulos no tienen. |
| **Feature Flags** | Plan comercial con flags | Asociar flags a plan/suscripción | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No hay modelo de plan. Flags están directamente en Company. |
| **Configuración** | Módulo Configuración | Hub de configuración | ✅ Implementado | Configuracion.tsx, ConfiguracionEmpresa.tsx | Empresa | Sí | Parcial | Parcial | No | N/A | 5 secciones: Empresa, Accesos, Módulos (no impl), Seguridad (no impl), Notificaciones (no impl). |
| **Configuración** | Información general | Nombre, logo, datos de contacto | ✅ Implementado UX | InformacionGeneral.tsx | Empresa | Sí | No | Sí (selección país) | Sí (selección idioma) | N/A | Formularios completos. Sin persistencia. |
| **Configuración** | Datos legales/fiscales | NIF/CIF, razón social, dirección fiscal | ✅ Implementado UX | InformacionGeneral.tsx | Empresa | Sí | No | Sí (campos preparados) | No | N/A | Formularios completos. Sin backend. |
| **Configuración** | Branding básico | Logo, color corporativo | ✅ Implementado | Company.logo, Company.color | Empresa | Sí | No | No | No | N/A | Color usado en header. Logo opcional. |
| **Configuración** | Marcas | Submarcas de la empresa | ✅ Implementado UX | ConfiguracionMarcas.tsx | Empresa | Sí | Sí (marcas por PDV) | No | No | N/A | UX completa, mock data. |
| **Configuración** | Calendario laboral | Festivos y días no laborables | ✅ Implementado UX | CalendarioLaboral.tsx | Empresa | Sí | Sí (por PDV) | Sí (festivos por país) | No | RRHH | Calendario visual. Sin backend. |
| **Configuración** | Configuración de fichajes | Reglas de fichaje y geolocalización | ✅ Implementado UX | ConfiguracionFichajes.tsx | Empresa | Sí | Sí (por PDV) | No | No | RRHH | Vinculado a clockin.advanced flag. |
| **Configuración** | Facturación e impuestos | IVA, retenciones, series | ✅ Implementado UX | FacturacionImpuestos.tsx | Empresa | Sí | Sí (por PDV) | Sí (tipos IVA por país) | No | Finanzas | Configuración completa. Sin backend. |
| **Configuración** | Importación de datos | Importar clientes, productos, etc. | ✅ Implementado UX | ConfiguracionImportacion.tsx | Empresa | Sí | No | No | No | N/A | Solo UX de carga. Sin procesamiento. |
| **Multipaís** | Selección de país | Dropdown con 9 países | ✅ Implementado UX | InformacionGeneral.tsx líneas 38-48 | Empresa | Sí | No | Sí (preparado) | No | N/A | Preparado pero no funcional. Sin vinculación. |
| **Multipaís** | Moneda | EUR, USD, GBP, MXN, ARS | ✅ Implementado UX | InformacionGeneral.tsx líneas 50-56 | Empresa | Sí | No | Sí (preparado) | No | N/A | Dropdown. Sin aplicación real. |
| **Multipaís** | Zona horaria | 9 zonas horarias | ✅ Implementado UX | InformacionGeneral.tsx líneas 67-77 | Empresa | Sí | No | Sí (preparado) | No | N/A | Dropdown. Sin aplicación real. |
| **Multipaís** | Formatos regionales | Separadores decimales, moneda | ⚠️ Parcial | useRegionalPrefs.ts | Usuario | No | No | Parcial (mock) | No | N/A | Hook mock. No conectado a configuración. |
| **Multiidioma** | Selección de idioma | ES, EN, FR, PT, IT, DE | ✅ Implementado UX | InformacionGeneral.tsx líneas 58-65 | Empresa | Sí | No | Sí (preparado) | No | N/A | Dropdown. Sin i18n real. |
| **Multiidioma** | Sistema i18n | Traducciones y cambio dinámico | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Todo hardcoded en español. No existe biblioteca i18n. |
| **Seguridad** | Autenticación | Login/logout | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe pantalla login. switchUserRole simula cambio. |
| **Seguridad** | Control de acceso por rol | Restricciones por gerente/trabajador | ⚠️ Parcial | AppContext.userRole, rutas específicas | Usuario | Sí | No | No | No | N/A | Rutas diferentes según rol. Sin validación backend. |
| **Seguridad** | Permisos granulares | Ver/Operar/Administrar por módulo | ✅ Implementado UX | ConfiguracionUsuariosPermisos.tsx | Usuario | Sí | No | No | No | N/A | Matriz completa. Sin aplicación funcional. |
| **Seguridad** | 2FA | Autenticación de dos factores | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe. |
| **Seguridad** | Logs de acceso | Auditoría de sesiones | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe. |
| **Seguridad** | Políticas de contraseña | Complejidad, caducidad | ❌ No trabajado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | No existe. |
| **Persistencia** | localStorage | Persistencia cliente de sesión | ✅ Implementado | AppContext líneas 24-82 | Usuario | Sí | No | No | No | N/A | Persiste: currentUser, currentCompany, viewMode, currentSection, userRole. |
| **Notificaciones** | Configuración de alertas | Preferencias de notificaciones | ❌ No trabajado | Configuracion.tsx (placeholder) | Usuario | N/A | N/A | N/A | N/A | N/A | Sección existe en menú. Sin implementar. |

---

## 📋 TABLA 2: FLUJOS CRÍTICOS

| Flujo | Evento inicial | Rol | Origen | Módulos implicados | Resultado | Dependencias | Riesgos |
|-------|----------------|-----|--------|-------------------|-----------|--------------|---------|
| **F-SIS-001: Cambio de empresa** | Usuario selecciona empresa del dropdown | Gerente/Trabajador | Header | Sistema, todos | currentCompany cambia, se persiste en localStorage, módulos se recargan | AppContext.currentCompany, localStorage | Si módulo no verifica currentCompany, puede mostrar datos incorrectos. |
| **F-SIS-002: Activar Vista Global** | Usuario selecciona "Vista Global" | Gerente | Header | Sistema, Dashboard, Finanzas, Informes | viewMode='global', currentCompany=null, módulos operativos se bloquean | AppContext.viewMode, RestrictedSection | Módulos que no verifican viewMode quedan accesibles incorrectamente. |
| **F-SIS-003: Bloqueo por falta de empresa** | Usuario en Vista Global intenta acceder a Equipo | Gerente | Navegación | Sistema, RRHH | RestrictedSection se muestra, operación bloqueada | viewMode='global' | Si módulo no implementa bloqueo, falla o muestra datos vacíos. |
| **F-SIS-004: Alta de centro/PDV** | Gerente crea nuevo PDV | Gerente | Configuración > Puntos de Venta | Sistema, RRHH, Stock | Nuevo WorkCenter creado (solo UX) | currentCompany | No persiste. No afecta a asignaciones reales. |
| **F-SIS-005: Desactivar centro con stock** | Gerente desactiva PDV con inventario | Gerente | Configuración > Puntos de Venta | Sistema, Stock | Modal de desactivación con opciones transferir/ajustar | WorkCenter.status, Stock | Solo UX. Sin validación real de stock. |
| **F-SIS-006: Asignar empleado a centro** | Gerente asigna trabajador a PDV | Gerente | Configuración > Accesos | Sistema, RRHH | Employee.workCenter actualizado (solo UX) | Employee, WorkCenter | No valida si centro existe o está activo. |
| **F-SIS-007: Invitar usuario** | Gerente invita trabajador por email | Gerente | Equipo > Añadir Trabajador | Sistema, RRHH | onboardingStatus='invitado' (solo UX) | RRHH.onboarding flag | Sin envío de email real. Sin token de invitación. |
| **F-SIS-008: Cambiar rol de usuario** | Gerente modifica rol de trabajador | Gerente | Configuración > Accesos | Sistema, RRHH, todos | Permisos cambian (solo UX) | Roles mock | Sin aplicación funcional. Módulos no verifican rol. |
| **F-SIS-009: Configurar país/moneda** | Gerente selecciona país en Información General | Gerente | Configuración > Información General | Sistema | Campos actualizados (solo UX) | N/A | Sin persistencia. Sin aplicación en formatos. |
| **F-SIS-010: Activar flag de módulo** | Backend activa flag (ej: RRHH.vacations) | Sistema | Backend (simulado en mock) | Sistema, RRHH | Tab "Vacaciones" aparece/desaparece en Equipo | RRHHFlags, EmployeeDetailPanel | Solo implementado en RRHH. Otros módulos sin flags. |
| **F-SIS-011: Cambiar de rol usuario** | Usuario cambia de Gerente a Trabajador (simulado) | Usuario | Simulación (switchUserRole) | Sistema, todos | userRole cambia, currentSection cambia, persiste | AppContext.userRole, localStorage | Simula cambio sin re-login. No hay autenticación real. |
| **F-SIS-012: Persistencia en localStorage** | Usuario cierra navegador | Usuario | Sistema | Sistema | Estado se guarda en localStorage | localStorage API | Si se borra localStorage, se pierde estado. Reset a valores mock. |
| **F-SIS-013: Acceso a módulo restringido** | Trabajador intenta acceder a Finanzas | Trabajador | Navegación | Sistema, Finanzas | (No implementado) | userRole, permisos | No hay validación. Trabajador puede ver todo. |
| **F-SIS-014: Configurar IVA por país** | Gerente configura tipos IVA en Facturación | Gerente | Configuración > Facturación e Impuestos | Sistema, Finanzas | Tipos IVA configurados (solo UX) | País de empresa | Sin persistencia. Sin aplicación en facturas. |
| **F-SIS-015: Importar datos** | Gerente sube CSV de clientes | Gerente | Configuración > Importación de Datos | Sistema, Clientes | Modal de importación (solo UX) | N/A | Sin procesamiento. Sin validación. Sin inserción. |

---

## 📋 TABLA 3: DEPENDENCIAS CRÍTICAS

| Dependencia | Origen | Destino | Tipo | Criticidad | Estado | Riesgo |
|-------------|--------|---------|------|------------|--------|--------|
| **DEP-SIS-001** | AppContext.currentCompany | Todos los módulos | Estado global | ALTA | ✅ Implementado | Si módulo no verifica currentCompany, muestra datos incorrectos o falla. |
| **DEP-SIS-002** | AppContext.viewMode | Módulos operativos | Estado global | ALTA | ⚠️ Parcial | Solo algunos módulos verifican. Otros accesibles en Vista Global. |
| **DEP-SIS-003** | AppContext.userRole | Navegación y rutas | Estado global | MEDIA | ⚠️ Parcial | Rutas diferentes pero sin validación. Trabajador accede a todo. |
| **DEP-SIS-004** | Company.rrhhFlags | Módulo RRHH | Feature flags | ALTA | ✅ Implementado | Único módulo con flags. Otros sin sistema de flags. |
| **DEP-SIS-005** | Employee.workCenter | Módulo RRHH | Asignación | MEDIA | ⚠️ Parcial | String sin validación. No verifica si centro existe. |
| **DEP-SIS-006** | WorkCenter (mock) | RRHH, Stock, Finanzas | Datos | ALTA | ⚠️ Parcial | Mock en PuntosDeVenta.tsx. No en tipos globales. No persiste. |
| **DEP-SIS-007** | localStorage | Persistencia sesión | Persistencia | ALTA | ✅ Implementado | Si se borra, reset a mock. No hay backend de respaldo. |
| **DEP-SIS-008** | User.companies | Selector empresa | Datos | ALTA | ✅ Implementado | Permite multiempresa. Sin límite de empresas. |
| **DEP-SIS-009** | País/Moneda/Idioma | Formatos y traducciones | Configuración | BAJA | ❌ No implementado | Preparación UX existe. Sin aplicación funcional. |
| **DEP-SIS-010** | Roles/Permisos | Control acceso módulos | Seguridad | ALTA | ❌ No implementado | UX completa. Sin validación funcional. |
| **DEP-SIS-011** | Invitación usuario | Envío email, token | Onboarding | MEDIA | ❌ No implementado | Solo UX. Sin email. Sin token. |
| **DEP-SIS-012** | Plan/Suscripción | Feature flags generales | Comercial | ALTA | ❌ No implementado | No existe modelo. Solo RRHHFlags. |

---

## 🚨 PROBLEMAS DE DEGRADACIÓN

### 1. **Módulos sin verificación de Vista Global**
- **Problema:** Algunos módulos no verifican `viewMode === 'global'` y no muestran RestrictedSection.
- **Impacto:** Usuario puede acceder a módulos operativos en Vista Global donde no debería.
- **Módulos afectados:** Verificar cada módulo individualmente.
- **Solución requerida:** Añadir verificación en todos los módulos operativos.

### 2. **WorkCenter no está en tipos globales**
- **Problema:** WorkCenter se define solo en `PuntosDeVenta.tsx` como mock. No en `types.ts`.
- **Impacto:** Otros módulos no pueden usar WorkCenter. RRHH usa `Employee.workCenter` como string.
- **Riesgo:** Sin validación de existencia. Sin tipo estructurado.
- **Solución requerida:** Mover WorkCenter a `types.ts` y usarlo en Employee.

### 3. **Feature Flags solo en RRHH**
- **Problema:** Solo existe `RRHHFlags`. Otros módulos (Finanzas, Stock, CRM) no tienen flags.
- **Impacto:** No se puede controlar funcionalidades por plan en otros módulos.
- **Riesgo:** Si se añaden flags a otros módulos, no hay sistema unificado.
- **Solución requerida:** Crear sistema general de flags: `ModuleFlags` con subcategorías.

### 4. **Sin modelo de Cuenta/Tenant**
- **Problema:** No existe separación lógica Account-Company. Todo está en User.companies.
- **Impacto:** No se puede facturar, gestionar suscripción ni multi-tenant real.
- **Riesgo:** Si se añade multi-tenant, refactor masivo.
- **Solución requerida:** Crear Account/Tenant como nivel superior a Company.

### 5. **Permisos sin aplicación funcional**
- **Problema:** UX completa de roles y permisos. Sin validación en módulos.
- **Impacto:** Trabajador puede ver todo. Sin control real de acceso.
- **Riesgo:** Fuga de información sensible.
- **Solución requerida:** Implementar validación en cada módulo según permisos.

### 6. **localStorage como única persistencia**
- **Problema:** Todo se pierde si se borra localStorage.
- **Impacto:** Usuario pierde sesión y configuración.
- **Riesgo:** Sin backend, imposible recuperar estado.
- **Solución requerida:** Conectar a backend para persistencia real.

### 7. **Multipaís sin aplicación**
- **Problema:** Dropdowns de país, moneda, idioma existen. Sin efecto funcional.
- **Impacto:** Usuario configura pero nada cambia.
- **Riesgo:** Expectativa vs realidad. Usuario espera que funcione.
- **Solución requerida:** Implementar formatos regionales y aplicar en todo el sistema.

### 8. **Sin sistema i18n**
- **Problema:** Todo hardcoded en español. Dropdown de idioma no hace nada.
- **Impacto:** Sistema solo funciona en español.
- **Riesgo:** No escalable a otros países.
- **Solución requerida:** Integrar i18next o similar. Traducir todos los strings.

---

## 🎯 ALCANCE MÍNIMO OBLIGATORIO DEL MÓDULO SISTEMA

### ✅ **Cuenta (Account/Tenant)**
**Estado actual:** ❌ **NO EXISTE**

**Requerido:**
- Modelo `Account` como nivel superior
- Separación lógica: 1 Account → N Companies
- Billing/Facturación a nivel Account
- Suscripción/Plan comercial en Account

**Impacto de no tenerlo:**
- Imposible facturar correctamente
- No hay multi-tenant real
- Mezcla de empresas sin separación

---

### ✅ **Empresas (Companies)**
**Estado actual:** ✅ **IMPLEMENTADO PARCIAL**

**Existe:**
- Modelo Company con id, name, vertical, color
- Array User.companies permite multiempresa
- Selector de empresa funcional
- Vista Global para gerentes

**Falta:**
- País, moneda, idioma en Company
- Vinculación a Account/Tenant
- Límites por plan (max users, max PDV)
- Configuración fiscal/legal persistida

---

### ✅ **Selector de empresa / Vista Global**
**Estado actual:** ✅ **IMPLEMENTADO**

**Funciona:**
- Dropdown en header
- Cambio entre empresas
- Vista Global (solo gerente)
- Persistencia en localStorage
- RestrictedSection en módulos operativos

**Falta:**
- Verificación en TODOS los módulos
- Logo de empresa en selector
- Indicador visual empresa activa en toda la UI

---

### ✅ **Centros / Puntos de Venta (WorkCenters/PDV)**
**Estado actual:** ⚠️ **IMPLEMENTADO UX, SIN BACKEND**

**Existe:**
- Alta/edición/desactivación (UX completa)
- Tipos: PDV vs WorkCenter
- Estados: active/inactive
- Flag isCostCenter
- Modal de desactivación con gestión stock

**Falta:**
- Modelo en `types.ts`
- Persistencia backend
- Validación de existencia en asignaciones
- Horarios de apertura persistidos
- Vinculación real a RRHH y Stock

---

### ✅ **Usuarios: alta/invitación, roles, vinculación**
**Estado actual:** ⚠️ **IMPLEMENTADO UX, SIN BACKEND**

**Existe:**
- Alta de trabajadores (AddEmployeeModal)
- Roles: Gerente, Trabajador
- Invitación con onboardingStatus
- Asignación a 1 centro principal
- Gestión de usuarios externos (clientes, agentes)
- Matriz de permisos (ver/operar/administrar)

**Falta:**
- Envío de email invitación
- Token de invitación
- Autenticación real
- Validación de permisos funcional
- Roles personalizables
- Asignación multi-centro

---

### ✅ **Plan comercial y Feature Flags**
**Estado actual:** ⚠️ **SOLO RRHH, NO GENERALIZADO**

**Existe:**
- `RRHHFlags` con 10 funcionalidades
- Tabs dinámicas en RRHH según flags
- Degradación automática si flag se desactiva

**Falta:**
- Modelo de Plan/Suscripción estructurado
- Flags para otros módulos (Finanzas, Stock, CRM, etc.)
- Límites cuantitativos (max users, max transactions)
- Gestión de cambio de plan
- Facturación por plan

---

### ✅ **Configuración general (branding, datos fiscales/legales)**
**Estado actual:** ⚠️ **IMPLEMENTADO UX, SIN PERSISTENCIA**

**Existe:**
- Información General (nombre, logo, contacto)
- Datos legales (NIF, razón social, dirección fiscal)
- Branding (logo, color corporativo)
- Configuración de marcas
- Calendario laboral
- Configuración de fichajes
- Facturación e impuestos

**Falta:**
- Persistencia backend
- Aplicación de configuración en módulos
- Validación de campos obligatorios
- Logos subidos reales

---

### ✅ **Multipaís (moneda/país/formatos)**
**Estado actual:** ⚠️ **PREPARACIÓN UX, NO FUNCIONAL**

**Existe:**
- Dropdowns: 9 países, 5 monedas, 9 zonas horarias
- Hook `useRegionalPrefs` (mock)
- Campos preparados en InformacionGeneral

**Falta:**
- Vinculación país-company
- Aplicación de formatos regionales
- Tipos IVA por país
- Calendarios laborales por país
- Validación de campos según país (NIF vs EIN)

---

### ✅ **Multiidioma / i18n**
**Estado actual:** ❌ **NO TRABAJADO**

**Existe:**
- Dropdown de 6 idiomas (sin funcionalidad)
- Todo hardcoded en español

**Falta:**
- Biblioteca i18n (react-i18next)
- Archivos de traducción
- Cambio dinámico de idioma
- Traducción de todos los strings
- Formatos de fecha según idioma

---

### ✅ **Seguridad mínima**
**Estado actual:** ⚠️ **PARCIAL, SIN BACKEND**

**Existe:**
- Control de acceso por empresa (currentCompany)
- Rutas diferentes por rol (gerente vs trabajador)
- Vista Global solo gerente
- RestrictedSection en módulos
- Persistencia localStorage

**Falta:**
- Autenticación (login/logout)
- Tokens JWT
- Validación backend de permisos
- 2FA
- Logs de acceso/auditoría
- Políticas de contraseña
- Sesiones y expiración
- Rate limiting

---

## 📁 ARCHIVOS CLAVE DEL MÓDULO SISTEMA

### **Tipos y contexto:**
- `/src/app/types.ts` → Tipos base: Company, User, Employee, RRHHFlags
- `/src/app/context/AppContext.tsx` → Estado global: currentUser, currentCompany, viewMode

### **Componentes principales:**
- `/src/app/components/layout/HeaderResponsive.tsx` → Selector de empresa
- `/src/app/components/sections/Configuracion.tsx` → Hub de configuración
- `/src/app/components/sections/ConfiguracionEmpresa.tsx` → Config completa empresa
- `/src/app/components/sections/configuracion/InformacionGeneral.tsx` → Datos generales
- `/src/app/components/sections/configuracion/PuntosDeVenta.tsx` → Gestión centros/PDV
- `/src/app/components/sections/configuracion/ConfiguracionAccesos.tsx` → Usuarios y accesos
- `/src/app/components/sections/configuracion/ConfiguracionUsuariosPermisos.tsx` → Roles y permisos
- `/src/app/components/ui/GlobalViewBanner.tsx` → Banner Vista Global
- `/src/app/components/ui/RestrictedSection.tsx` → Bloqueo sin empresa

### **Hooks:**
- `/src/app/hooks/useRegionalPrefs.ts` → Preferencias regionales (mock)

### **Datos:**
- `/src/app/data/mockData.ts` → Empresas mock con RRHHFlags

---

## 🔄 FLUJOS DESTACADOS CON DEPENDENCIAS

### **Flujo: Gerente crea PDV y asigna trabajador**

```
INICIO: Gerente en Configuración > Puntos de Venta
  ↓
1. Clic "Añadir Punto de Venta"
  ↓
2. Modal creación → Rellena: nombre, tipo, país, dirección
  ↓
3. Selecciona estado: Activo
  ↓
4. Configurar horarios (opcional)
  ↓
5. Guardar → WorkCenter creado (SOLO UX, no persiste)
  ↓
6. Navega a Equipo > Trabajadores
  ↓
7. Clic en trabajador → Panel detalle
  ↓
8. Editar → Campo "Centro principal"
  ↓
9. Dropdown muestra centros creados (SOLO si está en mockData)
  ↓
10. Selecciona centro → Guardar
  ↓
11. Employee.workCenter actualizado (SOLO UX)
  ↓
FIN: Trabajador "asignado" a PDV (sin validación real)

DEPENDENCIAS:
- currentCompany (contexto)
- WorkCenter (mock en PuntosDeVenta.tsx)
- Employee (tipos)
- AddEmployeeModal / EmployeeDetailPanel

RIESGOS:
- Sin persistencia: centro desaparece al recargar
- Sin validación: puede asignar a centro inexistente si escribe texto
- Sin verificación de estado: puede asignar a centro inactivo
```

---

### **Flujo: Sistema degrada cuando flag se desactiva**

```
INICIO: Usuario en módulo RRHH > Tab "Vacaciones"
  ↓
1. Backend actualiza Company.rrhhFlags.vacations = false
  ↓
2. Estado se propaga a frontend (polling o websocket)
  ↓
3. Componente Equipo.tsx re-renderiza
  ↓
4. subSections filtra tabs según flags
  ↓
5. Tab "Vacaciones" YA NO está en array
  ↓
6. Usuario sigue en activeSubSection='vacations'
  ↓
7. Verificación: isActiveSubSectionAvailable = false
  ↓
8. setActiveSubSection('team') → fallback a BASE
  ↓
9. Usuario ve tab "Equipo" automáticamente
  ↓
FIN: Degradación sin error

DEPENDENCIAS:
- RRHHFlags
- Equipo.tsx líneas 140-155
- EmployeeDetailPanel.tsx (igual)

FUNCIONA EN:
- Módulo RRHH (Equipo)
- EmployeeDetailPanel

NO FUNCIONA EN:
- Otros módulos (sin flags)
```

---

## 🎓 CONCLUSIONES Y RECOMENDACIONES

### **1. Implementar Cuenta/Tenant urgente**
- Separar lógica: Account → Companies → Users
- Asociar suscripción a Account
- Facturación a nivel Account

### **2. Generalizar sistema de Feature Flags**
- Crear `ModuleFlags` con categorías: rrhh, finanzas, stock, crm, ventas
- Asociar flags a Plan/Suscripción
- Implementar degradación en todos los módulos

### **3. Mover WorkCenter a tipos globales**
- Definir en `types.ts`
- Usar en Employee, Stock, Finanzas
- Validar existencia en asignaciones

### **4. Implementar multipaís funcional**
- Vincular país a Company
- Aplicar formatos regionales
- Calendarios y tipos IVA por país
- Validaciones específicas por país

### **5. Integrar sistema i18n**
- react-i18next
- Traducir todos los strings
- Cambio dinámico de idioma
- Formatos según locale

### **6. Conectar a backend**
- Persistencia real de configuración
- Autenticación y sesiones
- Validación de permisos
- Auditoría de accesos

### **7. Seguridad**
- Implementar login/logout
- Tokens JWT
- Validación de permisos en backend
- 2FA
- Logs de auditoría

---

**FIN DE AUDITORÍA**  
**Estado general:** Sistema funcional en UX, preparado para backend, con deuda técnica en seguridad, multipaís y generalización de flags.
