import { QAChecklist, QAItem } from '../../components/design-system/QAChecklist';

const items: QAItem[] = [
  // Layout Components
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Logo Udar Edge visible',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Navegación completa: 12 módulos interactivos',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Estados activos con color amber/naranja',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'User section clickeable con menú desplegable',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Menú usuario: Mi perfil (modal próximamente)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Menú usuario: Ayuda (modal próximamente)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Sidebar',
    feature: 'Menú usuario: Cerrar sesión → /',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Topbar',
    feature: 'Título y subtítulo dinámicos por página',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Topbar',
    feature: 'Buscador global funcional',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Topbar',
    feature: 'Icono notificaciones con badge (modal próximamente)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Layout - Topbar',
    feature: 'Selector empresa (modal próximamente)',
    status: 'ok'
  },
  
  // Dashboard
  {
    module: 'SAAS__ Dashboard',
    feature: '4 KPI Cards clickeables con navegación',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Tabs funcionales: Stock, Alertas, KPIs, Top 5',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Resumen de stock con 4 métricas',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Alertas dinámicas con acciones navegables',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'KPIs del negocio: 4 métricas calculadas',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Top 5 vehículos del mes ordenados por margen',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Actividad reciente con timestampsempty state cuando no hay datos',
    status: 'ok'
  },
  {
    module: 'SAAS__ Dashboard',
    feature: 'Empty state con CTAs → /saas/vehicles y /saas/clients',
    status: 'ok'
  },

  // Vehicles
  {
    module: 'SAAS__ Vehicles',
    feature: 'Pills de filtro funcionales (disponible, reservado, vendido, todos)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Buscador por marca/modelo/matrícula',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Botón "Añadir vehículo" (abre modal)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Botón "Importar stock" (abre wizard CSV)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Grid de cards con imagen, detalles y precio',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Click en card → /saas/vehicles/:id',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Badge de estado con color (disponible, reservado, vendido)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Días en stock visibles',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Empty state con CTA "Añadir primer vehículo"',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Modal AddVehicle con formulario completo',
    status: 'ok'
  },
  {
    module: 'SAAS__ Vehicles',
    feature: 'Wizard ImportStock con steps',
    status: 'ok'
  },

  // Vehicle Detail
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Breadcrumb navegable: Vehículos > [Marca Modelo]',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Tabs: Detalles, Documentos, Historial',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Botones de acción según estado',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Información completa del vehículo',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Galería de fotos (si tiene)',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Sección costes y márgenes',
    status: 'ok'
  },
  {
    module: 'SAAS__ VehicleDetail',
    feature: 'Timeline de historial con eventos',
    status: 'ok'
  },

  // Clients (CRM)
  {
    module: 'SAAS__ Clients',
    feature: 'Pills de filtro: Nuevo, Contactado, Cualificado, etc.',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Buscador por nombre/email/teléfono',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Botón "Añadir lead" (abre modal)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Tabla con columnas: Nombre, Contacto, Estado, Interés, Origen, Última actividad',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Click en fila → /saas/clients/:id',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Badge de estado con colores semáforo',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Empty state con CTA "Añadir primer lead"',
    status: 'ok'
  },
  {
    module: 'SAAS__ Clients',
    feature: 'Modal AddLead con formulario completo',
    status: 'ok'
  },

  // Client Detail
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Breadcrumb navegable: Clientes > [Nombre]',
    status: 'ok'
  },
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Tabs: Información, Actividad, Operaciones',
    status: 'ok'
  },
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Botones de acción: llamar, email, WhatsApp',
    status: 'ok'
  },
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Tarjeta de información del lead',
    status: 'ok'
  },
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Timeline de actividad',
    status: 'ok'
  },
  {
    module: 'SAAS__ ClientDetail',
    feature: 'Lista de operaciones asociadas',
    status: 'ok'
  },

  // Operations
  {
    module: 'SAAS__ Operations',
    feature: 'Pills de filtro por status',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Buscador',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Botón "Nueva operación" (abre modal)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Tabla con todas las columnas relevantes',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Click en fila → /saas/operations/:id',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Badge de estado',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Empty state con CTA',
    status: 'ok'
  },
  {
    module: 'SAAS__ Operations',
    feature: 'Modal AddSale con formulario',
    status: 'ok'
  },

  // Operation Detail
  {
    module: 'SAAS__ OperationDetail',
    feature: 'Breadcrumb navegable',
    status: 'ok'
  },
  {
    module: 'SAAS__ OperationDetail',
    feature: 'Tabs: Resumen, Documentos, Pagos, Historial',
    status: 'ok'
  },
  {
    module: 'SAAS__ OperationDetail',
    feature: 'Información completa de la operación',
    status: 'ok'
  },
  {
    module: 'SAAS__ OperationDetail',
    feature: 'Links a vehículo y cliente asociados',
    status: 'ok'
  },
  {
    module: 'SAAS__ OperationDetail',
    feature: 'Timeline de eventos',
    status: 'ok'
  }
];

export function Block3QA() {
  return (
    <QAChecklist 
      blockName="Bloque 3: SaaS Core (Dashboard, Vehicles, Clients, Operations)"
      items={items}
      onComplete={() => {
        window.location.href = '/qa/block-4';
      }}
    />
  );
}
