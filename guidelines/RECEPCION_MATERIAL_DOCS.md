# Recepción de Material - Documentación UX/UI

## 📋 Resumen

Sistema de recepción de material diseñado para Vertial que permite registrar entradas de stock mediante dos flujos principales:
1. **Recepción desde pedido existente** - Material esperado de un pedido a proveedor
2. **Compra directa** - Material adquirido sin pedido previo

El sistema está preparado para integración con OCR automático de documentos (albaranes, tickets, facturas).

---

## 🎯 Características Principales

### ✅ Flujo Guiado de 4 Pasos
- **Paso 1**: Selección del tipo de recepción
- **Paso 2**: Captura de documento (OCR)
- **Paso 3**: Revisión y edición manual
- **Paso 4**: Confirmación final

### ✅ OCR Automático
- Captura con cámara o subida de archivo
- Procesamiento automático de documentos
- Detección de errores y advertencias
- Revisión manual obligatoria

### ✅ Gestión Flexible
- Edición de cantidades, lotes, caducidades
- Asignación de centros de coste
- Marcado de líneas como "no registrar" (compras personales)
- Eliminación de líneas
- Añadir artículos manualmente

### ✅ Responsive Design
- Optimizado para móvil y tablet
- Diseño adaptativo para uso en almacén
- Iconografía clara y comprensible

---

## 🔄 Flujo Completo

### PASO 1: Selección Tipo de Recepción

**Opciones:**
- **Recepción desde pedido**
  - Muestra lista de pedidos pendientes/parciales
  - Información visible: número, proveedor, fecha, artículos esperados
  - Estados: Pendiente | Parcial | Completo
  - Cantidades precargadas automáticamente

- **Compra directa**
  - Sin pedido previo
  - Ideal para compras urgentes o espontáneas
  - OCR de ticket o factura

**Validaciones:**
- Debe seleccionar un tipo
- Si es "desde pedido", debe seleccionar un pedido específico

---

### PASO 2: Captura de Documento

**Opciones de captura:**
- 📷 **Capturar con cámara** - Foto en tiempo real
- 📤 **Subir archivo** - PDF, JPG, PNG

**Estados del sistema:**

1. **Esperando captura**
   - Muestra dos tarjetas con opciones

2. **Procesando OCR** (simulado 2 segundos)
   - Animación de carga
   - Indicador de progreso
   - Mensaje: "Procesando documento..."

3. **Documento procesado**
   - ✅ **Sin errores**: Muestra resumen (artículos detectados, proveedor, precios)
   - ⚠️ **Con advertencias**: Aviso de líneas que requieren revisión manual

**Avisos informativos:**
- "El sistema leerá el documento y propondrá cantidades"
- "Podrás revisar y corregir los datos antes de guardar"

---

### PASO 3: Revisión Manual (OBLIGATORIA)

**Tabla editable con columnas:**
- **Artículo**: Nombre del producto
- **Cantidad**: Campo numérico con botones +/-
- **Lote**: Campo de texto (código alfanumérico)
- **Caducidad**: Selector de fecha
- **Precio/ud**: Campo numérico con 2 decimales
- **Centro**: Dropdown con centros de coste disponibles

**Acciones por línea:**
- ✏️ **Editar**: Modificar cualquier campo
- 👁️/👁️‍🗨️ **Toggle visibilidad**: Marcar como "no registrar"
- 🗑️ **Eliminar**: Quitar línea completamente

**Funciones adicionales:**
- ➕ **Añadir artículo manualmente**: Botón superior derecho
- Líneas marcadas como "no registrar" se muestran con opacidad reducida
- No afectan al cálculo de totales

**Avisos:**
- 🔸 Explicación de líneas no registradas (compras personales)
- 📦 Resumen en tiempo real: Total unidades + Valor total

---

### PASO 4: Confirmación

**Resumen visual:**

1. **Tipo de recepción**
   - Desde pedido / Compra directa
   - Número de pedido (si aplica)

2. **Métricas principales** (3 tarjetas)
   - 📦 Unidades totales
   - 💰 Valor total
   - 📄 Líneas a registrar

3. **Detalle de artículos**
   - Lista completa con:
     - Nombre del artículo
     - Lote y fecha de caducidad
     - Cantidad y precio unitario

**Opciones finales:**

✅ **Checkbox: "Actualizar stock automáticamente"**
- Marcado por defecto
- Si está activo: Las cantidades se añaden al stock inmediatamente
- Texto explicativo debajo

**Aviso de impacto:**
- 📈 "Se actualizarán los niveles de stock de X artículos en el centro 'Almacén Central'"

---

## 🎨 Componentes UI Utilizados

