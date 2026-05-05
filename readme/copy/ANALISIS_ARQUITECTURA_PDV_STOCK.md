# 📊 ANÁLISIS TÉCNICO: ARQUITECTURA PDV, STOCK Y CATÁLOGO

**Sistema:** Vertial - SaaS B2B Multiempresa y Multivertical  
**Fecha:** 17 de enero de 2025  
**Alcance:** Análisis de arquitectura actual sin modificación de código  
**Objetivo:** Evaluar soporte multi-PDV y detectar riesgos críticos

---

## 🔍 METODOLOGÍA DE ANÁLISIS

Se han revisado los siguientes componentes del sistema:

- ✅ Tipos base del sistema (`/src/app/types.ts`)
- ✅ Módulo de Puntos de Venta (`PuntosDeVenta.tsx`)
- ✅ Recepción de Material (`RecepcionMaterialModal.tsx`)
- ✅ Detalle de Artículo (`DetalleArticulo.tsx`)
- ✅ Wizard de Productos (`ProductWizard.tsx`)
- ✅ Configuración de Marcas (`ConfiguracionMarcas.tsx`)
- ✅ Módulo de Productos (`Productos.tsx`)
- ✅ Configuración de Compras e Inventario (`ComprasInventario.tsx`)

---

## 1️⃣ PDV Y STOCK

### ❓ ¿El stock de Artículos está asociado a un PDV específico o es global a la empresa?

**RESPUESTA:** ❌ **GLOBAL A LA EMPRESA**

#### Evidencia técnica:

**Archivo:** `/src/app/types.ts` (líneas 79-86)
```typescript
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;  // ⚠️ Número único, sin relación con PDV
  status: 'activo' | 'inactivo';
}
```

**Archivo:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 52-55)
```typescript
// Stock
stockActual: 45.5,      // ⚠️ Número global único
stockMinimo: 20,
stockOptimo: 100,
```

#### Conclusión:
El stock se almacena como **un único valor numérico por artículo**, sin discriminación por ubicación física o PDV.

---

### ❓ ¿Existen estructuras tipo ArticuloPDV, StockPorPDV o equivalente?

**RESPUESTA:** ❌ **NO EXISTEN**

#### Búsqueda exhaustiva realizada:
```bash
# Búsqueda de patrones: ArticuloPDV, StockPorPDV, ArticuloUbicacion, stock.*pdv
# Resultado: 0 coincidencias
```

#### Estructuras encontradas:

**Archivo:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 42-48)
```typescript
interface LineaRecepcion {
  id: string;
  articulo: string;
  cantidad: number;
  lote: string;
  caducidad: string;
  precioUnitario: number;
  centroCosto: string;  // ⚠️ String libre, no ID referenciado
  proveedor: string;
  noRegistrar: boolean;
}
```

**Problema identificado:**
- `centroCosto` es un **string libre** ('Almacén Central', 'PDV Norte', etc.)
- **NO es una foreign key** a una tabla de PDV/Centros
- **NO permite queries relacionales** ni integridad referencial

---

### ❓ ¿Qué ocurre si una empresa tiene varios PDV?

**RESPUESTA:** ⚠️ **RIESGO CRÍTICO DE INCOHERENCIA**

#### Escenario real:

**Empresa: Pizzería "La Buena Mesa"**
- PDV Centro: 50 kg de Harina 00
- PDV Norte: 30 kg de Harina 00
- PDV Sur: 20 kg de Harina 00

**Lo que muestra el sistema:**
```
Stock actual: 100 kg
Stock mínimo: 20 kg
Stock óptimo: 150 kg
Estado: ✅ OK
```

**Problema:**
- PDV Sur tiene solo 20 kg (en el mínimo)
- Pero el sistema muestra "OK" porque el total es 100 kg
- **No hay alertas por PDV**
- **No hay recomendaciones de transferencia**

---

## 2️⃣ RECEPCIÓN DE MATERIAL

### ❓ ¿Contempla el PDV de entrada?

