/** Roles con vista de equipo completa (alineado con services/managerRoles.js). */
const MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
]);

export function isManagerRole(role?: string | null): boolean {
  return MANAGER_ROLES.has(String(role || '').trim());
}
