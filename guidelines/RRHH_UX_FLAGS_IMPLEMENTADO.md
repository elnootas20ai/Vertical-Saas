# ✅ MÓDULO EQUIPO Y RRHH - UX PREPARADA PARA FLAGS Y SIN DATOS MOCK

**Fecha:** 27 de Enero de 2026  
**Estado:** ✅ COMPLETADO

---

## 📋 RESUMEN EJECUTIVO

Se ha preparado completamente la UX del módulo **Equipo y RRHH** para soportar el sistema **BASE + FLAGS** definido en el Documento Maestro RRHH v1. El sistema ahora:

✅ **Funciona con RRHH BASE** como núcleo mínimo independiente  
✅ **Soporta FLAGS** que activan/desactivan funcionalidades según plan comercial  
✅ **Elimina todos los datos mock** del flujo de visualización  
✅ **Degrada correctamente** cuando una funcionalidad no está activa  
✅ **Mantiene coherencia multiempresa** sin romper flujos  

---

## 🎯 CAMBIOS IMPLEMENTADOS

### 1️⃣ SISTEMA DE FLAGS EN TIPOS

**Archivo:** `/src/app/types.ts`

Se ha definido la interfaz `RRHHFlags` con todas las funcionalidades controlables:

```typescript
export interface RRHHFlags {
  onboarding: boolean;        // Flujo de onboarding completo
  schedules: boolean;         // Planificación horaria
  'clockin.advanced': boolean; // Fichaje con GEO y dispositivo
  vacations: boolean;         // Gestión de vacaciones
  expenses: boolean;          // Gestión de gastos
  consumptions: boolean;      // Gestión de consumos
  jobdescription: boolean;    // Job Description
  audit: boolean;             // Historial y auditoría
  gestoria: boolean;          // Gestoría
  multicenter: boolean;       // Multi-centro
}
```

La interfaz `Company` ahora incluye:
- `rrhhFlags?: RRHHFlags` - Flags de funcionalidades RRHH
- `employees?: Employee[]` - Empleados reales (no mock)

---

### 2️⃣ MÓDULO EQUIPO - TABS DINÁMICAS

**Archivo:** `/src/app/components/sections/Equipo.tsx`

#### ✅ ANTES (problema):
- Todas las tabs hardcoded
- Importaba `mockEmployees` directamente
- No verificaba flags
- Datos mock mezclados con lógica

#### ✅ AHORA (solución):
- **Tabs renderizadas condicionalmente** según FLAGS
- **Datos obtenidos de `currentCompany.employees`** (no mock)
- **Empty State** cuando no hay empleados
- **Fallback seguro** cuando flag se desactiva

```typescript
// 🎯 TABS DINÁMICAS SEGÚN FLAGS
const subSections = [
  // ✅ BASE: siempre visible
  { id: 'team' as SubSection, label: 'Equipo', icon: Users, isBase: true },
  // 🚩 FLAGS: solo si están activas
  rrhhFlags.schedules && { id: 'schedules' as SubSection, label: 'Horarios', icon: Calendar, isBase: false },
  // ✅ Fichajes BASE siempre visible
  { id: 'fichajes' as SubSection, label: 'Fichajes', icon: Clock, isBase: true },
  rrhhFlags.vacations && { id: 'vacations' as SubSection, label: 'Vacaciones', icon: Plane, isBase: false },
  rrhhFlags.consumptions && { id: 'consumos' as SubSection, label: 'Consumos', icon: ShoppingCart, isBase: false },
  rrhhFlags.expenses && { id: 'expenses' as SubSection, label: 'Gastos', icon: Receipt, isBase: false },
].filter(Boolean);
```

#### 🚫 EMPTY STATE implementado:
```typescript
{employees.length === 0 && (
  <EmptyState
    icon={Users}
    title="No hay trabajadores registrados"
    description="Comienza añadiendo tu primer trabajador al equipo..."
    actionLabel="Añadir Trabajador"
    onAction={() => setShowAddModal(true)}
  />
)}
```

---

### 3️⃣ EMPLOYEE DETAIL PANEL - TABS DINÁMICAS

**Archivo:** `/src/app/components/equipo/EmployeeDetailPanel.tsx`

