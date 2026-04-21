# ✅ FIX: Botón Editar Producto

## 🎯 Problema Identificado
El botón "Editar" en el DetalleProducto estaba abriendo el ProductWizard en **Paso 1 (Tipo de Producto)** mostrando "Añadir Producto" en lugar de:
1. Cargar los datos del producto existente
2. Abrir directamente en el paso de edición (Paso 6: Identidad del Producto)
3. Mostrar "Editar Producto" como título

## 🔧 Solución Implementada

### 1. **Componente: Productos.tsx**
**Ubicación:** `/src/app/components/sections/Productos.tsx` (línea 567-608)

**ANTES:**
```tsx
onEdit={(id) => {
  setProductoSeleccionado(null);
  // TODO: Cargar datos del producto y abrir wizard en modo edición
  setShowProductWizard(true);
}}
```

**DESPUÉS:**
```tsx
onEdit={(id) => {
  // Buscar el producto en los datos mock
  const producto = mockProducts.find(p => p.id === id);
  
  if (producto) {
    // Preparar los datos iniciales para el wizard basados en el producto
    const initialData = {
      type: 'manufacturable' as const, // En producción vendría del producto
      name: producto.name,
      category: producto.category,
      basePrice: producto.price,
      status: producto.status,
      ivaType: '21%' as const,
      // Otros campos se cargarían del backend en producción
      escandallo: [],
      comboProducts: [],
      brands: [],
      allLocations: true,
      selectedLocations: [],
      description: '',
      image: null,
      images: [],
      sku: '',
      barcode: '',
    };
    
    setProductWizardInitialData(initialData);
    setProductWizardStartStep(6); // Ir directo al paso 6 (Identidad del Producto) en modo edición
  }
  
  setProductoSeleccionado(null);
  setShowProductWizard(true);
}}
```

### 2. **Componente: ProductWizard.tsx**
**Ubicación:** `/src/app/components/wizards/ProductWizard.tsx` (línea 427-432)

**Actualizado el título del wizard:**
```tsx
<h2 className="text-xl font-bold text-gray-900">
  {initialData?.name ? 'Editar Producto' : 'Añadir Producto'}
</h2>
```

Ahora muestra:
- ✅ **"Editar Producto"** cuando hay `initialData.name` (modo edición)
- ✅ **"Añadir Producto"** cuando NO hay `initialData.name` (modo creación)

### 3. **Componente: DemoNuevasFuncionalidades.tsx**
**Ubicación:** `/src/app/components/DemoNuevasFuncionalidades.tsx`

**Actualizado:**
- ✅ Añadido callback `onEdit` al DetalleProducto
- ✅ Corregido ProductWizard para usar `isOpen` prop en lugar de renderizado condicional

## 📋 Flujo Correcto Ahora

```
1. Usuario ve DetalleProducto
   ↓
2. Usuario hace clic en botón "Editar"
   ↓
3. Sistema busca el producto por ID en mockProducts
   ↓
4. Sistema prepara initialData con los datos del producto
   ↓
5. Sistema configura productWizardStartStep = 6 (Paso: Identidad del Producto)
   ↓
6. Sistema cierra DetalleProducto
   ↓
7. Sistema abre ProductWizard con:
   - Título: "Editar Producto"
   - Paso: 6 de 7 (Identidad del Producto)
   - Datos precargados (nombre, categoría, precio, etc.)
   ↓
8. Usuario ve el wizard en MODO EDICIÓN con datos cargados
```

## 🚀 Resultado

✅ **Botón "Editar" funcional**
✅ **Datos del producto se cargan correctamente**
✅ **Wizard se abre en Paso 6 (Identidad del Producto)** - Salta el paso de selección de tipo
✅ **Título correcto: "Editar Producto"** en lugar de "Añadir Producto"
✅ **Wizard muestra "Paso 6 de 7"** - Usuario puede editar nombre, categoría, imágenes, etc.
✅ **Flujo consistente en todos los componentes**

## 🎯 ¿Por qué Paso 6?

El **Paso 6 (Identidad del Producto)** es el lugar ideal para empezar la edición porque:

1. ✅ El tipo de producto ya está definido (no necesita seleccionarlo)
2. ✅ Es donde están los campos más comunes a editar:
   - Nombre del producto
   - Categoría
   - Descripción
   - Imágenes
   - SKU
   - Código de barras
   - Estado (activo/inactivo)
3. ✅ El usuario puede navegar hacia atrás si necesita editar otros pasos (PVP, Escandallo, etc.)
4. ✅ El usuario puede avanzar al Paso 7 para revisar puntos de venta

## 📝 Notas para Producción

Cuando se conecte al backend real:

1. **Cargar datos completos del producto:**
   ```tsx
   const productoCompleto = await fetchProductoById(id);
   ```

2. **Mapear todos los campos:**
   - Imágenes
   - SKU
   - Código de barras
   - Escandallo (si es manufacturable)
   - Productos combo (si es combo)
   - Artículo vinculado (si es no-manufacturable)
   - Marcas
   - Puntos de venta
   - etc.

3. **Validar el tipo de producto:**
   ```tsx
   type: producto.tipo, // 'no-manufacturable' | 'manufacturable' | 'combo' | 'servicio'
   ```

## ✅ Archivos Modificados

1. `/src/app/components/sections/Productos.tsx` - Callback onEdit mejorado + startAtStep = 6
2. `/src/app/components/wizards/ProductWizard.tsx` - Título dinámico (Editar/Añadir Producto)
3. `/src/app/components/DemoNuevasFuncionalidades.tsx` - Añadido onEdit callback

## 🧪 Testing Manual

Para probar el botón "Editar":

1. ✅ Ve a la pestaña **Catálogo → Productos**
2. ✅ Haz clic en cualquier producto (ej: Pizza Margarita)
3. ✅ Se abre el **DetalleProducto** con toda la información
4. ✅ Haz clic en el botón **"Editar"** (icono lápiz arriba a la derecha)
5. ✅ Se cierra el DetalleProducto
6. ✅ Se abre el **ProductWizard** con:
   - Título: **"Editar Producto"**
   - Progreso: **"Paso 6 de 7"**
   - Campos precargados: Nombre, Categoría, Precio, etc.
7. ✅ Puedes navegar con "Atrás" a otros pasos
8. ✅ Puedes hacer cambios y guardar

## 🔄 Comparación Antes/Después

| Aspecto | ❌ ANTES | ✅ DESPUÉS |
|---------|----------|------------|
| **Título** | "Añadir Producto" | "Editar Producto" |
| **Paso inicial** | Paso 1 (Tipo de Producto) | Paso 6 (Identidad del Producto) |
| **Datos** | Vacío (como nuevo producto) | Precargados del producto existente |
| **UX** | Confuso (parece crear nuevo) | Claro (es evidente que estás editando) |
| **Navegación** | Debe pasar por 5 pasos antes de editar | Empieza en el paso más relevante |
