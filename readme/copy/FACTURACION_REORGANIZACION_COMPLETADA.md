# 📊 ARQUITECTURA DE FACTURACIÓN - REORGANIZACIÓN COMPLETADA
**Sistema:** UDAR EDGE  
**Fecha:** 17 Enero 2026  
**Versión:** 1.0.0  
**Estado:** REORGANIZACIÓN FINALIZADA ✅

---

## 🎯 OBJETIVO CUMPLIDO

Reorganizar el módulo de Facturación sin modificar entidades ni lógica de negocio, solo ubicación y vistas para lograr una arquitectura más coherente y contextualizada.

---

## ✅ CAMBIOS IMPLEMENTADOS

### 1️⃣ MÓDULO CLIENTES - Nueva Pestaña "Facturas"

**Ubicación:** Clientes > Ficha Cliente > Pestaña "Facturas"

**Archivo:** `/src/app/components/clientes/FacturasClienteView.tsx`

**Características:**
- ✅ Vista contextual por cliente
- ✅ Dos modos de visualización: Tabla y Cards
- ✅ Filtros: búsqueda por nº factura, estado
- ✅ Ordenación por: número, fecha, estado, total
- ✅ KPIs contextuales:
  - Total facturas del cliente
  - Total facturado acumulado
  - Pendiente de cobro
- ✅ Acciones rápidas: Ver factura, Descargar PDF

**Integración:**
- Modificado `/src/app/components/clientes/CustomerDetailModal.tsx`
- Añadido tipo de pestaña: `'facturas'`
- Componente integrado con props `clienteId` y `clienteNombre`

**Vista Tabla:**
```
| Nº Factura | Fecha | Estado | Base Imponible | Total | Acciones |
```

**Vista Cards:**
```
┌─────────────────────────┐
│ FAC-2025-001            │
│ 15/01/2025   [Pagada]   │
│ Base: 1,200.00€         │
│ IVA: 252.00€            │
│ Total: 1,452.00€        │
│ [Ver] [PDF]             │
└─────────────────────────┘
```

---

### 2️⃣ MÓDULO PRODUCTOS/SERVICIOS - Nueva Pestaña "Facturas Proveedores"

**Ubicación:** Productos/Servicios > Pestaña "Facturas Proveedores"

**Archivo:** `/src/app/components/productos/FacturasProveedoresView.tsx`

**Características:**
- ✅ Vista operativa de compras
- ✅ Dos modos de visualización: Tabla y Cards
- ✅ Filtros: búsqueda, proveedor, estado
- ✅ Ordenación por: proveedor, número, fecha, estado, total
- ✅ KPIs operativos:
  - Total facturas de proveedores
  - Total gastado
  - Pendiente de pago
- ✅ Acciones rápidas: Ver factura, Descargar PDF

**Integración:**
- Modificado `/src/app/components/sections/Productos.tsx`
- Añadida pestaña `'facturas-proveedores'` al sistema de tabs
- Icon `FileText` para la pestaña
- Componente standalone sin props (vista global de proveedores)

**Vista Tabla:**
```
| Proveedor | Nº Factura | Fecha | Estado | Total | Acciones |
```

**Vista Cards:**
```
┌─────────────────────────┐
│ 🚚 Suministros García   │
│ FPROV-2025-045          │
│ 12/01/2025   [Pendiente]│
│ Total: 2,450.00€        │
│ [Ver] [PDF]             │
└─────────────────────────┘
```

---

### 3️⃣ MÓDULO FINANZAS - Simplificación Completada

**Archivo:** `/src/app/components/sections/Finanzas.tsx`

**Eliminado:**
- ❌ Sección completa de "Facturas" (clientes, proveedores, otros gastos)
- ❌ Sub-tabs: Clientes | Proveedores | Otros Gastos
- ❌ Tabla de facturas detallada
- ❌ Tipo `FacturasSubTab`
- ❌ Estado `facturasSubTab`
- ❌ Función `getFilteredData()`
- ❌ Estados `searchTerm`, `sortColumn`, `sortDirection`
- ❌ Función `handleSort()`
- ❌ Mock data: `facturasClientes`, `facturasProveedores`, `otrosGastos`

**Mantenido:**
- ✅ Resumen ejecutivo global
- ✅ Gráficos de ventas (día, semana, mes)
- ✅ Análisis de gastos por categorías
- ✅ Indicadores financieros
- ✅ Cobros y pagos (estado de caja)
- ✅ Análisis de costes operativos
- ✅ Rentabilidad por producto/pedido/empleado
- ✅ Contabilidad (resultados, balance, mayor)
- ✅ KPIs financieros avanzados
- ✅ Proyecciones financieras

