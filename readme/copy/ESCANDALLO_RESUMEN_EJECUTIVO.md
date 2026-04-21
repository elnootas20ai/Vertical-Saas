# 🧮 SISTEMA DE ESCANDALLOS - RESUMEN EJECUTIVO

## 🎯 ¿Qué es un Escandallo?

Un **escandallo** es la descomposición de un **producto de venta** en sus **artículos componentes**, permitiendo:
- ✅ Calcular el coste real de producción
- ✅ Calcular márgenes de beneficio (€ y %)
- ✅ Consumir stock automáticamente al vender

---

## 📋 FLUJO COMPLETO EN 3 PANTALLAS

### 1️⃣ PUNTO DE ENTRADA

**Ubicación**: Detalle de Producto de venta  
**Condición**: Solo si `tipo = "Producto"` y `escandalloActive = true`

```
┌─────────────────────────────────────────────────┐
│ ℹ️ Define qué artículos componen este producto │
│                                                 │
│        [➕ Crear escandallo]                    │
└─────────────────────────────────────────────────┘
```

---

### 2️⃣ WIZARD DE CREACIÓN (3 pasos)

#### **Paso 1: Seleccionar Artículos**

```
🔍 Buscar artículos
┌────────────────────────────────────────┐
│ 📦 Harina de trigo                     │
│    Stock: 150 kg • 0.85 €/kg  [➕]     │
└────────────────────────────────────────┘

📝 Artículos añadidos (3)
┌────────────────────────────────────────┐
│ Harina  [2.5] kg              [🗑️]    │
│ Azúcar  [0.5] kg              [🗑️]    │
│ Huevos  [3] ud                [🗑️]    │
└────────────────────────────────────────┘
```

#### **Paso 2: Revisar Costes**

```
┌─────────────────────────────────────────────┐
│ Artículo    │ Cant. │ Coste u. │ Coste p.  │
├─────────────────────────────────────────────┤
│ Harina      │ 2.5   │ 0.85 €   │ 2.13 €    │
│ Azúcar      │ 0.5   │ 1.20 €   │ 0.60 €    │
│ Huevos      │ 3     │ 0.25 €   │ 0.75 €    │
└─────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐
│ Coste total  │  │ Precio venta │
│   8.50 €     │  │   25.00 €    │
└──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ Margen (€)   │  │ Margen (%)   │
│ 📈 16.50 €   │  │ 📈 66.0%     │
└──────────────┘  └──────────────┘
```

#### **Paso 3: Confirmar**

```
✓ Producto: Tarta de Chocolate Premium
✓ Artículos: 3 componentes
✓ Coste total: 8.50 €
✓ Margen: 16.50 € (66.0%)

ℹ️ Al vender este producto, se descontará 
   automáticamente el stock de los artículos.

          [Guardar escandallo]
```

---

### 3️⃣ VISTA DE DETALLE (después de crear)

```
┌────────────────────────────────────────────────┐
│ 🧮 Escandallo          [✓ Activo] [▼]         │
│    3 artículos • Coste: 8.50 €                │
├────────────────────────────────────────────────┤
│                                                │
│ Artículos componentes:                         │
│ ┌──────────────────────────────────────────┐   │
│ │ 📦 Harina   2.5 kg  0.85€  2.13€  [✓]   │   │
│ │ 📦 Azúcar   0.5 kg  1.20€  0.60€  [✓]   │   │
│ │ 📦 Huevos   3 ud    0.25€  0.75€  [✓]   │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│ Análisis de margen:                            │
│ Precio venta: 25.00€  Margen: 16.50€ (66%)    │
│                                                │
│ [✏️ Editar] [⚡ Desactivar] [🗑️ Eliminar]     │
└────────────────────────────────────────────────┘
```

---

## 🔑 REGLAS DE NEGOCIO CLAVE

### ✅ Escandallo SÍ aplica a:
- Productos de tipo **"Producto"**
- Solo si `escandalloActive = true`

### ❌ Escandallo NO aplica a:
- Productos de tipo **"Servicio"**
- Si el módulo está desactivado

### 🎚️ Estados del Escandallo
- **Activo**: Consume stock al vender
- **Inactivo**: Existe pero no consume stock
- **No existe**: No hay escandallo definido

### 📊 Consumo de Stock
El stock solo se consume si:
```
escandalloActive = true
AND escandallo existe
AND escandallo.activo = true
```

---

## 🎨 COMPONENTES CREADOS

### 1. **CrearEscandalloWizard.tsx**
`/src/app/components/modals/CrearEscandalloWizard.tsx`

**Wizard modal de 3 pasos**:
- Paso 1: Selección de artículos con buscador
- Paso 2: Resumen de costes y márgenes
- Paso 3: Confirmación final

**Props**:
```typescript
{
  isOpen: boolean;
  onClose: () => void;
  onSave: (escandallo: EscandalloData) => void;
  producto: {
    id: string;
    nombre: string;
    precioVenta: number;
  };
}
```

---

### 2. **DetalleEscandallo.tsx**
`/src/app/components/productos/DetalleEscandallo.tsx`

