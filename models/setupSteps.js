/**
 * Setup Steps — Definiciones y motor de pasos dinámicos para el onboarding operativo.
 *
 * Determina qué pasos mostrar en /saas/onboarding según:
 *  - businessType (vertical del negocio)
 *  - requestedModules (módulos contratados)
 *
 * Importable desde backend y frontend (API client re-exporta tipos).
 */

// ─── Definiciones de pasos ───────────────────────────────────────────────────

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
    icon: 'UserPlus',
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

// ─── Categorías para agrupación visual ───────────────────────────────────────

export const STEP_CATEGORIES = {
  base:     { label: 'Configuración base',  order: 1 },
  crm:      { label: 'CRM y clientes',      order: 2 },
  stock:    { label: 'Stock y catálogo',     order: 3 },
  tpv:      { label: 'Punto de venta',       order: 4 },
  workshop: { label: 'Taller',              order: 5 },
};

// ─── Motor de cálculo ────────────────────────────────────────────────────────

/**
 * Determina qué pasos del setup aplican para una vertical y módulos concretos.
 *
 * @param {string} businessType — Clave de la vertical (ej: 'delivery', 'lawyer')
 * @param {Record<string, boolean>} requestedModules — Módulos contratados
 * @returns {Array<{key: string, required: boolean, completed: boolean, completedAt: string|null, skipped: boolean, skippedAt: string|null, metadata: Record<string, unknown>}>}
 */
export function computeSetupSteps(businessType, requestedModules = {}) {
  const definitions = Object.values(SETUP_STEP_DEFINITIONS);

  const applicable = definitions.filter((def) => {
    const { verticals, modules } = def.appliesTo;

    const verticalMatch = verticals === 'all' || (Array.isArray(verticals) && verticals.includes(businessType));
    if (!verticalMatch) return false;

    if (Array.isArray(modules) && modules.length > 0) {
      const hasAnyModule = modules.some((m) => requestedModules[m] === true);
      if (!hasAnyModule) return false;
    }

    return true;
  });

  applicable.sort((a, b) => a.order - b.order);

  return applicable.map((def) => ({
    key: def.key,
    required: def.required,
    completed: false,
    completedAt: null,
    skipped: false,
    skippedAt: null,
    metadata: {},
  }));
}

/**
 * Devuelve las definiciones completas de los pasos aplicables (con título, icono, etc.).
 */
export function getApplicableStepDefinitions(businessType, requestedModules = {}) {
  const definitions = Object.values(SETUP_STEP_DEFINITIONS);

  return definitions
    .filter((def) => {
      const { verticals, modules } = def.appliesTo;
      const verticalMatch = verticals === 'all' || (Array.isArray(verticals) && verticals.includes(businessType));
      if (!verticalMatch) return false;
      if (Array.isArray(modules) && modules.length > 0) {
        return modules.some((m) => requestedModules[m] === true);
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);
}
