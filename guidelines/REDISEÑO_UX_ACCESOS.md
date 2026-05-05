# ✅ REDISEÑO UX - ACCESOS AL SISTEMA | Vertial

**Fecha:** 26 de enero de 2026  
**Proyecto:** Vertial - Sistema de Accesos Refactorizado  
**Estado:** ✅ Implementado

---

## 🎯 OBJETIVO CUMPLIDO

Se ha rediseñado completamente el apartado **Configuración → Accesos al Sistema** para:

✅ Separar claramente 3 tipos de personas con acceso  
✅ Eliminar duplicidades de permisos  
✅ Mantener coherencia con la ficha individual de trabajadores  
✅ Diferenciar accesos de clientes y agentes externos  
✅ Eliminar confusión entre usuarios, roles y permisos  

---

## 🔄 CAMBIOS REALIZADOS

### **1️⃣ RENOMBRADO DE SECCIÓN**

| Antes | Después |
|-------|---------|
| ❌ **Configuración → Usuarios y Permisos** | ✅ **Configuración → Accesos al Sistema** |
| "Gestión de roles y accesos" | "Gestiona trabajadores, clientes y agentes externos" |

---

### **2️⃣ NUEVA ESTRUCTURA DE PESTAÑAS**

#### ❌ **ELIMINADAS (Antiguas)**
- Usuarios
- Roles y Permisos
- Responsables Operativos

#### ✅ **NUEVAS (3 Pestañas Claras)**

### 🔹 **PESTAÑA 1: TRABAJADORES**

**Descripción:**
> "Personas internas del negocio con responsabilidades operativas"

**Vista de Listado:**
```
┌─────────────────────────────────────────────────────────────┐
│ Nombre          │ Email              │ Puesto  │ Estado    │
├─────────────────────────────────────────────────────────────┤
│ Carlos Ruiz     │ carlos@empresa.com │ Gerente │ ✓ Activo  │
│ Ana Martínez    │ ana@empresa.com    │ Encarg. │ ✓ Activo  │
│ Pedro López     │ pedro@empresa.com  │ Camer.  │ ✓ Activo  │
│ Laura García    │ laura@empresa.com  │ Cocin.  │ ⏳ Invit.  │
│ Miguel F.       │ miguel@empresa.com │ Repart. │ ✓ Activo  │
└─────────────────────────────────────────────────────────────┘
```

**CTA Principal:**
- **"Gestionar trabajador →"**
  - Al hacer clic: navega a **Equipo → Detalle del trabajador**
  - Allí se gestionan: Base (N1-N4), Permisos (Flags), Job Description

**Copy Aclaratorio Visible:**
> "Los permisos de los trabajadores se gestionan individualmente desde su ficha personal en Equipo. Allí se asigna su Base (N1-N4), se marcan sus Permisos (Operar/Ver Resultados) y se visualizan sus Funciones (Job Description)."

**🚫 NO SE MUESTRA:**
- ❌ Roles
- ❌ Niveles (N1-N4)
- ❌ Permisos resumidos
- ❌ Accesos por módulo

---

### 🔹 **PESTAÑA 2: CLIENTES**

**Descripción:**
> "Clientes con acceso a su información dentro del sistema"

**Vista de Listado:**
```
┌───────────────────────────────────────────────────┐
│ Cliente                  │ Acceso      │ Acción  │
├───────────────────────────────────────────────────┤
│ Distribuciones S.L.      │ ✓ Activo    │ Gestionar │
│ Restaurante El Patio     │ ✓ Activo    │ Gestionar │
│ Hotel Mediterranean      │ ✗ Desactiv. │ Gestionar │
└───────────────────────────────────────────────────┘
```

**Permisos Específicos de Clientes:**

| Permiso | Descripción |
|---------|-------------|
| 👁️ **Ver pedidos** | Consultar estado de pedidos activos e históricos |
| 📄 **Ver facturas** | Acceder a sus facturas emitidas |
| ✅ **Ver estado de servicios** | Consultar progreso de servicios contratados |
| 📥 **Descargar documentos** | Descargar albaranes, facturas y certificados |