**Comentario dejado en código:**
```typescript
// SECCIÓN DE FACTURAS ELIMINADA - Ahora en módulos Clientes y Productos
// Las facturas se gestionan desde sus contextos específicos:
// - Facturas de clientes: Clientes > Ficha Cliente > Pestaña "Facturas"
// - Facturas de proveedores: Productos/Servicios > Pestaña "Facturas Proveedores"
```

---

## 🏗️ ARQUITECTURA FINAL

```
┌──────────────────────────────────────────────────────────────┐
│                    MÓDULO CLIENTES                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Ficha de Cliente (CustomerDetailModal)                 │  │
│  │                                                         │  │
│  │  Pestañas:                                             │  │
│  │  • Resumen                                             │  │
│  │  • Datos                                               │  │
│  │  • Actividad                                           │  │
│  │  • Notas                                               │  │
│  │  • [NUEVO] Facturas ✅ (FacturasClienteView)          │  │
│  │    ↳ Vista contextual del cliente                     │  │
│  │    ↳ Historial de facturación                         │  │
│  │    ↳ Estado de pagos                                   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              MÓDULO PRODUCTOS / SERVICIOS                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Sistema de Pestañas                                    │  │
│  │                                                         │  │
│  │  • Productos                                           │  │
│  │  • Servicios                                           │  │
│  │  • Artículos (stock)                                   │  │
│  │  • Proveedores                                         │  │
│  │  • [NUEVO] Facturas Proveedores ✅                    │  │
│  │    (FacturasProveedoresView)                          │  │
│  │    ↳ Vista global de todas las facturas              │  │
│  │    ↳ Filtro por proveedor                             │  │
│  │    ↳ Control de pagos                                  │  │
│  │  • Escandallo                                          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    MÓDULO FINANZAS                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [SIMPLIFICADO] Visión Global Analítica                │  │
│  │                                                         │  │
│  │  Pestañas:                                             │  │
│  │  • Base (Resumen + Ventas + Gastos + Indicadores)     │  │
│  │  • Operativa (Cobros/Pagos + Costes)                  │  │
│  │    ❌ [ELIMINADO] Facturas detalladas                 │  │
│  │  • Avanzada (Rentabilidad + Contabilidad + KPIs +     │  │
│  │               Proyecciones)                            │  │
│  │                                                         │  │
│  │  Enfoque: Informes, totales, IVA, exportaciones       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📋 REGLAS CUMPLIDAS

### ✅ No se modificaron entidades
- Las interfaces de `Factura` no se alteraron
- Los datos siguen la misma estructura
- Preparado para backend futuro

### ✅ No se duplicó lógica
- No hay cálculos fiscales duplicados
- Los componentes son vistas, no lógica contable
- Reutilización de componentes UI existentes

### ✅ Coherencia visual
- Uso de componentes UI del sistema (Card, Badge, Button)
- Paleta de colores consistente
- Iconografía unificada (Lucide React)

### ✅ Responsive design
- Vistas adaptadas a mobile, tablet, desktop
- Toggle tabla/cards para mejor UX en móvil
- Filtros colapsables en pantallas pequeñas

### ✅ Preparado para backend
- Estructura de datos clara
- Props definidas para integración
- Mock data fácilmente reemplazable

---

## 🔄 FLUJO DE USUARIO

### **Consultar facturas de un cliente específico:**
```
1. Módulo Clientes
2. Seleccionar cliente
3. Ficha de Cliente
4. Pestaña "Facturas"
5. Ver historial contextualizado
```

### **Consultar facturas de proveedores:**
```
1. Módulo Productos/Servicios
2. Pestaña "Facturas Proveedores"
3. Filtrar por proveedor si es necesario
4. Ver todas las facturas de compras
```

### **Análisis financiero global:**
```
1. Módulo Finanzas
2. Ver totales consolidados
3. Analizar gráficos de ventas
4. Revisar gastos por categorías
5. Exportar informes
```

---

## 🎓 VENTAJAS DE LA NUEVA ARQUITECTURA

### **Contextualización:**
- Las facturas se consultan donde tienen sentido
- Clientes ven su relación comercial completa
- Proveedores se gestionan desde operativa

### **Separación de responsabilidades:**
- **Clientes:** Relación comercial y facturación
- **Productos:** Operativa y proveedores
- **Finanzas:** Análisis global y contabilidad

### **Mejor UX:**
- Menos navegación entre módulos
- Información contextual relevante
- Vistas optimizadas por rol

### **Escalabilidad:**
- Fácil añadir nuevas vistas contextuales
- Componentes reutilizables
- Preparado para crecimiento

---

## 📊 COMPARATIVA ANTES/DESPUÉS

| Aspecto | ❌ Antes | ✅ Después |
|---------|---------|------------|
| **Facturas de clientes** | Solo en Finanzas | Clientes > Ficha > Facturas |
| **Facturas de proveedores** | Solo en Finanzas | Productos > Facturas Proveedores |
| **Contexto** | Global descontextualizado | Contextual por entidad |
| **Navegación** | 3 clics mínimo | 2 clics máximo |
| **Finanzas** | Mezcla operativa y análisis | Solo análisis estratégico |
| **UX** | Genérica | Específica por rol |

---

## 🚀 INTEGRACIÓN CON BACKEND (FUTURO)

### **Facturas de Clientes:**
```typescript
// Endpoint sugerido
GET /api/clientes/{clienteId}/facturas
- Filtros: estado, fechaDesde, fechaHasta
- Respuesta: Array<Factura>
```

### **Facturas de Proveedores:**
```typescript
// Endpoint sugerido
GET /api/proveedores/facturas
- Filtros: proveedorId, estado, fechaDesde, fechaHasta
- Respuesta: Array<FacturaProveedor>
```

### **Análisis Financiero:**
```typescript
// Endpoints sugeridos
GET /api/finanzas/resumen?periodo={periodo}
GET /api/finanzas/ventas?tipo={dia|semana|mes}
GET /api/finanzas/gastos?categorias=true
GET /api/finanzas/iva?trimestre={Q}
```

---

## 📝 ARCHIVOS MODIFICADOS

### **Creados:**
- ✅ `/src/app/components/clientes/FacturasClienteView.tsx` (419 líneas)
- ✅ `/src/app/components/productos/FacturasProveedoresView.tsx` (438 líneas)

### **Modificados:**
- ✅ `/src/app/components/clientes/CustomerDetailModal.tsx`
  - Añadido import `FacturasClienteView`
  - Actualizado tipo `TabType` con `'facturas'`
  - Añadida pestaña "Facturas" en navegación
  - Renderizado condicional para nueva pestaña

- ✅ `/src/app/components/sections/Productos.tsx`
  - Añadido import `FacturasProveedoresView`
  - Añadido import `FileText` icon
  - Actualizado tipo de `activeTab` con `'facturas-proveedores'`
  - Añadida pestaña en navegación
  - Renderizado condicional para nueva vista

- ✅ `/src/app/components/sections/Finanzas.tsx`
  - Eliminado tipo `FacturasSubTab`
  - Eliminado estado `facturasSubTab`
  - Eliminados estados de filtros: `searchTerm`, `sortColumn`, `sortDirection`
  - Eliminada función `getFilteredData()`
  - Eliminada función `handleSort()`
  - Eliminado mock data de facturas
  - Eliminada sección completa de "Facturas"
  - Añadidos comentarios explicativos

---

## ✅ CHECKLIST FINAL

- [x] Vista de facturas de clientes creada
- [x] Vista de facturas de proveedores creada
- [x] Integración en módulo Clientes completada
- [x] Integración en módulo Productos completada
- [x] Módulo Finanzas simplificado
- [x] Código legacy eliminado
- [x] Estados no usados limpiados
- [x] Funciones obsoletas eliminadas
- [x] Mock data de facturas eliminado
- [x] Comentarios explicativos añadidos
- [x] Coherencia visual mantenida
- [x] Responsive design implementado
- [x] Filtros y ordenación funcionales
- [x] KPIs contextuales añadidos
- [x] Documento de arquitectura creado

---

## 🎉 RESULTADO FINAL

La arquitectura de facturación ha sido reorganizada exitosamente:

✅ **Clientes** es ahora el centro de relación comercial y facturación  
✅ **Productos/Servicios** concentra la gestión de proveedores y compras  
✅ **Finanzas** es puramente analítico y estratégico  

**Sin modificar:**
- Entidades de datos
- Lógica de negocio
- Cálculos fiscales
- Navegación global
- UX principal del sistema

**Con mejoras en:**
- Contextualización de información
- Experiencia de usuario
- Separación de responsabilidades
- Escalabilidad futura

---

**FIN DEL DOCUMENTO**

*Reorganización completada y arquitectura cerrada.*  
*Última actualización: 17 de Enero de 2026*
