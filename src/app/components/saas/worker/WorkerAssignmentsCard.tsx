import { MapPin } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { getHrLocationCopy } from '../../../lib/retailLocationCopy';
import {
  hasExplicitSiteAssignment,
  listActiveSiteAssignments,
} from '../../../lib/workerStoreAssignment';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';

/** Sitios asignados al trabajador (opcional). Si no hay, lo dice claro. */
export function WorkerAssignmentsCard() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const hrCopy = getHrLocationCopy(currentBusiness?.businessType);
  const { storeLabel, loading } = useWorkerAssignedStore();

  const employment = user?.employment;
  const sites = listActiveSiteAssignments(employment?.assignments);
  const hasSite = hasExplicitSiteAssignment(employment);

  // Si solo hay salesPointId (sin array assignments), mostrar la etiqueta resuelta.
  const displaySites =
    sites.length > 0
      ? sites.map((s) => ({ id: s.entityId, name: s.entityName, primary: s.isPrimary }))
      : hasSite && (storeLabel || employment?.salesPointId)
        ? [{
            id: String(employment?.salesPointId || 'site'),
            name: storeLabel || hrCopy.workerStoreFallback,
            primary: true,
          }]
        : [];

  if (loading && displaySites.length === 0 && !hasSite) {
    return (
      <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
        <p className="text-sm text-stone-500">Cargando asignaciones…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
          <MapPin className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Asignados</h3>
          <p className="text-[11px] text-stone-500">Sitio donde fichas y operas</p>
        </div>
      </div>

      {displaySites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 px-4 py-5 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">
            {hrCopy.workerNoStoreTitle}
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            {hrCopy.workerNoStoreHint}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {displaySites.map((site) => (
            <li
              key={site.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-3 py-2.5"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {site.name}
                  </p>
                  <p className="text-[11px] text-stone-500">Para fichaje y TPV</p>
                </div>
              </div>
              {site.primary ? (
                <span className="shrink-0 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                  Principal
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
