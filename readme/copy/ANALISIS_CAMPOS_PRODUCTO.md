# ANÁLISIS DE CAMPOS - PRODUCTO/SERVICIO
## Comparativa entre DetalleProducto.tsx y ProductWizard.tsx

---

## ✅ CAMPOS DISPONIBLES EN CREACIÓN/EDICIÓN (ProductWizard)

### PASO 1: Tipo de Producto
- ✅ **Tipo de producto**: no-manufacturable | manufacturable | combo | servicio

### PASO 2: Composición
- ✅ **Artículo vinculado** (para no-manufactur able)
- ✅ **Escandallo** (para manufacturable) - lista de ingredientes
- ✅ **Productos en combo** (para combo)

### PASO 3: Precio
- ✅ **Precio base** (sin IVA)
- ✅ **Tipo de IVA**: 0%, 4%, 10%, 21%

### PASO 4: Marcas
- ✅ **Marcas** (array de strings)

### PASO 5: Puntos de Venta
- ✅ **Todos los PDV** (boolean)
- ✅ **PDVs seleccionados** (array de IDs)

### PASO 6: Identidad del Producto
- ✅ **Nombre**
- ✅ **Descripción**
- ✅ **Categoría** (con opción de crear nueva)
- ✅ **Imágenes** (múltiples, arrastrables)
- ✅ **Estado**: activo | inactivo
- ✅ **SKU**
- ✅ **Código de barras**

---

## 📊 CAMPOS MOSTRADOS EN DETALLE (DetalleProducto)

### TAB 1: Información General
- ✅ Nombre
- ✅ Categoría
- ✅ Tipo
- ✅ Estado
- ✅ Descripción
- ✅ SKU
- ✅ Código de barras
- ✅ Etiquetas
- ✅ Alérgenos
- ✅ Marcas
- ✅ Imágenes (galería con selector)
- ✅ **Información Nutricional** (si aplica)

### TAB 2: PVP y Margen
- ✅ Precio de venta (sin IVA)
- ✅ IVA
- ✅ Precio con IVA
- ✅ Coste unitario
- ✅ Margen bruto
- ✅ Margen porcentaje
- ✅ Beneficio unitario

### TAB 3: Costes y Escandallo
- ✅ Coste total
- ✅ Lista de ingredientes con cantidades y costes
- ✅ Ingrediente limitante
- ✅ Capacidad máxima de producción

### TAB 4: Ventas y Stock
- ✅ Ventas últimos 7 días
- ✅ Ventas últimos 30 días
- ✅ Total histórico
- ✅ Ingresos
- ✅ Gráfico de ventas
- ✅ Disponibilidad por PDV
- ✅ Stock por PDV

### TAB 5: Historial
- ✅ Eventos de trazabilidad
- ✅ Cambios de precios
- ✅ Evolución de precios
- ✅ Metadata (fecha creación, modificación, usuarios)

---

## ⚠️ CAMPOS HUÉRFANOS - SIN POSIBILIDAD DE EDICIÓN

### 🔴 CRÍTICOS (Mostrados en DetalleProducto pero NO editables en ProductWizard)

1. **Etiquetas** (tags)
   - Se muestra en: Tab General
   - NO está en ProductWizard
   - **IMPACTO**: Las etiquetas mostradas son solo datos mock, no se pueden asignar

2. **Alérgenos**
   - Se muestra en: Tab General
   - NO está en ProductWizard
   - **IMPACTO**: Información legal importante que no se puede gestionar

3. **Información Nutricional**
   - Se muestra en: Tab General (completa con tablas)
   - NO está en ProductWizard
   - **IMPACTO ALTO**: Acabamos de implementar toda la UX de visualización pero no hay forma de editarla

---

## 🟡 CAMPOS CALCULADOS/AUTOMÁTICOS (OK)

Estos campos se calculan automáticamente y NO necesitan edición:

- ✅ **Ventas**: Se generan desde transacciones
- ✅ **Stock**: Se gestiona desde movimientos de inventario
- ✅ **Coste unitario**: Calculado desde escandallo
- ✅ **Margen**: Calculado desde precio - coste
- ✅ **Historial**: Generado automáticamente por el sistema
- ✅ **Capacidad máxima**: Calculada desde ingrediente limitante

---

## 📝 RECOMENDACIONES PARA COMPLETAR EL WIZARD

### ALTA PRIORIDAD

1. **Añadir Paso 6B: Etiquetas y Alérgenos**
   ```
   - Etiquetas: campo multi-select o tags input
   - Alérgenos: checklist de alérgenos comunes
   ```

2. **Añadir Paso 7: Información Nutricional (solo para manufacturables)**
   ```
   - Checkbox: "Mostrar información nutricional"
   - Opción: "Calcular automáticamente desde ingredientes" vs "Editar manualmente"
   - Tabla de valores por 100g
   - Peso por ración
   - Checkbox: "Mostrar en carta"
   - Checkbox: "Mostrar en app"
   ```

### MEDIA PRIORIDAD

3. **Mejorar Paso 4: Marcas**
   - Actualmente solo permite añadir marcas
   - Falta validación y gestión de marcas existentes

4. **Validaciones adicionales**
   - SKU único
   - Código de barras válido
   - Categoría requerida

---

## 🎯 ESTRUCTURA PROPUESTA PARA ProductWizard COMPLETO

```
PASO 1: Tipo de Producto ✅
PASO 2: Composición (artículo/escandallo/combo) ✅
PASO 3: Precio e IVA ✅
PASO 4: Marcas ✅
PASO 5: Puntos de Venta ✅
PASO 6: Identidad (nombre, categoría, descripción, imágenes, SKU) ✅
PASO 6B: Etiquetas y Alérgenos ❌ FALTA
PASO 7: Información Nutricional ❌ FALTA (solo si aplica)
```

---

## 🔍 CAMPOS ADICIONALES DETECTADOS EN MOCK

Estos campos existen en el mock de DetalleProducto pero podrían no ser necesarios en creación:

- `id`: Se genera automáticamente
- `fechaCreacion`: Timestamp automático
- `creadoPor`: Usuario de sesión
- `ultimaModificacion`: Timestamp automático
- `modificadoPor`: Usuario de sesión
- `imagenes`: Ya está en ProductWizard ✅
- `imagen`: Es la primera del array de imágenes ✅

---

## ✅ CONCLUSIÓN

**CAMPOS HUÉRFANOS DETECTADOS:**
1. ❌ **Etiquetas** - Necesita ser añadido al wizard
2. ❌ **Alérgenos** - Necesita ser añadido al wizard
3. ❌ **Información Nutricional completa** - Necesita ser añadido al wizard

**ACCIÓN REQUERIDA:**
- Añadir un paso adicional en ProductWizard para Etiquetas y Alérgenos
- Añadir un paso opcional para Información Nutricional (solo productos manufacturables)
- Vincular estos campos al mock y al formulario de edición