#### ✅ Cambios clave:
- **Nueva prop:** `rrhhFlags?: RRHHFlags`
- **Tabs renderizadas condicionalmente**
- **Validación de tab activa** (si se desactiva flag, vuelve a 'info')

```typescript
const tabs = [
  // ✅ BASE: siempre visible
  { id: 'info' as const, label: 'Información', icon: User, isBase: true },
  // 🚩 FLAG: Horarios
  flags.schedules && { id: 'schedule' as const, label: 'Horarios', icon: Calendar, isBase: false },
  // ✅ BASE: Fichajes (siempre visible)
  { id: 'attendance' as const, label: 'Fichaje', icon: ClipboardCheck, isBase: true },
  // 🚩 FLAG: Vacaciones
  flags.vacations && { id: 'vacation' as const, label: 'Vacaciones', icon: Plane, isBase: false },
  // ✅ BASE: Documentación (siempre visible)
  { id: 'documents' as const, label: 'Documentación', icon: FileText, isBase: true },
  // ✅ BASE: Permisos (siempre visible)
  { id: 'permissions' as const, label: 'Permisos', icon: Shield, isBase: true },
  // 🚩 FLAG: Job Description
  flags.jobdescription && { id: 'job-description' as const, label: 'Descripción Puesto', icon: Briefcase, isBase: false },
  // 🚩 FLAG: Historial/Auditoría
  flags.audit && { id: 'history' as const, label: 'Historial', icon: History, isBase: false },
].filter(Boolean);
```

#### 🔄 Degradación automática:
```typescript
// Si la tab activa ya no está disponible (flag desactivada), volver a 'info'
const isActiveTabAvailable = tabs.some(t => t.id === activeTab);
if (!isActiveTabAvailable && activeTab !== 'info') {
  setActiveTab('info');
}
```

---

### 4️⃣ DATOS MOCK - PREPARADOS PARA BACKEND

**Archivo:** `/src/app/data/mockData.ts`

#### ✅ Cambios implementados:
- **Flags de ejemplo** en cada empresa mock
- **`employees: []`** (array vacío = sin datos hardcoded)
- **Ejemplos de 3 planes:**
  - **La Buena Mesa:** Plan PREMIUM (todas las flags activas)
  - **AutoTaller Pro:** Plan BÁSICO (pocas flags activas)
  - **Construcciones Norte:** Plan INTERMEDIO

```typescript
{
  id: '1',
  name: 'La Buena Mesa',
  vertical: 'delivery',
  color: '#FF6B35',
  // 🚀 Ejemplo: Plan PREMIUM (todas las flags activas)
  rrhhFlags: {
    onboarding: true,
    schedules: true,
    'clockin.advanced': true,
    vacations: true,
    expenses: true,
    consumptions: true,
    jobdescription: true,
    audit: true,
    gestoria: true,
    multicenter: true,
  },
  // ✅ Employees reales (array vacío = sin datos mock)
  employees: [],
}
```

**⚠️ NOTA IMPORTANTE:**  
El array `mockEmployees` AÚN EXISTE en el archivo pero **YA NO SE USA** en `Equipo.tsx`. Ahora se obtienen los empleados desde `currentCompany.employees`.

---

## 📊 FUNCIONALIDADES BASE vs FLAG

### ✅ FUNCIONALIDADES BASE (siempre activas)

Estas funcionalidades **NUNCA** desaparecen, sin importar el plan:

| Funcionalidad | Ubicación | Descripción |
|--------------|-----------|-------------|
| **Listado de trabajadores** | Tab "Equipo" | Siempre visible |
| **Alta/edición de trabajador** | Modal | Siempre disponible |
| **Datos personales y laborales** | Detalle empleado | Siempre visible |
| **Fichajes legales** | Tab "Fichajes" | Entrada, salida, historial |
| **Documentación básica** | Tab "Documentación" | Contratos, DNI, IBAN |
| **Roles y permisos** | Tab "Permisos" | Siempre visible |
| **Chat gerente ↔ trabajador** | Botón mensaje | Siempre disponible |

### 🚩 FUNCIONALIDADES FLAG (controladas por plan)

Estas funcionalidades **solo aparecen** si su flag está activa:

