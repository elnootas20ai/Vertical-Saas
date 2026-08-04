/**
 * Resuelve la tienda/local efectivo del trabajador para fichaje y TPV.
 * Prioridad: employment.salesPointId → asignación activa → horario → única tienda del scope.
 */

import type { EmploymentInfo, WorkerAssignment } from './authApi';

export function resolveEffectiveSalesPointRef(options: {
  employmentSalesPointId?: string | null;
  scheduleWorkCenterId?: string | null;
  assignments?: WorkerAssignment[] | null;
  workCenters?: Array<{ _id?: string; id?: string; active?: boolean; deletedAt?: string }>;
  pointsOfSale?: Array<{ _id?: string; workCenterId?: string | null }>;
}): string {
  const fromEmployment = String(options.employmentSalesPointId || '').trim();
  if (fromEmployment) return fromEmployment;

  const fromAssignment = getPrimarySiteAssignment(options.assignments)?.entityId;
  if (fromAssignment) return String(fromAssignment).trim();

  const fromSchedule = String(options.scheduleWorkCenterId || '').trim();
  if (fromSchedule) return fromSchedule;

  const workCenters = (options.workCenters || []).filter(
    (wc) => !wc.deletedAt && wc.active !== false && String(wc._id || wc.id || '').trim(),
  );
  if (workCenters.length === 1) {
    return String(workCenters[0]._id || workCenters[0].id || '').trim();
  }

  const pointsOfSale = (options.pointsOfSale || []).filter(
    (p) => String(p._id || '').trim(),
  );
  if (pointsOfSale.length === 1) {
    const pdv = pointsOfSale[0];
    return String(pdv.workCenterId || pdv._id || '').trim();
  }

  return '';
}

export function listActiveSiteAssignments(
  assignments?: WorkerAssignment[] | null,
): WorkerAssignment[] {
  return (assignments || []).filter(
    (a) =>
      a.status === 'active'
      && (a.type === 'work_center' || a.type === 'branch')
      && String(a.entityId || '').trim(),
  );
}

export function getPrimarySiteAssignment(
  assignments?: WorkerAssignment[] | null,
): WorkerAssignment | null {
  const active = listActiveSiteAssignments(assignments);
  if (active.length === 0) return null;
  return active.find((a) => a.isPrimary) || active[0];
}

export function hasExplicitSiteAssignment(employment?: Partial<EmploymentInfo> | null): boolean {
  if (!employment) return false;
  if (String(employment.salesPointId || '').trim()) return true;
  return listActiveSiteAssignments(employment.assignments).length > 0;
}

/** Asigna (o cambia) el sitio principal de fichaje/TPV y sincroniza salesPointId. */
export function assignPrimaryWorkSite(
  employment: EmploymentInfo | undefined,
  site: { id: string; name: string },
  today = new Date().toISOString().slice(0, 10),
): EmploymentInfo {
  const siteId = String(site.id || '').trim();
  const siteName = String(site.name || '').trim() || 'Sitio';
  const prev = employment || ({} as EmploymentInfo);
  const existing = [...(prev.assignments || [])];

  const nextAssignments: WorkerAssignment[] = existing.map((a) => {
    if (a.status !== 'active') return a;
    if (a.type !== 'work_center' && a.type !== 'branch') return a;
    if (String(a.entityId) === siteId) {
      return { ...a, entityName: siteName, isPrimary: true, status: 'active' as const };
    }
    return {
      ...a,
      isPrimary: false,
      status: 'ended' as const,
      endDate: a.endDate || today,
    };
  });

  const already = nextAssignments.some(
    (a) => a.status === 'active' && String(a.entityId) === siteId,
  );
  if (!already && siteId) {
    nextAssignments.push({
      id: `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'work_center',
      entityId: siteId,
      entityName: siteName,
      startDate: today,
      isPrimary: true,
      status: 'active',
    });
  }

  return {
    ...prev,
    salesPointId: siteId,
    assignments: nextAssignments,
  };
}

/** Quita la asignación de sitios (opcional: el trabajador puede seguir fichando sin sitio). */
export function clearPrimaryWorkSite(
  employment: EmploymentInfo | undefined,
  today = new Date().toISOString().slice(0, 10),
): EmploymentInfo {
  const prev = employment || ({} as EmploymentInfo);
  const nextAssignments = (prev.assignments || []).map((a) => {
    if (a.status !== 'active') return a;
    if (a.type !== 'work_center' && a.type !== 'branch') return a;
    return {
      ...a,
      isPrimary: false,
      status: 'ended' as const,
      endDate: a.endDate || today,
    };
  });
  return {
    ...prev,
    salesPointId: '',
    assignments: nextAssignments,
  };
}
