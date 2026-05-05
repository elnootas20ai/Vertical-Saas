# TOUR DE BIENVENIDA / ONBOARDING — Diseño de Tickets

**Página:** `/saas/onboarding`  
**Objetivo:** Guiar el alta inicial del negocio según la vertical y módulos contratados, dejando el sistema listo para operar.  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Flujo 1: Wizard de registro (`/auth/onboarding/*`) — COMPLETO

| Paso | Componente | Qué recoge |
|---|---|---|
| 1. Tipo de negocio | `BusinessType.tsx` | `businessType` — 22 verticales definidas |
| 2. Datos empresa | `Company.tsx` | `companyProfile` — nombre comercial, fiscal, CIF, provincia, dirección, email, teléfono |
| 3. Estructura | `Structure.tsx` | `businessMetrics` — nº usuarios, nº ubicaciones |
| 4. Necesidades | `Needs.tsx` | `requestedModules` — inventory, sales, CRM, documentation, analytics, workshop |
| 5. Recomendación plan | `Recommendation.tsx` | `subscriptionSelection` — plan recomendado, billing mensual/anual |
| 6. Pago | `PaymentInfo.tsx` | `paymentDetails` — tarjeta + activación trial 14 días |
| 7. Confirmación | `Confirmation.tsx` | Animación + redirect a `/saas/dashboard` |

- **Contexto:** `OnboardingContext.tsx` — estado en `localStorage` + sync con backend CouchDB (debounce 800ms)
- **Backend:** `GET/PUT /api/auth/profile/:userId/onboarding` — campos `onboardingCompleted` + `onboardingData` en documento `account:*`
- **Modelo:** `OnboardingData` con `completedStep`, `businessType`, `companyProfile`, `businessMetrics`, `requestedModules`, `subscriptionSelection`, `paymentDetails`, `trial`

### Flujo 2: Tour guiado post-login (`OnboardingTour.tsx`) — PARCIAL

| Aspecto | Estado |
|---|---|
| Modal con 7 pasos fijos (Bienvenida → Primera venta → Listo) | Funcional |
| Navegación por pasos con dots y progress bar | Funcional |
| Redirige a rutas relevantes (settings, clients, catalog, sales) | Funcional |
| Persistencia en `localStorage` (`vertial_onboarding_completed`) | Funcional |
| Pasos dinámicos según vertical | **NO** — siempre muestra los mismos 7 pasos |
| Pasos condicionales según módulos contratados (TPV, stock, CRM) | **NO** |
| Persistencia en backend | **NO** — solo `localStorage` |
| Verificación real de completitud por paso | **NO** — solo avanza por click |

### Flujo 3: Onboarding trabajador (`WorkerOnboarding.tsx`) — BÁSICO

| Aspecto | Estado |
|---|---|
| Checklist 6 pasos (empresa, equipo, seguridad, docs, formación, herramientas) | UI funcional |
| Toggle manual de completitud | Funcional |
| Persistencia en backend | **NO** — solo `useState` local |
| Conexión con datos reales del sistema | **NO** — estados hardcodeados |

### Sistemas relevantes que YA existen

| Sistema | Ruta/Archivo | BD |
|---|---|---|
| Datos de empresa (business) | `businessRouter.js` / `businessController.js` | CouchDB `accounts` |
| Equipo (team members) | `orgchartRouter.js` / Team.tsx | CouchDB `accounts` |
| Ubicaciones / Sedes | `locationsRouter.js` / `locationsController.js` | CouchDB `*-locations` |
| Clientes | `clientsRouter.js` / `ClientsPage.tsx` | CouchDB `*-clients` (o similar) |
| Catálogo | `catalogConfigRouter.js` / `CatalogPage.tsx` | CouchDB `*-catalog` |
| Config catálogo por vertical | `models/verticalCatalog.js` | 22 verticales con features flags |
| TPV | `TpvPage.tsx`, `TpvContext.tsx` | Rutas `tpv/*` |
| Motor de alertas | `services/alertEngine.js` | CouchDB `notifications` |
| Notificaciones | `notificationRouter.js` | CouchDB `notifications` |
| Push + SSE | `pushRouter.js`, `sseRouter.js` | — |

### Lo que FALTA para el onboarding solicitado

| Funcionalidad | Estado |
|---|---|
| Página `/saas/onboarding` como hub de setup operativo | **No existe** |
| Modelo de progreso de setup (distinto del wizard de auth) | **No existe** |
| Motor de pasos dinámicos según vertical + módulos contratados | **No existe** |
| Paso: verificar/completar datos de empresa | **No existe** (auth recoge datos pero no valida completitud) |
| Paso: crear trabajadores iniciales con invitación | **No existe** como paso guiado |
| Paso: crear sedes / PDV | **No existe** como paso guiado |
| Paso: importar/crear clientes iniciales (si CRM activo) | **No existe** como paso guiado |
| Paso: crear catálogo/stock inicial (si stock activo) | **No existe** como paso guiado |
| Paso: configurar TPV (si TPV contratado) | **No existe** como paso guiado |
| Paso: verificación de módulos activos configurados | **No existe** |
| Email de bienvenida trial 14 días | **No existe** |
| Alerta: onboarding incompleto | **No existe** |
| Alerta: módulo activo sin configurar | **No existe** |
| Alerta: trabajador inicial no creado | **No existe** |
| Conexión Dashboard ↔ Onboarding (widget de progreso) | **No existe** |

---

## Mapa de verticales → pasos condicionales

Cada vertical activa distintas features en `verticalCatalog.js`. Esto determina qué pasos se muestran:

