/**
 * Resuelve la tienda/local efectivo del trabajador para fichaje y TPV.
 * Prioridad: employment.salesPointId → horario (work_center_id) → única tienda del scope.
 */

export function resolveEffectiveSalesPointRef(options: {
  employmentSalesPointId?: string | null;
  scheduleWorkCenterId?: string | null;
  workCenters?: Array<{ _id?: string; id?: string; active?: boolean; deletedAt?: string }>;
  pointsOfSale?: Array<{ _id?: string; workCenterId?: string | null }>;
}): string {
  const fromEmployment = String(options.employmentSalesPointId || '').trim();
  if (fromEmployment) return fromEmployment;

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