**RESPUESTA:** ⚠️ **SÍ, PERO DE FORMA DÉBIL (STRING, NO RELACIONAL)**

#### Evidencia:

**Archivo:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 1096-1109)
```typescript
{/* Centro de costo */}
<div>
  <label className=\"block text-sm font-medium text-gray-700 mb-1.5\">
    Centro de costo
  </label>
  <select
    value={nuevoArticulo.centroCosto}
    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, centroCosto: e.target.value })}
    className=\"w-full border border-gray-300 rounded-lg px-3 py-2\">
    <option value=\"Almacén Central\">Almacén Central</option>
    <option value=\"Almacén Secundario\">Almacén Secundario</option>
    <option value=\"Cocina Central\">Cocina Central</option>
  </select>
</div>
```

**Problemas identificados:**
1. ❌ Valores **hardcoded** en el componente
2. ❌ **No hay sincronización** con el módulo de Puntos de Venta
3. ❌ Si se crea un nuevo PDV en Configuración → Puntos de Venta, **no aparece aquí**
4. ❌ Si se renombra un PDV, **el histórico queda con el nombre antiguo** (string)
5. ❌ Imposible hacer análisis tipo: "Mostrar recepciones del PDV Norte en enero"

---

### ❓ ¿El PDV se hereda de algún flujo?

**RESPUESTA:** ⚠️ **PARCIALMENTE (SOLO EN RECEPCIÓN DESDE PEDIDO)**

#### Evidencia:

**Archivo:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 132-134)
```typescript
centroCosto: 'Almacén Central',
proveedor: tipoRecepcion === 'pedido' && pedidoSeleccionado 
  ? pedidosMock.find(p => p.id === pedidoSeleccionado)?.proveedor || '' 
  : ''
```

**Problema:**
- Solo se hereda el **proveedor** si viene de pedido
- El `centroCosto` siempre se inicializa como 'Almacén Central' (hardcoded)
- **No hay herencia real del PDV destino**

---

## 3️⃣ PRODUCTOS Y PDV

### ❓ ¿Un Producto está asociado a uno o varios PDV?

**RESPUESTA:** ✅ **SÍ, A NIVEL DE DISPONIBILIDAD (NO DE STOCK)**

#### Evidencia:

**Archivo:** `/src/app/components/wizards/ProductWizard.tsx` (líneas 72-74)
```typescript
// Paso 5
allLocations: boolean,
selectedLocations: string[],
```

**Archivo:** `/src/app/components/wizards/ProductWizard.tsx` (líneas 113-117)
```typescript
const mockLocations = [
  { id: '1', name: 'PDV Centro' },
  { id: '2', name: 'PDV Norte' },
  { id: '3', name: 'PDV Sur' },
];
```

**Interpretación:**
- Un producto **puede activarse/desactivarse por PDV**
- Ejemplo: "Pizza Margarita" está disponible en PDV Centro y Norte, pero no en PDV Sur
- **Esto controla VISIBILIDAD, no STOCK**

---

### ❓ ¿Existe lógica tipo ProductoPDV (precio, activo/inactivo por PDV)?

**RESPUESTA:** ⚠️ **PARCIAL: DISPONIBILIDAD SÍ, PRECIO NO**

#### Análisis del Wizard de Productos:

**Paso 5 - Disponibilidad por PDV:**
```typescript
// El wizard permite seleccionar PDVs donde el producto estará disponible
// PERO no permite configurar:
// - Precio diferenciado por PDV ❌
// - Stock diferenciado por PDV ❌
// - Visibilidad en carta/menú ❌
// - Comisiones por PDV ❌
```

**Estructura actual:**
```
Producto: Pizza Margarita
├── Precio: €12.50 (GLOBAL)
├── Stock: 45 (GLOBAL)
├── PDVs disponibles: [PDV Centro, PDV Norte]
└── ❌ SIN precio por PDV
```

---

### ❓ ¿Un producto puede venderse en un PDV distinto del que tiene stock?

**RESPUESTA:** ⚠️ **SÍ, Y ES UN RIESGO CRÍTICO**