**Componente de vista de escandallo existente**:
- Tabla de artículos con stocks
- Análisis de márgenes
- Acciones: Editar, Activar/Desactivar, Eliminar
- Expandible/colapsable

**Props**:
```typescript
{
  escandallo: EscandalloData;
  precioVenta: number;
  onEditar: () => void;
  onToggleActivo: () => void;
  onEliminar: () => void;
}
```

---

### 3. **DemoEscandallo.tsx**
`/src/app/components/sections/DemoEscandallo.tsx`

**Demo completa del sistema**:
- Muestra el flujo completo
- Incluye ejemplos de datos
- Documentación integrada

---

## 📐 ESTRUCTURA DE DATOS

```typescript
interface ArticuloEscandallo {
  articuloId: string;
  nombre: string;
  cantidad: number;          // > 0 obligatorio
  unidad: string;
  costeUnitario: number;
  costeParcial: number;      // cantidad × costeUnitario
  stockActual?: number;
}

interface EscandalloData {
  productoId: string;
  articulos: ArticuloEscandallo[];  // Mínimo 1
  costeTotal: number;                // Σ costeParcial
  activo: boolean;                   // Default: true
}
```

---

## 🔗 RELACIONES

```
PRODUCTO (1) ──┬── (0..1) ESCANDALLO
               │
               └── (N) ARTÍCULOS

• Un producto puede tener 0 o 1 escandallo
• Un escandallo tiene muchos artículos (mínimo 1)
• Un artículo puede estar en varios escandallos
```

---

## 🚫 FUERA DEL ALCANCE

**NO se implementa** (preparado conceptualmente):
- ❌ Producción / Fabricación
- ❌ Multi-nivel de escandallo
- ❌ Versionado de escandallos
- ❌ Simulación de recetas
- ❌ Escandallo por lote
- ❌ Análisis de rentabilidad histórica

---

## 🎯 ACCIONES DISPONIBLES

| Acción | Descripción | Requiere confirmación |
|--------|-------------|----------------------|
| **Crear** | Abre wizard de 3 pasos | No |
| **Editar** | Abre wizard con datos precargados | No |
| **Activar/Desactivar** | Toggle del estado (sin borrar) | No |
| **Eliminar** | Borra permanentemente | ✅ Sí |

---

## 🎨 GUÍA RÁPIDA DE COLORES

| Color | Uso |
|-------|-----|
| 🟣 Morado | Primario, wizard, acciones principales |
| 🟢 Verde | Margen positivo, estado activo, éxito |
| 🔴 Rojo | Margen negativo, eliminar, errores |
| 🟠 Naranja | Advertencias, estado inactivo |
| 🔵 Azul | Información, ayudas contextuales |

---

## 📊 CÁLCULOS AUTOMÁTICOS

```typescript
// Coste total del escandallo
costeTotal = Σ(cantidad × costeUnitario)

// Margen en euros
margenEuros = precioVenta - costeTotal

// Margen en porcentaje
margenPorcentaje = ((precioVenta - costeTotal) / precioVenta) × 100
```

---

## ✅ VALIDACIONES

### En Wizard - Paso 1:
- ✅ Mínimo 1 artículo añadido
- ✅ Todas las cantidades > 0
- ❌ No permite cantidad = 0
- ❌ No permite artículos duplicados

### Margen Negativo:
- ⚠️ Muestra alerta visual
- ✅ NO bloquea el guardado

---

## 🚀 CÓMO USAR

### Para ver la demo:
1. La demo está activa por defecto en `/src/app/App.tsx`
2. Abre el navegador y verás el sistema completo
3. Haz clic en "➕ Crear escandallo" para probar el wizard
4. Experimenta con los 3 pasos del wizard
5. Guarda y prueba las acciones (Editar, Desactivar, Eliminar)

### Para integrar en tu app:
```typescript
import { CrearEscandalloWizard } from '@/app/components/modals/CrearEscandalloWizard';
import { DetalleEscandallo } from '@/app/components/productos/DetalleEscandallo';

// Mostrar wizard
<CrearEscandalloWizard
  isOpen={wizardAbierto}
  onClose={() => setWizardAbierto(false)}
  onSave={handleGuardarEscandallo}
  producto={productoActual}
/>

// Mostrar detalle
{escandallo && (
  <DetalleEscandallo
    escandallo={escandallo}
    precioVenta={producto.precioVenta}
    onEditar={handleEditar}
    onToggleActivo={handleToggleActivo}
    onEliminar={handleEliminar}
  />
)}
```

---

## 📚 DOCUMENTACIÓN COMPLETA

Para más detalles, consultar:
- **Documentación completa**: `/ESCANDALLO_UX_DOCUMENTATION.md`
- **Componentes**: `/src/app/components/modals/CrearEscandalloWizard.tsx`
- **Demo interactiva**: `/src/app/components/sections/DemoEscandallo.tsx`

---

**✨ Sistema diseñado exclusivamente para UX/UI - Sin lógica backend implementada**