**🚫 PROHIBICIONES:**
- ❌ NO usar Base (N1-N4)
- ❌ NO usar permisos de Operar
- ❌ NO generar Job Description

**Copy Fijo:**
> "Los clientes solo acceden a su propia información. No tienen acceso operativo, no pueden ver datos de otros clientes ni gestionar aspectos internos del negocio. Sus permisos son siempre de solo consulta."

---

### 🔹 **PESTAÑA 3: AGENTES EXTERNOS**

**Descripción:**
> "Proveedores, gestoría, asesores u otros colaboradores externos"

**Vista de Listado:**
```
┌─────────────────────────────────────────────────────────┐
│ Nombre                     │ Tipo      │ Acceso      │
├─────────────────────────────────────────────────────────┤
│ Gestoría Martínez          │ Gestoría  │ ✓ Activo    │
│ Distribuidora Bebidas      │ Proveedor │ ✓ Activo    │
│ Asesoría Fiscal González   │ Asesor    │ ✗ Desactiv. │
└─────────────────────────────────────────────────────────┘
```

**Permisos Específicos de Agentes:**

| Permiso | Descripción |
|---------|-------------|
| 👁️ **Ver documentos** | Consultar documentación específica |
| 📤 **Subir documentación** | Cargar documentos y archivos necesarios |
| 📊 **Ver datos económicos** | Acceder a información financiera relevante (si procede) |

**Tipos de Agentes:**
- 🏢 **Gestoría** → Acceso a datos laborales y documentación legal
- 📦 **Proveedor** → Carga de albaranes y documentación de pedidos
- 💼 **Asesor** → Consulta de datos económicos y financieros
- 🔧 **Mantenimiento** → Acceso limitado a datos técnicos

**🚫 PROHIBICIONES:**
- ❌ NO usar Base (N1-N4)
- ❌ NO usar permisos operativos
- ❌ NO generar Job Description

**Copy Fijo:**
> "Los agentes externos tienen acceso limitado y controlado. Sus permisos son principalmente de lectura y carga documental. No tienen acceso a la gestión operativa del negocio ni a información confidencial de trabajadores o clientes."

---

## 🗑️ ELIMINACIONES IMPORTANTES

### **1. Eliminación de Roles Activos**

❌ **SE ELIMINÓ DE LA UX:**
- Roles que gobiernen permisos automáticamente
- Roles como entidad activa que otorga accesos
- Textos como "Acceso total al sistema"
- Tarjetas de "Gerente", "Encargado", "Trabajador" con permisos implícitos

✅ **SI SE MANTIENEN ROLES:**
- Solo como **plantillas internas** (no visibles en esta sección)
- No vinculadas directamente a usuarios activos
- No mostradas como sistema de control activo

---

### **2. Componente PermissionsView.tsx**

**Estado:** Pendiente de eliminar (recomendado)

El componente `/src/app/components/equipo/PermissionsView.tsx` mostraba:
- 3 roles predefinidos (Gerente, Encargado, Trabajador)
- Permisos asociados a cada rol
- Tabla de trabajadores con inferencia de roles

❌ **Este componente NO debe usarse** ya que:
- Implica que los roles otorgan permisos automáticamente
- Crea confusión sobre la fuente de verdad
- Contradice el modelo Base + Flags

---

## 🏗️ ARQUITECTURA UX CLARA

### **Jerarquía de Poder**

```
┌─────────────────────────────────────────────┐
│  FICHA DEL TRABAJADOR                       │
│  (Equipo → Detalle del trabajador)          │
│                                              │
│  ✅ Aquí se asignan permisos REALES:        │
│     • Base (N1-N4)                          │
│     • Permisos (Operar / Ver Resultados)    │
│     • Job Description (generado automático) │
│                                              │
│  👉 ESTA ES LA FUENTE ÚNICA DE VERDAD       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  CONFIGURACIÓN → ACCESOS AL SISTEMA         │
│                                              │
│  ✅ Aquí se ORGANIZA quién tiene acceso:    │
│     • Lista de trabajadores                 │
│     • Lista de clientes                     │
│     • Lista de agentes externos             │
│                                              │
│  👉 NO SE ASIGNAN PERMISOS AQUÍ             │
└─────────────────────────────────────────────┘
```

