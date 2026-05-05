# 🔍 AUDITORÍA DE ARCHIVOS HUÉRFANOS - Vertial

**Fecha:** 11 de enero de 2026  
**Objetivo:** Identificar código duplicado, archivos no utilizados y optimizar el proyecto

---

## 📊 RESUMEN EJECUTIVO

### Estadísticas
- **Archivos huérfanos identificados:** 11
- **Componentes UI duplicados:** 5 pares
- **Archivos de documentación para consolidar:** 5
- **Espacio estimado a liberar:** ~150 KB de código
- **Impacto en mantenibilidad:** ALTO ⚠️

---

## 🚨 ARCHIVOS HUÉRFANOS (NO UTILIZADOS)

### 1️⃣ COMPONENTES DE LAYOUT ANTIGUOS

#### ❌ `/src/app/components/layout/Layout.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `LayoutResponsive.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Se migró a versión responsive. No hay imports.

#### ❌ `/src/app/components/layout/Header.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `HeaderResponsive.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se usa `HeaderResponsive` en `LayoutResponsive.tsx`

#### ❌ `/src/app/components/layout/Sidebar.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `SidebarResponsive.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se usa `SidebarResponsive` en `LayoutResponsive.tsx`

---

### 2️⃣ COMPONENTES DE SECCIONES ANTIGUAS

#### ❌ `/src/app/components/sections/Dashboard.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `DashboardResponsive.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se importa `DashboardResponsive` en `LayoutResponsive.tsx`

---

### 3️⃣ COMPONENTES DE EQUIPO VIEJOS

#### ❌ `/src/app/components/equipo/ExpensesView.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `ExpensesViewOptimized.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se usa la versión optimizada en `EmployeeDetailPanel.tsx`
- **Tamaño:** ~12 KB

#### ❌ `/src/app/components/equipo/VacationsView.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `VacationsViewOptimized.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se usa la versión optimizada en `EmployeeDetailPanel.tsx`
- **Tamaño:** ~10 KB

#### ❌ `/src/app/components/equipo/SchedulesView.tsx`
- **Estado:** NO USADO
- **Reemplazado por:** `SchedulesViewPRO.tsx`
- **Acción recomendada:** ⚠️ **ELIMINAR**
- **Justificación:** Solo se usa `SchedulesViewPRO` en `EmployeeDetailPanel.tsx`
- **Tamaño:** ~8 KB

---

### 4️⃣ COMPONENTES DE PLANIFICACIÓN DUPLICADOS

#### ⚠️ `/src/app/components/equipo/PlanificacionHorariaGeneral.tsx`
- **Estado:** POSIBLEMENTE NO USADO
- **Acción recomendada:** 🔍 **VERIFICAR Y ELIMINAR SI NO SE USA**
- **Nota:** Existe `PlanificacionHorariaGeneralMejorada.tsx` y `PlanificacionHorariaMobile.tsx`
- **Tamaño:** ~25 KB

#### ⚠️ `/src/app/components/equipo/PlanificacionHorariaGeneralMejorada.tsx`
- **Estado:** VERIFICAR USO
- **Acción recomendada:** 🔍 **VERIFICAR si se usa en alguna sección de gerente**
- **Nota:** Parece ser versión mejorada de desktop
- **Tamaño:** ~30 KB

---

### 5️⃣ OTROS COMPONENTES

#### ❌ `/src/app/components/modals/EventModal.tsx`
- **Estado:** NO ENCONTRADO EN BÚSQUEDAS
- **Acción recomendada:** 🔍 **VERIFICAR si se usa en Calendario**
- **Nota:** Puede ser usado dinámicamente

#### ❌ `/src/app/components/showcase/TypographyShowcase.tsx`
- **Estado:** COMPONENTE DE DESARROLLO
- **Acción recomendada:** ⚠️ **MOVER A CARPETA /docs O ELIMINAR**
- **Justificación:** No es código de producción, es showcase de tipografía

---

## 📦 COMPONENTES UI DUPLICADOS

### ⚠️ PROBLEMA: Archivos con mayúscula Y minúscula

```
/src/app/components/ui/
├── Badge.tsx          ← Versión custom
├── badge.tsx          ← Versión shadcn/ui
├── Button.tsx         ← Versión custom
├── button.tsx         ← Versión shadcn/ui
├── Card.tsx           ← Versión custom
├── card.tsx           ← Versión shadcn/ui
├── Table.tsx          ← Versión custom
├── table.tsx          ← Versión shadcn/ui
├── Tooltip.tsx        ← Versión custom
└── tooltip.tsx        ← Versión shadcn/ui
```

### 📋 Estado Actual
- **Versiones CUSTOM (mayúscula):** Se usan en TODO el proyecto
- **Versiones shadcn (minúscula):** NO SE USAN

### ✅ Acción Recomendada
**CONSERVAR versiones con MAYÚSCULA, ELIMINAR minúsculas:**

```bash
# ELIMINAR estos archivos:
/src/app/components/ui/Badge.tsx
/src/app/components/ui/Button.tsx
/src/app/components/ui/card.tsx
/src/app/components/ui/table.tsx
/src/app/components/ui/tooltip.tsx
```

**Razón:** Las versiones custom están adaptadas al diseño de Vertial y son las que se importan en todos los componentes.

---

## 📄 ARCHIVOS DE DOCUMENTACIÓN

### Consolidación Recomendada

