# 🧮 SISTEMA DE ESCANDALLOS - DOCUMENTACIÓN UX

## 📋 ÍNDICE

1. [Contexto del Sistema](#contexto-del-sistema)
2. [Punto de Entrada](#punto-de-entrada)
3. [Wizard de Creación](#wizard-de-creación)
4. [Vista de Detalle](#vista-de-detalle)
5. [Relaciones Visuales](#relaciones-visuales)
6. [Fuera del Alcance](#fuera-del-alcance)

---

## 🎯 CONTEXTO DEL SISTEMA

### Definición
Un **escandallo** es la descomposición de un producto de venta en sus artículos componentes, permitiendo:
- Calcular el coste real de producción
- Calcular márgenes de beneficio
- Consumir stock automáticamente al vender

### Reglas de Negocio

✅ **Escandallo PUEDE aplicarse a:**
- Productos de tipo "Producto"
- Solo si `escandalloActive = true` (flag de funcionalidad)

❌ **Escandallo NO puede aplicarse a:**
- Productos de tipo "Servicio"
- Si el módulo de escandallo está desactivado

### Características Principales

| Característica | Descripción |
|----------------|-------------|
| **Relación** | Producto → Artículos (1:N) |
| **Cálculo de coste** | Suma de (cantidad × coste unitario) de cada artículo |
| **Cálculo de margen** | Precio venta - Coste total |
| **Consumo de stock** | Solo si `escandalloActive = true` y `escandallo.activo = true` |
| **Estados** | Activo / Inactivo (sin eliminar) |
| **Eliminación** | Requiere confirmación explícita |

---

## 🚀 PUNTO DE ENTRADA

### Ubicación
Sección **"Escandallo"** dentro del detalle de un Producto de venta.

### Condiciones de Visibilidad

```typescript
const mostrarBotonEscandallo = 
  producto.tipo === 'producto' && 
  escandalloActive === true &&
  !producto.tieneEscandallo;
```

### Diseño Visual

#### Sin Escandallo (Punto de Entrada)

```
┌─────────────────────────────────────────────────────────┐
│ ℹ️ Define el escandallo de este producto               │
│                                                         │
│ Especifica qué artículos componen este producto para   │
│ calcular costes y gestionar stock automáticamente.     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           ➕ Crear escandallo                           │
└─────────────────────────────────────────────────────────┘
```

### Texto Auxiliar
> "Define qué artículos componen este producto"

---

## 🧙 WIZARD DE CREACIÓN

### Estructura General

El wizard se divide en **3 pasos obligatorios**, sin navegación libre.

```
[1 Artículos] ━━━ [2 Costes] ━━━ [3 Confirmar]
    ✓              ⚪             ⚪
```

### PASO 1: Selección de Artículos

#### Objetivo
Permitir al usuario buscar y añadir artículos al escandallo, definiendo las cantidades necesarias.

#### Elementos Visuales

1. **Información contextual**
   ```
   ℹ️ Define qué artículos componen este producto
   Al vender este producto, se descontará automáticamente el 
   stock de los artículos seleccionados (si la funcionalidad 
   está activa).
   ```

2. **Buscador de artículos**
   - Campo de búsqueda con icono 🔍
   - Placeholder: "Buscar por nombre o SKU..."
   - Filtro en tiempo real

3. **Lista de artículos disponibles**
   
   Por cada artículo:
   ```
   ┌────────────────────────────────────────────────────┐
   │ 📦 Harina de trigo                                 │
   │     SKU: HAR-001 • Stock: 150 kg • 0.85 €/kg      │
   │                                    [➕ Añadir]     │
   └────────────────────────────────────────────────────┘
   ```

4. **Artículos añadidos al escandallo**
   
   Zona destacada visualmente (fondo morado claro):
   ```
   ┌────────────────────────────────────────────────────┐
   │ Artículos en el escandallo (3)                     │
   │ ┌──────────────────────────────────────────────┐   │
   │ │ Harina de trigo                              │   │
   │ │ 0.85 €/kg              [2.5] kg      [🗑️]   │   │
   │ └──────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────┘
   ```

#### Reglas de Validación

- ✅ Al menos 1 artículo añadido
- ✅ Todas las cantidades > 0
- ❌ No permitir cantidad = 0
- ❌ No permitir artículos duplicados

#### Estados del Botón Añadir

| Estado | Visual | Acción |
|--------|--------|--------|
| Disponible | `➕ Añadir` (morado) | Añade al escandallo |
| Ya añadido | `✓ Añadido` (gris) | Deshabilitado |

#### Navegación
- **Siguiente**: Solo si validación OK
- **Cancelar**: Cierra wizard sin guardar

---

### PASO 2: Resumen de Costes

#### Objetivo
Mostrar el desglose económico completo y calcular márgenes automáticamente.

#### Elementos Visuales

1. **Tabla resumen**

   ```
   ┌──────────────────────────────────────────────────────────────┐
   │ Artículo       │ Cantidad │ Coste unit. │ Coste parcial    │
   ├──────────────────────────────────────────────────────────────┤
   │ Harina         │ 2.5 kg   │ 0.85 €      │ 2.13 €          │
   │ Azúcar         │ 0.5 kg   │ 1.20 €      │ 0.60 €          │
   │ Huevos         │ 3 ud     │ 0.25 €      │ 0.75 €          │
   └──────────────────────────────────────────────────────────────┘
   ```

2. **Tarjetas de totales** (Grid 2x2)

   ```
   ┌─────────────────────┐  ┌─────────────────────┐
   │ 🧮 Coste total      │  │ 🛒 Precio venta     │
   │    8.50 €           │  │    25.00 €          │
   └─────────────────────┘  └─────────────────────┘

   ┌─────────────────────┐  ┌─────────────────────┐
   │ 📈 Margen (€)       │  │ 📈 Margen (%)       │
   │    16.50 €          │  │    66.0%            │
   └─────────────────────┘  └─────────────────────┘
   ```

#### Cálculos Automáticos

```typescript
costeTotal = Σ(cantidad × costeUnitario)
margenEuros = precioVenta - costeTotal
margenPorcentaje = ((precioVenta - costeTotal) / precioVenta) × 100
```

#### Alerta de Margen Negativo

Si `margenEuros < 0`:

```
┌────────────────────────────────────────────────────────┐
│ ⚠️ Margen negativo detectado                          │
│                                                        │
│ El coste total del escandallo es superior al precio   │
│ de venta. Considera ajustar el precio de venta o      │
│ revisar las cantidades de los artículos.              │
└────────────────────────────────────────────────────────┘
```

**IMPORTANTE**: El margen negativo NO bloquea el guardado, solo alerta.

#### Navegación
- **Anterior**: Vuelve a paso 1 (mantiene datos)
- **Siguiente**: Avanza a confirmación
- **Cancelar**: Cierra wizard sin guardar

---

### PASO 3: Confirmación

#### Objetivo
Revisar todos los datos antes de guardar y confirmar el usuario entiende el funcionamiento.

#### Elementos Visuales

1. **Resumen del producto**
   ```
   ┌────────────────────────────────────────────────────┐
   │ Producto                                           │
   │ Nombre: Tarta de Chocolate Premium                │
   │ Precio de venta: 25.00 €                          │
   └────────────────────────────────────────────────────┘
   ```

2. **Lista final de artículos**
   ```
   ┌────────────────────────────────────────────────────┐
   │ Artículos del escandallo (3)                       │
   │ ┌──────────────────────────────────────────────┐   │
   │ │ Harina de trigo                              │   │
   │ │ 2.5 kg × 0.85 €                  2.13 €      │   │
   │ └──────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────┘
   ```

3. **Resumen económico**
   ```
   ┌────────────────────────────────────────────────────┐
   │ Coste total:                           8.50 €      │
   │ ─────────────────────────────────────────────────  │
   │ Margen:                    16.50 € (66.0%)         │
   └────────────────────────────────────────────────────┘
   ```

4. **Aviso importante**
   ```
   ℹ️ Funcionamiento del escandallo
   
   Al vender este producto, se descontará automáticamente el 
   stock de los artículos definidos en este escandallo (si la 
   funcionalidad está activa). El escandallo se guardará como 
   activo y podrás editarlo o desactivarlo en cualquier momento.
   ```

#### Navegación
- **Anterior**: Vuelve a paso 2 (mantiene datos)
- **Guardar escandallo**: Guarda y cierra wizard
- **Cancelar**: Cierra wizard sin guardar

---

## 📊 VISTA DE DETALLE

### Ubicación
Se muestra en la sección de detalle del producto, reemplazando el botón de creación.

### Header del Componente

```
┌────────────────────────────────────────────────────────────┐
│ 🧮 Escandallo del producto               [✓ Activo] [▼]   │
│    3 artículos • Coste total: 8.50 €                       │
└────────────────────────────────────────────────────────────┘
```

### Estado: Expandido

#### 1. Alerta si está inactivo

```
┌────────────────────────────────────────────────────────────┐
│ ⚠️ Escandallo desactivado                                 │
│ El escandallo existe pero no se aplicará al vender el     │
│ producto. Actívalo para que consuma stock automáticamente.│
└────────────────────────────────────────────────────────────┘
```

#### 2. Tabla de artículos

```
┌──────────────────────────────────────────────────────────────┐
│ Artículo       │ Cant.   │ Coste u. │ Coste p. │ Stock      │
├──────────────────────────────────────────────────────────────┤
│ 📦 Harina      │ 2.5 kg  │ 0.85 €   │ 2.13 €   │ 150 kg ✓  │
│ 📦 Azúcar      │ 0.5 kg  │ 1.20 €   │ 0.60 €   │ 80 kg  ✓  │
│ 📦 Huevos      │ 3 ud    │ 0.25 €   │ 0.75 €   │ 500 ud ✓  │
├──────────────────────────────────────────────────────────────┤
│                              Coste total:      8.50 €        │
└──────────────────────────────────────────────────────────────┘
```

**Código de colores para stock**:
- 🟢 Verde: Stock > cantidad × 10 (abundante)
- 🟠 Naranja: Stock > cantidad (suficiente)
- 🔴 Rojo: Stock ≤ cantidad (insuficiente)

#### 3. Análisis de margen (Grid 1x3)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Precio venta │  │ Margen (€)   │  │ Margen (%)   │
│   25.00 €    │  │ 📈 16.50 €   │  │ 📈 66.0%     │
└──────────────┘  └──────────────┘  └──────────────┘
```

Si margen negativo, mostrar alerta:

```
┌────────────────────────────────────────────────────────────┐
│ ⚠️ Margen negativo                                        │
│ El coste del escandallo supera el precio de venta.       │
│ Considera ajustar el precio o revisar las cantidades.    │
└────────────────────────────────────────────────────────────┘
```

#### 4. Acciones disponibles

```
┌────────────────────────────────────────────────────────────┐
│ [✏️ Editar escandallo] [⚡ Desactivar] [🗑️ Eliminar]     │
└────────────────────────────────────────────────────────────┘
```

**Descripción de acciones**:

| Acción | Icono | Comportamiento |
|--------|-------|----------------|
| **Editar** | ✏️ | Abre wizard con datos precargados |
| **Activar/Desactivar** | ⚡ | Toggle estado (no borra datos) |
| **Eliminar** | 🗑️ | Requiere confirmación, elimina permanentemente |

#### 5. Confirmación de eliminación

Cuando se pulsa "Eliminar":

```
┌────────────────────────────────────────────────────────────┐
│ ⚠️ ¿Eliminar escandallo?                                  │
│                                                            │
│ Esta acción no se puede deshacer. Se perderá toda la      │
│ configuración del escandallo y no se descontará stock     │
│ al vender el producto.                                    │
│                                                            │
│              [Cancelar]  [🗑️ Sí, eliminar]               │
└────────────────────────────────────────────────────────────┘
```

### Estado: Colapsado

```
┌────────────────────────────────────────────────────────────┐
│ 🧮 Escandallo del producto               [✓ Activo] [▲]   │
│    3 artículos • Coste total: 8.50 €                       │
└────────────────────────────────────────────────────────────┘
```

---

## 🔗 RELACIONES VISUALES

### Diagrama de Entidades

```
┌─────────────────┐
│    PRODUCTO     │
│  (tipo venta)   │
│                 │
│ • Nombre        │ 1
│ • Precio venta  │ │
│ • SKU           │ │ tiene
│ • Categoría     │ │ (opcional)
└─────────────────┘ │
                    │
                   0..1
                    │
┌─────────────────┐ │
│   ESCANDALLO    │◄┘
│                 │
│ • Activo/Inactivo│ 1
│ • Coste total   │ │
│ • Fecha creac.  │ │ compuesto por
└─────────────────┘ │
                    │
                    N
                    │
┌─────────────────┐ │
│    ARTÍCULO     │◄┘
│ (tipo compra)   │
│                 │
│ • Nombre        │
│ • Coste unit.   │
│ • Stock actual  │
│ • Unidad        │
└─────────────────┘
```

### Cardinalidades

| Relación | Cardinalidad | Descripción |
|----------|--------------|-------------|
| Producto → Escandallo | 1:0..1 | Un producto puede tener 0 o 1 escandallo |
| Escandallo → Artículos | 1:N | Un escandallo tiene muchos artículos |
| Artículo → Escandallos | N:N | Un artículo puede estar en varios escandallos |

### Reglas de Integridad

✅ **Permitido**:
- Un producto SIN escandallo
- Un producto CON escandallo activo
- Un producto CON escandallo inactivo
- Un artículo en múltiples escandallos
- Editar escandallo existente
- Desactivar sin eliminar

❌ **NO permitido**:
- Múltiples escandallos por producto
- Escandallo en producto tipo "Servicio"
- Cantidad 0 en artículo del escandallo
- Artículos duplicados en mismo escandallo

---

## 🚫 FUERA DEL ALCANCE

### Funcionalidades NO Implementadas

Estas funcionalidades están **preparadas conceptualmente** pero NO se implementan en esta fase:

#### 1. Producción y Fabricación
- Órdenes de producción
- Planificación de fabricación
- Asignación de recursos
- Tiempos de producción

#### 2. Multi-nivel de Escandallo
- Escandallos anidados
- Sub-escandallos
- Recetas de recetas

#### 3. Versionado
- Historial de cambios
- Versiones de escandallo
- Comparativas entre versiones

#### 4. Simulación de Recetas
- Cálculo de costes hipotéticos
- Simulador de márgenes
- Análisis "qué pasaría si"

#### 5. Escandallo por Lote
- Producción en lotes
- Escandallo variable por tamaño
- Economías de escala

#### 6. Análisis Avanzado
- Rentabilidad histórica
- Tendencias de costes
- Alertas de variación de precios

---

## 📐 ESPECIFICACIONES TÉCNICAS

### Estructura de Datos

```typescript
interface ArticuloEscandallo {
  articuloId: string;
  nombre: string;
  cantidad: number;           // > 0 obligatorio
  unidad: string;             // Informativa, no editable
  costeUnitario: number;
  costeParcial: number;       // cantidad × costeUnitario
  stockActual?: number;       // Opcional, solo para vista
}

interface EscandalloData {
  productoId: string;
  articulos: ArticuloEscandallo[];  // Mínimo 1
  costeTotal: number;                // Σ costeParcial
  activo: boolean;                   // Default: true
  fechaCreacion?: string;
  fechaModificacion?: string;
}
```

### Flags de Funcionalidad

```typescript
// Flag global del módulo
const escandalloActive: boolean = true;  // Sistema-wide

// Flag individual del escandallo
const escandallo.activo: boolean = true; // Por producto
```

### Condiciones de Consumo de Stock

El stock se consume SOLO si:

```typescript
const consumeStock = 
  escandalloActive === true &&      // Módulo activo
  escandallo !== null &&             // Tiene escandallo
  escandallo.activo === true;        // Escandallo activo
```

---

## 🎨 GUÍA DE ESTILO

### Colores

| Elemento | Color | Uso |
|----------|-------|-----|
| Primario | Morado `#9333EA` | Botones principales, wizard |
| Éxito | Verde `#10B981` | Margen positivo, estado activo |
| Error | Rojo `#EF4444` | Margen negativo, eliminar |
| Advertencia | Naranja `#F59E0B` | Alertas, estados intermedios |
| Información | Azul `#3B82F6` | Tips, ayudas contextuales |

### Iconografía

| Elemento | Icono | Contexto |
|----------|-------|----------|
| Escandallo | 🧮 `Calculator` | Headers, títulos |
| Artículo | 📦 `Package` | Listas, tarjetas |
| Añadir | ➕ `Plus` | Botones de creación |
| Editar | ✏️ `Edit` | Acciones de modificación |
| Eliminar | 🗑️ `Trash2` | Acciones de borrado |
| Margen + | 📈 `TrendingUp` | Margen positivo |
| Margen - | 📉 `TrendingDown` | Margen negativo |
| Info | ℹ️ `Info` | Ayudas contextuales |
| Alerta | ⚠️ `AlertCircle` | Advertencias |

### Mensajes al Usuario

#### Contextuales
- **Creación**: "Define qué artículos componen este producto"
- **Sin artículos**: "Debes añadir al menos un artículo al escandallo"
- **Cantidad inválida**: "Todos los artículos deben tener cantidad mayor a 0"

#### Confirmaciones
- **Margen negativo**: "El coste total del escandallo es superior al precio de venta. Considera ajustar el precio de venta o revisar las cantidades de los artículos."
- **Eliminar**: "Esta acción no se puede deshacer. Se perderá toda la configuración del escandallo y no se descontará stock al vender el producto."

#### Informativos
- **Funcionamiento**: "Al vender este producto, se descontará automáticamente el stock de los artículos definidos en este escandallo (si la funcionalidad está activa)."

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Punto de Entrada
- [ ] Botón "+ Escandallo" visible solo si tipo = "Producto" y escandalloActive = true
- [ ] Texto auxiliar claro y descriptivo
- [ ] Estado deshabilitado si ya existe escandallo

### Wizard - Paso 1
- [ ] Buscador funcional por nombre y SKU
- [ ] Lista de artículos con todos los datos (stock, coste, unidad)
- [ ] Botón "Añadir" se deshabilita si ya está añadido
- [ ] Input de cantidad con validación > 0
- [ ] Eliminar artículo del escandallo funcional
- [ ] Validación: mínimo 1 artículo

### Wizard - Paso 2
- [ ] Tabla resumen con todos los cálculos
- [ ] Tarjetas de totales (4 tarjetas)
- [ ] Cálculo automático de margen en € y %
- [ ] Alerta de margen negativo (sin bloqueo)
- [ ] Colores dinámicos según margen

### Wizard - Paso 3
- [ ] Resumen completo del producto
- [ ] Lista final de artículos
- [ ] Totales económicos
- [ ] Aviso de funcionamiento
- [ ] Botón "Guardar" funcional

### Vista de Detalle
- [ ] Header con estado Activo/Inactivo
- [ ] Expandir/colapsar funcional
- [ ] Alerta si está inactivo
- [ ] Tabla de artículos con stock
- [ ] Análisis de margen (3 tarjetas)
- [ ] Botón Editar (abre wizard con datos)
- [ ] Botón Activar/Desactivar (toggle)
- [ ] Botón Eliminar con confirmación

### Lógica de Negocio
- [ ] Flag escandalloActive funcional
- [ ] Tipo "Servicio" nunca muestra opción de escandallo
- [ ] Escandallo se guarda como activo por defecto
- [ ] Desactivar no elimina datos
- [ ] Eliminar requiere confirmación
- [ ] Editar precarga datos en wizard

---

## 📞 SOPORTE

Para dudas sobre implementación, consultar:
- **Arquitectura de datos**: Ver diagrama de entidades
- **Flujos UX**: Revisar wizard paso a paso
- **Validaciones**: Ver checklist de implementación
- **Casos edge**: Ver sección "Fuera del alcance"

---

**Versión**: 1.0  
**Fecha**: Enero 2025  
**Proyecto**: UDAR EDGE - Core ERP  
**Módulo**: Catálogo - Escandallos