#### Escenario problemático:

**Estado del sistema:**
```
Artículo: Masa Pizza
├── Stock total: 50 kg
├── Ubicación real:
│   ├── PDV Centro: 0 kg
│   ├── PDV Norte: 50 kg
│   └── PDV Sur: 0 kg
└── ❌ Sistema solo ve: 50 kg (sin ubicación)

Producto: Pizza Margarita
├── Usa: 0.25 kg de Masa Pizza
├── Disponible en: PDV Centro, PDV Norte, PDV Sur
└── ❌ Puede venderse en PDV Centro aunque no tenga masa
```

**¿Qué pasaría al vender en TPV?**
1. Cliente pide Pizza Margarita en PDV Centro
2. Sistema verifica: "Stock global de Masa Pizza: 50 kg ✅"
3. Venta confirmada ✅
4. **PROBLEMA:** La masa está en PDV Norte, no en PDV Centro
5. **Resultado:** Venta confirmada sin stock real en esa ubicación

---

## 4️⃣ MARCAS

### ❓ ¿Las Marcas están asociadas a PDV?

**RESPUESTA:** ❌ **NO, SON GLOBALES A LA EMPRESA**

#### Evidencia:

**Archivo:** `/src/app/components/sections/configuracion/ConfiguracionMarcas.tsx` (líneas 7-14)
```typescript
interface Brand {
  id: string;
  name: string;
  logo?: string;
  status: 'active' | 'inactive';
  isDefault: boolean;
  color: string;
  // ❌ NO tiene relación con PDV
}
```

**Uso actual de Marcas:**
- Organizar productos bajo nombres comerciales diferentes
- Ejemplo: "UDAR Premium", "UDAR Classic", "UDAR Gourmet"
- Útil para empresas multimarca o franquicias
- **PERO** la marca es global, no por PDV

---

### ❓ ¿Una Marca puede estar activa en un PDV y no en otro?

**RESPUESTA:** ❌ **NO, NO HAY RELACIÓN MARCA-PDV**

#### Problema identificado:

**Escenario no contemplado:**
```
Empresa: Restaurantes González S.L.
├── PDV Centro (Marca: González Premium)
├── PDV Norte (Marca: González Express)
└── PDV Sur (Marca: González Premium)

❌ El sistema NO permite esta configuración
✅ Solo permite: Una empresa tiene N marcas (globales)
```

---

## 5️⃣ TPV Y CONSUMO DE STOCK

### ❓ ¿Existe lógica de venta/TPV?

**RESPUESTA:** ❌ **NO IMPLEMENTADA (SOLO REFERENCIAS DOCUMENTALES)**

#### Búsqueda realizada:
- **NO existe** módulo de TPV/Ventas
- **NO existe** lógica de descuento de stock
- **NO existe** concepto de "ticket" o "venta"

#### Referencias encontradas:

**Archivo:** `/src/app/components/sections/gerente/Onboarding.tsx` (línea 184)
```typescript
{
  id: '3',
  titulo: 'Uso del Sistema TPV',
  descripcion: 'Manual de usuario del sistema de punto de venta',
  categoria: 'tecnica',
  // ⚠️ Solo documentación, no hay módulo real
}
```

---

### ❓ ¿Desde dónde se descuenta el stock?

**RESPUESTA:** ⚠️ **NO APLICA (TPV NO IMPLEMENTADO)**

#### Pero proyectando el riesgo si se implementara:

**Con la arquitectura actual:**
```typescript
// Pseudocódigo de lo que pasaría:
function procesarVenta(productoId, cantidad, pdvId) {
  const producto = getProducto(productoId);
  
  // ❌ PROBLEMA: Stock es global
  if (producto.stock >= cantidad) {
    producto.stock -= cantidad;  // ⚠️ Resta del total global
    // ❌ NO identifica de qué PDV se descuenta
    // ❌ NO verifica stock en ese PDV específico
    return { success: true };
  }
}
```