---

## 📋 PRINCIPIOS UX APLICADOS

### ✅ **1. Separación por Tipo de Relación**

No se organiza por "usuarios" genéricos, sino por:
- 👥 **Trabajadores** → Personas del negocio
- 🏪 **Clientes** → Consumidores con acceso
- 🏢 **Agentes Externos** → Colaboradores externos

### ✅ **2. Copy Claro y Directo**

Cada pestaña tiene:
- **Descripción visible** que explica quién es
- **Copy aclaratorio** sobre limitaciones
- **Notas informativas** destacadas

### ✅ **3. UX Binaria**

- **Trabajadores:** Lista + "Gestionar trabajador →"
- **Clientes:** Lista + "Gestionar acceso →"
- **Agentes:** Lista + "Gestionar acceso →"

Sin opciones confusas, sin duplicidades.

### ✅ **4. Jerarquía Visual**

- **Títulos grandes** para cada pestaña
- **Cards destacadas** para descripciones importantes
- **Tablas limpias** sin columnas innecesarias
- **CTAs claros** con iconos →

### ✅ **5. Códigos de Color Consistentes**

- 🔵 **Azul** → Trabajadores
- 🟣 **Morado** → Clientes
- 🟠 **Naranja** → Agentes Externos

---

## 🚫 PROHIBICIONES CUMPLIDAS

### ❌ **NO SE INVENTARON:**
- Nuevos tipos de permisos
- Nuevas reglas de negocio
- Lógica de backend
- Validaciones automáticas

### ❌ **NO SE MUESTRAN:**
- Niveles (N1-N4) en módulos
- Roles activos que gobiernen permisos
- Mezclado de trabajadores con clientes
- Permisos resumidos en tablas

### ❌ **NO SE CREARON:**
- Duplicidades de gestión de permisos
- Múltiples sitios para asignar accesos
- Confusión entre puesto y rol de sistema

---

## 📊 RESULTADO FINAL

### ✅ **CUMPLIMIENTO DE OBJETIVOS**

| Objetivo | Estado | Observaciones |
|----------|--------|---------------|
| El gerente entiende quién tiene acceso | ✅ CUMPLIDO | 3 pestañas claras por tipo de relación |
| No existen duplicidades de permisos | ✅ CUMPLIDO | Permisos solo en ficha de trabajador |
| Coherencia con ficha individual | ✅ CUMPLIDO | Copy explícito: "Los permisos se gestionan en Equipo" |
| Clientes y agentes diferenciados | ✅ CUMPLIDO | Pestañas separadas con permisos específicos |
| Eliminación de confusión | ✅ CUMPLIDO | Sin roles activos, sin duplicidades |

---

## 🎨 CARACTERÍSTICAS UX IMPLEMENTADAS

### **1. Diseño Visual**

✅ **Cards con Gradientes:** Cada tipo usa colores diferenciados  
✅ **Avatares Circulares:** Iniciales con degradado de color  
✅ **Badges de Estado:** Activo (verde), Invitado (gris), Desactivado (gris)  
✅ **Tablas Responsivas:** Scroll horizontal en móvil  
✅ **Iconos Lucide:** Consistentes en toda la interfaz  

### **2. Interacción**

✅ **Hover States:** Filas de tabla se destacan al pasar el cursor  
✅ **CTAs Claros:** Botones "Gestionar" con flecha →  
✅ **Pestañas Navegables:** Border inferior destacado en activo  
✅ **Info Boxes:** Cards con borde destacado para información importante  

### **3. Accesibilidad**