| Flag | Tab/Sección | Visible si |
|------|-------------|------------|
| `schedules` | Tab "Horarios" | `rrhhFlags.schedules === true` |
| `vacations` | Tab "Vacaciones" | `rrhhFlags.vacations === true` |
| `expenses` | Tab "Gastos" | `rrhhFlags.expenses === true` |
| `consumptions` | Tab "Consumos" | `rrhhFlags.consumptions === true` |
| `jobdescription` | Tab "Descripción Puesto" | `rrhhFlags.jobdescription === true` |
| `audit` | Tab "Historial" | `rrhhFlags.audit === true` |
| `onboarding` | Flujo onboarding | `rrhhFlags.onboarding === true` |
| `gestoria` | Sección gestoría | `rrhhFlags.gestoria === true` |
| `clockin.advanced` | GEO, dispositivo | `rrhhFlags['clockin.advanced'] === true` |
| `multicenter` | Multi-centro UI | `rrhhFlags.multicenter === true` |

---

## 🔄 FLUJO DE DEGRADACIÓN

### Escenario 1: Flag se desactiva mientras usuario está en esa tab

```typescript
// Usuario está en tab "Vacaciones"
activeTab = 'vacation'

// Backend actualiza: rrhhFlags.vacations = false

// Sistema detecta que la tab ya no está disponible
const isActiveTabAvailable = tabs.some(t => t.id === activeTab);
if (!isActiveTabAvailable) {
  setActiveTab('info'); // ✅ Vuelve a tab BASE "Información"
}
```

**Resultado:** UX no se rompe, usuario ve tab "Información" automáticamente.

---

### Escenario 2: Empresa sin empleados

```typescript
employees.length === 0 // true

// ✅ Se muestra EmptyState
<EmptyState
  icon={Users}
  title="No hay trabajadores registrados"
  description="Comienza añadiendo tu primer trabajador al equipo..."
  actionLabel="Añadir Trabajador"
  onAction={() => setShowAddModal(true)}
/>
```

**Resultado:** UX clara, no se muestran tablas vacías sin explicación.

---

### Escenario 3: Vista Global activa

```typescript
if (viewMode === 'global') {
  return (
    <RestrictedSection
      title="Gestión de Equipo no disponible en Vista Global"
      description="Selecciona una empresa del selector para acceder..."
      icon={Users}
    />
  );
}
```

**Resultado:** Multiempresa protegido correctamente.

---

## 🚀 PRÓXIMOS PASOS (BACKEND)

### 1️⃣ Conectar employees reales

```typescript
// ACTUAL (mock):
const employees = currentCompany?.employees || [];

// FUTURO (backend):
const { data: employees, isLoading } = useQuery({
  queryKey: ['employees', currentCompany?.id],
  queryFn: () => api.getEmployees(currentCompany?.id),
  enabled: !!currentCompany?.id,
});

if (isLoading) {
  return <LoadingSpinner />;
}

if (!employees || employees.length === 0) {
  return <EmptyState ... />;
}
```

### 2️⃣ Verificar flags desde backend

```typescript
// ACTUAL (mock):
const rrhhFlags = currentCompany?.rrhhFlags || defaultFlags;

// FUTURO (backend):
const { data: companyPlan } = useQuery({
  queryKey: ['company-plan', currentCompany?.id],
  queryFn: () => api.getCompanyPlan(currentCompany?.id),
});

const rrhhFlags = companyPlan?.rrhhFlags || defaultFlags;
```

### 3️⃣ Persistir cambios de empleados

```typescript
// Alta de empleado
const mutation = useMutation({
  mutationFn: (employeeData) => api.createEmployee(employeeData),
  onSuccess: () => {
    queryClient.invalidateQueries(['employees', currentCompany?.id]);
  },
});
```

---

## 📝 CHECKLIST DE VALIDACIÓN

### ✅ Sistema de FLAGS
- [x] Interfaz `RRHHFlags` definida en types
- [x] Tabs renderizadas condicionalmente en Equipo
- [x] Tabs renderizadas condicionalmente en EmployeeDetailPanel
- [x] Validación de tab activa cuando flag se desactiva
- [x] Ejemplos de flags en mockData (3 planes diferentes)

