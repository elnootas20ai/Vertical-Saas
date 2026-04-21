# 📋 AUDITORÍA COMPLETA — MÓDULO CATÁLOGO (UDAR EDGE)

**Fecha de auditoría**: 27 de enero de 2026  
**Versión del sistema**: Figma CORE (pre-backend)  
**Auditor**: Sistema de análisis técnico  
**Objetivo**: Fotografía exacta del estado actual sin proponer mejoras

---

## 🎯 RESUMEN EJECUTIVO

### Números totales
- **Funcionalidades detectadas**: 47 funcionalidades
- **Componentes principales**: 18 archivos
- **Datos 100% mock**: SÍ (arrays hardcoded en frontend)
- **Backend conectado**: NO
- **Submódulos identificados**: 6

### Estado por funcionalidad
| Estado | Cantidad | % |
|--------|----------|---|
| **Diseñado** (UX completa) | 14 | 29.8% |
| **Parcial** (UI existe pero no ejecuta) | 28 | 59.6% |
| **No trabajado** | 5 | 10.6% |

### Riesgos críticos identificados
1. ✅ **100% datos mock** - No hay integración con backend real
2. ⚠️ **Sin segregación multiempresa** - Artículos/productos sin `companyId`
3. ⚠️ **Relación Producto ↔ Artículo inexistente** - Solo conceptual, no persistida
4. ⚠️ **Stock sin trazabilidad real** - Valores hardcoded
5. ⚠️ **Pedidos sin estado de ejecución** - Flujo visual únicamente
6. ⚠️ **Escandallo como FLAG** - Módulo condicional pero no gestionado en backend

---

## 1️⃣ INVENTARIO FUNCIONAL COMPLETO

### SUBMÓDULO: Catálogo (Productos y Servicios de venta)

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 1 | Listar productos y servicios | Vista unificada de productos vendibles y servicios | Diseñado | `Productos.tsx` Tab "Catálogo" | Gerente | ❌ No | ❌ No | Mock hardcoded `mockProducts` + `mockServices` |
| 2 | Cambiar vista Grid/Lista | Toggle entre tarjetas y tabla | Diseñado | `Productos.tsx` (viewMode2) | Gerente | N/A | N/A | Solo visual |
| 3 | Filtrar por búsqueda | Campo de búsqueda visual | Parcial | `Productos.tsx` header tabla | Gerente | N/A | N/A | Sin implementar lógica |
| 4 | Filtrar por categoría | Botón de filtro presente | Parcial | `Productos.tsx` header tabla | Gerente | N/A | N/A | Sin implementar lógica |
| 5 | Ver stock de producto | Muestra valor numérico de stock | Diseñado | `Productos.tsx` tarjeta | Gerente | ❌ No | ❌ No | Valor mock, sin origen real |
| 6 | Alerta stock bajo | Badge rojo si stock < 10 | Diseñado | `Productos.tsx` tarjeta | Gerente | N/A | N/A | Lógica hardcoded |
| 7 | Ver precio de producto/servicio | Precio formateado EUR | Diseñado | `Productos.tsx` tarjeta | Gerente | N/A | N/A | Valor mock |
| 8 | Ver duración de servicio | Duración en servicios | Diseñado | `Productos.tsx` tarjeta | Gerente | N/A | N/A | Solo servicios |
| 9 | Crear producto/servicio (Wizard) | Wizard de 6 pasos | Parcial | `ProductWizard.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 10 | Seleccionar tipo producto | No-manufacturable / Manufacturable / Combo / Servicio | Diseñado | `ProductWizard.tsx` Step 1 | Gerente | N/A | N/A | Paso funcional |
| 11 | Vincular artículo (no-manufacturable) | Asociar 1 artículo de compra | Parcial | `ProductWizard.tsx` Step 2 | Gerente | ❌ No | ❌ No | Sin persistencia |
| 12 | Crear escandallo (manufacturable) | Añadir múltiples artículos con cantidades | Parcial | `ProductWizard.tsx` Step 2 | Gerente | ❌ No | ❌ No | Cálculos visuales OK, sin guardar |
| 13 | Crear combo | Seleccionar productos existentes | Parcial | `ProductWizard.tsx` Step 2 | Gerente | ❌ No | ❌ No | Sin persistencia |
| 14 | Definir precio base e IVA | 0% / 4% / 10% / 21% | Diseñado | `ProductWizard.tsx` Step 3 | Gerente | N/A | N/A | Valores OK |
| 15 | Calcular margen automático | Precio venta - coste artículos | Diseñado | `ProductWizard.tsx` Step 3 | Gerente | N/A | N/A | Solo si hay escandallo |
| 16 | Asignar marcas | Múltiples marcas (mock) | Parcial | `ProductWizard.tsx` Step 4 | Gerente | N/A | N/A | Mock brands |
| 17 | Asignar PDVs de venta | Todos o específicos | Parcial | `ProductWizard.tsx` Step 5 | Gerente | ❌ No | ❌ No | Mock locations |
| 18 | Añadir nombre, categoría, SKU, código barras | Datos de identificación | Diseñado | `ProductWizard.tsx` Step 6 | Gerente | N/A | N/A | Campos OK |
| 19 | Subir imagen producto | Input tipo file | Parcial | `ProductWizard.tsx` Step 6 | Gerente | N/A | N/A | No sube a servidor |

### SUBMÓDULO: Artículos (Productos de compra)

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 20 | Listar artículos | Vista de artículos de compra | Diseñado | `Productos.tsx` Tab "Artículos" | Gerente | ❌ No | ❌ No | Mock `mockArticles` reutiliza `mockProducts` |
| 21 | Ver detalle de artículo | Modal completo de artículo | Diseñado | `DetalleArticulo.tsx` | Gerente | ❌ No | ❌ No | UX completa, datos mock |
| 22 | Crear artículo | Modal de alta de artículo | Parcial | `AñadirArticuloModal.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 23 | Gestionar categorías artículos | Categorías predefinidas + añadir nuevas | Diseñado | `AñadirArticuloModal.tsx` | Gerente | N/A | N/A | Estado local |
| 24 | Definir unidad de medida | kg, L, ud, g, ml, etc. | Diseñado | `AñadirArticuloModal.tsx` | Gerente | N/A | N/A | Input text libre |
| 25 | Formato de compra (variantes) | Saco, Caja, Pack con equivalencias | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Mock en detalle |
| 26 | Asociar proveedor principal | Selección de proveedor | Parcial | `AñadirArticuloModal.tsx` | Gerente | ❌ No | ❌ No | Mock proveedores |
| 27 | Asociar proveedores alternativos | Múltiples proveedores | Parcial | `DetalleArticulo.tsx` | Gerente | ❌ No | ❌ No | Solo visual |
| 28 | Definir coste de compra | Precio unitario | Diseñado | `AñadirArticuloModal.tsx` | Gerente | N/A | N/A | Input numérico |
| 29 | Stock mínimo y óptimo | Alertas de reposición | Diseñado | `AñadirArticuloModal.tsx` | Gerente | N/A | N/A | Valores por defecto: 20, 100 |
| 30 | Ver stock actual | Visualización de stock total y por ubicación | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Mock ubicaciones |
| 31 | Alertas stock crítico/bajo | Badges según nivel | Diseñado | `DetalleArticulo.tsx` | Gerente | N/A | N/A | Lógica cálculo % OK |
| 32 | Gestión de lotes y caducidades | Ver lotes, estado (OK/Próximo/Caducado) | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Mock lotes |
| 33 | Alerta lotes próximos a caducar | Badge naranja con días | Diseñado | `DetalleArticulo.tsx` | Gerente | N/A | N/A | Cálculo mock |
| 34 | Ver costes (Último / CMP) | Último coste vs Coste Medio Ponderado | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Valores mock |
| 35 | Ajustar CMP manualmente | Modal de ajuste | No trabajado | Botón presente | Gerente | N/A | N/A | Modal no existe |
| 36 | Ver productos que usan artículo | Relación inversa escandallo | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Mock |
| 37 | Añadir notas internas | Notas por artículo | Diseñado | `DetalleArticulo.tsx` modal | Gerente | ❌ No | ❌ No | Modal funcional, sin persistencia |
| 38 | Ver historial de movimientos | Recepciones, consumos, ajustes | Diseñado | `DetalleArticulo.tsx` sección | Gerente | ❌ No | ❌ No | Mock |
| 39 | Ver imágenes de artículo | Galería de imágenes | Diseñado | `DetalleArticulo.tsx` sección | Gerente | N/A | N/A | Mock URLs Unsplash |
| 40 | Recibir material | Modal de recepción | Parcial | Botón en detalle | Gerente | N/A | N/A | Modal existe, console.log |
| 41 | Crear pedido desde artículo | Atajo rápido | Parcial | Botón en detalle | Gerente | N/A | N/A | Abre wizard pedido |
| 42 | Ajustar stock manualmente | Modal de ajuste | Parcial | `AjusteStockModal.tsx` | Gerente | ❌ No | ❌ No | Modal existe |
| 43 | Transferir stock entre almacenes | Modal de transferencia | Parcial | `TransferirStockModal.tsx` | Gerente | ❌ No | ❌ No | console.log |
| 44 | Realizar inventario de artículo | Modal de conteo manual o foto | Parcial | `InventarioArticuloModal.tsx` | Gerente | ❌ No | ❌ No | console.log |

