# ✅ REFACTORIZACIÓN MÓDULO SISTEMA - COMPLETADA

**Fecha:** 27 de Enero de 2026  
**Objetivo:** Preparar UX del módulo Sistema para backend real, sin mock data, con feature flags

---

## 🎯 CAMBIOS IMPLEMENTADOS

### 1. **TIPOS GLOBALES ACTUALIZADOS** (`/src/app/types.ts`)

#### ✅ Nuevo: `SystemFlags`
```typescript
export interface SystemFlags {
  multicompany_advanced: boolean;  // Gestión avanzada de múltiples empresas
  multipais: boolean;              // Multipaís (moneda, zona horaria, formatos)
  multilanguage: boolean;          // Multiidioma (i18n)
  security_advanced: boolean;      // Logs de auditoría y seguridad avanzada
}
```

#### ✅ Nuevo: `WorkCenter` (antes solo en mock)
```typescript
export interface WorkCenter {
  id: string;
  name: string;
  type: 'pdv' | 'workCenter';
  address: string;
  city?: string;
  postalCode?: string;
  country: string;
  status: 'active' | 'inactive';
  isCostCenter: boolean;
  companyId: string;
  maxDailyHours?: number;
  timezone?: string;
}
```

#### ✅ Actualizado: `Company`
Ahora incluye:
- `country`, `currency`, `language`, `timezone` (preparado para multipaís)
- `systemFlags?: SystemFlags` (flags de Sistema)
- `rrhhFlags?: RRHHFlags` (flags de RRHH)
- `fiscalName`, `taxId`, `fiscalAddress` (datos legales/fiscales)
- `employees?: Employee[]` (relación)
- `workCenters?: WorkCenter[]` (relación)

#### ✅ Actualizado: `Employee`
- `workCenterId?: string` (antes era `workCenter?: string` - texto libre)
- Ahora apunta a un WorkCenter real

#### ✅ Actualizado: `Alert`
- Agregado `title?: string`
- Agregado `timestamp?: string`

---

### 2. **CONTEXTO GLOBAL REFACTORIZADO** (`/src/app/context/AppContext.tsx`)

#### ✅ Eliminado mock data hardcoded
- Ya no importa `mockUserGerente` ni `mockUserTrabajador`
- Valores por defecto son `null` para mostrar estados vacíos correctos

#### ✅ Actualizado: `AppContextType`
- `currentUser: User | null` (antes era `User`)
- `setCurrentUser: (user: User | null) => void`

#### ✅ Lógica mejorada
- Si usuario no tiene empresas → `currentCompany = null`
- Si se selecciona empresa → `viewMode = 'single'`
- Si se activa Vista Global → `currentCompany = null`
- Al cambiar rol → resetear sección predeterminada

---

### 3. **DATOS DE DESARROLLO** (`/src/app/data/devData.ts`)

#### ✅ Nuevo archivo para simular sesión (SOLO DESARROLLO)

**Funciones disponibles:**

```typescript
setupDevSession()      // Configura usuario de desarrollo con empresa demo
clearDevSession()      // Limpia sesión (para probar estados vacíos)
setupEmptySession()    // Configura usuario sin empresas
```

**Usuario de desarrollo incluye:**
- 1 empresa con plan PREMIUM (todas las flags activas)
- SystemFlags activadas (multipaís, multiidioma, seguridad avanzada)
- RRHHFlags activadas (onboarding, vacaciones, gastos, etc.)
- Sin datos mock de empleados ni centros

⚠️ **IMPORTANTE:** Este archivo se eliminará cuando se conecte el backend real.

---

### 4. **APP.TSX ACTUALIZADO** (`/src/app/App.tsx`)

#### ✅ Setup automático de sesión de desarrollo

```typescript
useEffect(() => {
  const existingUser = localStorage.getItem('udar-current-user');
  
  if (!existingUser) {
    console.log('🔧 Configurando sesión de desarrollo...');
    setupDevSession();
    window.location.reload();
  }
}, []);
```

- Si no hay sesión → configura sesión de desarrollo automáticamente
- En producción, esto se manejará con autenticación real

---

### 5. **HEADER RESPONSIVE REFACTORIZADO** (`/src/app/components/layout/HeaderResponsive.tsx`)

#### ✅ Eliminado import de `mockData`
- Ya no usa `mockAlerts` del archivo mockData

#### ✅ Manejo de estados vacíos
- Si `!currentUser` → no renderiza (debería estar en login)
- Si `!hasCompanies` → botón selector deshabilitado, muestra "Sin empresas"
- Vista Global solo aparece si hay múltiples empresas (>1)

