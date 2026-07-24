import type { RoleDefinition } from './authApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

/** Catálogo de funciones al invitar / Equipo, por vertical. IDs estables (permisos). */

export const RESTAURANT_FUNCTION_ROLES: RoleDefinition[] = [
  { id: 'Administrador', description: 'Responsable del bar o restaurante.', permissions: [], users: 0 },
  { id: 'Gestor', description: 'Gestiona equipo, altas y nóminas (RRHH).', permissions: [], users: 0 },
  { id: 'Encargado', description: 'Coordina el servicio del local (sala, barra y cocina).', permissions: [], users: 0 },
  {
    id: 'Mostrador / Atención',
    description: 'Camarero/a, barra y atención en sala.',
    permissions: [],
    users: 0,
  },
  { id: 'Cocina', description: 'Prepara comandas de sala y cocina.', permissions: [], users: 0 },
];

export const DELIVERY_FUNCTION_ROLES: RoleDefinition[] = [
  { id: 'Administrador', description: 'Responsable del negocio o del local.', permissions: [], users: 0 },
  { id: 'Gestor', description: 'Gestiona equipo, altas y nóminas (RRHH).', permissions: [], users: 0 },
  { id: 'Encargado', description: 'Coordina la operativa diaria.', permissions: [], users: 0 },
  {
    id: 'Mostrador / Atención',
    description: 'Atiende clientes en mostrador, sala o food truck.',
    permissions: [],
    users: 0,
  },
  { id: 'Cocina', description: 'Prepara pedidos y cocina.', permissions: [], users: 0 },
  { id: 'Reparto', description: 'Entrega pedidos a domicilio.', permissions: [], users: 0 },
];

export const EVENTS_FUNCTION_ROLES: RoleDefinition[] = [
  { id: 'Administrador', description: 'Gestiona equipo, permisos y operación del negocio.', permissions: [], users: 0 },
  { id: 'Gestor', description: 'Gestiona equipo, altas y nóminas (RRHH).', permissions: [], users: 0 },
  { id: 'Encargado', description: 'Coordina contrataciones, catering y logística.', permissions: [], users: 0 },
  { id: 'Comercial', description: 'Presupuestos, clientes y cierre de contratos.', permissions: [], users: 0 },
  { id: 'Operaciones', description: 'Planificación del día del evento e invitados.', permissions: [], users: 0 },
];

/** Etiqueta visible en UI (el id interno no cambia: permisos / datos). */
const RESTAURANT_ROLE_LABELS: Record<string, string> = {
  Administrador: 'Administrador',
  Gestor: 'Gestor',
  Encargado: 'Encargado',
  'Mostrador / Atención': 'Sala / barra',
  Cocina: 'Cocina',
};

export function getFunctionRolesForBusiness(businessType?: string | null): RoleDefinition[] {
  if (businessType === 'events') return EVENTS_FUNCTION_ROLES;
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_FUNCTION_ROLES;
  return DELIVERY_FUNCTION_ROLES;
}

export function getInviteRoleDisplayLabel(
  roleId: string | null | undefined,
  businessType?: string | null,
): string {
  const id = String(roleId || '').trim();
  if (!id) return '';
  if (isRestaurantBusinessType(businessType)) {
    return RESTAURANT_ROLE_LABELS[id] || id;
  }
  return id;
}

/** Sugerencias de cargo RRHH (texto libre `position`) al invitar. */
export function getInvitePositionSuggestions(businessType?: string | null): string[] {
  if (isRestaurantBusinessType(businessType)) {
    return [
      'Camarero/a',
      'Barista',
      'Ayudante de sala',
      'Runner / pasaplatos',
      'Encargado de sala',
      'Cocinero/a',
      'Ayudante de cocina',
      'Jefe de cocina',
    ];
  }
  if (businessType === 'events') {
    return ['Comercial', 'Coordinación', 'Operaciones', 'Montaje'];
  }
  return [
    'Mostrador',
    'Cocinero/a',
    'Repartidor/a',
    'Encargado/a',
    'Ayudante',
  ];
}

export function suggestPositionForInviteRole(
  roleId: string | null | undefined,
  businessType?: string | null,
): string {
  const role = String(roleId || '').trim();
  if (!isRestaurantBusinessType(businessType)) {
    if (role === 'Reparto') return 'Repartidor/a';
    if (role === 'Cocina') return 'Cocinero/a';
    if (role === 'Mostrador / Atención') return 'Mostrador';
    if (role === 'Encargado') return 'Encargado/a';
    return '';
  }
  if (role === 'Cocina') return 'Cocinero/a';
  if (role === 'Mostrador / Atención') return 'Camarero/a';
  if (role === 'Encargado') return 'Encargado de sala';
  if (role === 'Gestor') return 'Gestor RRHH';
  if (role === 'Administrador') return 'Administrador';
  return '';
}
