/** Roles con vista de equipo completa (fichajes, RRHH, alertas). */
export const MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
]);

export function isManagerRole(role) {
  return MANAGER_ROLES.has(String(role || '').trim());
}
