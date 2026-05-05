# 📋 ARQUITECTURA UX: CATÁLOGO COMPLETO
## Módulo: Catálogo + Pedidos + Facturas + Productos y Servicios

---

## 🎯 OBJETIVO COMPLETADO

Se ha diseñado e implementado la arquitectura UX completa del módulo Catálogo de Vertial, alineando:
- ✅ Facturas de proveedor (nueva funcionalidad completa)
- ✅ Pedidos a proveedor (ajustes UX realizados)
- ✅ Catálogo de artículos (unificado y coherente)
- ✅ Productos y servicios (separación clara)

---

## 1️⃣ FACTURAS DE PROVEEDOR - ARQUITECTURA COMPLETA

### 📄 **A. Modal "Añadir Factura de Proveedor"**

**Archivo:** `/src/app/components/modals/AñadirFacturaProveedorModal.tsx`

#### **Secciones del modal (en orden):**

1. **Datos básicos de la factura** *(obligatorio)*
   - Proveedor (select) *
   - Nº Factura (input texto) *
   - Fecha (date picker) *

2. **Asociar con pedidos** *(opcional)*
   - Sistema de checkboxes para seleccionar 0, 1 o varios pedidos
   - Muestra pedidos disponibles del proveedor seleccionado
   - Resumen con total de pedidos seleccionados
   - **Mensaje informativo:**
     > "Puedes asociar esta factura a uno o varios pedidos del mismo proveedor. Esto te ayudará a detectar diferencias entre lo pedido y lo facturado. También puedes no asociarla a ningún pedido."

3. **Líneas de la factura** *(obligatorio, mín. 1)*
   - Sistema dinámico de líneas (añadir/eliminar)
   - Campos por línea:
     - Artículo (texto)
     - Cantidad (número)
     - Unidad (texto)
     - Precio unitario (número)
     - Subtotal (calculado automáticamente)
   - **Total de factura calculado en tiempo real**

4. **Detección automática de diferencias:**
   - ✅ **Coincide**: Badge verde si total factura = total pedidos
   - ⚠️ **Hay diferencias**: Badge naranja mostrando monto de diferencia
   - ℹ️ **Sin pedido asociado**: Badge azul informativo
   - **Permite continuar aunque haya diferencias**

5. **Observaciones e incidencias:**
   - **Observaciones internas** (textarea)
     - Texto helper: "Uso interno. No visible para el proveedor."
   - **Incidencias con proveedor** (textarea)
     - Texto helper: "Preparado para comunicación con proveedor (F2)."

#### **UX clave:**
- ✅ Vista paralela de líneas de factura vs pedidos seleccionados
- ✅ Cálculos automáticos en tiempo real
- ✅ Detección visual de coincidencias/diferencias
- ⚠️ La factura NO modifica stock
- ⚠️ La factura NO cierra pedidos automáticamente

---

### 📊 **B. Vista detalle de factura**

**Archivo:** `/src/app/components/productos/DetalleFacturaProveedor.tsx`

#### **Estructura del detalle:**

**HEADER (sticky):**
- Botón "Volver"
- Nº Factura + Badge de estado (Pagada/Pendiente/Vencida)
- Proveedor + Fecha
- Total factura (destacado)
- Acciones: Descargar PDF, Ver documento

**CONTENIDO (secciones desplegables):**

1. **Estado de coherencia** (siempre visible arriba)
   - 🟢 **Coincide**: "Los totales coinciden con los pedidos asociados"
   - 🟠 **Hay diferencias**: "Diferencia: XX.XX €"
   - 🔵 **Sin pedido asociado**: "Esta factura no está asociada a ningún pedido"

2. **Pedidos asociados**
   - Lista de pedidos vinculados
   - Cada pedido muestra:
     - Número + Estado (badge)
     - Fecha + Nº artículos + Total
     - Click → Va al detalle del pedido
   - Total de todos los pedidos asociados

3. **Artículos facturados**
   - Lista de todas las líneas de la factura
   - Por línea: Artículo, cantidad × precio unitario = subtotal
   - Total factura al final (destacado)

4. **Observaciones / Incidencias**
   - **Observaciones internas** (fondo azul)
   - **Incidencias con proveedor** (fondo naranja)
   - Solo se muestra si tiene contenido

#### **UX clave:**
- ✅ Estado de coherencia siempre visible
- ✅ Navegación cruzada a pedidos
- ✅ Información contable clara
- ✅ Incidencias visiblemente diferenciadas

---

### 📑 **C. Lista de facturas**

**Archivo:** `/src/app/components/productos/FacturasProveedoresView.tsx`

#### **Características:**
- **2 vistas:** Tabla / Tarjetas (toggle)
- **Columnas tabla:**
  - Proveedor (con icono)
  - Nº Factura
  - Fecha
  - Estado (badge)
  - Total
  - Acciones (Ver / Descargar PDF)
