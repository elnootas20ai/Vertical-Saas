# 📦 Pedidos a Proveedor - Documentación UX

## 🎯 Objetivo

Separar claramente dos entidades conceptuales en el módulo de **Pedidos a Proveedor**:

1. **Pedido a Proveedor** (entidad formal)
2. **Lista de la Compra** (entidad operativa - SOLO para pedidos de recogida)

---

## 🧩 Modelo Funcional

### 1️⃣ Pedido a Proveedor
- **Siempre existe** como entidad formal
- Contiene información del pedido: artículos, cantidades, precios, destinos
- Puede ser de tipo:
  - **Envío**: El proveedor entrega el material
  - **Recogida**: Se va a recoger el material

### 2️⃣ Lista de la Compra
- **SOLO existe si el pedido es de tipo RECOGIDA**
- Sirve para ejecutar la compra (checklist operativo)
- Permite marcar artículos como:
  - ✅ Completo
  - ⚠️ Incidencia (parcial o no disponible)
- **NO mueve stock** (el stock se actualiza al confirmar recepción)
- **NO sustituye al pedido** (es complementaria)

---

## 📁 Estructura de Archivos

```
/src/app/components/productos/
├── PedidosProveedorView.tsx       # Vista de lista de pedidos
├── DetallePedidoProveedor.tsx     # Detalle del pedido (vista principal)
└── ListaCompraDetalle.tsx         # Lista de la compra (vista operativa)
```

---

## 📍 Vista de Lista de Pedidos

**Archivo:** `PedidosProveedorView.tsx`

### Columnas mostradas:
- Nº Pedido
- Proveedor
- Estado
- Nº Artículos
- Total estimado
- Canal

### Acciones por fila:

#### 1️⃣ Botón "Ver pedido" 👁️
- **Siempre visible**
- Abre el modal `DetallePedidoProveedor`

#### 2️⃣ Botón "Ver lista" 📋
- **SOLO visible si** `pedido.tipoEntrega === 'recogida'`
- Abre el modal `ListaCompraDetalle`

#### 3️⃣ Botón "Más opciones" ⋯
- Menú contextual (placeholder para futuras acciones)

### Vistas disponibles:
- **Tabla**: Vista tabular responsive
- **Cards**: Vista de tarjetas en grid

---

## 📄 Detalle del Pedido

**Archivo:** `DetallePedidoProveedor.tsx`

### Cabecera
- Nº Pedido (destacado)
- Estado (badge)
- Proveedor
- Canal
- Tipo de pedido: **Envío** o **Recogida**

### Contenido

#### Si `tipoEntrega === 'recogida'`:
Muestra un **bloque destacado** (naranja) con:
- Icono 📋
- Título: "Este pedido es de recogida"
- Texto explicativo
- Botón: **"Ver lista de la compra"**

#### Información del pedido:
- Fecha de creación
- Fecha de envío
- Nº de artículos
- Total estimado

#### Artículos pedidos:
Lista de artículos con:
- Nombre
- Cantidad y unidad
- Precio unitario
- Subtotal
- Destino (PDV / Almacén)

**⚠️ NO se muestra checklist aquí** (eso está en la Lista de la Compra)

---

## 📋 Lista de la Compra

**Archivo:** `ListaCompraDetalle.tsx`

### Cabecera
- Título: "Detalle del Pedido"
- Canal (emoji + label)
- Estado

### Lista de artículos (formato lista, NO cards)

Cada artículo muestra:
- **Checkbox circular de estado** (izquierda):
  - ✓ Verde = Completo
  - ⚠ Naranja = Parcial
  - ✕ Rojo = No disponible
  - ○ Gris = Pendiente

- **Información del artículo**:
  - Nombre (destacado)
  - Cantidad prevista (grande y prominente)
  - Formato de compra (ej: "5 bolsas de 10 kg")
  - Destino (editable con dropdown)

- **Botones de acción** (derecha):
  - 🟢 **Completo**: Marca como completo
  - 🟠 **Incidencia**: Abre panel para reportar incidencia

### Panel expandible de incidencia
Al hacer clic en "Incidencia":
- **Tipo de incidencia**:
  - ⚠️ Cantidad parcial
  - ❌ No disponible
- **Cantidad real** (solo si es parcial)

### Footer
Botón: **"Continuar"**

### Modal de Confirmación
Al hacer clic en "Continuar":
- **Banner informativo**: "El stock se actualizará al confirmar la recepción"
- **Cards de resumen**:
  - Nº artículos
  - No disponibles
  - Previsto vs Real
  - Destinos
- **Escanear factura/ticket** (UX preparada)
- **Botones**:
  - "Guardar y continuar"
  - "Finalizar lista"

---

## 🎨 Diseño UX

### Separación clara:
1. **Pedido** = Azul (formal, informativo)
2. **Lista de la compra** = Naranja/Ámbar (operativo, acción)

### Responsive:
- **Mobile**: Botones solo con iconos
- **Desktop**: Botones con icono + texto

### Flujo de usuario:

```
PEDIDOS DE ENVÍO:
Ver lista → Ver pedido → Detalles → Cerrar

PEDIDOS DE RECOGIDA:
Ver lista → Ver pedido → Ver lista de compra → Ejecutar compra → Finalizar
```

---

## 🔐 Roles

- **Gerente**: Acceso completo
- **Trabajador**: Acceso operativo (ejecutar lista de compra)
- **Proveedor** (futuro): Sin acceso

---

## ✅ Checklist de Implementación

- [x] Actualizar modelo de datos (`tipoEntrega: 'envio' | 'recogida'`)
- [x] Vista de lista con acciones condicionales
- [x] Detalle del pedido limpio (sin checklist)
- [x] Bloque condicional "Ver lista de compra" en pedidos de recogida
- [x] Lista de la compra independiente
- [x] Modal de confirmación con escaneo de factura
- [x] Responsive mobile (iconos sin texto)
- [x] Separación visual clara (azul vs naranja)

---

## 📱 Mobile UX

### Optimizaciones para móvil:
- Botones compactos (solo iconos)
- Layout vertical en cards
- Scrolling optimizado
- Touch targets de 44x44px mínimo
- Texto legible (mínimo 14px)

---

## 🚀 Próximos Pasos

1. **Backend**: Conectar con API real
2. **Escaneo de factura**: Implementar lógica de OCR
3. **Recepción de material**: Actualizar stock
4. **Notificaciones**: Alertas de incidencias
5. **Histórico**: Registro de cambios en la lista

---

## 📝 Notas Importantes

- **NO se muestra lista de compra en pedidos de envío**
- **NO se mezcla checklist dentro del detalle del pedido**
- **NO se mueve stock desde la lista** (solo al confirmar recepción)
- **La lista de compra es opcional** (solo para recogida)

---

**Última actualización:** Enero 2025  
**Versión:** 1.0.0  
**Estado:** ✅ Implementado