| Vertical | Stock | Proveedor | TPV/PDV | CRM relevante | Pasos extra |
|---|---|---|---|---|---|
| delivery | Si | Si | Si | Si | Alérgenos, carta digital |
| hairSalon | No | No | No | Si | Servicios + duración |
| gym | Si | No | No | Si | Clases + capacidad |
| clinic | Si | Si | No | Si | Especialidades + citas |
| vet | Si | Si | No | Si | Especies + citas |
| hotel | Si | No | Si | Si | Habitaciones + amenities |
| workshop | Si | Si | No | Si | Repuestos + vehículos compatibles |
| carDealership | Si | Si | No | Si | Vehículos + financiación |
| cleaning | Si | No | No | Si | Servicios + personal |
| events | No | Si | No | Si | Paquetes + capacidad |
| construction | Si | Si | No | No | Materiales + obras |
| academy | No | No | No | Si | Cursos + plazas |
| realEstate | No | No | No | Si | Inmuebles |
| lawyer | No | No | No | No | Expedientes |
| nightclub | Si | Si | Si | No | Alérgenos, carta |
| pharmacy | Si | Si | No | No | Código Nacional + receta |
| taxi | No | No | No | No | Trayectos |
| carWash | Si | No | No | No | Servicios |
| scrapyard | Si | No | No | No | Piezas + estado |
| spareParts | Si | Si | No | No | Recambios |
| tobaccoShop | Si | No | No | No | — |
| butcherShop | Si | No | No | No | — |

---

## TICKETS

---

### TICKET OB-01: Modelo de datos — `setup_progress` (progreso del onboarding operativo)

**Tipo:** Backend + API Client  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto
El wizard de auth (`/auth/onboarding/*`) recoge preferencias comerciales (vertical, plan, pago). Pero una vez dentro del SaaS, el usuario necesita completar la configuración operativa real: crear equipo, sedes, clientes, catálogo, etc. Este progreso debe vivir como documento separado en CouchDB para no mezclar con el `onboardingData` existente.

#### Qué hacer

**1. Definir tipo de documento CouchDB en la BD de cuentas (`accounts`)**

```typescript
interface SetupStep {
  key: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  skipped: boolean;
  skippedAt: string | null;
  metadata: Record<string, unknown>;
}

interface SetupProgress {
  _id: string;                // setup_progress:{user_id}
  _rev?: string;
  type: 'setup_progress';
  user_id: string;
  business_id: string;
  businessType: string;       // vertical elegida
  requestedModules: {         // módulos contratados (copiados del auth onboarding)
    inventory: boolean;
    sales: boolean;
    crm: boolean;
    documentation: boolean;
    analytics: boolean;
    workshop: boolean;
  };
  steps: SetupStep[];
  overallCompleted: boolean;
  overallCompletedAt: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  welcomeEmailSent: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**2. Builder + sanitizer en `services/couchdb.js`**

- `buildSetupProgressDocument(userId, businessId, businessType, requestedModules)` — Construye el documento con los pasos calculados según vertical y módulos (usa la lógica del ticket OB-02)
- `sanitizeSetupProgress(doc)` — Limpieza y validación
- `findSetupProgressByUserId(userId)` — Busca el progreso existente
- `saveSetupProgress(userId, data)` — Guarda/actualiza

**3. Router `routers/setupProgressRouter.js`**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/:userId` | Obtener progreso actual (o crearlo si no existe) |
| `PUT` | `/:userId/step/:stepKey` | Marcar paso como completado |
| `PUT` | `/:userId/step/:stepKey/skip` | Marcar paso como saltado |
| `PUT` | `/:userId/reset` | Reiniciar progreso completo |
| `GET` | `/:userId/status` | Resumen: % completado, pasos pendientes, días trial restantes |

**4. Montar en `index.js`**

```javascript
app.use('/api/setup-progress', requireAuth, burstLimiter, planAwareLimiter, setupProgressRouter);
```

**5. API Client TypeScript**

Crear `src/app/lib/setupProgressApi.ts`:

```typescript
export interface SetupStep {
  key: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  skipped: boolean;
  skippedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface SetupProgress {
  steps: SetupStep[];
  overallCompleted: boolean;
  businessType: string;
  requestedModules: Record<string, boolean>;
  trialStartDate: string | null;
  trialEndDate: string | null;
  welcomeEmailSent: boolean;
}

export interface SetupStatus {
  percentComplete: number;
  pendingSteps: string[];
  trialDaysRemaining: number;
  overallCompleted: boolean;
}

export function getSetupProgressRequest(userId: string): Promise<SetupProgress>;
export function completeStepRequest(userId: string, stepKey: string, metadata?: Record<string, unknown>): Promise<SetupProgress>;
export function skipStepRequest(userId: string, stepKey: string): Promise<SetupProgress>;
export function resetSetupProgressRequest(userId: string): Promise<SetupProgress>;
export function getSetupStatusRequest(userId: string): Promise<SetupStatus>;
```

#### Criterios de aceptación
- El documento se crea automáticamente la primera vez que se accede a `/saas/onboarding`
- Los pasos se calculan dinámicamente según `businessType` + `requestedModules`
- Marcar un paso como completado actualiza `overallCompleted` si todos los requeridos están listos
- `GET /status` devuelve correctamente el porcentaje y días de trial restantes
- Si el documento ya existe, no se sobreescribe al volver a acceder

---

### TICKET OB-02: Motor de pasos dinámicos según vertical y módulos

**Tipo:** Backend + Frontend (lógica compartida)  
**Prioridad:** Crítica  
**Dependencias:** OB-01

#### Contexto
Cada vertical necesita pasos distintos. Un restaurante necesita carta y alérgenos; un abogado no necesita stock. Los módulos contratados (TPV, CRM, stock) también determinan qué pasos mostrar. Esta lógica debe vivir en un único lugar reutilizable por backend (al crear el `setup_progress`) y frontend (para renderizar la UI).

#### Qué hacer

**1. Crear `models/setupSteps.js` (shared, importable desde backend y frontend)**

