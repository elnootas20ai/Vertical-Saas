# 📦 ANÁLISIS TÉCNICO: GESTIÓN ACTUAL DE STOCK, PDV, LOTES Y RECEPCIONES

**Sistema:** Vertial - Frontend Core  
**Fecha:** 17 de enero de 2025  
**Tipo:** Análisis de estado actual  
**Alcance:** Documentación técnica sin propuestas de solución

---

## 📋 ÍNDICE

1. [Arquitectura de Stock](#1-arquitectura-de-stock)
2. [Sistema de Lotes](#2-sistema-de-lotes)
3. [Recepciones de Material](#3-recepciones-de-material)
4. [Relación con PDV](#4-relación-con-pdv)
5. [Cálculo de Costes](#5-cálculo-de-costes)
6. [Movimientos de Stock](#6-movimientos-de-stock)
7. [Dependencias entre Componentes](#7-dependencias-entre-componentes)
8. [Limitaciones Técnicas Actuales](#8-limitaciones-técnicas-actuales)

---

## 1️⃣ ARQUITECTURA DE STOCK

### 1.1 Modelo de Datos Actual

#### **Ubicación:** `/src/app/types.ts`

```typescript
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;  // ⚠️ Valor único, escalar
  status: 'activo' | 'inactivo';
}
```

#### **Características:**

| Aspecto | Estado Actual |
|---------|--------------|
| **Tipo de dato** | `number` (primitivo) |
| **Granularidad** | Global por artículo |
| **Ubicación física** | No contemplada |
| **Multi-PDV** | No soportado |
| **Persistencia** | Solo en memoria (mock data) |

### 1.2 Almacenamiento de Stock en Detalle de Artículo

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx`

```typescript
const articuloMock = {
  id: '1',
  nombre: 'Harina 00 Premium',
  categoria: 'Harinas y cereales',
  unidadMedida: 'kg',
  codigoInterno: 'HAR-00-PREM',
  estado: 'activo' as 'activo' | 'inactivo',
  proveedorPrincipal: 'Suministros Hostelería S.L.',
  proveedoresAlternativos: ['Distribuciones Alimentarias', 'Molino del Sur'],
  
  // 📦 STOCK
  stockActual: 45.5,      // ⚠️ Único valor global
  stockMinimo: 20,        // Umbral de alerta
  stockOptimo: 100,       // Target recomendado
  
  // 💰 COSTES
  ultimoCosto: 1.20,
  costoMedioPonderado: 1.18,
  fechaUltimaCompra: '2025-01-15',
  proveedorUltimaCompra: 'Suministros Hostelería S.L.',
  metodoCalculo: 'cmp' as 'ultimo' | 'cmp',
  
  // ... resto de datos
}
```

#### **Propiedades del Stock:**

1. **Stock Actual (`stockActual`):**
   - Tipo: `number`
   - Representa: Unidades totales disponibles
   - Actualización: Manual o por recepción
   - Sin relación con ubicación física

2. **Stock Mínimo (`stockMinimo`):**
   - Tipo: `number`
   - Uso: Umbral para alertas
   - Cálculo: Definido manualmente
   - Sin diferenciación por PDV

3. **Stock Óptimo (`stockOptimo`):**
   - Tipo: `number`
   - Uso: Target para recomendaciones de compra
   - Cálculo: Definido manualmente
   - Sin diferenciación por PDV

### 1.3 Cálculo de Estado de Stock

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 103-109)

```typescript
// Calcular estado del stock
const porcentajeStock = (articulo.stockActual / articulo.stockOptimo) * 100;
const estadoStock = articulo.stockActual < articulo.stockMinimo 
  ? 'critico' 
  : articulo.stockActual < articulo.stockOptimo * 0.5 
    ? 'bajo' 
    : 'ok';
```

#### **Lógica de Estados:**

```
Estado CRÍTICO:  stockActual < stockMinimo
Estado BAJO:     stockActual < (stockOptimo * 0.5)
Estado OK:       stockActual >= (stockOptimo * 0.5)
```

#### **Limitación Identificada:**
- Los umbrales son **globales**
- No hay alertas diferenciadas por PDV
- Un PDV puede estar en crítico mientras otro está en óptimo, pero el sistema solo mostrará un estado global

---

## 2️⃣ SISTEMA DE LOTES

### 2.1 Estructura de Datos de Lotes

#### **Ubicación:** `/src/app/components/modals/AñadirArticuloModal.tsx` (líneas 44-52)

```typescript
interface Lote {
  id: string;
  proveedor: string;
  fechaEntrada: string;
  cantidad: number;
  costeUnitario: number;
  fechaCaducidad: string;
  estado: 'activo' | 'agotado' | 'caducado';
}
```

#### **Propiedades:**

| Campo | Tipo | Propósito | Obligatorio |
|-------|------|-----------|-------------|
| `id` | `string` | Identificador único | ✅ |
| `proveedor` | `string` | Nombre del proveedor (texto libre) | ✅ |
| `fechaEntrada` | `string` | Fecha de recepción | ✅ |
| `cantidad` | `number` | Unidades disponibles en el lote | ✅ |
| `costeUnitario` | `number` | Coste por unidad | ✅ |
| `fechaCaducidad` | `string` | Fecha de vencimiento | ✅ |
| `estado` | `'activo' \| 'agotado' \| 'caducado'` | Estado del lote | ✅ |

#### **Ausencias Críticas:**
- ❌ No hay campo `puntoVentaId` o `ubicacion`
- ❌ No hay campo `numeroLote` (solo id interno)
- ❌ No hay relación con `centroCosto` de la recepción

### 2.2 Lotes en Detalle de Artículo

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 64-68)

```typescript
lotes: [
  { 
    id: '1', 
    lote: 'LOTE-2025-016', 
    caducidad: '2025-12-31', 
    cantidad: 25.5, 
    estado: 'ok' as 'ok' | 'proximo' | 'caducado' 
  },
  { 
    id: '2', 
    lote: 'LOTE-2025-012', 
    caducidad: '2025-02-20', 
    cantidad: 20, 
    estado: 'proximo' as 'ok' | 'proximo' | 'caducado' 
  },
]
```

#### **Estados de Lote:**

```
'ok'       → Caducidad lejana
'proximo'  → Próximo a caducar (criterio no definido en código)
'caducado' → Fecha superada
```

#### **Limitación:** La lógica de cálculo de estados no está implementada en el frontend

### 2.3 Gestión de Lotes en Modal de Artículo

#### **Ubicación:** `/src/app/components/modals/AñadirArticuloModal.tsx` (líneas 83-102)

```typescript
const [lotes, setLotes] = useState<Lote[]>([
  {
    id: '1',
    proveedor: 'Suministros Hostelería S.L.',
    fechaEntrada: '2025-01-15',
    cantidad: 50,
    costeUnitario: 2.50,
    fechaCaducidad: '2025-06-15',
    estado: 'activo'
  },
  {
    id: '2',
    proveedor: 'Distribuidora Alimentos',
    fechaEntrada: '2025-01-10',
    cantidad: 30,
    costeUnitario: 2.35,
    fechaCaducidad: '2025-05-10',
    estado: 'activo'
  }
]);
```

#### **Funcionalidad Disponible:**
- ✅ Visualización de lotes existentes
- ✅ Mock data para pruebas
- ❌ No hay CRUD de lotes implementado
- ❌ No hay validación de fechas
- ❌ No hay cálculo automático de estado

### 2.4 Rotación de Lotes

#### **Ubicación:** `/src/app/components/modals/AñadirArticuloModal.tsx` (líneas 820-830)

```typescript
<div>
  <p className="text-xs text-gray-600 mb-1">Método de rotación</p>
  <div className="flex items-center gap-2">
    <Badge variant="default" className="bg-blue-100 text-blue-700 font-semibold">
      FIFO
    </Badge>
    <span className="text-xs text-gray-600">(Por defecto)</span>
  </div>
  <p className="text-xs text-gray-500 mt-1">
    Si hay caducidad → FEFO automático
  </p>
</div>
```

#### **Estado Actual:**
- ✅ UI muestra "FIFO" como método por defecto
- ✅ Mención de "FEFO automático" si hay caducidad
- ❌ **NO HAY LÓGICA IMPLEMENTADA** para FIFO/FEFO
- ❌ No hay selección de lote al consumir stock
- ❌ No hay ordenamiento automático de lotes

#### **Implicaciones:**
```
Escenario: 
- Lote A: 50 kg, caducidad 2025-03-15
- Lote B: 30 kg, caducidad 2025-06-30

Al consumir 40 kg:
❌ Sistema no elige lote automáticamente
❌ No descuenta de Lote A primero (FEFO)
❌ No hay trazabilidad de qué lote se consumió
```

---

## 3️⃣ RECEPCIONES DE MATERIAL

### 3.1 Estructura del Modal de Recepción

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx`

#### **Flujo de Wizard (4 pasos):**

```
PASO 1: Tipo de recepción
├── Opción A: Desde pedido existente
│   └── Selección de pedido pendiente
└── Opción B: Recepción directa
    └── Sin pedido previo

PASO 2: Captura de documento (OPCIONAL)
├── Subir factura/albarán
├── OCR automático (si está activado)
└── Extracción de datos

PASO 3: Líneas de recepción
├── Edición de artículos detectados
├── Añadir artículos manualmente
├── Configurar lote, caducidad, precio
└── Asignar centro de costo

PASO 4: Confirmación
├── Resumen de recepción
├── Toggle: Actualizar stock automáticamente
└── Registrar recepción
```

### 3.2 Línea de Recepción

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 38-48)

```typescript
interface LineaRecepcion {
  id: string;
  articulo: string;           // ⚠️ Nombre, no ID
  cantidad: number;
  lote: string;
  caducidad: string;
  precioUnitario: number;
  centroCosto: string;        // ⚠️ String libre, no relacional
  proveedor: string;          // ⚠️ Nombre, no ID
  noRegistrar: boolean;       // Para compras personales
}
```

#### **Problemas Identificados:**

1. **`articulo: string`**
   - Almacena el nombre del artículo, no su ID
   - Dificulta la relación con la tabla de artículos
   - Riesgo de inconsistencias por renombrados

2. **`centroCosto: string`**
   - Valor libre: "Almacén Central", "PDV Norte", etc.
   - No es una foreign key
   - No se sincroniza con PuntosDeVenta
   - Hardcoded en el código

3. **`proveedor: string`**
   - Nombre del proveedor, no su ID
   - Sin relación con tabla de proveedores

### 3.3 Mock Data de Líneas de Recepción

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 96-119)

```typescript
const [lineasRecepcion, setLineasRecepcion] = useState<LineaRecepcion[]>([
  {
    id: '1',
    articulo: 'Masa Pizza Base',
    cantidad: 50,
    lote: 'LOTE-2025-015',
    caducidad: '2025-06-15',
    precioUnitario: 2.50,
    centroCosto: 'Almacén Central',    // ⚠️ Hardcoded
    proveedor: 'Suministros Hostelería S.L.',
    noRegistrar: false
  },
  {
    id: '2',
    articulo: 'Harina 00 Premium',
    cantidad: 100,
    lote: 'LOTE-2025-016',
    caducidad: '2025-12-31',
    precioUnitario: 1.20,
    centroCosto: 'Almacén Central',    // ⚠️ Hardcoded
    proveedor: 'Suministros Hostelería S.L.',
    noRegistrar: false
  }
]);
```

### 3.4 Selector de Centro de Costo

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 1096-1109)

```typescript
{/* Centro de costo */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    Centro de costo
  </label>
  <select
    value={nuevoArticulo.centroCosto}
    onChange={(e) => setNuevoArticulo({ ...nuevoArticulo, centroCosto: e.target.value })}
    className="w-full border border-gray-300 rounded-lg px-3 py-2"
  >
    <option value="Almacén Central">Almacén Central</option>
    <option value="Almacén Secundario">Almacén Secundario</option>
    <option value="Cocina Central">Cocina Central</option>
  </select>
</div>
```

#### **Problemas:**
- ✅ Opciones hardcoded en JSX
- ❌ No se cargan desde `/src/app/components/sections/configuracion/PuntosDeVenta.tsx`
- ❌ Si se crea un nuevo PDV, no aparece aquí
- ❌ Si se renombra un PDV, el histórico queda inconsistente

### 3.5 Actualización de Stock

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (línea 122)

```typescript
// PASO 4: Confirmación
const [actualizarStockAutomaticamente, setActualizarStockAutomaticamente] = useState(true);
```

#### **Flujo de Guardado:**

```typescript
const handleGuardarRecepcion = () => {
  const recepcion = {
    tipoRecepcion,
    pedidoSeleccionado,
    documentoNombre,
    lineasRecepcion: lineasRecepcion.filter(l => !l.noRegistrar),
    actualizarStockAutomaticamente  // ⚠️ Solo flag, sin lógica
  };
  
  onSave(recepcion);
  handleClose();
};
```

#### **Receptor de datos:**

**Ubicación:** `/src/app/components/sections/Productos.tsx` (líneas 341-348)

```typescript
const handleSaveRecepcionMaterial = (data: any) => {
  console.log('Recepción de material registrada:', data);
  // Aquí iría la lógica para:
  // 1. Registrar la recepción en la base de datos
  // 2. Actualizar el stock de artículos
  // 3. Asociar con el pedido si corresponde
  // 4. Generar entrada de inventario
};
```

#### **Estado Actual:**
- ✅ Se captura el flag `actualizarStockAutomaticamente`
- ❌ **NO HAY LÓGICA IMPLEMENTADA** para actualizar el stock
- ❌ Solo se hace `console.log`
- ❌ No se incrementa `stockActual` del artículo
- ❌ No se crea un lote nuevo
- ❌ No se registra el movimiento

### 3.6 Integración con Pedidos

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (líneas 50-63)

```typescript
interface PedidoProveedor {
  id: string;
  numero: string;
  proveedor: string;
  fecha: string;
  articulosEsperados: number;
  estado: 'pendiente' | 'parcial' | 'completo';
}

const pedidosMock: PedidoProveedor[] = [
  { id: '1', numero: 'PED-2025-001', proveedor: 'Suministros Hostelería S.L.', fecha: '2025-01-15', articulosEsperados: 12, estado: 'pendiente' },
  { id: '2', numero: 'PED-2025-002', proveedor: 'Distribuciones Alimentarias', fecha: '2025-01-14', articulosEsperados: 8, estado: 'parcial' },
  { id: '3', numero: 'PED-2025-003', proveedor: 'Materiales Construcción Pro', fecha: '2025-01-13', articulosEsperados: 25, estado: 'pendiente' },
];
```

#### **Funcionalidad:**
- ✅ Selección de pedido existente
- ✅ Prellenado de proveedor si viene de pedido
- ❌ No se actualiza el estado del pedido tras recepción
- ❌ No se marcan artículos como recibidos
- ❌ No hay validación de cantidad recibida vs esperada

### 3.7 Compras No Empresariales

#### **Campo:** `noRegistrar: boolean`

#### **Ubicación:** `/src/app/components/modals/RecepcionMaterialModal.tsx` (línea 765)

```typescript
<p className="text-xs text-amber-800 mt-0.5">
  Las líneas marcadas con <EyeOff className="size-3 inline" /> no afectarán al stock 
  (ej. compras personales)
</p>
```

#### **Propósito:**
- Permitir registrar compras que no son para el negocio
- Ejemplo: Empleado compra algo personal en el mismo pedido
- No afectan al stock
- Se filtran antes de guardar

#### **Implementación:**
```typescript
lineasRecepcion: lineasRecepcion.filter(l => !l.noRegistrar)
```

---

## 4️⃣ RELACIÓN CON PDV

### 4.1 PDV en Configuración

#### **Ubicación:** `/src/app/components/sections/configuracion/PuntosDeVenta.tsx`

#### **Estructura de PDV (implícita):**

```typescript
// No hay interface explícita, se maneja en estado local
{
  id: 'centro-1',
  nombre: 'La Buena Mesa Centro',  // Ejemplo
  horarios: {
    monday: { closed: false, slots: [...] },
    tuesday: { closed: false, slots: [...] },
    // ... resto de días
  },
  centroCosto: boolean,  // Marca si es centro de costo
}
```

#### **Mock de Centros de Costo:**

**Ubicación:** `/src/app/components/sections/configuracion/ComprasInventario.tsx` (líneas 48-53)

```typescript
const mockCentros = [
  'PDV Centro',
  'PDV Norte',
  'PDV Sur',
  'Almacén Central'
];
```

#### **Problema:**
- Hay dos fuentes de verdad:
  1. `PuntosDeVenta.tsx` → Centros de trabajo configurados
  2. `ComprasInventario.tsx` → Mock hardcoded
- No hay sincronización entre ambas

### 4.2 Centro de Costo vs Punto de Venta

#### **Ubicación:** `/src/app/components/sections/configuracion/ComprasInventario.tsx` (líneas 55-62)

```typescript
const mockCentrosCosto = [
  'Cocina - Materia Prima',
  'Cocina - Bebidas',
  'Mantenimiento',
  'Limpieza',
  'Administrativo',
  'Equipamiento'
];
```

#### **Conceptos Mezclados:**

| Concepto | Propósito | Uso Actual |
|----------|-----------|------------|
| **PDV** | Ubicación física de venta | Configuración de horarios, equipos |
| **Centro de Costo** | Agrupación contable | Clasificación de gastos |
| **Almacén** | Ubicación de stock | ❌ No diferenciado de PDV |

#### **Estado Actual:**
```
En RecepcionMaterialModal:
centroCosto: "Almacén Central"  ← ¿Es PDV? ¿Es centro contable? ¿Es almacén físico?

En PuntosDeVenta:
centroCosto: boolean  ← Solo marca si el PDV es centro de costo

❌ No hay relación clara entre ambos conceptos
```

### 4.3 Reglas de Proveedor → Centro de Costo

#### **Ubicación:** `/src/app/components/sections/configuracion/ComprasInventario.tsx` (líneas 35-38)

```typescript
const [reglasProveedor, setReglasProveedor] = useState([
  { id: '1', proveedor: 'Suministros Hostelería S.L.', centroCosto: 'Cocina - Materia Prima' },
  { id: '2', proveedor: 'Distribuidora Alimentos', centroCosto: 'Cocina - Materia Prima' },
]);
```

#### **Funcionalidad:**
- ✅ Permite configurar reglas automáticas
- ✅ Al recibir de un proveedor, asigna centro de costo automáticamente
- ❌ **NO ESTÁ CONECTADO** con RecepcionMaterialModal
- ❌ No se aplica en la práctica

### 4.4 Stock por PDV: Estado Actual

#### **Búsqueda realizada:**

```bash
# Patrones buscados:
- ArticuloPDV
- StockPorPDV
- ArticuloUbicacion
- stock.*pdv

# Resultado: 0 coincidencias
```

#### **Conclusión:**
❌ **NO EXISTE** ninguna estructura para almacenar stock diferenciado por PDV

---

## 5️⃣ CÁLCULO DE COSTES

### 5.1 Métodos de Cálculo

#### **Ubicación:** `/src/app/components/sections/configuracion/ComprasInventario.tsx` (línea 45)

```typescript
const [metodoCostes, setMetodoCostes] = useState<'ultimo' | 'medio'>('medio');
```

#### **Opciones Disponibles:**

| Método | Código | Descripción |
|--------|--------|-------------|
| **Último coste** | `'ultimo'` | Usa el precio de la última compra |
| **Coste medio ponderado** | `'medio'` | Promedio ponderado de todas las compras |

#### **Configuración en UI:**

```typescript
<Badge variant="default" className="bg-blue-100 text-blue-700 text-xs">
  {metodoCostes === 'ultimo' ? 'Último coste' : 'Coste medio ponderado'}
</Badge>
```

### 5.2 Almacenamiento de Costes en Artículo

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 57-62)

```typescript
// Costes
ultimoCosto: 1.20,                                    // Precio última compra
costoMedioPonderado: 1.18,                           // CMP calculado
fechaUltimaCompra: '2025-01-15',
proveedorUltimaCompra: 'Suministros Hostelería S.L.',
metodoCalculo: 'cmp' as 'ultimo' | 'cmp',           // Método aplicado
```

#### **Propiedades:**

1. **`ultimoCosto`:**
   - Último precio pagado por unidad
   - Actualización: En cada recepción
   - Uso: Si método = 'ultimo'

2. **`costoMedioPonderado`:**
   - Promedio ponderado histórico
   - Fórmula: `Σ(cantidad × precio) / Σ(cantidad)`
   - Actualización: En cada recepción
   - Uso: Si método = 'medio'

3. **`metodoCalculo`:**
   - Almacena qué método se está usando
   - Permite auditar decisiones de coste

### 5.3 Historial de Compras

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 90-93)

```typescript
compras: [
  { id: '1', fecha: '2025-01-15', proveedor: 'Suministros Hostelería S.L.', cantidad: 50, precioUnitario: 1.20, total: 60.00 },
  { id: '2', fecha: '2025-01-08', proveedor: 'Distribuciones Alimentarias', cantidad: 100, precioUnitario: 1.15, total: 115.00 },
],
```

#### **Estructura:**

```typescript
interface Compra {
  id: string;
  fecha: string;
  proveedor: string;        // ⚠️ Nombre, no ID
  cantidad: number;
  precioUnitario: number;
  total: number;
}
```

#### **Uso:**
- ✅ Visualización en tab "Compras" del detalle
- ❌ No se usa para calcular CMP (es mock data)
- ❌ No hay lógica implementada de actualización

### 5.4 Actualización Automática de Costes

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 578-585)

```typescript
<div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-3">
  <Info className="size-5 text-indigo-600 flex-shrink-0 mt-0.5" />
  <div>
    <p className="text-sm font-semibold text-indigo-900">Cálculo automático de costes</p>
    <p className="text-sm text-indigo-800 mt-1">
      Cuando cambies el precio de compra de este artículo, todos los productos que lo usan 
      actualizarán su coste automáticamente. Esto asegura que tus márgenes siempre estén 
      correctamente calculados.
    </p>
  </div>
</div>
```

#### **Estado:**
- ✅ UI describe la funcionalidad
- ❌ **NO HAY LÓGICA IMPLEMENTADA**
- ❌ No hay relación reactiva entre artículos y productos
- ❌ Cambiar el coste de un artículo no actualiza escandallos

---

## 6️⃣ MOVIMIENTOS DE STOCK

### 6.1 Estructura de Movimientos

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx` (líneas 84-88)

```typescript
movimientos: [
  { id: '1', fecha: '2025-01-16', accion: 'Recepción', usuario: 'Carlos García', cantidad: 25.5, lote: 'LOTE-2025-016' },
  { id: '2', fecha: '2025-01-15', accion: 'Consumo', usuario: 'Sistema TPV', cantidad: -10, lote: 'LOTE-2025-012' },
  { id: '3', fecha: '2025-01-14', accion: 'Ajuste manual', usuario: 'Ana Martínez', cantidad: 2, lote: 'LOTE-2025-012' },
],
```

#### **Estructura Implícita:**

```typescript
interface MovimientoStock {
  id: string;
  fecha: string;
  accion: string;           // ⚠️ Texto libre
  usuario: string;          // ⚠️ Nombre, no ID
  cantidad: number;         // Positivo = entrada, Negativo = salida
  lote: string;             // Número de lote
  // ❌ NO HAY: PDV origen
  // ❌ NO HAY: PDV destino
  // ❌ NO HAY: motivo detallado
  // ❌ NO HAY: tipo de movimiento (enum)
}
```

### 6.2 Tipos de Movimientos Identificados

| Tipo | Usuario | Cantidad | Origen |
|------|---------|----------|--------|
| **Recepción** | Usuario real | Positiva | RecepcionMaterialModal |
| **Consumo** | "Sistema TPV" | Negativa | Venta (no implementado) |
| **Ajuste manual** | Usuario real | Positiva/Negativa | Modal de ajuste (no encontrado) |
| **Transferencia** | - | - | ❌ No contemplado |
| **Merma** | - | - | ❌ No contemplado |
| **Devolución** | - | - | ❌ No contemplado |

### 6.3 Generación de Movimientos

#### **Estado Actual:**
- ❌ Los movimientos son mock data estática
- ❌ No se crean al registrar recepciones
- ❌ No hay función `createMovimiento()`
- ❌ No hay tabla en backend

#### **Flujo Esperado (no implementado):**

```typescript
// Al registrar recepción:
function registrarRecepcion(recepcion) {
  // 1. Actualizar stock
  articulo.stockActual += recepcion.cantidad;
  
  // 2. Crear lote
  const nuevoLote = { ... };
  articulo.lotes.push(nuevoLote);
  
  // 3. Crear movimiento  ← ❌ NO EXISTE
  const movimiento = {
    fecha: new Date().toISOString(),
    accion: 'Recepción',
    usuario: currentUser.name,
    cantidad: recepcion.cantidad,
    lote: recepcion.lote,
  };
  articulo.movimientos.push(movimiento);
}
```

### 6.4 Visualización de Movimientos

#### **Ubicación:** `/src/app/components/catalogo/DetalleArticulo.tsx`

#### **Tab de Historial:**

```typescript
const [tabHistorial, setTabHistorial] = useState<'movimientos' | 'compras' | 'ajustes' | 'inventarios'>('movimientos');
```

#### **Tabs Disponibles:**

1. **Movimientos de stock:**
   - Lista todos los movimientos
   - Ordenados por fecha (más reciente primero)
   - Muestra: fecha, acción, usuario, cantidad, lote

2. **Compras:**
   - Historial de compras del artículo
   - Muestra: fecha, proveedor, cantidad, precio, total

3. **Ajustes:**
   - ❌ Tab definido pero sin contenido

4. **Inventarios:**
   - ❌ Tab definido pero sin contenido

---

## 7️⃣ DEPENDENCIAS ENTRE COMPONENTES

### 7.1 Mapa de Componentes

```
Productos.tsx (Main)
│
├── ProductWizard.tsx
│   └── (Crea productos/servicios)
│
├── AñadirArticuloModal.tsx
│   ├── Gestión de lotes
│   └── Configuración de stock
│
├── RecepcionMaterialModal.tsx
│   ├── Captura de recepciones
│   ├── Asigna centro de costo
│   └── NO actualiza stock (solo UI)
│
├── CatalogoArticulos.tsx
│   └── DetalleArticulo.tsx
│       ├── Visualiza stock
│       ├── Visualiza lotes
│       └── Visualiza movimientos
│
└── Configuración:
    ├── PuntosDeVenta.tsx (Centros de trabajo)
    └── ComprasInventario.tsx
        ├── Método de costes
        ├── Reglas de proveedor
        └── Centro de costo por defecto
```

### 7.2 Flujo de Datos de Recepción

```
┌─────────────────────────────────┐
│ RecepcionMaterialModal          │
│ ┌─────────────────────────────┐ │
│ │ 1. Usuario completa wizard  │ │
│ │ 2. onSave(recepcion)        │ │
│ └─────────────────────────────┘ │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Productos.tsx                   │
│ ┌─────────────────────────────┐ │
│ │ handleSaveRecepcionMaterial │ │
│ │ console.log(data)           │ │  ← ❌ Solo log
│ │ // TODO: actualizar stock   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
              │
              ▼
         ❌ NO HAY BACKEND
         ❌ NO SE ACTUALIZA STOCK
         ❌ NO SE CREA LOTE
         ❌ NO SE REGISTRA MOVIMIENTO
```

### 7.3 Dependencias de Configuración

#### **Centro de Costo:**

```
ComprasInventario.tsx (config)
│
├── mockCentros: ['PDV Centro', 'PDV Norte', ...]
│   └── Usado en: selector de centro por defecto
│
❌ NO CONECTA CON ▼
│
RecepcionMaterialModal.tsx
│
└── Options hardcoded:
    ├── "Almacén Central"
    ├── "Almacén Secundario"
    └── "Cocina Central"
```

#### **Método de Costes:**

```
ComprasInventario.tsx
│
├── metodoCostes: 'medio' | 'ultimo'
│   └── Solo estado local
│
❌ NO SE USA EN ▼
│
DetalleArticulo.tsx
│
├── ultimoCosto: 1.20
├── costoMedioPonderado: 1.18
└── metodoCalculo: 'cmp'  ← Mock estático
```

### 7.4 Dependencias No Resueltas

| Origen | Destino | Dato | Estado |
|--------|---------|------|--------|
| PuntosDeVenta | RecepcionMaterial | Lista de PDV | ❌ No conectado |
| ComprasInventario | RecepcionMaterial | Reglas de proveedor | ❌ No aplicado |
| ComprasInventario | DetalleArticulo | Método de costes | ❌ No sincronizado |
| RecepcionMaterial | DetalleArticulo | Stock actualizado | ❌ No implementado |
| RecepcionMaterial | DetalleArticulo | Nuevo lote | ❌ No creado |
| RecepcionMaterial | DetalleArticulo | Movimiento | ❌ No registrado |

---

## 8️⃣ LIMITACIONES TÉCNICAS ACTUALES

### 8.1 Limitaciones de Arquitectura

#### **L1: Stock sin Granularidad por PDV**

```typescript
// Estado actual:
stockActual: 45.5  // Global

// Necesidad real:
stockPorPDV: [
  { pdvId: 'pdv-1', cantidad: 25.5 },
  { pdvId: 'pdv-2', cantidad: 20.0 }
]
```

**Impacto:**
- ❌ Imposible saber stock real por ubicación
- ❌ Alertas imprecisas
- ❌ Ventas sin validación de stock local
- ❌ Transferencias no contempladas

---

#### **L2: Lotes sin Ubicación Física**

```typescript
// Estado actual:
interface Lote {
  id: string;
  cantidad: number;
  // ❌ NO HAY: ubicacion / pdvId
}

// Necesidad real:
interface Lote {
  id: string;
  cantidad: number;
  pdvId: string;  // ← CRÍTICO
}
```

**Impacto:**
- ❌ FIFO/FEFO imposible por ubicación
- ❌ No se puede hacer picking por PDV
- ❌ Inventarios físicos sin segregación
- ❌ Caducidades sin control por ubicación

---

#### **L3: Centro de Costo como String Libre**

```typescript
// Estado actual:
centroCosto: "Almacén Central"  // String libre

// Necesidad real:
centroCostoId: "cc-001"  // Foreign key
```

**Impacto:**
- ❌ Inconsistencias por renombrado
- ❌ Imposible hacer queries relacionales
- ❌ Duplicados por typos
- ❌ No hay validación

---

#### **L4: Artículo y Proveedor como Nombres**

```typescript
// En LineaRecepcion:
articulo: "Harina 00 Premium"  // ❌ Nombre
proveedor: "Suministros Hostelería S.L."  // ❌ Nombre

// Necesidad real:
articuloId: "art-123"  // ✅ ID
proveedorId: "prv-456"  // ✅ ID
```

**Impacto:**
- ❌ Relaciones débiles
- ❌ Renombrados rompen histórico
- ❌ No hay integridad referencial
- ❌ Búsquedas ineficientes

---

#### **L5: Movimientos sin Origen/Destino**

```typescript
// Estado actual:
interface Movimiento {
  fecha: string;
  accion: string;  // "Recepción", "Consumo", etc.
  cantidad: number;
  // ❌ NO HAY: origen/destino
}

// Para transferencias necesitas:
interface Movimiento {
  tipo: 'entrada' | 'salida' | 'transferencia';
  pdvOrigen?: string;
  pdvDestino?: string;
}
```

**Impacto:**
- ❌ No se puede rastrear flujo de stock
- ❌ Transferencias no modelables
- ❌ Auditoría incompleta

---

### 8.2 Limitaciones Funcionales

#### **F1: Actualización de Stock No Implementada**

**Código actual:**

```typescript
const handleSaveRecepcionMaterial = (data: any) => {
  console.log('Recepción de material registrada:', data);
  // TODO: Actualizar stock
};
```

**Estado:** 
- ✅ UI completa
- ✅ Wizard funcional
- ✅ Datos capturados
- ❌ **NO SE ACTUALIZA STOCK**

---

#### **F2: Lotes No se Crean**

**Flujo esperado:**

```typescript
// Al recibir material:
1. Crear nuevo lote con datos de recepción
2. Añadir a articulo.lotes[]
3. Actualizar cantidad del artículo

// Estado actual:
❌ Lotes son mock estático
```

---

#### **F3: Movimientos No se Registran**

```typescript
// Al recibir material, debería:
articulo.movimientos.push({
  fecha: new Date(),
  accion: 'Recepción',
  usuario: currentUser,
  cantidad: recepcion.cantidad,
  lote: recepcion.lote
});

// Estado actual:
❌ Movimientos son mock estático
```

---

#### **F4: FIFO/FEFO No Implementado**

**UI muestra:**
- "FIFO por defecto"
- "FEFO automático si hay caducidad"

**Realidad:**
- ❌ No hay lógica de selección de lote
- ❌ No hay ordenamiento por fecha
- ❌ No hay consumo automático de lote más antiguo
- ❌ No hay validación de caducidad

---

#### **F5: Cálculo de CMP No Implementado**

```typescript
// La configuración dice: "Coste medio ponderado"
metodoCostes: 'medio'

// Pero en el artículo:
costoMedioPonderado: 1.18  // ← Mock estático

// No hay lógica:
function calcularCMP(articulo: Articulo): number {
  // ❌ NO EXISTE
}
```

---

#### **F6: Reglas de Proveedor No se Aplican**

**Configuración:**

```typescript
reglasProveedor: [
  { proveedor: 'Suministros Hostelería S.L.', centroCosto: 'Cocina - Materia Prima' }
]
```

**En recepción:**
- ❌ No se consultan las reglas
- ❌ Usuario debe seleccionar centro manualmente
- ❌ Valor por defecto es siempre "Almacén Central"

---

### 8.3 Limitaciones de Integración

#### **I1: PDV No Sincronizado con Recepciones**

```
PuntosDeVenta.tsx → Crea PDV "La Buena Mesa Sur"
          ↓
          ❌ NO APARECE EN
          ↓
RecepcionMaterialModal.tsx → Selector de centro de costo
```

---

#### **I2: Configuración de Costes No se Aplica**

```
ComprasInventario.tsx → Usuario elige "Último coste"
          ↓
          ❌ NO SE USA EN
          ↓
DetalleArticulo.tsx → Siempre muestra CMP (mock)
```

---

#### **I3: Pedidos No se Actualizan tras Recepción**

```typescript
// Pedido:
estado: 'pendiente'
articulosEsperados: 12

// Usuario recibe 8 artículos
// Estado debería cambiar a:
estado: 'parcial'
articulosRecibidos: 8

// Estado actual:
❌ Pedido no se actualiza
```

---

### 8.4 Limitaciones de Datos

#### **D1: Sin Persistencia**

```
Toda la información es mock data en memoria
↓
Al recargar la página:
❌ Recepciones desaparecen
❌ Stock no persiste
❌ Lotes se pierden
❌ Movimientos se borran
```

---

#### **D2: Sin Validaciones**

```typescript
// Permitido actualmente:
- Stock negativo
- Lotes con cantidad 0
- Fechas de caducidad en el pasado
- Precios negativos
- Cantidad > stock (en consumos)
- PDV inexistentes (string libre)
```

---

#### **D3: Sin Cálculos Automáticos**

```
❌ Días de cobertura
❌ Punto de reorden
❌ Consumo medio real
❌ Rotación de stock
❌ ABC de artículos
❌ Valor de inventario
❌ Mermas automáticas por caducidad
```

---

### 8.5 Limitaciones de UX (sin soluciones)

#### **UX1: Feedback de Acciones**

```typescript
// Al guardar recepción:
onSave(recepcion);
handleClose();  // Modal se cierra

// Usuario NO ve:
❌ Confirmación de éxito
❌ Stock actualizado
❌ Nuevo movimiento
❌ Lote creado
```

---

#### **UX2: Estados Intermedios**

```
❌ No hay loading states
❌ No hay error handling
❌ No hay retry logic
❌ No hay offline support
```

---

#### **UX3: Datos Desactualizados**

```
// DetalleArticulo.tsx muestra:
stockActual: 45.5

// Usuario recibe 50 kg más
// DetalleArticulo sigue mostrando:
stockActual: 45.5  ← ❌ No se actualiza
```

---

## 📊 MATRIZ DE IMPACTO

### Por Funcionalidad

| Funcionalidad | Estado Actual | Bloquea Multi-PDV | Criticidad |
|--------------|---------------|-------------------|------------|
| Stock global | Mock estático | ✅ SÍ | 🔴 CRÍTICO |
| Lotes sin ubicación | Mock estático | ✅ SÍ | 🔴 CRÍTICO |
| Recepciones | UI completa, sin lógica | ✅ SÍ | 🔴 CRÍTICO |
| Centro de costo string | Implementado débil | ✅ SÍ | 🔴 CRÍTICO |
| Movimientos | Mock estático | ⚠️ PARCIAL | 🟡 ALTO |
| FIFO/FEFO | Solo UI | ⚠️ PARCIAL | 🟡 ALTO |
| Cálculo CMP | Mock estático | ❌ NO | 🟢 MEDIO |
| Reglas proveedor | Config sin uso | ❌ NO | 🟢 MEDIO |

---

## 📁 ARCHIVOS CLAVE

### Gestión de Stock

```
/src/app/types.ts
└── interface Product { stock: number }

/src/app/components/catalogo/DetalleArticulo.tsx
├── stockActual, stockMinimo, stockOptimo
├── cálculo de estados
└── visualización de alertas

/src/app/components/modals/AñadirArticuloModal.tsx
├── configuración de stock
└── gestión de lotes (UI)
```

### Lotes

```
/src/app/components/modals/AñadirArticuloModal.tsx
├── interface Lote
└── mock data de lotes

/src/app/components/catalogo/DetalleArticulo.tsx
├── visualización de lotes
└── alertas de caducidad
```

### Recepciones

```
/src/app/components/modals/RecepcionMaterialModal.tsx
├── wizard de 4 pasos
├── interface LineaRecepcion
├── captura de datos
└── ❌ sin lógica de actualización

/src/app/components/sections/Productos.tsx
└── handleSaveRecepcionMaterial (solo console.log)
```

### PDV y Centros

```
/src/app/components/sections/configuracion/PuntosDeVenta.tsx
└── configuración de PDV (sin relación con stock)

/src/app/components/sections/configuracion/ComprasInventario.tsx
├── mockCentros (hardcoded)
├── mockCentrosCosto (hardcoded)
└── reglas de proveedor (sin aplicar)
```

### Costes

```
/src/app/components/sections/configuracion/ComprasInventario.tsx
└── metodoCostes: 'ultimo' | 'medio'

/src/app/components/catalogo/DetalleArticulo.tsx
├── ultimoCosto
├── costoMedioPonderado
└── metodoCalculo (mock)
```

---

## 🔍 CONCLUSIONES TÉCNICAS

### Estado del Sistema

**✅ Lo que ESTÁ implementado:**
- UI completa de recepciones (wizard 4 pasos)
- Visualización de stock, lotes y movimientos
- Configuración de métodos de coste
- Modal de añadir artículo con lotes
- Detalle completo de artículo

**❌ Lo que NO está implementado:**
- Actualización real de stock
- Creación de lotes
- Registro de movimientos
- Cálculo de CMP
- FIFO/FEFO
- Aplicación de reglas de proveedor
- Stock por PDV
- Transferencias entre ubicaciones

**⚠️ Lo que está PARCIALMENTE implementado:**
- Centro de costo (string libre, no relacional)
- Configuración de OCR (UI sin backend)
- Pedidos a proveedor (sin actualización post-recepción)

### Nivel de Preparación para Producción

| Aspecto | Nivel | Comentario |
|---------|-------|------------|
| **UI/UX** | 85% | Interfaces completas y funcionales |
| **Lógica de negocio** | 15% | Solo mock data y console.logs |
| **Integración** | 5% | Componentes no conectados |
| **Persistencia** | 0% | Sin backend |
| **Multi-PDV** | 0% | No soportado |
| **Validaciones** | 0% | Sin validaciones de datos |

### Esfuerzo Estimado para Funcionalidad Completa

**Asumiendo backend disponible:**

| Tarea | Complejidad | Tiempo Estimado |
|-------|-------------|-----------------|
| Conectar recepciones → stock | Media | 2-3 días |
| Implementar creación de lotes | Baja | 1 día |
| Registrar movimientos | Baja | 1 día |
| Cálculo de CMP | Media | 2 días |
| FIFO/FEFO | Alta | 3-4 días |
| Stock por PDV | Alta | 5-7 días |
| Transferencias | Alta | 4-5 días |
| Validaciones completas | Media | 2-3 días |
| **TOTAL** | - | **20-30 días** |

---

**FIN DEL DOCUMENTO**