#### ✅ Notificaciones
- Array vacío por defecto (preparado para backend)
- Mensaje: "No hay notificaciones"

---

## 🏗️ ARQUITECTURA BASE vs FLAGS

### ✅ BASE (SIEMPRE ACTIVO)
Estas funcionalidades están siempre presentes:

1. **Empresas**
   - Selector de empresa
   - Vista Global (si >1 empresa y rol gerente)
   - Persistencia en localStorage

2. **Usuarios**
   - Modelo User con companies[]
   - Roles: gerente / trabajador
   - Cambio de rol (simulado)

3. **WorkCenters**
   - Modelo WorkCenter en tipos globales
   - Relación con Company

4. **Seguridad mínima**
   - Restricción por empresa activa
   - Bloqueo Vista Global en módulos operativos

### ✅ FLAGS (SEGÚN PLAN COMERCIAL)

#### SystemFlags
| Flag | UX si activa | UX si desactivada |
|------|--------------|-------------------|
| `multicompany_advanced` | Gestión avanzada múltiples empresas | Oculto |
| `multipais` | Selector país/moneda/idioma | Oculto |
| `multilanguage` | Selector idioma + i18n | Oculto |
| `security_advanced` | Logs auditoría, 2FA | Oculto |

#### RRHHFlags (ya implementadas)
- `onboarding`, `schedules`, `clockin.advanced`, `vacations`, `expenses`, `consumptions`, `jobdescription`, `audit`, `gestoria`, `multicenter`

---

## 🚫 MOCK DATA ELIMINADO

### ❌ Ya NO se usa:
- `mockUserGerente`
- `mockUserTrabajador`
- `mockCompanies` (en header)
- `mockAlerts` (en header)

### ✅ Reemplazo:
- **Desarrollo:** `devData.ts` (temporal, se eliminará)
- **Producción:** Backend API

---

## 📋 ESTADOS VACÍOS IMPLEMENTADOS

### 1. Sin usuario (`currentUser === null`)
- Header no se renderiza
- Debería estar en pantalla de login

### 2. Sin empresas (`currentUser.companies.length === 0`)
- Selector muestra: "Sin empresas"
- Botón selector deshabilitado
- No hay Vista Global disponible

### 3. Sin empresa activa (`currentCompany === null`)
- Módulos operativos muestran `<RestrictedSection />`
- Mensaje: "Selecciona una empresa para continuar"

### 4. Vista Global activa (`viewMode === 'global'`)
- Módulos operativos bloqueados
- Solo módulos analíticos (Dashboard, Finanzas, Informes)

---

## ✅ PREPARACIÓN MULTIPAÍS Y MULTIIDIOMA

### Company preparado para:
- `country`: código país (ES, FR, MX, etc.)
- `currency`: código moneda (EUR, USD, etc.)
- `language`: código idioma (es, en, fr, etc.)
- `timezone`: zona horaria

### WorkCenter preparado para:
- `country`: país del centro
- `timezone`: zona horaria del centro

### Pendiente (no implementado aún):
- Sistema i18n (react-i18next)
- Aplicación de formatos regionales
- Validaciones específicas por país

---

## 🔐 SEGURIDAD Y BLOQUEOS

### ✅ Implementado:
1. **Bloqueo por empresa activa**
   - Si `!currentCompany` → `<RestrictedSection />`
   - Módulos operativos verifican `currentCompany`

2. **Bloqueo Vista Global**
   - Si `viewMode === 'global'` → módulos operativos bloqueados
   - Solo módulos analíticos accesibles

3. **Persistencia localStorage**
   - Se guarda: `currentUser`, `currentCompany`, `viewMode`, `userRole`, `currentSection`

### ⚠️ Pendiente (cuando se conecte backend):
- Autenticación real (login/logout)
- Tokens JWT
- Validación permisos backend
- 2FA
- Logs de auditoría
- Sesiones y expiración

---

## 🎯 FEATURE FLAGS: CÓMO CONSUMIR

### Ejemplo en un componente:

```typescript
import { useApp } from '@/app/context/AppContext';

export function MiComponente() {
  const { currentCompany } = useApp();
  
  // Verificar flag de Sistema
  const hasMultipais = currentCompany?.systemFlags?.multipais ?? false;
  
  // Verificar flag de RRHH
  const hasVacations = currentCompany?.rrhhFlags?.vacations ?? false;
  
  return (
    <div>
      {hasMultipais && (
        <div>Selector de país/moneda</div>
      )}
      
      {hasVacations && (
        <div>Gestión de vacaciones</div>
      )}
    </div>
  );
}
```