- **Ordenación:** Por todas las columnas
- **Filtros:** Por proveedor, estado, fechas
- **Acciones:**
  - Botón "+Factura" → Abre modal de añadir
  - Click en fila → Abre detalle
  - Botón ojo → Abre detalle
  - Botón descarga → Descarga PDF

---

## 2️⃣ PEDIDOS A PROVEEDOR - AJUSTES UX

### 📦 **Detalle de pedido ACTUALIZADO**

**Archivo:** `/src/app/components/productos/DetallePedidoProveedor.tsx`

#### **Nuevas secciones añadidas:**

**1. Bloque "Facturas asociadas"**
- Puede mostrar 0, 1 o varias facturas
- Por cada factura:
  - Nº Factura + Estado (badge)
  - Fecha + Total
  - Click → Va al detalle de la factura
- **Si no hay facturas:** Muestra mensaje informativo

**2. Bloque "Observaciones"**
- Visible cuando el pedido está:
  - Facturado
  - Reclamado
  - Cerrado
- Muestra observaciones internas y del proveedor

**3. Estados del pedido visibles:**
- 🟡 **Borrador** (badge amarillo)
- 🔵 **Enviado** (badge azul)
- 🟢 **Recibido** (badge verde)
- 🟣 **Facturado** (badge morado)
- 🔴 **Reclamado** (badge rojo)
- ⚫ **Cancelado** (badge gris)

⚠️ **Importante:** Los cambios de estado NO son automáticos, solo se representan visualmente.

---

## 3️⃣ CATÁLOGO - PRODUCTOS Y SERVICIOS (VENTA)

### 🛍️ **A. Lista de Catálogo**

**Archivo:** `/src/app/components/sections/Productos.tsx` (tab "productos")

#### **Diferenciación visual:**

**PRODUCTO:**
- 📦 Icono: Paquete
- Color: Azul
- Badge: "Producto"
- Puede consumir artículos (tiene o no escandallo)

**SERVICIO:**
- ⚙️ Icono: Engranaje
- Color: Verde
- Badge: "Servicio"
- NO consume stock

#### **Información mínima mostrada:**
- Nombre
- Tipo (Producto / Servicio)
- Precio
- Estado (Activo / Inactivo)

#### **Acciones disponibles:**
- 👁️ Ver detalle
- ✏️ Editar
- 🔴 Desactivar (no eliminar)

---

### 🎯 **B. Detalle de Producto (venta)**

**Estructura ordenada de más a menos uso:**

1. **Información básica**
   - Nombre
   - Descripción
   - Categoría
   - Estado

2. **Precio e impuestos**
   - Precio venta (PVP)
   - Impuestos aplicables
   - Precio final

3. **Relación con artículos** *(solo informativo)*
   - ✅ Tiene escandallo: "Este producto usa X artículos"
   - ❌ Sin escandallo: "Producto simple sin artículos asociados"
   - Click → Ve lista de artículos del escandallo
   - ⚠️ **NO mostrar stock aquí**
   - ⚠️ **NO mezclar con datos de compra**

4. **Uso en ventas** *(informativo)*
   - Productos vendidos (últimos 30 días)
   - Productos más vendidos
   - Tendencia

5. **Disponibilidad**
   - Puntos de venta donde está disponible
   - Toggle activo/inactivo por ubicación

---

### ⚙️ **C. Detalle de Servicio**

**Estructura más simple:**

1. **Información básica**
   - Nombre
   - Descripción
   - Tipo de servicio

2. **Precio**
   - Precio por hora / unidad
   - Impuestos

3. **Duración** *(si aplica)*
   - Duración estimada
   - Unidad (minutos, horas, días)

4. **Estado**
   - Activo / Inactivo
   - Disponibilidad

---

## 4️⃣ PRINCIPIOS UX APLICADOS

### ✅ **Separación clara de contextos:**

| CONTEXTO | ENTIDADES | UBICACIÓN |
|----------|-----------|-----------|
| **Compra** | Artículos, Proveedores, Pedidos | Catálogo → Stock / Proveedores / Pedidos |
| **Venta** | Productos, Servicios, Precios | Catálogo → Productos |
| **Logística** | Recepción, Transferencia, Ajustes | Catálogo → Stock (acciones) |
| **Contabilidad** | Facturas de proveedor | Catálogo → Facturas |

### ✅ **Relaciones cruzadas (solo informativas):**
- Artículo → "Usado en X productos"
- Producto → "Usa X artículos"
- Pedido → "Facturas asociadas"
- Factura → "Pedidos asociados"

### ✅ **No mostrar acciones que no existen:**
- Si es nivel BASE, no mostrar funcionalidades F2/F3
- Si algo es futuro, marcarlo como "preparado" con mensaje