```javascript
export const SETUP_STEP_DEFINITIONS = {
  company_profile: {
    key: 'company_profile',
    title: 'Datos de empresa',
    description: 'Completa el perfil de tu negocio: nombre, CIF, dirección y contacto',
    icon: 'Building2',
    route: '/saas/settings/empresas',
    category: 'base',
    required: true,
    appliesTo: { verticals: 'all', modules: [] },
    order: 1,
  },
  initial_team: {
    key: 'initial_team',
    title: 'Invita a tu equipo',
    description: 'Añade a los trabajadores que van a usar la plataforma',
    icon: 'Users',
    route: '/saas/team',
    category: 'base',
    required: true,
    appliesTo: { verticals: 'all', modules: [] },
    order: 2,
  },
  locations: {
    key: 'locations',
    title: 'Sedes y puntos de venta',
    description: 'Configura tus ubicaciones físicas: oficinas, tiendas, almacenes',
    icon: 'MapPin',
    route: '/saas/locations',
    category: 'base',
    required: true,
    appliesTo: { verticals: 'all', modules: [] },
    order: 3,
  },
  initial_clients: {
    key: 'initial_clients',
    title: 'Sube tus clientes',
    description: 'Importa tu base de clientes desde Excel o crea los primeros manualmente',
    icon: 'Users',
    route: '/saas/clients',
    category: 'crm',
    required: false,
    appliesTo: { verticals: 'all', modules: ['crm'] },
    order: 4,
  },
  catalog_setup: {
    key: 'catalog_setup',
    title: 'Crea tu catálogo',
    description: 'Da de alta productos o servicios con precios, categorías e impuestos',
    icon: 'Package',
    route: '/saas/catalog',
    category: 'stock',
    required: false,
    appliesTo: {
      verticals: [
        'delivery', 'gym', 'clinic', 'vet', 'hotel', 'workshop',
        'carDealership', 'cleaning', 'nightclub', 'pharmacy',
        'carWash', 'scrapyard', 'spareParts', 'construction',
        'tobaccoShop', 'butcherShop',
      ],
      modules: ['inventory'],
    },
    order: 5,
  },
  stock_initial: {
    key: 'stock_initial',
    title: 'Stock inicial',
    description: 'Registra el inventario actual para empezar con cifras reales',
    icon: 'Warehouse',
    route: '/saas/articles',
    category: 'stock',
    required: false,
    appliesTo: {
      verticals: [
        'delivery', 'gym', 'clinic', 'vet', 'hotel', 'workshop',
        'carDealership', 'nightclub', 'pharmacy', 'carWash',
        'scrapyard', 'spareParts', 'construction', 'cleaning',
        'tobaccoShop', 'butcherShop',
      ],
      modules: ['inventory'],
    },
    order: 6,
  },
  tpv_config: {
    key: 'tpv_config',
    title: 'Configura el TPV',
    description: 'Prepara tu punto de venta: caja, métodos de pago y ticket',
    icon: 'Monitor',
    route: '/saas/tpv',
    category: 'tpv',
    required: false,
    appliesTo: {
      verticals: ['delivery', 'hotel', 'nightclub'],
      modules: ['sales'],
    },
    order: 7,
  },
  crm_pipeline: {
    key: 'crm_pipeline',
    title: 'Configura tu pipeline comercial',
    description: 'Define las etapas de tu embudo de ventas para gestionar leads',
    icon: 'Kanban',
    route: '/saas/pipeline',
    category: 'crm',
    required: false,
    appliesTo: {
      verticals: [
        'carDealership', 'realEstate', 'events', 'construction',
        'academy', 'clinic', 'vet', 'hotel',
      ],
      modules: ['crm'],
    },
    order: 8,
  },
  workshop_config: {
    key: 'workshop_config',
    title: 'Configura el taller',
    description: 'Prepara categorías de reparación, tarifas de mano de obra y plantillas',
    icon: 'Wrench',
    route: '/saas/workshop',
    category: 'workshop',
    required: false,
    appliesTo: {
      verticals: ['workshop', 'carDealership'],
      modules: ['workshop'],
    },
    order: 9,
  },
  document_numbering: {
    key: 'document_numbering',
    title: 'Numeración de documentos',
    description: 'Define la serie y numeración de facturas, presupuestos y albaranes',
    icon: 'FileText',
    route: '/saas/settings/numeracion',
    category: 'base',
    required: false,
    appliesTo: { verticals: 'all', modules: [] },
    order: 10,
  },
  first_operation: {
    key: 'first_operation',
    title: 'Realiza tu primera operación',
    description: 'Crea una venta, presupuesto u orden de trabajo de prueba',
    icon: 'Rocket',
    route: '/saas/sales',
    category: 'base',
    required: false,
    appliesTo: { verticals: 'all', modules: [] },
    order: 11,
  },
};
```

**2. Función `computeSetupSteps(businessType, requestedModules)`**

Lógica que filtra `SETUP_STEP_DEFINITIONS` según:
- `appliesTo.verticals` — `'all'` incluye todas; array filtra por `businessType`
- `appliesTo.modules` — array vacío = siempre visible; con valores = al menos uno de los módulos debe estar activo en `requestedModules`
- Combina ambos criterios con AND: la vertical debe aplicar Y al menos un módulo debe estar activo (si se especifican módulos)
- Ordena por campo `order`
- Devuelve array de `SetupStep` con `completed: false, skipped: false` por defecto

**3. Exponer desde backend**

- Importar `computeSetupSteps` en `buildSetupProgressDocument` (OB-01) para generar los steps iniciales
- Endpoint `GET /api/setup-progress/:userId/available-steps` que devuelve los pasos disponibles sin crear documento (útil para preview)

**4. Exponer desde frontend**

- Crear `src/app/lib/setupSteps.ts` que re-exporta tipos e importa las definiciones
- Hook `useSetupSteps()` que lee `businessType` y `requestedModules` del contexto y devuelve los pasos aplicables

#### Criterios de aceptación
- Un restaurante (`delivery`) con todos los módulos activos ve: empresa, equipo, sedes, clientes, catálogo, stock, TPV, numeración, primera operación
- Un abogado (`lawyer`) sin stock ni CRM ve: empresa, equipo, sedes, numeración, primera operación
- Un taller (`workshop`) con CRM e inventario ve: empresa, equipo, sedes, clientes, catálogo, stock, pipeline CRM, config taller, numeración, primera operación
- La función es determinista: mismos inputs → mismos pasos
- Los pasos opcionales se pueden saltar sin bloquear el progreso

---

### TICKET OB-03: Contexto React — `SetupProgressContext`

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Dependencias:** OB-01, OB-02

#### Contexto
La página de onboarding y otros componentes (Dashboard, Sidebar) necesitan acceder al estado del setup. Un contexto centralizado evita llamadas redundantes y mantiene el estado sincronizado.