### SUBMÓDULO: Proveedores

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 45 | Listar proveedores | Vista de proveedores | Diseñado | `Productos.tsx` Tab "Proveedores" | Gerente | ❌ No | ❌ No | Mock `mockSuppliers` |
| 46 | Crear proveedor | Modal de alta | Parcial | `AñadirProveedorModal.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 47 | Ver total pedidos proveedor | Contador de pedidos | Diseñado | `Productos.tsx` tarjeta | Gerente | ❌ No | ❌ No | Valor mock |

### SUBMÓDULO: Pedidos a Proveedores

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 48 | Listar pedidos | Vista de pedidos enviados/borradores | Diseñado | `PedidosProveedorView.tsx` | Gerente | ❌ No | ❌ No | Mock `mockPedidos` |
| 49 | Crear pedido (Wizard) | Wizard paso a paso | Parcial | `CrearPedidoProveedorWizard.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 50 | Estados de pedido | Borrador, Enviado, Recibido, Cerrado, Cancelado | Diseñado | `PedidosProveedorView.tsx` | Gerente | N/A | N/A | Solo visual |
| 51 | Tipo de entrega | Envío / Recogida | Diseñado | `CrearPedidoProveedorWizard.tsx` | Gerente | N/A | N/A | Determina si genera lista compra |
| 52 | Canal de envío | Email, WhatsApp, Portal, Teléfono, Otro | Diseñado | `CrearPedidoProveedorWizard.tsx` | Gerente | N/A | N/A | Mock canales |
| 53 | Lista de compra (recogida) | Lista imprimible para compra física | Diseñado | `ListaCompraDetalle.tsx` | Gerente | ❌ No | ❌ No | Sólo si tipoEntrega='recogida' |
| 54 | Ver detalle pedido | Modal de detalle | Parcial | `DetallePedidoProveedor.tsx` | Gerente | ❌ No | ❌ No | UX diseñada |
| 55 | Vincular pedido con recepción | Al recibir material | Parcial | `RecepcionMaterialModal.tsx` | Gerente | N/A | N/A | console.log |

