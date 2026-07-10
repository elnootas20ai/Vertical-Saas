/** Tienda/PDV asignada al trabajador (invitación o ficha de equipo). */
export function resolveMemberSalesPointRef(
  memberId: string,
  teamUsers: Array<{ user_id: string; employment?: { salesPointId?: string } }>,
): string {
  return String(
    teamUsers.find((u) => u.user_id === memberId)?.employment?.salesPointId || '',
  ).trim();
}

export function salesPointRefsMatch(a: string, b: string): boolean {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left === `wc:${right}` || right === `wc:${left}`) return true;
  return false;
}

export function memberMatchesStoreFilter(
  memberId: string,
  filterWorkCenter: string,
  teamUsers: Array<{ user_id: string; employment?: { salesPointId?: string } }>,
  recordSalesPointId?: string,
): boolean {
  if (filterWorkCenter === 'all') return true;
  const assigned = resolveMemberSalesPointRef(memberId, teamUsers);
  if (salesPointRefsMatch(assigned, filterWorkCenter)) return true;
  if (recordSalesPointId && salesPointRefsMatch(recordSalesPointId, filterWorkCenter)) return true;
  return false;
}