### Indicador de Progreso (Stepper)
- 4 pasos claramente marcados
- Estados: Actual (verde) | Completado (verde claro con ✓) | Pendiente (gris)
- Líneas de conexión que cambian de color según progreso

### Cards Seleccionables
- Borde que cambia a verde cuando está seleccionado
- Fondo ligeramente coloreado al seleccionar
- Iconos grandes y claros

### Badges de Estado
- **Pendiente**: Naranja
- **Parcial**: Azul
- **Completo**: Verde

### Avisos Informativos
- 🔵 **Info (azul)**: Información general
- 🟡 **Warning (ámbar)**: Advertencias o errores OCR
- 🟢 **Success (verde)**: Confirmaciones
- 🟣 **Future (morado)**: Funcionalidades futuras

### Tabla Editable
- Campos inline editables
- Botones de acción en cada fila
- Hover states claros
- Responsive en móvil (scroll horizontal)

---

## 📱 Responsive Design

### Mobile (< 768px)
- Botones con iconos + texto reducido
- Stepper compacto con números
- Tabla con scroll horizontal
- Cards en columna única

### Tablet (768px - 1024px)
- Grid de 2 columnas en Paso 1
- Tabla completa visible
- Botones con texto completo

### Desktop (> 1024px)
- Layout optimizado con máximos 3xl/4xl/5xl/6xl según paso
- Todas las columnas visibles
- Hover states completos

---

## 🔮 Preparación para Futuras Integraciones

### OCR Real
El sistema simula un procesamiento de 2 segundos, pero está preparado para:
- Llamada a API de OCR (Google Vision, Tesseract, AWS Textract)
- Manejo de errores de lectura
- Confianza por campo (score de OCR)
- Resaltado de campos con baja confianza

### Multi-centro
- Campo "Centro de coste" ya implementado
- Preparado para asignación por artículo
- Impacto de stock por centro calculado

### Lotes y Trazabilidad
- Campo lote con formato específico
- Fechas de caducidad obligatorias
- Base para sistema FIFO/FEFO

### Compras No Empresariales
- Toggle "no registrar" implementado
- Útil para:
  - Compras personales
  - Material de prueba
  - Devoluciones
  - Líneas erróneas

---

## 🚀 Acceso a la Funcionalidad

### Ubicación
`Módulo Artículos` → Botón **"Recibir Material"**

Disponible en:
- Vista móvil (botón principal)
- Vista desktop (toolbar superior)

### Componentes Involucrados
```
/src/app/components/modals/RecepcionMaterialModal.tsx
/src/app/components/sections/Productos.tsx (integración)
```

---

## 💾 Datos Guardados (Mock)

El sistema registra en consola:
```javascript
{
  tipoRecepcion: 'pedido' | 'directa',
  pedidoSeleccionado: 'PED-2025-001' | null,
  documentoNombre: 'albarán_001_2025.pdf',
  lineasRecepcion: [
    {
      articulo: 'Masa Pizza Base',
      cantidad: 50,
      lote: 'LOTE-2025-015',
      caducidad: '2025-06-15',
      precioUnitario: 2.50,
      centroCosto: 'Almacén Central',
      proveedor: 'Suministros Hostelería S.L.',
      noRegistrar: false
    }
  ],
  actualizarStockAutomaticamente: true
}
```

---

## ✨ Próximas Mejoras

### Fase 2 (Backend)
- [ ] Integración real con OCR
- [ ] Guardado en base de datos
- [ ] Actualización automática de stock
- [ ] Generación de documentos PDF
- [ ] Histórico de recepciones

### Fase 3 (Avanzado)
- [ ] Reconocimiento de productos por imagen
- [ ] Validación de precios con histórico
- [ ] Alertas de variación de precio
- [ ] Conciliación automática con pedidos
- [ ] Notificaciones al proveedor
- [ ] Integración con sistemas ERP externos

---

## 🎯 Principios de Diseño Aplicados

✅ **Mínima escritura manual** - OCR + datos precargados
✅ **Flujo guiado claro** - 4 pasos lineales con progreso visible
✅ **Revisión obligatoria** - Usuario siempre valida datos antes de confirmar
✅ **Feedback visual constante** - Estados, colores, iconos
✅ **Preparado para móvil** - Uso en almacén con tablet/smartphone
✅ **Pensado para TPV** - Flujo rápido y eficiente
✅ **Multi-centro desde diseño** - Campo presente en todo momento
✅ **Flexible y tolerante** - Permite marcar líneas como no válidas sin perder datos

---

**Documento creado para Vertial**
*Diseño UX/UI - Recepción de Material*
*Versión 1.0 - Enero 2025*

