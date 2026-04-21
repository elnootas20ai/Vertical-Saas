import { QAChecklist, QAItem } from '../../components/design-system/QAChecklist';

const items: QAItem[] = [
  // Sales
  {
    module: 'SAAS__ Sales',
    feature: 'Vista de pipeline/kanban o tabla',
    status: 'ok'
  },
  {
    module: 'SAAS__ Sales',
    feature: 'Filtros funcionales',
    status: 'ok'
  },
  {
    module: 'SAAS__ Sales',
    feature: 'Empty state adecuado',
    status: 'ok'
  },

  // Documents
  {
    module: 'SAAS__ Documents',
    feature: 'Lista de documentos con filtros',
    status: 'ok'
  },
  {
    module: 'SAAS__ Documents',
    feature: 'Botón "Nuevo documento" funcional',
    status: 'ok'
  },
  {
    module: 'SAAS__ Documents',
    feature: 'Estados de documento visibles (borrador, enviado, firmado)',
    status: 'ok'
  },
  {
    module: 'SAAS__ Documents',
    feature: 'Empty state con CTA',
    status: 'ok'
  },

  // Finance
  {
    module: 'SAAS__ Finance',
    feature: 'KPIs financieros principales',
    status: 'ok'
  },
  {
    module: 'SAAS__ Finance',
    feature: 'Gráficos de ingresos vs gastos',
    status: 'ok'
  },
  {
    module: 'SAAS__ Finance',
    feature: 'Tabs o secciones navegables',
    status: 'ok'
  },
  {
    module: 'SAAS__ Finance',
    feature: 'Exportación de datos (botón)',
    status: 'ok'
  },

  // Locations
  {
    module: 'SAAS__ Locations',
    feature: 'Lista de ubicaciones',
    status: 'ok'
  },
  {
    module: 'SAAS__ Locations',
    feature: 'Botón "Añadir ubicación"',
    status: 'ok'
  },
  {
    module: 'SAAS__ Locations',
    feature: 'Vista de plazas/espacios por ubicación',
    status: 'ok'
  },
  {
    module: 'SAAS__ Locations',
    feature: 'Vehículos asignados visibles',
    status: 'ok'
  },

  // Calls (IA)
  {
    module: 'SAAS__ Calls',
    feature: 'Funcionalidad o próximamente modal',
    status: 'ok'
  },

  // ANCOVE
  {
    module: 'SAAS__ Ancove',
    feature: 'Integración ANCOVE o próximamente modal',
    status: 'ok'
  },

  // Team
  {
    module: 'SAAS__ Team',
    feature: 'Lista de miembros del equipo',
    status: 'ok'
  },
  {
    module: 'SAAS__ Team',
    feature: 'Botón "Invitar miembro"',
    status: 'ok'
  },
  {
    module: 'SAAS__ Team',
    feature: 'Roles y permisos visibles',
    status: 'ok'
  },
  {
    module: 'SAAS__ Team',
    feature: 'Estados de usuario (activo, pendiente)',
    status: 'ok'
  },

  // Settings
  {
    module: 'SAAS__ Settings',
    feature: 'Tabs de configuración: General, Empresa, Facturación, Notificaciones',
    status: 'ok'
  },
  {
    module: 'SAAS__ Settings',
    feature: 'Formularios editables en cada sección',
    status: 'ok'
  },
  {
    module: 'SAAS__ Settings',
    feature: 'Botones "Guardar cambios" funcionales',
    status: 'ok'
  },
  {
    module: 'SAAS__ Settings',
    feature: 'Gestión de plan actual',
    status: 'ok'
  },
  {
    module: 'SAAS__ Settings',
    feature: 'Zona peligrosa (eliminar cuenta, etc.)',
    status: 'ok'
  }
];

export function Block4QA() {
  return (
    <QAChecklist 
      blockName="Bloque 4: SaaS Secondary (Sales, Finance, Documents, Team, Settings, etc.)"
      items={items}
      onComplete={() => {
        window.location.href = '/qa/final';
      }}
    />
  );
}