**Resultado:**
- Stock se descuenta del total global
- **Sin relación con el PDV donde ocurrió la venta**
- **Sin trazabilidad de movimientos por ubicación**

---

### ❓ ¿Se identifica el PDV origen de la venta?

**RESPUESTA:** ⚠️ **NO EXISTE MÓDULO DE VENTAS**

#### Pero analizando el módulo de Finanzas:

**Archivo:** `/src/app/components/sections/Finanzas.tsx` (línea 55)
```typescript
type CostesSelector = 'producto' | 'pedido' | 'empleado' | 'punto-venta';
```

**Interpretación:**
- El módulo de Finanzas **SÍ contempla** análisis por punto-venta
- **PERO** no hay datos de ventas reales para alimentar este análisis
- Es una preparación para funcionalidad futura

---

### ❓ ¿Podría descuento stock incorrecto en multi-PDV?

**RESPUESTA:** ⚠️ **SÍ, RIESGO CRÍTICO**

#### Matriz de riesgo:

| Escenario | Riesgo | Impacto |
|-----------|--------|---------|
| Venta en PDV sin stock local | **ALTO** | Producto vendido pero no disponible físicamente |
| Descuento de stock global | **ALTO** | Pérdida de trazabilidad por ubicación |
| Transferencias no contempladas | **MEDIO** | Imposible rebalancear stock entre PDVs |
| Inventarios sin PDV | **ALTO** | Imposible hacer inventario físico por ubicación |
| Alertas de stock global | **ALTO** | PDV puede quedarse sin stock sin alertas |

---

## 6️⃣ RIESGOS DETECTADOS

### 🔴 CRÍTICOS (Bloquean multi-PDV)

#### 1. **Stock global sin segregación**
- **Descripción:** Stock es un número único por artículo
- **Impacto:** Imposible saber cuánto hay en cada PDV
- **Escenario roto:** Multi-PDV con inventarios separados
- **Archivos afectados:**
  - `/src/app/types.ts` (interface Product)
  - `/src/app/components/catalogo/DetalleArticulo.tsx`

#### 2. **Recepción sin PDV relacional**
- **Descripción:** `centroCosto` es string libre, no foreign key
- **Impacto:** 
  - Stock entra a "Almacén Central" (string)
  - Si se renombra, se pierde trazabilidad
  - Imposible consultar "recepciones del PDV Norte"
- **Archivos afectados:**
  - `/src/app/components/modals/RecepcionMaterialModal.tsx`

#### 3. **Lotes sin ubicación física**
- **Descripción:** Lotes tienen cantidad pero no saben dónde están
- **Impacto:**
  - FIFO/FEFO imposible por ubicación
  - Control de caducidades sin PDV
  - Imposible saber qué lote está en qué PDV
