import { FileArchive, FileWarning, UserCheck } from 'lucide-react';

type Mode = 'invite' | 'hr' | 'worker';

/** Qué completa el trabajador (ficha) — más concreto que solo el label corto. */
const WORKER_SPECIFICS = [
  'DNI / NIE (documento de identidad)',
  'Fecha de nacimiento',
  'Nacionalidad',
  'Dirección completa + ciudad',
  'Nº Seguridad Social',
  'IBAN / cuenta bancaria para el cobro',
  'Contacto de emergencia (nombre y teléfono)',
] as const;

/** Qué cierra el Gestor / RRHH en el alta. */
const GESTOR_ALTA_SPECIFICS = [
  'Fecha de alta en la empresa',
  'Grupo de cotización (Seguridad Social)',
  'Mutua de accidentes',
  'Tipo de contrato y condiciones',
  'Centro / tienda de asignación',
  'Función y permisos en Vertial',
] as const;

/** Qué hace el Gestor cada mes con las nóminas. */
const GESTOR_NOMINAS_SPECIFICS = [
  'Preparar un ZIP con un PDF por trabajador',
  'Nombrar cada PDF con nombre o DNI (ej. nomina_ana_lopez_2026_05.pdf)',
  'Opcional: CSV archivo;nombre;dni si el nombre no basta',
  'Equipo → Nóminas → Subir ZIP nóminas',
  'Revisar asignaciones y publicar',
] as const;

/**
 * Bloque «Gestor» / RRHH: comparativa concreta trabajador vs gestor.
 * Se usa en invitación, ficha de equipo y pantallas RRHH.
 */
export function HrGestorChecklist({
  mode = 'invite',
  compact = false,
  className = '',
}: {
  mode?: Mode;
  compact?: boolean;
  className?: string;
}) {
  const title =
    mode === 'worker'
      ? 'Qué completa cada uno'
      : mode === 'hr'
        ? 'Apartado Gestor (RRHH)'
        : 'Apartado Gestor';

  const subtitle =
    mode === 'hr'
      ? 'Alta laboral + nóminas mensuales: qué toca al trabajador y qué al Gestor.'
      : 'Al invitar: el trabajador rellena su ficha; el Gestor cierra el alta y sube las nóminas.';

  return (
    <div className={`rounded-2xl border border-violet-200 bg-violet-50/90 dark:border-violet-800 dark:bg-violet-950/30 ${compact ? 'p-3' : 'p-4'} ${className}`}>
      <div className="mb-2 flex items-start gap-2">
        <FileWarning className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} mt-0.5 shrink-0 text-violet-600 dark:text-violet-400`} />
        <div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-violet-900 dark:text-violet-100`}>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-violet-700/90 dark:text-violet-300/90">
            {subtitle}
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-2 ${compact ? '' : 'md:grid-cols-2'}`}>
        <div className="rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5 dark:border-blue-900 dark:bg-gray-900/40">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-blue-800 dark:text-blue-300">
            <UserCheck className="h-3.5 w-3.5" />
            Trabajador (en su app)
          </p>
          <ul className="space-y-1">
            {WORKER_SPECIFICS.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-blue-700 dark:text-blue-300">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 dark:border-violet-900 dark:bg-gray-900/40">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-violet-800 dark:text-violet-300">
            <FileWarning className="h-3.5 w-3.5" />
            Gestor — alta laboral
          </p>
          <ul className="space-y-1">
            {GESTOR_ALTA_SPECIFICS.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-violet-700 dark:text-violet-300">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">
          <FileArchive className="h-3.5 w-3.5" />
          Gestor — nóminas del mes (ZIP)
        </p>
        <ul className="space-y-1">
          {GESTOR_NOMINAS_SPECIFICS.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {!compact && (
          <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            No hace falta Excel de nóminas: solo el ZIP con los PDFs.
          </p>
        )}
      </div>
    </div>
  );
}
