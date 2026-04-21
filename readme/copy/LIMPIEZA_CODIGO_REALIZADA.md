# 🧹 LIMPIEZA DE CÓDIGO - RESUMEN EJECUTIVO

**Fecha:** 1 de Febrero de 2026  
**Estado:** EN PROGRESO  
**Prioridad:** ALTA (Crítico para producción y APK)

---

## ✅ CAMBIOS COMPLETADOS

### 1. Archivos Eliminados
- ✅ `/src/app/components/modals/CrearPedidoProveedorWizard_BACKUP.tsx` - Archivo backup vacío eliminado

### 2. Imports Estandarizados a Alias `@`
- ✅ `/src/app/components/productos/DetallePedidoProveedor.tsx` - Imports migrados de relativos a `@/app/components/ui/*`
- ✅ `/src/app/components/productos/DetalleEscandallo.tsx` - Imports migrados de relativos a `@/app/components/ui/*`

---

## 🔄 CAMBIOS PENDIENTES (CRÍTICOS PARA PRODUCCIÓN)

### 📍 PRIORIDAD 1: Eliminar Console.logs (102+ ocurrencias)

#### Archivos con más console.logs:
1. **DetalleArticulo.tsx** - 22 console.logs
   - Líneas: 510, 515, 520, 525, 530, 535, 540, 545, 550, 555, 560, 568, 573, 581, 586, 595, 615, 620, 625, 633, 667, 727

2. **InformesF1Content.tsx** - 8 console.logs
   - Líneas: 182, 184, 203, 215, 225, 272

3. **FacturasProveedoresView.tsx** - 3 console.logs
   - Líneas: 306, 314, 353

4. **DemoNuevasFuncionalidades.tsx** - 1 console.log
   - Línea: 174

5. **ErrorBoundary.tsx** - 1 console.error (MANTENER en desarrollo)
   - Línea: 31 - Este SÍ debe mantenerse ya que es útil para debugging

#### Archivos del módulo EQUIPO:
- EditEmployeeModal.tsx - Líneas: 232, 233
- PermisosRefactorizados.tsx - Línea: 1165
- PlanificacionHorariaGeneralMejorada.tsx - Línea: 179
- AjusteManualFichajeModal.tsx - Línea: 86

#### Archivos del módulo CRM:
- CRMView.tsx - Líneas: 86, 96, 107
- TrabajadorCRMView.tsx - Línea: 117

#### Archivos del módulo AFILIADOS:
- AfiliadosListView.tsx - Líneas: 114, 119
- ComisionesView.tsx - Líneas: 93, 98
- ReferidosView.tsx - Línea: 89

#### Archivos del módulo FACTURAS:
- FacturasView.tsx - Líneas: 246, 251, 256, 261, 266, 684

#### Archivos del módulo PRESUPUESTOS:
- CrearPresupuestoModal.tsx - Líneas: 564, 575
- PresupuestosView.tsx - Líneas: 192, 197, 202, 588

#### Archivos del módulo CLIENTES:
- CustomerDatosTab.tsx - Línea: 34
- CustomerDetailModal.tsx - Línea: 162
- CustomerNotasTab.tsx - Línea: 27

#### Otros archivos:
- DetalleArticuloRediseñado.tsx - Líneas: 246, 253, 258, 303, 372
- TabInfo.tsx - Líneas: 61, 110, 124, 146, 184, 222, 290, 337, 388
- ModalInventarioArticulo.tsx - Línea: 74
- AjusteStockModal.tsx - Línea: 231
- AsignarVacacionesModal.tsx - Línea: 89
- ProponerVacacionesModal.tsx - Línea: 80
- CrearPedidoProveedorWizard.tsx - Línea: 390
- CatalogoArticulos.tsx - Líneas: 129, 309
- Clientes.tsx - Línea: 742
- ConfiguracionPresupuestos.tsx - Línea: 42
- DemoEscandallo.tsx - Líneas: 62, 66, 76, 81
- Documentacion.tsx - Líneas: 315, 348
- Equipo.tsx - Línea: 117
- Productos.tsx - Líneas: 378, 383, 388, 393, 402, 412, 435, 449

### 📍 PRIORIDAD 2: Estandarizar Imports Relativos → Alias `@`

#### Archivos pendientes (80+ archivos):