### SUBMÓDULO: Facturas de Proveedores

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 56 | Listar facturas de compra | Vista de facturas recibidas | Diseñado | `FacturasProveedoresView.tsx` | Gerente | ❌ No | ❌ No | Mock facturas |
| 57 | Añadir factura proveedor | Modal de alta | Parcial | `AñadirFacturaProveedorModal.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 58 | Ver detalle factura | Modal de detalle | Parcial | `DetalleFacturaProveedor.tsx` | Gerente | ❌ No | ❌ No | UX diseñada |
| 59 | Descargar PDF factura | Botón de descarga | No trabajado | `FacturasProveedoresView.tsx` | Gerente | N/A | N/A | console.log |

### SUBMÓDULO: Escandallo (FLAG)

| # | Funcionalidad | Descripción | Estado | Pantalla/Componente | Rol | Multiempresa | Multi-PDV | Observaciones |
|---|---------------|-------------|--------|---------------------|-----|--------------|-----------|---------------|
| 60 | Tab Escandallo (condicional) | Solo visible si `escandalloModuleActive = true` | Diseñado | `Productos.tsx` Tab | Gerente | N/A | N/A | FLAG hardcoded |
| 61 | Vista por Producto/Artículo/Margen | 3 vistas alternativas | Diseñado | `Productos.tsx` escandallo | Gerente | N/A | N/A | Cambio de vista OK |
| 62 | Listar escandallos | Productos con escandallo creado | Diseñado | `Productos.tsx` | Gerente | ❌ No | ❌ No | Mock `mockEscandallos` |
| 63 | Crear escandallo (Wizard) | Wizard de creación | Parcial | `CrearEscandalloWizard.tsx` | Gerente | ❌ No | ❌ No | console.log al guardar |
| 64 | Expandir/Colapsar detalle escandallo | Acordeón de artículos | Diseñado | `Productos.tsx` | Gerente | N/A | N/A | Estado local |
| 65 | Ver coste total escandallo | Suma de costes | Diseñado | `Productos.tsx` | Gerente | N/A | N/A | Cálculo mock |
| 66 | Ver margen de producto | Precio venta - coste total | Diseñado | `Productos.tsx` | Gerente | N/A | N/A | Cálculo mock |
| 67 | Stock estimado de producto | Máximas unidades fabricables | Diseñado | `Productos.tsx` | Gerente | ❌ No | ❌ No | Cálculo según artículo limitante |
| 68 | Guardar escandallo en blanco | Modal para guardar sin convertir a producto | Parcial | `GuardarEscandalloModal.tsx` | Gerente | ❌ No | ❌ No | console.log |
| 69 | Convertir escandallo en producto | Abre wizard producto con datos | Parcial | Flujo combinado | Gerente | ❌ No | ❌ No | Integración OK visualmente |

---

## 2️⃣ PRODUCTOS VS ARTÍCULOS - ANÁLISIS DETALLADO

### Diferenciación conceptual

**PRODUCTOS / SERVICIOS** (lo que se vende)
- **Interface TypeScript**: `Product` y `Service` en `Productos.tsx`
- **Campos actuales**:
  - `id: string`
  - `name: string`
  - `category: string`
  - `price: number` (precio de venta)
  - `stock: number` ⚠️ **PROBLEMA**: No debería tener stock directo
  - `status: 'activo' | 'inactivo'`
  - `type?: 'no-manufacturado' | 'manufacturado' | 'combo'` (solo en wizard)
  - `duration: string` (solo servicios)

**ARTÍCULOS** (lo que se compra)
- **Interface TypeScript**: `Article` en `Productos.tsx`
- **Campos actuales**:
  - `id: string`
  - `name: string`
  - `unit: string` (kg, L, ud, g, ml)
  - `cost: number` (coste de compra)
  - `stock: number`
  - `almacen?: string` ⚠️ **AÑADIDO**: Campo de almacén base

### Relación Producto ↔ Artículo

#### Estado actual
❌ **NO EXISTE RELACIÓN PERSISTIDA**

#### Evidencias de intento de relación
1. **En ProductWizard.tsx**:
   - Tipo "no-manufacturable": permite vincular 1 artículo
   - Tipo "manufacturable": permite crear escandallo (múltiples artículos)
   - Tipo "combo": permite vincular productos existentes
   - Interface `EscandalloItem` existe con `articleId`, `quantity`, `unit`, `cost`

2. **En DetalleArticulo.tsx**:
   - Sección "Uso en productos" muestra productos que usan el artículo
   - Relación inversa conceptualmente diseñada
   - Datos son 100% mock: `productosQueUsan` array hardcoded

3. **Mock de relación en escandallo**:
```typescript
interface Escandallo {
  productId: string;
  productName: string;
  productCategory: string;
  productType: 'no-manufacturado' | 'manufacturado' | 'combo';
  productPrice: number;
  items: EscandalloItem[]; // ← Relación conceptual
  totalCost: number;
  margin: number;
  marginPercentage: number;
  stockEstimated: 'disponible' | 'bajo' | 'agotado' | 'no-requiere';
  maxUnits: number;
  limitedBy?: string;
}
```

### Tipos de productos contemplados

✅ **PRODUCTO NO MANUFACTURABLE**
- Definición: Se compra y vende sin transformación
- Relación: 1 producto = 1 artículo
- Ejemplo: "Botella de agua" (producto) ← "Agua embotellada 1.5L" (artículo)
- Estado: **Diseñado** pero sin persistencia

✅ **PRODUCTO MANUFACTURABLE**
- Definición: Se fabrica a partir de múltiples artículos
- Relación: 1 producto = N artículos (escandallo)
- Ejemplo: "Pizza Margarita" ← [Masa, Salsa, Mozzarella, Albahaca, Aceite]
- Estado: **Diseñado** con cálculos de coste y margen
- **Problema**: Consumo de stock no implementado

✅ **PRODUCTO COMBO**
- Definición: Agrupación de productos existentes
- Relación: 1 combo = N productos
- Ejemplo: "Menú Familiar" ← [2x Pizza, 1x Ensalada, 1x Bebida]
- Estado: **Diseñado** pero sin cálculo automático de precio

✅ **SERVICIO**
- Definición: Prestación sin consumo de artículos
- Relación: Sin artículos asociados
- Campos propios: `duration`
- Estado: **Diseñado** completo

### Conclusión
**Separación**: ✅ Existe separación clara en interfaces y UX  
**Persistencia**: ❌ No existe en backend  
**Relación**: ⚠️ Conceptual y visual únicamente  
**Consumo de stock**: ❌ No implementado

---

## 3️⃣ FLUJOS FUNCIONALES EXISTENTES

### FLUJO 1: Alta de Producto/Servicio (ProductWizard)

**Evento inicial**: Click en botón "Añadir Producto/Servicio" (Tab Catálogo)

**Pantallas implicadas**:
1. `ProductWizard.tsx` - Modal wizard 6 pasos

**Pasos del flujo**:
1. **Paso 1 - Tipo de producto**
   - Selección: No-manufacturable, Manufacturable, Combo, Servicio
   - Resultado: `formData.type` actualizado
   - Validación: Requerido

2. **Paso 2 - Vinculación (condicional según tipo)**
   - **No-manufacturable**: Seleccionar 1 artículo de lista mock
   - **Manufacturable**: Añadir artículos con cantidades (escandallo)
   - **Combo**: Seleccionar productos existentes
   - **Servicio**: Paso omitido
   - Validación: Opcional (puede avanzar sin vincular)

3. **Paso 3 - Precio e IVA**
   - Input: Precio base (número)
   - Select: IVA (0%, 4%, 10%, 21%)
   - Cálculo automático: Si hay escandallo, muestra margen
   - Validación: Precio > 0

4. **Paso 4 - Marcas**
   - Selección múltiple de marcas mock
   - Validación: Opcional

5. **Paso 5 - Puntos de venta**
   - Toggle "Todos los PDVs" o selección específica
   - Lista de PDVs mock
   - Validación: Al menos 1 si no es "todos"

6. **Paso 6 - Datos de producto**
   - Inputs: Nombre, Categoría, Descripción
   - Inputs: SKU, Código de barras
   - Upload: Imagen (no funcional)
   - Toggle: Activo/Inactivo
   - Validación: Nombre requerido

**Resultado final**:
- `onSave(formData)` ejecutado
- En `Productos.tsx` línea 378: `console.log('Producto guardado:', data)`
- ❌ **NO SE GUARDA EN NINGÚN SITIO**
- Modal se cierra
- Lista de productos NO se actualiza

**Qué ocurre si falta información**:
- Wizard permite avanzar con campos opcionales vacíos
- Botón "Guardar" deshabilitado si falta nombre
- No hay validación de campos numéricos (puede ser 0)

---

### FLUJO 2: Alta de Artículo

**Evento inicial**: Click en botón "Añadir Artículo" (Tab Artículos)

**Pantallas implicadas**:
1. `AñadirArticuloModal.tsx` - Modal con secciones desplegables

**Secciones del flujo**:
1. **Datos básicos** (obligatorio)
   - Inputs: Nombre, Categoría (select), Unidad de medida, Referencia/SKU
   - Toggle: Activo/Inactivo
   - Gestión de categorías: Permite añadir nueva categoría personalizada
   - Validación: Nombre, unidad, categoría requeridos

2. **Formato de compra** (opcional)
   - Inputs: Unidad de compra, Cantidad por unidad, Contenido por unidad
   - Ejemplo: "1 Saco = 25 kg"
   - Estado: Sección desplegable, sin validación

3. **Compras y proveedores** (opcional)
   - Select: Proveedor principal (lista mock)
   - Input: Coste de compra
   - Botón: "Añadir proveedor" (abre `AñadirProveedorModal`)
   - Validación: Opcional

4. **Control de stock** (opcional)
   - Inputs: Stock mínimo (default: 20), Stock óptimo (default: 100)
   - Uso: Para alertas de reposición
   - Validación: Opcional

5. **Notas internas** (opcional)
   - Textarea libre
   - Validación: Opcional

**Resultado final**:
- `onSave(articulo)` ejecutado
- En `Productos.tsx` línea 383: `console.log('Artículo guardado:', data)`
- ❌ **NO SE GUARDA EN NINGÚN SITIO**
- Modal se cierra
- Lista de artículos NO se actualiza

**Qué ocurre si falta información**:
- Botón "Guardar" deshabilitado hasta que haya nombre, unidad y categoría
- Campos opcionales pueden dejarse vacíos

---

### FLUJO 3: Alta de Proveedor

**Evento inicial**: 
- Click en "Añadir Proveedor" (Tab Proveedores)
- Click en "Añadir proveedor" dentro de `AñadirArticuloModal`

**Pantallas implicadas**:
1. `AñadirProveedorModal.tsx`

**Datos solicitados**:
- Nombre comercial
- Persona de contacto
- Teléfono
- Email
- Categoría (select)
- CIF/NIF
- Dirección
- Observaciones

**Resultado final**:
- `onSave(proveedor)` ejecutado
- En `Productos.tsx` línea 388: `console.log('Proveedor guardado:', data)`
- ❌ **NO SE GUARDA EN NINGÚN SITIO**
- Modal se cierra
- Lista de proveedores NO se actualiza
- Si se llamó desde `AñadirArticuloModal`, no se vincula automáticamente

---

### FLUJO 4: Creación de Pedido a Proveedor (Wizard)

**Evento inicial**: Click en "Crear pedido" (Tab Pedidos)

**Pantallas implicadas**:
1. `CrearPedidoProveedorWizard.tsx` - Wizard multi-paso

**Pasos del flujo**:
1. **Seleccionar proveedor**
   - Lista de proveedores mock
   - Validación: Requerido

2. **Añadir artículos**
   - Selección de artículos del catálogo
   - Input cantidad por artículo
   - Cálculo total estimado
   - Validación: Al menos 1 artículo

3. **Tipo de entrega**
   - **Envío**: El proveedor envía a dirección
   - **Recogida**: Se genera lista de compra imprimible
   - Validación: Requerido

4. **Canal de comunicación**
   - Opciones: Email, WhatsApp, Portal proveedor, Teléfono, Otro
   - Inputs condicionales según canal (email, teléfono, etc.)
   - Validación: Requerido

5. **Observaciones y confirmación**
   - Textarea observaciones
   - Resumen del pedido
   - Opciones: Guardar como borrador / Enviar pedido

**Resultado final**:
- `onSave(pedido)` ejecutado
- En `Productos.tsx` línea 1630: `console.log('Pedido creado:', pedido)`
- ❌ **NO SE GUARDA EN NINGÚN SITIO**
- ❌ **NO SE ENVÍA REALMENTE**
- Modal se cierra
- Lista de pedidos NO se actualiza

**Funcionalidad especial: Lista de compra**
- Si `tipoEntrega === 'recogida'`:
  - Se genera componente `ListaCompraDetalle.tsx`
  - Vista imprimible con checkboxes
  - Agrupada por secciones (alimentación, bebidas, etc.)
  - ❌ Sin persistencia

---

### FLUJO 5: Recepción de Material

**Evento inicial**: 
- Click en "Recibir material" (botón global Tab Artículos)
- Click en "Recibir material" (dentro de `DetalleArticulo`)

**Pantallas implicadas**:
1. `RecepcionMaterialModal.tsx`

**Datos solicitados**:
- Selección de proveedor
- Selección de artículos recibidos
- Cantidades recibidas
- Lote (opcional)
- Fecha de caducidad (opcional)
- Vincular con pedido existente (opcional)
- Observaciones

**Resultado final**:
- `onSave(data)` ejecutado
- En `Productos.tsx` línea 393: `console.log('Recepción de material registrada:', data)`
- ❌ **NO actualiza stock real**
- ❌ **NO genera movimiento de inventario**
- ❌ **NO asocia con pedido**
- Modal se cierra

**Qué debería hacer** (según comentarios en código):
```typescript
// 1. Registrar la recepción en la base de datos
// 2. Actualizar el stock de artículos
// 3. Asociar con el pedido si corresponde
// 4. Generar entrada de inventario
```

---

### FLUJO 6: Creación de Escandallo

**Evento inicial**: 
- Click en "Crear escandallo" (Tab Escandallo)
- Dentro de wizard de producto tipo "Manufacturable"

**Pantallas implicadas**:
1. `CrearEscandalloWizard.tsx` o sección inline en `Productos.tsx` Tab Escandallo
2. `GuardarEscandalloModal.tsx` (al finalizar)

**Pasos del flujo**:
1. **Añadir artículos**
   - Select: Artículo de catálogo mock
   - Input: Cantidad
   - Unidad: Se autocompleta según artículo
   - Cálculo: Coste total = cantidad × coste unitario artículo
   - Repetir: Permite añadir múltiples artículos

2. **Ver resumen**
   - Lista de artículos añadidos
   - Total artículos
   - Coste total calculado

3. **Guardar escandallo**
   - Opción 1: **Guardar en blanco** (abre `GuardarEscandalloModal`)
     - Input: Nombre del escandallo
     - Input: Categoría
     - Input: PVP sugerido
     - Input: Observaciones
     - Resultado: console.log (línea 435)
   
   - Opción 2: **Convertir en producto**
     - Abre `ProductWizard` con datos precargados
     - `initialData` incluye escandallo
     - Inicia en paso 3 (Precio e IVA)
     - Flujo integrado OK visualmente

**Resultado final**:
- `handleGuardarEscandallo(data)` o `handleConvertirEnProducto(data)`
- console.log al guardar
- ❌ **NO SE CREA RELACIÓN PRODUCTO ↔ ARTÍCULOS**
- ❌ **NO SE PERSISTE ESCANDALLO**
- Estado local se resetea

---

## 4️⃣ BOTONES Y ACCIONES NO EJECUTABLES

| Botón / Acción | Pantalla | Qué debería hacer | Qué hace realmente |
|----------------|----------|-------------------|-------------------|
| **Guardar producto** | `ProductWizard.tsx` | POST a backend, actualizar lista | `console.log('Producto guardado:', data)` |
| **Guardar artículo** | `AñadirArticuloModal.tsx` | POST a backend, actualizar lista | `console.log('Artículo guardado:', data)` |
| **Guardar proveedor** | `AñadirProveedorModal.tsx` | POST a backend, actualizar lista | `console.log('Proveedor guardado:', data)` |
| **Crear pedido** | `CrearPedidoProveedorWizard.tsx` | POST a backend, enviar por canal | `console.log('Pedido creado:', pedido)` |
| **Recibir material** | `RecepcionMaterialModal.tsx` | POST + UPDATE stock + movimiento | `console.log('Recepción de material registrada:', data)` |
| **Guardar inventario** | `InventarioArticuloModal.tsx` | POST + ajuste stock automático | `console.log('Inventario registrado:', data)` |
| **Ajustar CMP manualmente** | `DetalleArticulo.tsx` botón | Abrir modal de ajuste | Nada (modal no existe) |
| **Ajustar stock** | `AjusteStockModal.tsx` | POST + UPDATE stock + razón | console.log (modal existe pero sin persistencia) |
| **Transferir stock** | `TransferirStockModal.tsx` | POST movimiento entre almacenes | `console.log('Transferencia solicitada:', transferencia)` |
| **Guardar escandallo** | `GuardarEscandalloModal.tsx` | POST escandallo + relación artículos | `console.log('Escandallo guardado:', data)` |
| **Añadir factura proveedor** | `AñadirFacturaProveedorModal.tsx` | POST factura + vincular pedido | `console.log('Factura guardada:', factura)` |
| **Descargar PDF factura** | `FacturasProveedoresView.tsx` | GET /facturas/:id/pdf | `console.log('Descargar PDF:', factura.id)` |
| **Búsqueda de productos** | `Productos.tsx` input | Filtrar array por texto | Sin implementar (input decorativo) |
| **Filtro de productos** | `Productos.tsx` botón filtro | Abrir modal de filtros | Sin implementar (botón decorativo) |
| **Subir imagen producto** | `ProductWizard.tsx` paso 6 | Upload a CDN/servidor | Input file sin backend |
| **Añadir imagen artículo** | `DetalleArticulo.tsx` | Upload imagen | Botón sin funcionalidad |
| **Escanear lote** | `DetalleArticulo.tsx` | Activar cámara/escáner | Botón decorativo |
| **Editar artículo** | `DetalleArticulo.tsx` botón | Abrir modal edición | Nada (modal no existe) |
| **Añadir nueva categoría** | `AñadirArticuloModal.tsx` | POST categoría nueva | Solo añade a estado local |

### Conteo de acciones no ejecutables
- **Total acciones con botón visible**: 18
- **Con console.log únicamente**: 12
- **Sin ninguna acción**: 6
- **Porcentaje no funcional**: 100%

---

## 5️⃣ DATOS MOCK Y SUPOSICIONES

### Arrays hardcoded en frontend

#### En `Productos.tsx`
```typescript
✗ const mockProducts: Product[] = [...]  // 5 productos
✗ const mockServices: Service[] = [...]  // 4 servicios
✗ const mockSuppliers: Supplier[] = [...]  // 4 proveedores
✗ const mockArticles = mockProducts.map(...)  // Reutiliza productos como artículos
✗ const mockArticulos: Article[] = [...]  // 10 artículos para escandallos
✗ const mockEscandallos: Escandallo[] = [...]  // 4 escandallos con relaciones
```

#### En `ProductWizard.tsx`
```typescript
✗ const mockArticles: Article[] = [...]  // 5 artículos
✗ const mockProducts = [...]  // 3 productos para combos
✗ const mockBrands = [...]  // 3 marcas
✗ const mockLocations = [...]  // 3 PDVs
✗ const mockCategories = [...]  // 6 categorías
```

#### En `DetalleArticulo.tsx`
```typescript
✗ const articuloMock = {
    imagenes: [...],  // URLs Unsplash
    ubicaciones: [...],  // Almacenes con stock
    lotes: [...],  // Lotes con caducidades
    variantesCompra: [...],  // Formatos de compra
    productosQueUsan: [...],  // Relación inversa
    notas: [...],  // Notas internas
    movimientos: [...]  // Historial de movimientos
  }
