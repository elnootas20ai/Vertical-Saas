# COMPARATIVA: Detalle Producto vs Wizard Producto

## 📋 ITEMS EN DETALLE DEL PRODUCTO

### Tab 1: Información General
- ✅ Galería de imágenes (principal + miniaturas)
- ✅ Nombre del producto
- ✅ Categoría
- ✅ Tipo (manufacturable/no-manufacturable/combo/servicio)
- ✅ Estado (activo/inactivo)
- ✅ SKU
- ✅ Descripción
- ✅ **Etiquetas** (ej: Vegetariano, Best Seller, Premium)
- ✅ **Alérgenos** (ej: Gluten, Lácteos)

### Tab 2: PVP y Margen
- ✅ Precio de venta (sin IVA)
- ✅ IVA (%)
- ✅ Precio con IVA
- ✅ Precio final
- ✅ Coste unitario
- ✅ Margen bruto (€)
- ✅ Margen porcentaje (%)
- ✅ Beneficio por unidad
- ✅ Beneficio estimado 7 días
- ✅ Desglose visual (coste vs beneficio)

### Tab 3: Costes y Escandallo
- ✅ Coste total de producción
- ✅ Lista de ingredientes:
  - Nombre del ingrediente
  - Cantidad
  - Unidad de medida
  - Coste
  - Porcentaje sobre total
  - Badge "Limitante"
- ✅ Capacidad máxima de producción
- ✅ Ingrediente limitante
- ✅ Stock del ingrediente limitante

### Tab 4: Ventas y Stock
- ✅ Ventas últimos 7 días
- ✅ Ventas últimos 30 días
- ✅ Total histórico vendido
- ✅ Ingresos (7 días)
- ✅ Tendencia (↑ ↓)
- ✅ Porcentaje de cambio
- ✅ Gráfico de ventas diarias (últimos 7 días)
- ✅ Disponibilidad por Punto de Venta:
  - Nombre PDV
  - Estado (activo/inactivo)
  - Stock local

### Tab 5: Historial
- ✅ Gráfico evolución de precios
- ✅ Historial de cambios de precio:
  - Fecha del cambio
  - Precio anterior
  - Precio nuevo
  - Motivo del cambio
  - Usuario que realizó el cambio
- ✅ Fecha de creación
- ✅ Creado por (usuario)
- ✅ Última modificación
- ✅ Modificado por (usuario)
- ✅ Total vendido (histórico)

---

## 🧙 ITEMS EN WIZARD PRODUCTO (Crear/Editar)

### Paso 1: Tipo de Producto
- ✅ Tipo: No-manufacturable / Manufacturable / Combo / Servicio

### Paso 2: Configuración según tipo
**Si No-Manufacturable:**
- ✅ Artículo vinculado
- ✅ Cantidad del artículo

**Si Manufacturable:**
- ✅ Escandallo (lista de artículos):
  - Artículo
  - Cantidad
  - Unidad
  - Coste calculado

**Si Combo:**
- ✅ Productos incluidos
- ✅ Cantidad de cada producto

### Paso 3: Precio e Impuestos
- ✅ Precio base (sin IVA)
- ✅ Tipo de IVA (0%, 4%, 10%, 21%)
- ✅ Precio con IVA (calculado)
- ✅ Coste calculado (si manufacturable)
- ✅ Margen calculado

### Paso 4: Marcas
- ✅ **Marcas asociadas** (ej: Vertial Premium, Vertial Classic)

### Paso 5: Puntos de Venta
- ✅ Opción "Todos los PDV"
- ✅ Selección individual de PDV
- ✅ Lista de PDV disponibles

### Paso 6: Información General
- ✅ Nombre del producto
- ✅ Descripción
- ✅ Categoría (con opción de crear nueva)
- ✅ Imágenes (con drag & drop para reordenar)
- ✅ Estado (activo/inactivo)
- ✅ SKU
- ✅ Código de barras

### Paso 7: Resumen
- ✅ Vista previa de todos los datos

---

## ⚠️ DIFERENCIAS Y ELEMENTOS FALTANTES

### ❌ FALTAN EN WIZARD (no se pueden crear/editar):
1. **Etiquetas** (Vegetariano, Best Seller, Premium, etc.)
2. **Alérgenos** (Gluten, Lácteos, etc.)

### ❌ FALTAN EN DETALLE (aparecen en wizard pero no se muestran):
1. **Marcas** (Vertial Premium, Vertial Classic, etc.)
2. **Código de barras** (está en wizard pero no aparece destacado en detalle)

### 📊 SOLO EN DETALLE (datos generados automáticamente):
- Ventas y estadísticas
- Historial de cambios de precio
- Datos de creación/modificación
- Stock por PDV (solo lectura)

---

## ✅ RECOMENDACIONES

### Para el WIZARD (añadir):
1. ✅ **Campo: Etiquetas** (multiple select o chips)
   - Ejemplos: Vegetariano, Vegano, Sin Gluten, Best Seller, Nuevo, Premium, Oferta
   
2. ✅ **Campo: Alérgenos** (multiple select con lista estándar)
   - Ejemplos: Gluten, Lácteos, Huevo, Frutos secos, Soja, Pescado, Crustáceos, etc.

### Para el DETALLE (añadir en Tab 1 - Info General):
1. ✅ **Mostrar: Marcas asociadas**
2. ✅ **Mostrar: Código de barras** (destacado junto a SKU)

### Flujo de Edición:
- ✅ Al hacer clic en "Editar" desde el detalle → Abrir ProductWizard con initialData prellenado
- ✅ El wizard debe recibir el producto completo para editar
- ✅ Mantener el mismo flujo de pasos pero con datos existentes

---

## 🎯 RESUMEN

**Campos comunes (en ambos):** 14  
**Solo en Detalle:** 2 (Etiquetas, Alérgenos)  
**Solo en Wizard:** 1 (Marcas)  
**Datos automáticos:** 10+ (ventas, historial, etc.)

**ACCIÓN REQUERIDA:**
1. Añadir "Etiquetas" y "Alérgenos" al ProductWizard (paso 6)
2. Mostrar "Marcas" y "Código de barras" en DetalleProducto (tab 1)
3. Conectar el botón "Editar" correctamente