- **Archivos afectados:**
  - `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 65-68)

#### 4. **Producto disponible ≠ Stock disponible**
- **Descripción:** Un producto puede estar "disponible" en un PDV sin stock local
- **Impacto:** Ventas confirmadas sin stock físico en ese PDV
- **Archivos afectados:**
  - `/src/app/components/wizards/ProductWizard.tsx`

---

### 🟡 ALTOS (Degradan funcionalidad)

#### 5. **Sin lógica de transferencias entre PDV**
- **Descripción:** No hay forma de mover stock de PDV A a PDV B
- **Impacto:** Stock mal distribuido sin forma de rebalancear

#### 6. **Escandallo sin validación de stock por PDV**
- **Descripción:** Productos manufacturables consumen artículos del total global
- **Impacto:** Se puede "manufacturar" en PDV sin ingredientes locales

#### 7. **Alertas de stock sin granularidad por PDV**
- **Descripción:** Alertas basadas en stock total
- **Impacto:** 
  - PDV puede estar en stock crítico sin alertas
  - Recomendaciones de compra sin destino claro

---

### 🟢 MEDIOS (Mejoras necesarias)

#### 8. **Marcas globales sin asociación a PDV**
- **Descripción:** No se puede activar una marca solo en algunos PDV
- **Impacto:** Limitación comercial para franquicias/multimarca

#### 9. **Precios únicos por producto**
- **Descripción:** No hay precio diferenciado por PDV
- **Impacto:** Imposible tener precios distintos en PDV Premium vs Express

#### 10. **Historial de movimientos sin PDV origen/destino**
- **Descripción:** Movimientos de stock sin trazabilidad de ubicación
- **Impacto:** Auditoría y análisis limitados

---

## 7️⃣ CONCLUSIÓN

### ❓ ¿La arquitectura actual soporta multi-PDV?

**RESPUESTA FINAL:**

# ❌ **c) NO LO SOPORTA**

---

### Evaluación por criterios:

| Criterio | ¿Soportado? | Estado |
|----------|-------------|--------|
| Stock diferenciado por PDV | ❌ | No existe |
| Recepción con PDV relacional | ⚠️ | String débil |
| Productos con precio por PDV | ❌ | Precio global |
| Transferencias entre PDV | ❌ | No contemplado |
| Ventas con descuento por PDV | ❌ | TPV no existe |
| Lotes con ubicación | ❌ | Sin PDV |
| Alertas por PDV | ❌ | Globales |
| Inventarios por PDV | ❌ | No separados |
| Escandallo por PDV | ❌ | Global |
| Marcas por PDV | ❌ | Globales |

---

### 🔧 Piezas que faltan para arquitectura robusta multi-PDV:

#### **MODELO DE DATOS**

```typescript
// 1. Entidad PDV/Centro (no solo string)
interface PuntoDeVenta {
  id: string;
  nombre: string;
  codigo: string;
  direccion: string;
  tipo: 'pdv' | 'almacen' | 'cocina';
  activo: boolean;
  empresaId: string;
}

// 2. Stock por PDV (NO stock global)
interface StockPorPDV {
  articuloId: string;
  puntoVentaId: string;
  cantidad: number;
  stockMinimo: number;
  stockOptimo: number;
  // La suma de todos los StockPorPDV = stock total
}

// 3. Lotes con ubicación
interface Lote {
  id: string;
  articuloId: string;
  puntoVentaId: string;  // ⭐ CLAVE
  numeroLote: string;
  cantidad: number;
  fechaCaducidad: string;
}

// 4. Productos por PDV
interface ProductoPDV {
  productoId: string;
  puntoVentaId: string;
  activo: boolean;
  precio: number;  // ⭐ Precio diferenciado
  visibleEnCarta: boolean;
}

// 5. Movimientos con trazabilidad
interface MovimientoStock {
  id: string;
  articuloId: string;
  tipo: 'entrada' | 'salida' | 'transferencia' | 'ajuste';
  cantidad: number;
  puntoVentaOrigen?: string;
  puntoVentaDestino?: string;  // ⭐ Para transferencias
  fecha: string;
  usuarioId: string;
  motivo: string;
}

// 6. Ventas/TPV con PDV
interface Venta {
  id: string;
  puntoVentaId: string;  // ⭐ CRÍTICO
  fecha: string;
  total: number;
  lineas: LineaVenta[];
}

interface LineaVenta {
  productoId: string;
  cantidad: number;
  precio: number;
  descuentosStock: DescuentoStock[];  // ⭐ Trazabilidad
}