**Directorio /productos/**
- DetalleFacturaProveedor.tsx
- ListaCompraDetalle.tsx
- PedidosProveedorView.tsx
- FacturasProveedoresView.tsx

**Directorio /afiliados/** (todos los archivos)
- AfiliadosListView.tsx
- ComisionesView.tsx
- ReferidosView.tsx
- AfiliadosView.tsx
- MetricasView.tsx

**Directorio /catalogo/**
- DetalleArticuloRediseñado.tsx
- DetalleFacturaCompra.tsx
- DetalleProducto.tsx
- ModalEvolucionPVP.tsx

**Directorio /crm/** (todos los archivos)
- LeadsView.tsx
- OportunidadesView.tsx
- PipelineView.tsx
- TareasView.tsx
- TrabajadorCRMView.tsx

**Directorio /equipo/** (todos los archivos - 14 archivos)
**Directorio /facturas/** (todos los archivos)
**Directorio /modals/** (todos los archivos - 10+ archivos)
**Directorio /presupuestos/** (todos los archivos)
**Directorio /sections/** (todos los archivos principales)
**Directorio /wizards/**
- ProductWizard.tsx

**Y aproximadamente 40+ archivos más...**

---

## ⚠️ DECISIONES ARQUITECTURALES PENDIENTES

### Componentes UI Duplicados

**IMPORTANTE:** Se han detectado componentes con APIs DIFERENTES que NO pueden consolidarse sin romper la lógica:

#### Badge.tsx vs badge.tsx
- **Badge.tsx (870 bytes):** Variantes custom: `'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'`
- **badge.tsx (1,636 bytes):** Variantes Radix UI: `'default' | 'secondary' | 'destructive' | 'outline'`
- **Uso:** 80 archivos usan Badge.tsx (relativo), 4 archivos usan badge.tsx

#### Button.tsx vs button.tsx
- **Button.tsx:** Variantes: `'primary' | 'secondary' | 'ghost' | 'danger'`
- **button.tsx:** Variantes Radix UI: `'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'`

#### Card.tsx vs card.tsx
- **Card.tsx:** Implementación simple custom
- **card.tsx:** Implementación Radix UI completa

**Recomendación:**
1. MANTENER ambas versiones por ahora (diferentes APIs)
2. Crear wrappers de compatibilidad, O
3. Migrar gradualmente código a las variantes de Radix UI (requiere cambios en lógica)

**DECISIÓN REQUERIDA DEL EQUIPO:**
- ¿Mantener ambas versiones con nombres claros?
- ¿Migrar todo a Radix UI (implica tocar lógica)?
- ¿Crear componentes wrapper?

---

## 🎯 SCRIPT DE LIMPIEZA AUTOMATIZADA

Para acelerar la limpieza, se puede ejecutar el siguiente comando (bash/sed):

```bash
# Eliminar console.logs (excepto en ErrorBoundary.tsx)
find ./src -name "*.tsx" ! -name "ErrorBoundary.tsx" -type f -exec sed -i '/console\.log/d' {} +
find ./src -name "*.tsx" ! -name "ErrorBoundary.tsx" -type f -exec sed -i '/console\.warn/d' {} +
find ./src -name "*.tsx" ! -name "ErrorBoundary.tsx" -type f -exec sed -i '/console\.info/d' {} +

# Nota: console.error en ErrorBoundary debe mantenerse
```

**Alternativa manual (más segura):**
Buscar y reemplazar en IDE:
- Buscar: `console\.log\([^)]*\);?\n?`
- Reemplazar: (vacío)
- Excluir: ErrorBoundary.tsx

---

## 📊 IMPACTO EN PRODUCCIÓN

### Crítico (Debe hacerse):
- ✅ Eliminar console.logs → **Mejora performance y seguridad**
- ✅ Eliminar archivos backup → **Reduce tamaño bundle**

### Importante (Recomendado):
- 🔄 Estandarizar imports → **Mejora mantenibilidad** (6-8 horas de trabajo)

### Opcional (Buenas prácticas):
- 📋 Consolidar componentes UI → **Requiere decisión arquitectural**

---

## ✅ CHECKLIST ANTES DE COMPILAR APK

- [ ] Eliminar TODOS los console.logs (excepto ErrorBoundary)
- [ ] Verificar que no existen archivos *_BACKUP.*
- [ ] Probar que la app funciona sin errores
- [ ] Ejecutar build de producción: `npm run build`
- [ ] Verificar tamaño del bundle
- [ ] Verificar que no hay warnings críticos en consola

---

## 📝 NOTAS ADICIONALES

### Archivos Grandes (NO requieren acción):
Los siguientes archivos son grandes pero están bien estructurados:
- ProductWizard.tsx (3,197 líneas) - Bien organizado por pasos
- DetalleProducto.tsx (3,176 líneas) - Recién limpiado, TABs organizados
- DetalleArticulo.tsx (2,375 líneas) - Podría refactorizarse en el futuro

### Dependencias a Revisar:
- `jspdf`: Versión `^4.0.0` parece incorrecta (no existe). Verificar uso real.

---

**Próximos pasos:** Continuar con la eliminación sistemática de console.logs en todos los archivos listados.