### Reglas:
1. **Si flag es `false` → sección NO existe en la UI**
2. **No mostrar mensajes de "Plan no incluye esto"** → directamente ocultar
3. **Flags son booleanos** → sin niveles intermedios

---

## 🧪 CÓMO PROBAR

### Probar con sesión activa (plan PREMIUM):
```typescript
// Ya está configurado por defecto en App.tsx
// Usuario tiene todas las flags activas
```

### Probar estado vacío (sin empresas):
```typescript
// En consola del navegador:
import { setupEmptySession } from './data/devData';
setupEmptySession();
// Recargar página
```

### Probar limpieza total (sin sesión):
```typescript
// En consola del navegador:
import { clearDevSession } from './data/devData';
clearDevSession();
// Recargar página
```

### Simular plan BÁSICO:
```typescript
// Editar devData.ts y cambiar flags a false:
systemFlags: {
  multicompany_advanced: false,
  multipais: false,
  multilanguage: false,
  security_advanced: false,
}
```

---

## 📦 PRÓXIMOS PASOS (INTEGRACIÓN BACKEND)

### 1. Autenticación
- [ ] Pantalla de login
- [ ] Endpoint `/auth/login`
- [ ] Almacenar JWT en cookie httpOnly
- [ ] Refresh token

### 2. Usuarios y Empresas
- [ ] GET `/api/me` → User con companies[]
- [ ] GET `/api/companies/:id` → Company con flags
- [ ] GET `/api/companies/:id/workcenters` → WorkCenter[]

### 3. Feature Flags
- [ ] Flags vienen del backend en Company
- [ ] Sincronización automática
- [ ] Cache en localStorage (opcional)

### 4. Multipaís
- [ ] Aplicar formatos según Company.country
- [ ] Validaciones específicas por país
- [ ] Tipos IVA por país

### 5. Multiidioma
- [ ] Integrar react-i18next
- [ ] Archivos de traducción
- [ ] Cambio dinámico según Company.language

---

## ✅ CHECKLIST DE COMPLETITUD

### Sistema BASE
- [x] Tipos actualizados (SystemFlags, WorkCenter, Company)
- [x] AppContext sin mock data
- [x] Header maneja estados vacíos
- [x] Sesión de desarrollo temporal
- [x] Bloqueo por empresa activa
- [x] Bloqueo Vista Global

### Feature Flags
- [x] SystemFlags definidas
- [x] RRHHFlags existentes
- [x] Estructura en Company
- [x] Ejemplo de consumo

### Preparación Multipaís/Multiidioma
- [x] Campos en Company
- [x] Campos en WorkCenter
- [ ] Sistema i18n (pendiente)
- [ ] Formatos regionales (pendiente)

### Eliminación Mock Data
- [x] AppContext limpio
- [x] Header limpio
- [x] devData.ts temporal (advertido)

---

## 🚨 ADVERTENCIAS

1. **`devData.ts` ES TEMPORAL**
   - Solo para desarrollo
   - Eliminar cuando se conecte backend
   - No commitear en producción

2. **Estados vacíos son correctos**
   - Si no hay empresas → UI muestra "Sin empresas"
   - Si no hay centro → "No hay centros configurados"
   - **NO inventar datos**

3. **Feature flags gobiernan la UX**
   - Flag `false` → sección NO existe
   - No mostrar mensajes "Plan no incluye"
   - Directamente ocultar

4. **WorkCenter ahora es entidad global**
   - Ya no es string libre en Employee
   - Ahora es `workCenterId: string` con validación

---

## 📄 ARCHIVOS MODIFICADOS

```
✅ /src/app/types.ts                          (ACTUALIZADO)
✅ /src/app/context/AppContext.tsx            (REFACTORIZADO)
✅ /src/app/App.tsx                           (ACTUALIZADO)
✅ /src/app/components/layout/HeaderResponsive.tsx  (REFACTORIZADO)
✅ /src/app/data/devData.ts                   (NUEVO - TEMPORAL)
✅ /SISTEMA_REFACTORIZACION_COMPLETADA.md    (NUEVO - DOCUMENTACIÓN)
```

---

## 🎓 CONCLUSIÓN

El Módulo Sistema está ahora preparado para:

1. ✅ Funcionar sin mock data
2. ✅ Consumir feature flags por plan comercial
3. ✅ Manejar multiempresa correctamente
4. ✅ Bloquear Vista Global en módulos operativos
5. ✅ Escalar a multipaís y multiidioma
6. ✅ Conectar con backend real sin romper módulos dependientes

**Estado:** LISTO PARA INTEGRACIÓN BACKEND