#### Qué hacer

**1. Crear `src/app/context/SetupProgressContext.tsx`**

```typescript
interface SetupProgressContextType {
  progress: SetupProgress | null;
  status: SetupStatus | null;
  loading: boolean;
  error: string | null;
  completeStep: (stepKey: string, metadata?: Record<string, unknown>) => Promise<void>;
  skipStep: (stepKey: string) => Promise<void>;
  resetProgress: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

- Carga progreso al montar si hay `userId`
- Expone funciones para completar/saltar pasos (llaman a la API y actualizan estado)
- Calcula `status` localmente (% completado, pasos pendientes, días trial)
- Refresco automático al volver a la pestaña (`visibilitychange`)

**2. Montar `SetupProgressProvider` en `SaasRoot`**

Envolver el layout SaaS para que esté disponible en todas las páginas internas.

**3. Hook `useSetupProgress()`**

Atajo para consumir el contexto con validación de que está dentro del provider.

#### Criterios de aceptación
- El contexto carga el progreso al montar y expone `loading` mientras resuelve
- `completeStep` actualiza el estado local inmediatamente (optimistic) y sincroniza con backend
- Si la llamada falla, revierte el estado local y muestra `error`
- `status.percentComplete` se recalcula correctamente al completar/saltar pasos
- No hace peticiones si no hay `userId`

---

### TICKET OB-04: Página principal — `/saas/onboarding`

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Dependencias:** OB-01, OB-02, OB-03

#### Contexto
Esta es la página central del onboarding operativo. El usuario la ve tras completar el wizard de auth y entrar al SaaS por primera vez. Es un checklist visual con barra de progreso que guía paso a paso la puesta en marcha.

#### Qué hacer

**1. Crear `src/app/pages/saas/SetupOnboarding.tsx`**

Layout con tres secciones:

**A. Cabecera de bienvenida**
- Saludo personalizado: "¡Hola, {nombre}! Vamos a preparar {nombreEmpresa}"
- Badge de trial: "Te quedan X días de prueba gratuita"
- Barra de progreso global (% completado con animación)
- Contador: "X de Y pasos completados"

**B. Lista de pasos (checklist)**
- Cada paso es una tarjeta expandible con:
  - Icono (del `SETUP_STEP_DEFINITIONS`)
  - Título y descripción
  - Estado visual: pendiente (gris), en progreso (amber), completado (verde), saltado (gris tachado)
  - Badge "Requerido" si `required: true`
  - Badge de categoría (Base, CRM, Stock, TPV, Taller)
  - Botón "Ir a configurar" que navega a la `route` del paso
  - Botón "Saltar" para pasos opcionales
  - Al expandir: mini-guía contextual de qué hacer (2-3 líneas + enlace)
- Agrupación visual por categoría con separadores: "Configuración base", "CRM y clientes", "Stock y catálogo", "TPV", "Taller"

**C. Panel lateral / footer**
- Resumen del plan contratado (nombre, precio, billing)
- Vertical seleccionada con icono
- Módulos activos como pills/badges
- Enlace "¿Necesitas ayuda?" → HelpCenter
- Botón "Saltar todo e ir al Dashboard" (marca onboarding como saltado)

**2. Registrar ruta en `routes.tsx`**

```typescript
{ path: 'onboarding', Component: SetupOnboarding }
```

Dentro del bloque `saas/*`, al mismo nivel que `dashboard`.

**3. Diseño responsive**

- Desktop: lista de pasos a la izquierda (70%), panel de resumen a la derecha (30%)
- Móvil: lista de pasos full-width, resumen colapsado en cabecera
- Dark mode completo
- Animaciones de transición al completar pasos (confetti micro o check animado)

#### Criterios de aceptación
- La página carga los pasos dinámicos correctos según la vertical del usuario
- Al hacer clic en "Ir a configurar" navega a la ruta del paso
- Al volver a `/saas/onboarding`, el paso se marca como completado si la verificación lo confirma (ver OB-08)
- Los pasos opcionales se pueden saltar
- La barra de progreso refleja el estado real
- "Saltar todo" marca el onboarding como completado y redirige al dashboard
- El diseño se ve correcto en desktop, tablet y móvil
- Soporte dark mode

---

### TICKET OB-05: Paso — Verificar/completar datos de empresa (`company_profile`)

**Tipo:** Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** OB-04

#### Contexto
El wizard de auth recoge datos de empresa en `Company.tsx` (`companyProfile`), pero puede quedar incompleto si el usuario pasó rápido. Este paso verifica que los campos obligatorios están rellenos y, si no, muestra un formulario inline para completarlos sin salir de la página de onboarding.

#### Qué hacer

**1. Endpoint de verificación en `setupProgressRouter.js`**

`GET /api/setup-progress/:userId/verify/company_profile`

- Lee el documento `business` del usuario
- Comprueba campos obligatorios: `tradeName`, `legalName`, `taxId`, `address`, `province`
- Devuelve `{ complete: boolean, missingFields: string[] }`

**2. Componente inline `SetupCompanyProfile.tsx`**

- Se muestra al expandir el paso "Datos de empresa" en la página de onboarding
- Si ya está completo: muestra resumen con icono verde + datos principales
- Si falta algo: muestra mini-formulario con solo los campos pendientes, pre-rellenando lo que ya existe
- Botón "Guardar y completar" que:
  1. Guarda los datos en la API de business existente (`PUT /api/businesses/:userId/:businessId`)
  2. Marca el paso como completado (`PUT /api/setup-progress/:userId/step/company_profile`)

**3. Auto-completar paso**

Si al cargar el onboarding los datos ya están completos (desde el wizard de auth), marcar automáticamente este paso como completado sin intervención del usuario.

#### Criterios de aceptación
- Si la empresa tiene todos los campos obligatorios, el paso aparece como completado automáticamente
- Si faltan campos, se muestra el formulario inline con indicación clara de qué falta
- Al guardar, el paso se marca como completado y la barra de progreso se actualiza
- Los datos se guardan en la misma entidad `business` existente (no duplica)

---

### TICKET OB-06: Paso — Crear trabajadores iniciales (`initial_team`)

**Tipo:** Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** OB-04

#### Contexto
La mayoría de negocios tienen al menos un trabajador además del administrador. El onboarding debe guiar la invitación del equipo inicial para que el sistema esté listo para funcionar con múltiples usuarios.

#### Qué hacer

**1. Endpoint de verificación en `setupProgressRouter.js`**

`GET /api/setup-progress/:userId/verify/initial_team`

- Cuenta los miembros del equipo asociados al negocio (excluyendo al propio administrador)
- Devuelve `{ complete: boolean, memberCount: number, minimumRequired: 1 }`
- Completo si hay al menos 1 trabajador creado/invitado

**2. Componente inline `SetupInitialTeam.tsx`**

- Muestra cuántos trabajadores se indicaron en el wizard de auth (`businessMetrics.userCount`)
- Formulario simplificado para invitar: nombre, email, rol (desplegable con roles existentes de `ROLE_DEFINITIONS`)
- Lista de invitaciones enviadas con estado (pendiente, aceptada)
- Botón "Invitar trabajador" que llama a la API de invitación existente
- Opción "Lo haré más tarde" para saltar el paso

**3. Integración con sistema de invitaciones existente**

Usar el flujo de `saveInviteToken` + email de invitación que ya existe en `authController.js`.

#### Criterios de aceptación
- Si ya hay al menos 1 trabajador en el equipo, el paso aparece como completado
- Se puede invitar trabajadores directamente desde el onboarding
- La invitación usa el flujo existente (token + email)
- Se muestra el estado de las invitaciones pendientes
- Se puede saltar el paso

---

### TICKET OB-07: Paso — Crear sedes / PDV (`locations`)

**Tipo:** Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** OB-04

#### Contexto
Las sedes y puntos de venta son necesarios para organizar el negocio geográficamente. El wizard de auth preguntó cuántas ubicaciones tiene el negocio (`businessMetrics.locationCount`), ahora hay que crearlas realmente.

#### Qué hacer

**1. Endpoint de verificación en `setupProgressRouter.js`**

`GET /api/setup-progress/:userId/verify/locations`

- Cuenta las ubicaciones (`location`) del usuario
- Devuelve `{ complete: boolean, locationCount: number, expectedCount: number }`
- `expectedCount` viene de `businessMetrics.locationCount` del onboarding de auth
- Completo si `locationCount >= 1`

**2. Componente inline `SetupLocations.tsx`**

- Muestra cuántas sedes indicó el usuario (`expectedCount`) vs cuántas hay creadas
- Formulario simplificado: nombre, dirección, tipo (oficina/tienda/almacén/taller), teléfono
- Lista de sedes ya creadas con opción de editar
- Botón "Crear sede" que usa la API existente de locations (`POST /api/locations/:userId`)
- Si `locationCount === 1`, crear automáticamente "Sede principal" con la dirección de la empresa

**3. Auto-creación**

Si en el wizard de auth el usuario indicó 1 ubicación y la empresa tiene dirección, crear automáticamente la sede principal al iniciar el onboarding.

#### Criterios de aceptación
- Si ya existe al menos 1 sede, el paso aparece como completado
- Se pueden crear sedes directamente desde el onboarding
- Se sugiere crear tantas sedes como indicó el usuario en el registro
- La sede se crea usando la API existente de locations
- Se puede saltar el paso

---

### TICKET OB-08: Paso — Clientes iniciales (`initial_clients`, condicional CRM)

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** OB-04

#### Contexto
Solo aplica si el módulo CRM está activo (`requestedModules.crm === true`). Permite al usuario importar o crear sus primeros clientes.

#### Qué hacer

**1. Endpoint de verificación**

`GET /api/setup-progress/:userId/verify/initial_clients`

- Cuenta los clientes del usuario
- Devuelve `{ complete: boolean, clientCount: number }`
- Completo si `clientCount >= 1`

**2. Componente inline `SetupInitialClients.tsx`**

- Dos opciones presentadas como tarjetas:
  - **Importar desde archivo** — Drag & drop de CSV/Excel → usa API de importación existente
  - **Crear manualmente** — Formulario simplificado: nombre, email, teléfono, empresa
- Contador de clientes importados/creados
- Preview de los últimos 5 clientes creados

**3. Condicionalidad**

Este paso solo aparece si `requestedModules.crm === true` (lógica ya manejada por OB-02).

#### Criterios de aceptación
- El paso solo aparece si CRM está activo
- Se pueden importar clientes desde CSV/Excel directamente desde el onboarding
- Se pueden crear clientes manualmente con formulario simplificado
- Si ya hay al menos 1 cliente, el paso aparece como completado
- Se puede saltar el paso

---

### TICKET OB-09: Paso — Catálogo y stock inicial (`catalog_setup` + `stock_initial`, condicional)

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** OB-04, OB-02

#### Contexto
Solo aplica a verticales con stock (ver mapa en auditoría) y si `requestedModules.inventory === true`. El catálogo debe adaptarse a la terminología de la vertical (platos, servicios, tratamientos, recambios, etc.).

#### Qué hacer

**1. Endpoint de verificación**

`GET /api/setup-progress/:userId/verify/catalog_setup`

- Cuenta los ítems de catálogo del usuario
- Devuelve `{ complete: boolean, itemCount: number }`
- Completo si `itemCount >= 1`

`GET /api/setup-progress/:userId/verify/stock_initial`

- Verifica si al menos 1 ítem tiene `stockQuantity > 0`
- Devuelve `{ complete: boolean, itemsWithStock: number }`

**2. Componente inline `SetupCatalog.tsx`**

- Título dinámico según vertical: "Crea tus platos" (delivery), "Añade tus servicios" (hairSalon), "Registra tus repuestos" (workshop), etc.
  - Usar `getVerticalCatalogConfig(businessType).itemLabelPlural` de `verticalCatalog.js`
- Formulario con campos filtrados según vertical (usa `getVerticalCatalogConfig`)
- Incluye campos custom de la vertical (`customFields`)
- Categorías pre-cargadas de la vertical
- Importación masiva desde CSV/Excel
- Si la vertical tiene `features.allergens === true`, mostrar selector de alérgenos

**3. Componente inline `SetupStock.tsx`**

- Solo aparece si la vertical tiene `features.stock === true`
- Muestra tabla simplificada de productos creados con columna "Stock actual"
- Permite editar `stockQuantity` inline (click para editar)
- Al guardar, registrar movimiento tipo `initial` si el sistema de stock movements existe (OB-02 de COMPRAS-STOCK-TICKETS)

#### Criterios de aceptación
- La terminología se adapta a la vertical (platos, servicios, piezas, etc.)
- Los campos del formulario coinciden con la configuración de `verticalCatalog.js`
- Se puede importar catálogo desde CSV
- El paso de stock solo aparece si la vertical tiene stock activo
- Se puede saltar cada paso por separado

---

### TICKET OB-10: Paso — Configurar TPV (`tpv_config`, condicional)

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** OB-04

#### Contexto
Solo aplica a verticales con PDV que necesitan punto de venta (delivery, hotel, nightclub) y si `requestedModules.sales === true`. Configura lo mínimo para que el TPV funcione.

#### Qué hacer

**1. Endpoint de verificación**

`GET /api/setup-progress/:userId/verify/tpv_config`

- Verifica si hay al menos 1 punto de venta configurado con método de pago
- Devuelve `{ complete: boolean, salesPointCount: number }`

**2. Componente inline `SetupTpv.tsx`**

- Formulario simplificado para configuración mínima del TPV:
  - Nombre del punto de venta
  - Métodos de pago aceptados (efectivo, tarjeta, bizum)
  - Formato de ticket (básico/completo)
  - Vincular con sede (desplegable de sedes creadas en OB-07)
- Si ya hay sedes, pre-seleccionar la primera
- Preview visual del ticket de ejemplo

#### Criterios de aceptación
- Solo aparece en verticales con TPV y módulo sales activo
- Se puede configurar el TPV mínimo sin salir del onboarding
- Se vincula correctamente con la sede
- Se puede saltar el paso

---

### TICKET OB-11: Paso — Pipeline CRM (`crm_pipeline`, condicional)

**Tipo:** Frontend  
**Prioridad:** Baja  
**Dependencias:** OB-04

#### Contexto
Solo aplica a verticales con flujo comercial fuerte (concesionarios, inmobiliarias, eventos, etc.) y si `requestedModules.crm === true`. Configura las etapas del pipeline de ventas.

#### Qué hacer

**1. Endpoint de verificación**

`GET /api/setup-progress/:userId/verify/crm_pipeline`

- Verifica si hay etapas de pipeline configuradas
- Devuelve `{ complete: boolean, stageCount: number }`

**2. Componente inline `SetupPipeline.tsx`**

- Plantilla de pipeline pre-configurada según vertical:
  - Concesionario: Lead → Visita → Prueba → Oferta → Negociación → Cierre
  - Inmobiliaria: Contacto → Visita → Oferta → Documentación → Cierre
  - Eventos: Consulta → Presupuesto → Reserva → Planificación → Ejecución
  - Genérico: Lead → Contactado → Propuesta → Negociación → Cierre
- El usuario puede editar nombres, añadir/quitar etapas
- Botón "Aplicar plantilla" que crea el pipeline

#### Criterios de aceptación
- Se ofrece una plantilla de pipeline según la vertical
- El usuario puede personalizar las etapas antes de guardar
- Se puede saltar el paso

---

### TICKET OB-12: Paso — Configurar taller (`workshop_config`, condicional)

**Tipo:** Frontend  
**Prioridad:** Baja  
**Dependencias:** OB-04

#### Contexto
Solo aplica a verticales `workshop` y `carDealership` con `requestedModules.workshop === true`.

#### Qué hacer

**1. Endpoint de verificación**

`GET /api/setup-progress/:userId/verify/workshop_config`

- Verifica si hay configuración de taller (categorías de reparación, tarifa hora)
- Devuelve `{ complete: boolean }`

**2. Componente inline `SetupWorkshop.tsx`**

- Configuración mínima:
  - Tarifa de mano de obra por hora (€/h)
  - Categorías de reparación (mecánica, electricidad, carrocería, etc.) — pre-rellenadas
  - IVA aplicable
- Guardar usando API de taller existente

#### Criterios de aceptación
- Solo aparece en verticales de taller con módulo workshop activo
- Se pueden configurar los basics del taller
- Se puede saltar el paso

---

### TICKET OB-13: Email de bienvenida — Trial 14 días

**Tipo:** Backend  
**Prioridad:** Alta  
**Dependencias:** OB-01

#### Contexto
Al completar el wizard de auth y activar el trial, el usuario debe recibir un email de bienvenida con toda la información relevante de su cuenta.

#### Qué hacer

**1. Plantilla de email en `services/emailTemplates.js` (o similar)**

Contenido del email:
- Asunto: "¡Bienvenido a Vertial! Tu prueba gratuita de 14 días ha comenzado"
- Cuerpo:
  - Nombre del usuario y empresa
  - Plan contratado (nombre + precio estimado)
  - Fecha de inicio y fin del trial
  - Vertical seleccionada
  - Módulos activados
  - Enlace directo a `/saas/onboarding` ("Completa la configuración de tu negocio")
  - Enlace al centro de ayuda
  - Datos de contacto de soporte
  - Aviso: "No se te cobrará hasta el {fechaFin}. Puedes cancelar en cualquier momento."

**2. Trigger del envío**

- Enviar al completar el paso de confirmación (`Confirmation.tsx`) — ya existe el `updateOnboardingData`
- Marcar `welcomeEmailSent: true` en el `setup_progress` para no duplicar
- Si el envío falla, reintentar con backoff (3 intentos)

**3. Función en controlador**

Crear `sendWelcomeTrialEmail(userId)` en `authController.js` que:
1. Lee datos del usuario y `onboardingData`
2. Renderiza la plantilla
3. Envía vía `nodemailer` (ya configurado en el proyecto)
4. Actualiza `setup_progress.welcomeEmailSent = true`

#### Criterios de aceptación
- El email se envía automáticamente al completar el registro con trial
- No se envía más de una vez por usuario
- El email contiene toda la información del plan y fechas
- El enlace a `/saas/onboarding` funciona correctamente
- Si falla el envío, se reintenta (máx 3 veces)

---

### TICKET OB-14: Alertas de onboarding en el motor de alertas

**Tipo:** Backend  
**Prioridad:** Alta  
**Dependencias:** OB-01, OB-02

#### Contexto
El motor de alertas (`services/alertEngine.js`) ejecuta reglas cada hora. Necesitamos tres nuevas reglas para el onboarding que detecten cuando algo no se ha completado y avisen al usuario.

#### Qué hacer

**1. Regla `onboarding_incomplete`**

- **Condición:** `setup_progress.overallCompleted === false` Y han pasado más de 48h desde `createdAt`
- **Nivel:** `info` (primeras 48h extra) → `warning` (después de 5 días) → `critical` (últimos 3 días de trial)
- **Título:** "Tu configuración inicial está al {X}%"
- **Mensaje:** "Te faltan {N} pasos para tener tu negocio listo. Completa el onboarding para aprovechar tu prueba gratuita."
- **Ruta:** `/saas/onboarding`
- **Dedup key:** `onboarding_incomplete:{userId}` (1 alerta/día)

**2. Regla `module_not_configured`**

- **Condición:** Un módulo está activo en `requestedModules` pero el paso correspondiente del setup no está completado ni saltado, Y han pasado más de 72h
- **Nivel:** `warning`
- **Título:** "El módulo {nombre} está activo pero sin configurar"
- **Mensaje:** "Activaste {nombre} pero aún no lo has configurado. Completa el paso en el onboarding o desactívalo si no lo necesitas."
- **Ruta:** `/saas/onboarding`
- **Dedup key:** `module_not_configured:{userId}:{moduleKey}` (1/día por módulo)

**3. Regla `initial_team_missing`**

- **Condición:** El usuario indicó `businessMetrics.userCount > 1` en el registro pero no ha invitado a ningún trabajador, Y han pasado más de 24h
- **Nivel:** `info`
- **Título:** "Aún no has invitado a tu equipo"
- **Mensaje:** "Indicaste que {N} personas usarán la plataforma. Invítalas desde el onboarding para que empiecen a trabajar."
- **Ruta:** `/saas/onboarding`
- **Dedup key:** `initial_team_missing:{userId}` (1/día)

**4. Implementación en `alertEngine.js`**

- Añadir función `runOnboardingAlerts(accounts)` al ciclo de alertas
- Para cada cuenta con `onboardingCompleted` y `setup_progress` existente:
  - Evaluar las 3 reglas
  - Emitir alertas via `emitAlert()` existente (que ya gestiona dedup, SSE y push)

#### Criterios de aceptación
- Las 3 reglas se ejecutan en cada ciclo del motor de alertas (1h)
- Las alertas se crean con el nivel correcto según el tiempo transcurrido
- No se duplican (dedup por día funciona)
- Las alertas aparecen en el panel de notificaciones del usuario
- Se envían por push si el usuario tiene push habilitado
- Al completar el onboarding, las alertas dejan de generarse

---

### TICKET OB-15: Widget de progreso en Dashboard

**Tipo:** Frontend  
**Prioridad:** Media  
**Dependencias:** OB-03, OB-04

#### Contexto
El Dashboard es la primera pantalla que ve el usuario al entrar. Si el onboarding no está completo, debe mostrarse un widget prominente que recuerde completar la configuración.

#### Qué hacer

**1. Componente `SetupProgressWidget.tsx`**

- Se muestra en la parte superior del Dashboard si `overallCompleted === false`
- Contenido:
  - Barra de progreso circular o lineal con porcentaje
  - "X de Y pasos completados"
  - Lista de los próximos 2-3 pasos pendientes (nombre + icono)
  - Botón "Continuar configuración" → navega a `/saas/onboarding`
  - Botón pequeño "Ocultar" que lo minimiza (pero no lo elimina — vuelve a aparecer al día siguiente)
- Estilo: gradiente suave, bordes redondeados, coherente con el design system existente
- Si está en los últimos 3 días de trial y el onboarding no está completo: borde rojo + icono de alerta

**2. Integrar en `Dashboard.tsx`**

- Importar `useSetupProgress` del contexto
- Renderizar `SetupProgressWidget` condicionalmente antes del contenido principal
- Si `overallCompleted === true`, no mostrar nada

**3. Sidebar badge**

- En `Sidebar.tsx`, al lado del enlace "Onboarding" (si existe) o como item nuevo, mostrar badge con el % de completitud
- Badge: pill naranja con número "3/7" o "42%"
- Si ya está completo, mostrar check verde o no mostrar badge

#### Criterios de aceptación
- El widget aparece en el Dashboard si el onboarding no está completado
- Muestra correctamente el progreso y los pasos pendientes
- "Continuar configuración" lleva a `/saas/onboarding`
- Se puede ocultar temporalmente
- Desaparece permanentemente al completar el onboarding
- El badge del Sidebar refleja el estado real

---

### TICKET OB-16: Verificación automática de pasos al volver

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** OB-04, OB-05, OB-06, OB-07, OB-08, OB-09

#### Contexto
El usuario puede completar pasos yendo directamente a la sección correspondiente (ej: crea clientes desde `/saas/clients` en vez de desde el onboarding). Al volver a `/saas/onboarding`, el sistema debe verificar qué pasos se han completado "por fuera" y actualizar el progreso.

#### Qué hacer

**1. Endpoint batch de verificación**

`GET /api/setup-progress/:userId/verify-all`

- Ejecuta todas las verificaciones individuales de los pasos activos del usuario
- Actualiza el `setup_progress` con los pasos que ahora están completos
- Devuelve el progreso actualizado

Verificaciones por paso:

| Paso | Verificación |
|---|---|
| `company_profile` | Campos obligatorios de business rellenados |
| `initial_team` | Al menos 1 miembro invitado/creado |
| `locations` | Al menos 1 ubicación creada |
| `initial_clients` | Al menos 1 cliente (si CRM activo) |
| `catalog_setup` | Al menos 1 ítem de catálogo |
| `stock_initial` | Al menos 1 ítem con stock > 0 (si stock activo) |
| `tpv_config` | Al menos 1 punto de venta con método de pago |
| `crm_pipeline` | Al menos 1 etapa de pipeline |
| `workshop_config` | Tarifa de mano de obra configurada |
| `document_numbering` | Serie de factura definida |
| `first_operation` | Al menos 1 operación/venta creada |

**2. Trigger en frontend**

- Al montar `SetupOnboarding.tsx`, llamar a `verify-all` antes de renderizar
- Mostrar estado de carga mientras verifica
- Animar los pasos que pasan de pendiente a completado (transición suave)

**3. Trigger periódico (opcional)**

- Cada vez que se navega a `/saas/onboarding`, ejecutar verificación
- El contexto puede cachear el resultado 5 min para no bombardear

#### Criterios de aceptación
- Si el usuario creó clientes desde `/saas/clients`, al volver al onboarding el paso de clientes aparece completado
- La verificación es rápida (< 2 segundos para todos los pasos)
- Los pasos recién completados se animan visualmente
- No se pierden pasos marcados manualmente como completados

---

### TICKET OB-17: Redirect inteligente post-login

**Tipo:** Frontend  
**Prioridad:** Media  
**Dependencias:** OB-01, OB-03

#### Contexto
Cuando un usuario nuevo entra al SaaS por primera vez (tras el wizard de auth), debe ser redirigido al onboarding operativo en vez de al Dashboard. Los usuarios que ya completaron el onboarding van directamente al Dashboard.

#### Qué hacer

**1. Lógica en `Gate.tsx` o `SaasRoot.tsx`**

Tras autenticar, comprobar:

```
if (setupProgress === null || !setupProgress.overallCompleted) {
  // Primera vez o incompleto → /saas/onboarding
  navigate('/saas/onboarding');
} else {
  // Ya completado → /saas/dashboard
  navigate('/saas/dashboard');
}
```

**2. Excepciones**

- Si el usuario accede directamente a una ruta específica (ej: desde un enlace a `/saas/clients`), NO redirigir al onboarding
- Solo redirigir al onboarding si la ruta destino es `/saas` o `/saas/dashboard`
- Si el onboarding fue "saltado" (`overallCompleted: true` por skip), no volver a redirigir

**3. Banner persistente**

Si el usuario navega fuera del onboarding sin completarlo, mostrar un banner fino en la parte superior:
- "Tu configuración está al X%. Complétala para aprovechar tu prueba." + botón "Continuar"
- El banner se cierra con X pero reaparece al día siguiente
- Desaparece permanentemente al completar el onboarding

#### Criterios de aceptación
- El primer login post-registro redirige a `/saas/onboarding`
- Si el onboarding ya está completo, va directo al Dashboard
- Las URLs directas no se interceptan (solo redirect desde `/saas/dashboard`)
- El banner de recordatorio aparece en todas las páginas SaaS si el onboarding está incompleto
- "Saltar todo" deshabilita tanto el redirect como el banner

---

## Resumen de dependencias

```
OB-01 (Modelo setup_progress)
  ├── OB-02 (Motor de pasos dinámicos)
  │     └── OB-03 (Contexto React)
  │           └── OB-04 (Página principal /saas/onboarding)
  │                 ├── OB-05 (Paso: Datos empresa)
  │                 ├── OB-06 (Paso: Equipo)
  │                 ├── OB-07 (Paso: Sedes/PDV)
  │                 ├── OB-08 (Paso: Clientes - CRM)
  │                 ├── OB-09 (Paso: Catálogo/Stock)
  │                 ├── OB-10 (Paso: TPV)
  │                 ├── OB-11 (Paso: Pipeline CRM)
  │                 ├── OB-12 (Paso: Taller)
  │                 └── OB-16 (Verificación automática)
  ├── OB-13 (Email bienvenida)
  ├── OB-14 (Alertas onboarding)
  └── OB-17 (Redirect inteligente)

OB-03 (Contexto React)
  └── OB-15 (Widget Dashboard)
```

## Orden de implementación recomendado

| Fase | Tickets | Descripción |
|---|---|---|
| **Fase 1 — Cimientos** | OB-01, OB-02 | Modelo de datos + motor de pasos |
| **Fase 2 — Esqueleto UI** | OB-03, OB-04 | Contexto + página principal |
| **Fase 3 — Pasos base** | OB-05, OB-06, OB-07 | Empresa, equipo, sedes (siempre visibles) |
| **Fase 4 — Pasos condicionales** | OB-08, OB-09, OB-10, OB-11, OB-12 | Según vertical y módulos |
| **Fase 5 — Inteligencia** | OB-13, OB-14, OB-16, OB-17 | Email, alertas, verificación, redirect |
| **Fase 6 — Integración** | OB-15 | Widget Dashboard + Sidebar |

---

## Conexiones con otros módulos

| Módulo destino | Tipo de conexión |
|---|---|
| **Configuración** (`/saas/settings`) | Paso `company_profile` edita datos de empresa; paso `document_numbering` configura series |
| **Equipo** (`/saas/team`) | Paso `initial_team` invita trabajadores usando la API existente |
| **CRM** (`/saas/clients`, `/saas/pipeline`) | Pasos `initial_clients` y `crm_pipeline` crean datos en CRM |
| **Compras y Stock** (`/saas/catalog`, `/saas/articles`) | Pasos `catalog_setup` y `stock_initial` usan API de catálogo + `verticalCatalog.js` |
| **TPV** (`/saas/tpv`) | Paso `tpv_config` configura punto de venta |
| **Taller** (`/saas/workshop`) | Paso `workshop_config` configura taller |
| **Verticales** (`verticalCatalog.js`) | OB-02 lee features y campos por vertical para determinar pasos y formularios |
| **Dashboard** (`/saas/dashboard`) | OB-15 muestra widget de progreso |
| **Motor de alertas** (`alertEngine.js`) | OB-14 añade 3 reglas nuevas al ciclo horario |