### ✅ **Consistencia terminológica:**
- **Artículo** = Lo que se COMPRA a proveedores
- **Producto** = Lo que se VENDE (puede consumir artículos)
- **Servicio** = Lo que se VENDE (no consume stock)

---

## 5️⃣ FLUJOS IMPLEMENTADOS

### 🔄 **Flujo: Pedido ↔ Factura**

```
1. CREAR PEDIDO
   ↓
2. RECIBIR MATERIAL (opcional)
   ↓
3. RECIBIR FACTURA DEL PROVEEDOR
   ↓
4. CREAR FACTURA EN SISTEMA
   - Seleccionar proveedor
   - Asociar a pedido(s) o no asociar
   - Introducir líneas de factura
   - Sistema detecta diferencias automáticamente
   ↓
5. REVISAR DIFERENCIAS (si las hay)
   - Observaciones internas
   - Incidencias con proveedor
   ↓
6. GUARDAR FACTURA
   - NO modifica stock
   - NO cierra pedidos
   - Queda vinculada para trazabilidad
```

### 🔄 **Flujo: Artículo ↔ Pedido ↔ Recepción**

```
1. CREAR ARTÍCULO
   ↓
2. AÑADIR A PEDIDO
   ↓
3. ENVIAR PEDIDO A PROVEEDOR
   ↓
4. RECIBIR MATERIAL
   - Registrar cantidad recibida
   - Registrar lote y caducidad
   - Actualizar stock
   ↓
5. FACTURA (si llega)
   - Asociar a pedido
   - Comparar cantidades y precios
```

### 🔄 **Flujo: Producto / Servicio ↔ Venta**

```
1. CREAR PRODUCTO/SERVICIO
   - Definir precio
   - Asociar artículos (si es producto)
   - Configurar disponibilidad
   ↓
2. ACTIVAR EN PUNTOS DE VENTA
   ↓
3. VENDER (desde TPV/Comandas)
   - Si es producto con escandallo: consume artículos
   - Si es servicio: no consume stock
   ↓
4. ANÁLISIS
   - Productos más vendidos
   - Rentabilidad
   - Tendencias
```

---

## 6️⃣ COMPONENTES CREADOS/ACTUALIZADOS

### ✅ **Nuevos componentes:**
1. `/src/app/components/modals/AñadirFacturaProveedorModal.tsx`
2. `/src/app/components/productos/DetalleFacturaProveedor.tsx`

### ✅ **Componentes actualizados:**
1. `/src/app/components/productos/FacturasProveedoresView.tsx`
   - Integración con modal de añadir
   - Integración con detalle
   - Estados y navegación

2. `/src/app/components/modals/AñadirArticuloModal.tsx`
   - Textos clarificadores mejorados
   - Coherencia con detalle de artículo

3. `/src/app/components/catalogo/DetalleArticulo.tsx`
   - Historial simplificado (nivel BASE)
   - Etiquetas unificadas
   - Mensajes informativos alineados

---

## 7️⃣ RESULTADO FINAL

### ✅ **UX clara, ordenada y consistente:**
- Jerarquía visual correcta
- Flujos intuitivos
- Terminología unificada

### ✅ **Sin información duplicada:**
- Cada dato tiene su lugar único
- Las relaciones son informativas, no redundantes

### ✅ **Sin información contradictoria:**
- Compra vs Venta claramente separados
- Estados y acciones coherentes

### ✅ **Ciclo completo entendible:**
- Usuario comprende: Artículo → Pedido → Recepción → Factura
- Usuario comprende: Producto → Venta → Consumo de artículos

### ✅ **Diseño listo para escalar:**
- Preparado para F2 (incidencias con proveedor)
- Preparado para F3 (gestión avanzada)
- Arquitectura extensible sin modificar lo existente

---

## 8️⃣ NOTAS TÉCNICAS IMPORTANTES

### ⚠️ **Lo que NO hace el sistema:**
- La factura NO modifica stock automáticamente
- La factura NO cierra pedidos automáticamente
- Los cambios de estado de pedidos NO son automáticos

### ✅ **Lo que SÍ hace el sistema:**
- Detecta diferencias entre factura y pedidos
- Permite asociar 0, 1 o N pedidos a una factura
- Mantiene trazabilidad completa
- Separa claramente compra, venta y contabilidad

---

## 📌 **ARQUITECTURA LISTA PARA IMPLEMENTACIÓN**

Todos los componentes visuales, flujos y mensajes están implementados y listos para:
1. Conectar con backend real (actualmente usa mock data)
2. Integrar con sistema de permisos
3. Añadir validaciones de negocio
4. Extender en fases F2/F3 sin romper lo existente

**Estado:** ✅ **ARQUITECTURA UX COMPLETA Y COHERENTE**