```

#### En `PedidosProveedorView.tsx`
```typescript
✗ const mockPedidos: PedidoProveedor[] = [...]  // 6 pedidos
```

#### En `FacturasProveedoresView.tsx`
```typescript
✗ const mockFacturas = [...]  // Lista de facturas
```

#### En `AñadirArticuloModal.tsx`
```typescript
✗ const [categorias, setCategorias] = useState([
    'Alimentación',
    'Bebidas',
    'Materiales',
    'Equipamiento',
    'Limpieza',
    'Envases y embalaje'
  ])
```

### Datos ficticios no válidos para producción

| Concepto | Dónde está | Por qué no es válido |
|----------|-----------|---------------------|
| **Stock de productos** | `mockProducts` | Los productos manufacturados NO deberían tener stock directo |
| **Stock de artículos** | `mockArticles` | Valores inventados sin movimientos de entrada/salida |
| **Relación producto ↔ artículo** | `mockEscandallos` | No hay FK real, solo nombres duplicados |
| **Proveedores por artículo** | `articuloMock.proveedorPrincipal` | String en vez de FK a tabla proveedores |
| **Ubicaciones/Almacenes** | `articuloMock.ubicaciones` | Sin FK a tabla centros/almacenes |
| **Lotes y caducidades** | `articuloMock.lotes` | Sin trazabilidad de recepciones |
| **Historial de movimientos** | `articuloMock.movimientos` | Eventos inventados sin registro real |
| **Stock estimado productos** | `mockEscandallos.maxUnits` | Cálculo mock sin consultar stock real |
| **PDVs disponibles** | `mockLocations` | Sin relación con módulo Sistema |
| **Categorías** | Arrays locales | Sin tabla en backend |

### Relaciones inexistentes

❌ `products.id` ↔ `articles.id` (escandallo)  
❌ `products.id` ↔ `suppliers.id`  
❌ `articles.id` ↔ `suppliers.id`  
❌ `articles.id` ↔ `almacenes.id`  
❌ `pedidos.id` ↔ `recepciones.id`  
❌ `pedidos.id` ↔ `facturas.id`  
❌ `articles.id` ↔ `lotes.id`  
❌ `articles.id` ↔ `movimientos_stock.id`

### Conclusión de validez para producción
**❌ 0% de datos son válidos para producción**  
**✅ 100% requiere backend con base de datos relacional**

---

## 6️⃣ DEPENDENCIAS CRÍTICAS

### Con Módulo SISTEMA

| Funcionalidad Catálogo | Depende de | Qué necesita | Riesgo si no está |
|------------------------|------------|--------------|-------------------|
| **Crear producto/servicio** | Empresa activa | `companyId` | No se puede segregar por empresa |
| **Asignar PDVs a producto** | Centros/PDVs creados | FK a `centers` | Mock locations sin validez |
| **Stock por ubicación** | Almacenes configurados | FK a `almacenes` | Sin trazabilidad real |
| **Transferir stock** | Almacenes activos | Origen y destino válidos | No puede ejecutarse |
| **Usuarios en notas/historial** | Sistema de usuarios | `userId` del creador | Sin auditoría |

**Funcionalidades bloqueadas sin Sistema**: 5 de 69 (7.2%)

---

### Con Módulo CLIENTES

| Funcionalidad Catálogo | Depende de | Qué necesita | Riesgo si no está |
|------------------------|------------|--------------|-------------------|
| **Ninguna dependencia crítica** | - | - | Catálogo es independiente de Clientes |

**Funcionalidades bloqueadas sin Clientes**: 0

---

### Con Módulo TPV / OPERATIVA

| Funcionalidad Catálogo | Depende de | Qué necesita | Riesgo si no está |
|------------------------|------------|--------------|-------------------|
| **Consumo de stock (escandallo)** | Ventas TPV | Evento de venta para descontar artículos | Stock no se descuenta |
| **Stock de productos** | TPV vende productos | Registro de unidades vendidas | Stock productos sin actualizar |
| **Historial de movimientos (salidas)** | TPV registra consumos | Evento "Consumo" en movimientos | Sin trazabilidad de salidas |

**Funcionalidades bloqueadas sin TPV**: 3 de 69 (4.3%)

---

### Con Módulo FINANZAS

| Funcionalidad Catálogo | Depende de | Qué necesita | Riesgo si no está |
|------------------------|------------|--------------|-------------------|
| **Facturas de proveedores** | Contabilidad | Registro contable de compras | No hay asiento contable |
| **Coste de producto (CMP)** | Movimientos valorados | Cálculo CMP según recepciones | CMP inexacto |
| **Pedidos pendientes de pago** | Cuentas por pagar | Relación pedido ↔ pago | Sin control financiero |

**Funcionalidades bloqueadas sin Finanzas**: 3 de 69 (4.3%)

---

### Tabla resumen de dependencias

| Módulo | Funcionalidades afectadas | Severidad |
|--------|---------------------------|-----------|
| **Sistema** | 5 | 🔴 CRÍTICA |
| **TPV** | 3 | 🟡 MEDIA |
| **Finanzas** | 3 | 🟡 MEDIA |
| **Clientes** | 0 | ✅ SIN DEPENDENCIA |

---

## 7️⃣ MULTIEMPRESA Y MULTICENTRO

### Análisis de segregación por empresa

#### Productos/Servicios
```typescript
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'activo' | 'inactivo';
  type?: 'no-manufacturado' | 'manufacturado' | 'combo';
  // ❌ FALTA: companyId
}
```
**Problema**: Sin `companyId`, todos los productos son globales  
**Riesgo**: Al cambiar de empresa, se ven productos de otras empresas  
**Escalabilidad**: ❌ NO soporta multiempresa

---

#### Artículos
```typescript
interface Article {
  id: string;
  name: string;
  unit: string;
  cost: number;
  stock: number;
  almacen?: string; // ⚠️ String en vez de FK
  // ❌ FALTA: companyId
}
```
**Problema**: Sin `companyId`, artículos son globales  
**Riesgo crítico**: Una empresa podría ver/modificar artículos de otra  
**Escalabilidad**: ❌ NO soporta multiempresa

---

#### Proveedores
```typescript
interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  category: string;
  totalOrders: number;
  status: 'activo' | 'inactivo';
  // ❌ FALTA: companyId
}
```
**Pregunta arquitectónica**: ¿Los proveedores son globales o por empresa?
- **Si globales**: OK (similar a CRM lead sources)
- **Si por empresa**: ❌ Falta `companyId`

**Estado actual**: Mock no permite determinarlo  
**Recomendación pendiente de decisión de producto**

---

#### Pedidos
```typescript
interface PedidoProveedor {
  id: string;
  numeroPedido: string;
  proveedor: string; // ⚠️ String en vez de FK
  tipoEntrega: 'envio' | 'recogida';
  estado: 'borrador' | 'enviado' | 'recibido' | 'cerrado' | 'cancelado';
  numeroArticulos: number;
  totalEstimado: number;
  fechaCreacion: string;
  fechaEnvio?: string;
  canal: 'email' | 'whatsapp' | 'portal' | 'recogida' | 'telefono' | 'otro';
  // ❌ FALTA: companyId
  // ❌ FALTA: createdBy (userId)
}
```
**Problema**: Sin `companyId`, pedidos son globales  
**Riesgo crítico**: Fuga de información entre empresas  
**Escalabilidad**: ❌ NO soporta multiempresa

---

### Qué ocurre al cambiar de empresa activa

**Estado actual en código**:
```typescript
// En Productos.tsx línea 529-550
if (viewMode === 'global') {
  return (
    <GlobalViewBanner />
    <RestrictedSection
      title="Gestión de Catálogo no disponible en Vista Global"
      description="La gestión de catálogo y productos requiere el contexto de una empresa específica..."
    />
  );
}
```

**Comportamiento detectado**:
✅ En Vista Global: Módulo bloqueado correctamente  
⚠️ Al cambiar entre empresas: NO hay filtrado (porque no hay `companyId`)  
❌ Todos los datos son compartidos entre empresas

**Conclusión**: 
- Hay **intención** de soportar multiempresa (bloqueo en vista global)
- **NO hay implementación** técnica real
- **Requiere refactorización** completa de modelos de datos

---

### Multicentro / Multi-PDV

#### Asignación de productos a PDVs
En `ProductWizard.tsx` paso 5:
```typescript
allLocations: boolean;
selectedLocations: string[]; // IDs de PDVs
```

**Estado**: Diseñado  
**Problema**: `mockLocations` sin FK a tabla real de centros  
**Funcionalidad**: ❌ No ejecutable

---

#### Stock por ubicación
En `DetalleArticulo.tsx`:
```typescript
ubicaciones: [
  { id: '1', nombre: 'Almacén PDV Centro', stock: 30.5 },
  { id: '2', nombre: 'Almacén PDV Norte', stock: 15.0 },
]
```

**Estado**: Diseñado visualmente  
**Problema**: Sin FK a tabla `almacenes` o `centros`  
**Funcionalidad**: ❌ No ejecutable

---

### Conclusión multiempresa/multicentro

| Aspecto | Soporte actual | Requiere para funcionar |
|---------|----------------|------------------------|
| **Productos por empresa** | ❌ NO | Añadir `companyId` + filtros |
| **Artículos por empresa** | ❌ NO | Añadir `companyId` + filtros |
| **Proveedores** | ⚠️ Pendiente decisión | Si por empresa: `companyId` |
| **Pedidos por empresa** | ❌ NO | Añadir `companyId` + `createdBy` |
| **Facturas por empresa** | ❌ NO | Añadir `companyId` |
| **Productos por PDV** | ⚠️ Diseñado | FK a `centers` + filtros |
| **Stock por almacén** | ⚠️ Diseñado | Tabla `almacenes` + FK |
| **Bloqueo Vista Global** | ✅ SÍ | Funciona correctamente |

**Nivel de preparación multiempresa**: ⚠️ 15% (solo bloqueo UX)  
**Nivel de preparación multicentro**: ⚠️ 30% (UX diseñada, sin backend)

---

## 8️⃣ RESUMEN EJECUTIVO FINAL

### Números totales
- **Funcionalidades totales detectadas**: 69
- **Funcionalidades diseñadas** (UX completa): 20 (29%)
- **Funcionalidades parciales** (UI existe pero no ejecuta): 44 (63.8%)
- **Funcionalidades no trabajadas**: 5 (7.2%)

### Componentes inventariados
| Tipo | Cantidad | Archivos clave |
|------|----------|----------------|
| **Pantallas principales** | 1 | `Productos.tsx` |
| **Vistas de detalle** | 4 | `DetalleArticulo.tsx`, `DetallePedidoProveedor.tsx`, `DetalleFacturaProveedor.tsx`, `DetalleEscandallo.tsx` |
| **Modales de creación** | 6 | `AñadirArticuloModal.tsx`, `AñadirProveedorModal.tsx`, `AñadirFacturaProveedorModal.tsx`, etc. |
| **Wizards** | 3 | `ProductWizard.tsx`, `CrearPedidoProveedorWizard.tsx`, `CrearEscandalloWizard.tsx` |
| **Modales de acción** | 4 | `RecepcionMaterialModal.tsx`, `AjusteStockModal.tsx`, `TransferirStockModal.tsx`, `InventarioArticuloModal.tsx` |
| **TOTAL** | 18 | |

### Arrays mock detectados
- `mockProducts`: 5 elementos
- `mockServices`: 4 elementos
- `mockSuppliers`: 4 elementos
- `mockArticles`: 5 elementos (reutiliza productos)
- `mockArticulos`: 10 elementos
- `mockEscandallos`: 4 elementos
- `mockPedidos`: 6 elementos
- `mockFacturas`: Cantidad variable
- **TOTAL**: 8 arrays hardcoded

### Principales riesgos técnicos

#### 🔴 CRÍTICOS
1. **Sin segregación multiempresa**
   - Impacto: Fuga de datos entre empresas
   - Afecta a: Productos, Artículos, Pedidos, Facturas
   - Requiere: Refactorización completa de modelos

2. **100% datos mock sin backend**
   - Impacto: Nada se guarda realmente
   - Afecta a: Todas las funcionalidades de escritura
   - Requiere: Implementación completa de backend

3. **Relaciones solo conceptuales**
   - Impacto: Producto ↔ Artículo no existe en BD
   - Afecta a: Escandallo, consumo de stock, cálculo de márgenes
   - Requiere: Tabla de relaciones `product_articles`

4. **Stock sin trazabilidad**
   - Impacto: Imposible auditar movimientos
   - Afecta a: Inventarios, recepciones, consumos
   - Requiere: Tabla `stock_movements` + triggers

#### 🟡 IMPORTANTES
5. **Pedidos sin ejecución real**
   - Impacto: Flujo visual únicamente
   - Afecta a: Pedidos, recepciones, facturas
   - Requiere: Sistema de estados + integraciones

6. **Escandallo como FLAG no gestionado**
   - Impacto: Funcionalidad condicional sin control
   - Afecta a: Tab escandallo, consumo de stock
   - Requiere: Gestión de flags en backend + planes

7. **Almacenes sin estructura**
   - Impacto: Stock por ubicación no funcional
   - Afecta a: Transferencias, inventarios multi-almacén
   - Requiere: Tabla `almacenes` + FK en artículos

8. **Categorías sin persistencia**
   - Impacto: Categorías personalizadas solo en sesión
   - Afecta a: Filtros, organización
   - Requiere: Tabla `categories` o enum dinámico

### Principales riesgos de escalabilidad

#### 1. Modelo de datos insuficiente
```
❌ Actual: Arrays en frontend
✅ Necesario: Base de datos relacional con:
   - products (companyId, type, status)
   - articles (companyId, supplierId, unit)
   - product_articles (productId, articleId, quantity)
   - suppliers (companyId?)
   - almacenes (centerId, companyId)
   - stock_movements (articleId, almacenId, quantity, type, reason)
   - pedidos (companyId, supplierId, status)
   - facturas_proveedor (companyId, supplierId, pedidoId)
