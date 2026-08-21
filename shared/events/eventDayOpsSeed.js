/**
 * Semilla Día D al aceptar evento (API Node + front).
 * Misma forma que src/app/lib/eventsDayOps.ts
 */

const PHASE_IDS = ['almacen', 'carga', 'salida', 'llegada', 'montaje', 'evento', 'vuelta'];

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultPhases() {
  return PHASE_IDS.map((id) => ({
    id,
    plannedTime: '',
    done: false,
    note: '',
  }));
}

function buildCargo(event) {
  const out = [];
  for (const line of parseJsonArray(event.lineasPresupuesto)) {
    const name = String(line.concepto || '').trim();
    const qty = Math.max(0, Math.floor(Number(line.cantidad) || 0));
    if (!name || qty <= 0) continue;
    out.push({
      id: `pedido-${line.id || line.catalogItemId || name}`,
      name,
      qty,
      catalogItemId: String(line.catalogItemId || '').trim() || undefined,
      source: 'pedido',
      status: 'pendiente',
    });
  }
  for (const line of parseJsonArray(event.routeExtraStock)) {
    const name = String(line.name || '').trim();
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (!name || qty <= 0) continue;
    out.push({
      id: `extra-${line.id || line.catalogItemId || name}`,
      name,
      qty,
      catalogItemId: String(line.catalogItemId || '').trim() || undefined,
      source: 'extra',
      status: 'pendiente',
    });
  }
  return out;
}

function buildCrew(event) {
  let checklist = {};
  try {
    checklist =
      typeof event.planningChecklist === 'string'
        ? JSON.parse(event.planningChecklist || '{}')
        : event.planningChecklist || {};
  } catch {
    checklist = {};
  }
  const workers = Array.isArray(checklist.workers) ? checklist.workers : [];
  return workers
    .map((w) => {
      const name = String(w?.name || '').trim();
      const id = String(w?.id || '').trim() || `w-${name}`;
      if (!name) return null;
      return {
        id,
        name,
        role: 'Ayudante',
        arriveTime: '',
        isDriver: false,
        checkedIn: false,
      };
    })
    .filter(Boolean);
}

/**
 * Si el evento aún no tiene dayOps, lo crea. Si ya tiene, lo deja.
 * @returns {{ event: object, changed: boolean }}
 */
export function ensureDayOpsOnEventDoc(event) {
  if (!event || typeof event !== 'object') return { event, changed: false };
  if (String(event.dayOps || '').trim()) return { event, changed: false };

  const dayOps = {
    phases: defaultPhases(),
    cargo: buildCargo(event),
    crew: buildCrew(event),
    transport: { vehicleLabel: '', plate: '', notes: '' },
    brief: '',
  };

  return {
    event: {
      ...event,
      dayOps: JSON.stringify(dayOps),
      updatedAt: new Date().toISOString(),
    },
    changed: true,
  };
}