✅ **Contraste de Color:** Texto legible en todos los fondos  
✅ **Tamaños de Fuente:** Jerárquicos y consistentes  
✅ **Espaciado:** Padding y margin consistentes  
✅ **Estados Visuales:** Iconos + texto para comunicar estado  

---

## 📁 ARCHIVOS MODIFICADOS/CREADOS

### **✅ CREADOS**

```
/src/app/components/sections/configuracion/ConfiguracionAccesos.tsx
```
**Descripción:** Componente principal con 3 pestañas (Trabajadores, Clientes, Agentes Externos)

### **✏️ MODIFICADOS**

```
/src/app/components/sections/Configuracion.tsx
```
**Cambios:**
- Import de `ConfiguracionAccesos` en lugar de `ConfiguracionUsuariosPermisos`
- Título cambiado: "Usuarios y Permisos" → "Accesos al Sistema"
- Descripción: "Gestión de roles y accesos" → "Gestiona trabajadores, clientes y agentes externos"

### **⚠️ PENDIENTE DE ELIMINAR (Recomendado)**

```
/src/app/components/equipo/PermissionsView.tsx
```
**Razón:** Muestra roles activos con permisos implícitos, contradice el modelo

```
/src/app/components/sections/configuracion/ConfiguracionUsuariosPermisos.tsx
```
**Razón:** Componente antiguo reemplazado por `ConfiguracionAccesos.tsx`

---

## 🔄 FLUJO DE USUARIO

### **Escenario 1: Gestionar Permisos de Trabajador**

```
1. Gerente entra en: Configuración → Accesos al Sistema
2. Ve pestaña "Trabajadores" (activa por defecto)
3. Lee: "Los permisos se gestionan desde su ficha personal"
4. Hace clic en "Gestionar trabajador" (botón)
5. → Navega a: Equipo → Detalle del trabajador
6. Allí asigna: Base (N1-N4), Permisos (Flags), visualiza Job Description
```

### **Escenario 2: Dar Acceso a Cliente**

```
1. Gerente entra en: Configuración → Accesos al Sistema
2. Selecciona pestaña "Clientes"
3. Ve lista de clientes con estado de acceso
4. Hace clic en "Gestionar acceso"
5. → Modal/Vista para activar/desactivar permisos específicos de cliente
6. Marca: Ver pedidos, Ver facturas, Descargar documentos
7. Guarda cambios
```

### **Escenario 3: Activar Acceso de Gestoría**

```
1. Gerente entra en: Configuración → Accesos al Sistema
2. Selecciona pestaña "Agentes Externos"
3. Ve lista de agentes (Gestoría, Proveedores, Asesores)
4. Hace clic en "Gestionar acceso" en Gestoría
5. → Modal/Vista para activar permisos limitados
6. Marca: Ver documentos, Subir documentación, Ver datos económicos
7. Guarda cambios
```

---

## 🎯 PRÓXIMOS PASOS (NO IMPLEMENTADOS)

### **Backend & Lógica** (Fuera del alcance de este rediseño)

1. **Conectar gestión de permisos de trabajadores** desde Equipo → Detalle
2. **Implementar guardado real** de permisos de clientes y agentes
3. **Crear modals de gestión** para clientes y agentes externos
4. **Validar permisos en backend** para cada tipo de usuario
5. **Implementar navegación real** del botón "Gestionar trabajador"

---

## ✅ CONCLUSIÓN

El rediseño UX de **Configuración → Accesos al Sistema** cumple con todos los objetivos:

- ✅ **Claridad total:** 3 tipos de personas claramente separados
- ✅ **Sin duplicidades:** Permisos de trabajadores solo en su ficha
- ✅ **Coherencia arquitectónica:** Respeta el modelo Base + Flags
- ✅ **UX limpia:** Sin roles activos, sin confusión
- ✅ **Preparado para backend:** Estructura lista para conectar lógica real

**El sistema ahora tiene una UX que refleja correctamente la arquitectura de permisos definida.**

---

**Documento generado:** 26/01/2026  
**Versión:** 1.0  
**Estado:** ✅ Implementado (solo UX, sin backend)