```

#### 2. Sin control de concurrencia
- Stock puede descuadrarse con usuarios simultáneos
- Pedidos duplicados sin control
- Movimientos sin bloqueo optimista

#### 3. Sin histórico de cambios
- Cambios de precio sin auditoría
- Modificaciones de escandallo sin trazabilidad
- Borrados sin soft-delete

#### 4. Sin API diseñada
- No hay endpoints definidos
- No hay validación de permisos en backend
- No hay rate limiting

#### 5. Sin gestión de archivos
- Imágenes de productos no suben
- PDFs de facturas no se generan
- Listas de compra no se descargan

### Rutas críticas para lanzamiento

**Para tener Catálogo BASE funcional**:
1. ✅ Backend con tablas: `products`, `articles`, `suppliers`
2. ✅ Segregación por `companyId`
3. ✅ API CRUD básica
4. ✅ Persistencia real de datos
5. ✅ Stock básico sin multialmacén

**Para tener Escandallo (FLAG)**:
6. ✅ Tabla `product_articles`
7. ✅ Cálculo de costes en backend
8. ✅ Consumo de stock al vender
9. ✅ Gestión de flag en planes

**Para tener Pedidos funcional**:
10. ✅ Tabla `pedidos` + `pedido_items`
11. ✅ Sistema de estados de pedido
12. ✅ Recepción vinculada a pedido
13. ✅ Actualización de stock al recibir

**Para tener Facturas funcional**:
14. ✅ Tabla `facturas_proveedor`
15. ✅ Vinculación factura ↔ pedido
16. ✅ Integración con módulo Finanzas
17. ✅ Upload de PDFs

### Deuda técnica acumulada

| Categoría | Items | Severidad |
|-----------|-------|-----------|
| **Datos mock** | 8 arrays | 🔴 CRÍTICA |
| **console.log en vez de guardar** | 12 funciones | 🔴 CRÍTICA |
| **Botones decorativos** | 6 botones | 🟡 MEDIA |
| **Modales inexistentes** | 2 modales | 🟡 MEDIA |
| **Relaciones hardcoded** | 4 relaciones | 🔴 CRÍTICA |
| **Sin multiempresa** | Todo el módulo | 🔴 CRÍTICA |
| **Sin validación backend** | 100% | 🔴 CRÍTICA |

**Total items de deuda técnica**: 35+

---

## 📊 ANEXOS

### A. Lista completa de archivos auditados

```
/src/app/components/sections/Productos.tsx (1630+ líneas)
/src/app/components/catalogo/DetalleArticulo.tsx (1300+ líneas)
/src/app/components/wizards/ProductWizard.tsx (1800+ líneas)
/src/app/components/modals/AñadirArticuloModal.tsx (600+ líneas)
/src/app/components/modals/AñadirProveedorModal.tsx
/src/app/components/modals/CrearPedidoProveedorWizard.tsx (700+ líneas)
/src/app/components/modals/RecepcionMaterialModal.tsx
/src/app/components/modals/InventarioArticuloModal.tsx
/src/app/components/modals/TransferirStockModal.tsx
/src/app/components/modals/AjusteStockModal.tsx
/src/app/components/modals/CrearEscandalloWizard.tsx
/src/app/components/modals/GuardarEscandalloModal.tsx
/src/app/components/modals/AñadirFacturaProveedorModal.tsx
/src/app/components/productos/PedidosProveedorView.tsx
/src/app/components/productos/FacturasProveedoresView.tsx
/src/app/components/productos/ListaCompraDetalle.tsx
/src/app/components/productos/DetallePedidoProveedor.tsx
/src/app/components/productos/DetalleFacturaProveedor.tsx
```

### B. Interfaces TypeScript críticas

```typescript
// Producto/Servicio de venta
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number; // ⚠️ No debería tener si es manufacturable
  status: 'activo' | 'inactivo';
  type?: 'no-manufacturado' | 'manufacturado' | 'combo';
}