### ✅ Eliminación de MOCK DATA
- [x] `Equipo.tsx` no importa `mockEmployees`
- [x] Datos obtenidos desde `currentCompany.employees`
- [x] Array `employees` vacío por defecto en mockData
- [x] Empty State cuando no hay empleados

### ✅ Degradación Correcta
- [x] Tabs desaparecen si flag está OFF
- [x] Fallback a tab BASE si tab activa se desactiva
- [x] Empty State implementado
- [x] RestrictedSection para Vista Global

### ✅ Multiempresa
- [x] Verifica `viewMode === 'global'`
- [x] Muestra RestrictedSection cuando corresponde
- [x] Datos filtrados por `currentCompany?.id`

---

## 🎨 UX ACTUALIZADA

### Antes (❌ Problemas)
- Tabs siempre visibles (aunque funcionalidad no esté activa)
- Datos mock hardcoded
- Sin estados vacíos
- No degradaba cuando flag se desactivaba

### Ahora (✅ Solución)
- **Tabs dinámicas** según FLAGS
- **Datos reales** desde `currentCompany.employees`
- **Empty States** claros cuando no hay datos
- **Degradación automática** si flag se desactiva
- **UX coherente** entre Equipo y EmployeeDetailPanel

---

## 🔍 ARQUITECTURA FINAL

```
┌─────────────────────────────────────────────┐
│         Company (con rrhhFlags)             │
│  - employees: Employee[]                    │
│  - rrhhFlags: RRHHFlags                     │
└─────────────────┬───────────────────────────┘
                  │
                  ├─► Equipo.tsx
                  │   ├─ Obtiene employees desde Company
                  │   ├─ Verifica rrhhFlags
                  │   ├─ Renderiza tabs dinámicamente
                  │   └─ Muestra EmptyState si employees.length === 0
                  │
                  └─► EmployeeDetailPanel.tsx
                      ├─ Recibe rrhhFlags como prop
                      ├─ Renderiza tabs dinámicamente
                      ├─ Valida tab activa
                      └─ Degrada a 'info' si tab desactivada
```

---

## 🎓 REGLAS IMPLEMENTADAS

### ✅ RRHH BASE funciona solo
- Equipo, Fichajes, Documentación, Permisos siempre visibles
- No depende de ninguna flag

### ✅ FLAGS activan/desactivan secciones
- Tabs solo aparecen si flag está activa
- No se rompe UX cuando flag se desactiva

### ✅ NO hay datos mock en flujo
- `employees` viene de `currentCompany.employees`
- Si está vacío, se muestra EmptyState

### ✅ UX degrada correctamente
- Fallback automático a tabs BASE
- Estados vacíos claros
- Sin pantallas rotas

### ✅ Coherencia multiempresa
- Vista Global protegida con RestrictedSection
- Datos filtrados por empresa activa

---

## 📦 ARCHIVOS MODIFICADOS

1. **`/src/app/types.ts`**  
   - ✅ Añadida interfaz `RRHHFlags`
   - ✅ Extendida interfaz `Company`

2. **`/src/app/components/sections/Equipo.tsx`**  
   - ✅ Tabs dinámicas según FLAGS
   - ✅ Eliminado import de `mockEmployees`
   - ✅ Añadido EmptyState
   - ✅ Datos desde `currentCompany.employees`

3. **`/src/app/components/equipo/EmployeeDetailPanel.tsx`**  
   - ✅ Nueva prop `rrhhFlags`
   - ✅ Tabs dinámicas según FLAGS
   - ✅ Validación de tab activa
   - ✅ Import de `RRHHFlags` desde types

4. **`/src/app/data/mockData.ts`**  
   - ✅ Flags de ejemplo en empresas mock
   - ✅ `employees: []` por defecto

---

## ✅ RESULTADO FINAL

El módulo Equipo y RRHH está **100% preparado** para:

🚀 **Funcionar con RRHH BASE** sin dependencias  
🚩 **Soportar FLAGS** por plan comercial  
🚫 **NO mostrar datos mock** en la UI  
🔄 **Degradar correctamente** cuando flags cambian  
🏢 **Mantener coherencia** multiempresa  

**El sistema está listo para conectarse al backend real.**

---

**Documento generado:** 27/01/2026  
**Estado:** ✅ COMPLETADO Y VALIDADO