interface DescuentoStock {
  articuloId: string;
  loteId: string;
  puntoVentaId: string;  // ⭐ De dónde salió
  cantidad: number;
}
```

---

#### **LÓGICA DE NEGOCIO**

1. **Recepción de Material:**
   - Obligar selección de PDV destino (relacional, no string)
   - Aumentar `StockPorPDV` del PDV seleccionado
   - Crear lote con `puntoVentaId`

2. **Transferencias:**
   - Nuevo módulo: Transferir stock entre PDV
   - Validar stock disponible en origen
   - Movimiento: salida del PDV A + entrada al PDV B
   - Trazabilidad completa

3. **TPV/Ventas:**
   - Identificar PDV de la venta (contexto)
   - Validar stock en ese PDV específico
   - Descontar de `StockPorPDV` correcto
   - Si usa escandallo, consumir artículos del mismo PDV

4. **Alertas:**
   - Por PDV: "PDV Norte: Stock crítico de Harina 00"
   - Recomendaciones: "Transferir 20 kg de PDV Centro a PDV Norte"

5. **Inventarios:**
   - Por PDV: Inventario físico del PDV Norte
   - Ajustes afectan solo al `StockPorPDV` correspondiente

6. **Escandallo:**
   - Validar disponibilidad de artículos en el PDV de manufactura
   - Consumir solo del stock local
   - Opción: Permitir manufactura multi-PDV (avanzado)

---

#### **UX/UI AFECTADA**

**Módulos que necesitarían rediseño:**

1. **Recepción de Material:**
   - ✅ Ya tiene selector de centro, pero debe ser relacional

2. **Detalle de Artículo:**
   - ⚠️ Mostrar stock por PDV (tabla o lista)
   - ⚠️ Lotes con ubicación
   - ⚠️ Movimientos con origen/destino

3. **Wizard de Productos:**
   - ⚠️ Paso adicional: Configurar precio por PDV
   - ⚠️ Paso adicional: Stock inicial por PDV

4. **Catálogo/Artículos:**
   - ⚠️ Columna adicional: Stock por PDV (colapsable)
   - ⚠️ Filtro por PDV

5. **Nuevo: Transferencias:**
   - ⚠️ Módulo completo nuevo
   - De PDV X a PDV Y
   - Validaciones, historial

6. **TPV (futuro):**
   - ⚠️ Contexto de PDV obligatorio
   - ⚠️ Validación de stock local
   - ⚠️ Alertas si producto no disponible en ese PDV

---

## 📋 RESUMEN EJECUTIVO

### Estado actual: ❌ **NO READY para multi-PDV**

**Principales gaps:**
- Stock es global, no por PDV
- PDV se trata como string, no entidad relacional
- No hay transferencias entre ubicaciones
- Lotes sin ubicación física
- Productos disponibles sin validar stock local

**Impacto si se activa TPV sin corregir:**
- ✅ Ventas en PDV sin stock físico
- ✅ Descuentos de stock sin trazabilidad
- ✅ Imposibilidad de hacer inventarios por ubicación
- ✅ Alertas incorrectas (basadas en stock total)
- ✅ Incoherencias entre stock contable y físico

**Recomendación:**
🔴 **CRÍTICO:** Rediseñar modelo de datos antes de implementar TPV o activar múltiples PDV reales.

---

## 📎 ANEXOS

### Archivos revisados (18 archivos)

1. `/src/app/types.ts`
2. `/src/app/components/sections/configuracion/PuntosDeVenta.tsx`
3. `/src/app/components/modals/RecepcionMaterialModal.tsx`
4. `/src/app/components/catalogo/DetalleArticulo.tsx`
5. `/src/app/components/sections/CatalogoArticulos.tsx`
6. `/src/app/components/wizards/ProductWizard.tsx`
7. `/src/app/components/sections/configuracion/ConfiguracionMarcas.tsx`
8. `/src/app/components/sections/Productos.tsx`
9. `/src/app/components/sections/Finanzas.tsx`
10. `/src/app/components/sections/configuracion/ComprasInventario.tsx`
11. `/src/app/components/equipo/AddEmployeeModal.tsx`
12. `/src/app/components/equipo/AjusteManualFichajeModal.tsx`
13. `/src/app/components/sections/Equipo.tsx`
14. `/src/app/components/sections/configuracion/CalendarioLaboral.tsx`
15. `/src/app/components/sections/gerente/Onboarding.tsx`
16. `/src/app/components/sections/trabajador/Chats.tsx`
17. `/src/app/components/sections/trabajador/MiOnboarding.tsx`
18. `/src/app/context/AppContext.tsx`

### Patrones buscados sin resultados:
- `ArticuloPDV`
- `StockPorPDV`
- `ArticuloUbicacion`
- `ProductoUbicacion`
- `TransferenciaStock`

---

**FIN DEL INFORME**