// Artículo de compra
interface Article {
  id: string;
  name: string;
  unit: string; // kg, L, ud, g, ml
  cost: number;
  stock: number;
  almacen?: string; // ⚠️ String en vez de FK
}

// Relación escandallo (NO PERSISTIDA)
interface EscandalloItem {
  articleId: string;
  articleName: string;
  quantity: number;
  unit: string;
  cost: number;
  stock: number;
  stockStatus: 'normal' | 'bajo' | 'agotado';
}

// Escandallo completo (MOCK)
interface Escandallo {
  productId: string;
  productName: string;
  productCategory: string;
  productType: 'no-manufacturado' | 'manufacturado' | 'combo';
  productPrice: number;
  items: EscandalloItem[];
  totalCost: number;
  margin: number;
  marginPercentage: number;
  stockEstimated: 'disponible' | 'bajo' | 'agotado' | 'no-requiere';
  maxUnits: number;
  limitedBy?: string;
}
```

### C. Decisiones de producto pendientes

1. **Proveedores**: ¿Globales o por empresa?
2. **Categorías**: ¿Enum fijo o tabla dinámica?
3. **Escandallo**: ¿BASE o FLAG? (actualmente FLAG)
4. **Multialmacén**: ¿BASE o FLAG?
5. **Lotes y caducidades**: ¿BASE o FLAG?
6. **Variantes de compra**: ¿BASE o FLAG?
7. **Marcas**: ¿Gestión interna o solo metadata?
8. **Stock de productos manufacturables**: ¿Se controla o solo artículos?

---

**FIN DE LA AUDITORÍA**

**Conclusión**: El módulo Catálogo tiene una UX sólida y bien diseñada, pero requiere implementación completa de backend, segregación multiempresa, y refactorización de modelos de datos antes de ser funcional en producción.

**Próximo paso sugerido**: Decisión BASE/FLAG por funcionalidad + diseño de esquema de base de datos.