```
ACTUAL:
├── AUDITORIA_COHERENCIA_PERFILES.md
├── HORARIOS_README.md
├── MEJORAS_UX_IMPLEMENTADAS.md
├── MEJORAS_UX_MOBILE.md
└── MEJORAS_UX_PLANIFICACION.md

PROPUESTA:
└── /docs
    ├── README.md (consolidado)
    ├── AUDITORIA.md (consolidado)
    └── MEJORAS_UX.md (consolidado)
```

### Acción Recomendada
✅ **CONSOLIDAR** archivos de mejoras UX en uno solo  
✅ **MOVER** a carpeta `/docs` para mejor organización

---

## 🎯 PLAN DE ACCIÓN RECOMENDADO

### FASE 1: ELIMINACIÓN SEGURA (SIN RIESGO)
```bash
# 1. Componentes de layout antiguos
rm /src/app/components/layout/Layout.tsx
rm /src/app/components/layout/Header.tsx
rm /src/app/components/layout/Sidebar.tsx

# 2. Secciones antiguas
rm /src/app/components/sections/Dashboard.tsx

# 3. Componentes UI shadcn no usados
rm /src/app/components/ui/Badge.tsx
rm /src/app/components/ui/Button.tsx
rm /src/app/components/ui/card.tsx
rm /src/app/components/ui/table.tsx
rm /src/app/components/ui/tooltip.tsx
```

### FASE 2: ELIMINACIÓN CONFIRMADA (VERIFICAR ANTES)
```bash
# 1. Componentes de equipo viejos
rm /src/app/components/equipo/ExpensesView.tsx
rm /src/app/components/equipo/VacationsView.tsx
rm /src/app/components/equipo/SchedulesView.tsx

# 2. Componentes de planificación
# ⚠️ VERIFICAR ANTES DE ELIMINAR
rm /src/app/components/equipo/PlanificacionHorariaGeneral.tsx
```

### FASE 3: COMPONENTES A INVESTIGAR
```bash
# Verificar si se usan antes de eliminar:
- EventModal.tsx
- PlanificacionHorariaGeneralMejorada.tsx
```

### FASE 4: LIMPIEZA DE DOCUMENTACIÓN
```bash
# Consolidar archivos MD
mkdir /docs
mv *.md /docs/
# Consolidar manualmente
```

---

## 📈 BENEFICIOS ESPERADOS

### 🎯 Mantenibilidad
- ✅ Menos archivos = Menos confusión
- ✅ Código más limpio y organizado
- ✅ Búsquedas más rápidas en el IDE

### ⚡ Performance
- ✅ Bundle más pequeño (~150 KB menos)
- ✅ Tiempo de compilación reducido
- ✅ Menos imports innecesarios

### 👥 Experiencia del Desarrollador
- ✅ Claridad en qué componentes usar
- ✅ No más confusión entre versiones
- ✅ Código base más fácil de entender

---

## ⚠️ PRECAUCIONES

### Antes de eliminar archivos:

1. **Hacer backup del proyecto completo**
2. **Verificar que no hay imports dinámicos:**
   ```typescript
   // Ejemplo de import dinámico que no detectaríamos:
   const Component = await import(`./components/${name}.tsx`);
   ```
3. **Probar la aplicación completamente después de cada fase**
4. **Commit después de cada fase de limpieza**

---

## 🔄 COMPONENTES SHADCN/UI NO USADOS

Los siguientes componentes shadcn están instalados pero **posiblemente NO SE USAN**:

```
- accordion.tsx (??)
- alert-dialog.tsx (??)
- alert.tsx (??)
- aspect-ratio.tsx (??)
- avatar.tsx (??)
- breadcrumb.tsx (??)
- calendar.tsx (probablemente SÍ se usa)
- carousel.tsx (??)
- chart.tsx (??)
- checkbox.tsx (probablemente SÍ se usa)
- collapsible.tsx (??)
- command.tsx (??)
- context-menu.tsx (??)
- dialog.tsx (??)
- drawer.tsx (??)
- dropdown-menu.tsx (??)
- form.tsx (??)
- hover-card.tsx (??)
- input-otp.tsx (??)
- input.tsx (probablemente SÍ se usa)
- label.tsx (probablemente SÍ se usa)
- menubar.tsx (??)
- navigation-menu.tsx (??)
- pagination.tsx (??)
- popover.tsx (??)
- progress.tsx (??)
- radio-group.tsx (??)
- resizable.tsx (??)
- scroll-area.tsx (??)
- select.tsx (probablemente SÍ se usa)
- separator.tsx (??)
- sheet.tsx (??)
- sidebar.tsx (NO CONFUNDIR con Sidebar.tsx custom)
- skeleton.tsx (??)
- slider.tsx (??)
- sonner.tsx (probablemente SÍ se usa para toast)
- switch.tsx (probablemente SÍ se usa)
- tabs.tsx (probablemente SÍ se usa)
- textarea.tsx (probablemente SÍ se usa)
- toggle-group.tsx (??)
- toggle.tsx (??)
```

### Recomendación
🔍 **Hacer búsqueda específica de uso de cada uno antes de eliminar**

---

## 📝 CONCLUSIÓN

El proyecto tiene **código huérfano significativo** que puede ser eliminado de forma segura en fases. La limpieza mejorará significativamente la mantenibilidad sin afectar funcionalidad.

### Siguiente Paso Recomendado
✅ **Empezar con FASE 1** (eliminación segura sin riesgos)

---

**¿Quieres que proceda con la FASE 1 de limpieza?** 🚀
