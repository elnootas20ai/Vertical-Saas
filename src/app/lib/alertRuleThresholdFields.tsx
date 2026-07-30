import type { CashRegisterOperationalConfig, DeliveryOperationalConfig } from './settingsApi';

type OpSource = 'delivery' | 'cashRegister';

export type ThresholdFieldDef = {
  source: OpSource;
  path: string;
  /** Etiqueta junto al campo */
  label: string;
  /** Qué significa este valor y cuándo cuenta */
  hint: string;
  suffix?: string;
  min: number;
  max: number;
  step?: number;
  type?: 'number' | 'time';
};

type RuleThresholdHelp = {
  /** Frase que introduce los campos de esta alerta */
  intro: string;
  /** Nota extra al pie (opcional) */
  footer?: string;
};

const RULE_HELP: Record<string, RuleThresholdHelp> = {
  delivery_delayed_order: {
    intro: 'Aviso operativo por fase (in-app). Para el móvil del dueño usa «Pedido muy retrasado».',
    footer: 'El reloj de cada fase empieza al entrar en ese estado.',
  },
  delivery_order_very_delayed: {
    intro: 'Aviso al móvil si un pedido activo supera este tiempo desde que se creó:',
    footer: 'Por defecto 60 minutos. Cámbialo aquí según tu operativa.',
  },
  delivery_register_closed_ok: {
    intro: 'Te avisa al cerrar la caja cuando el contado cuadra (sin descuadre).',
    footer: 'Ideal para saber que el turno cerró bien aunque no estés en el local.',
  },
  delivery_register_closed_discrepancy: {
    intro: 'Te avisa al cerrar la caja si hay cualquier diferencia de efectivo:',
    footer: 'Complementa el umbral de «Descuadre de caja» del motor de alertas.',
  },
  delivery_unattended: {
    intro: 'Aviso si un pedido recién entrado nadie lo atiende en este tiempo:',
    footer: 'Cuenta desde que el pedido aparece como «nuevo» en el sistema.',
  },
  delivery_kitchen_saturated: {
    intro: 'Aviso según cuántos pedidos hay en cocina respecto a tu capacidad:',
    footer: 'Ejemplo: capacidad 10 y aviso 70 % → alerta con 7 pedidos en cocina.',
  },
  delivery_queue_overflow: {
    intro: 'Aviso si la cola de cocina se desborda respecto a tu capacidad:',
    footer: 'Suma pedidos en cola y en cocina; el crítico % marca el tope máximo.',
  },
  delivery_rider_saturated: {
    intro: 'Aviso si hay demasiados repartos para los riders activos:',
    footer: 'Ejemplo: 8 pedidos en reparto y 2 riders → ratio 4. Si máx/rider es 3, salta aviso.',
  },
  delivery_unassigned_order: {
    intro: 'Relacionado con la carga de reparto — mismo tope de pedidos por rider:',
    footer: 'Complementa la alerta de pedidos sin repartidor asignado.',
  },
  delivery_channel_silent: {
    intro: 'Aviso si un canal de pedidos (web, app, agregador…) deja de recibir pedidos:',
    footer: 'Solo en horario activo del negocio; evita falsas alarmas de madrugada.',
  },
  delivery_low_margin: {
    intro: 'Aviso si el margen estimado del día en delivery cae por debajo de:',
    footer: 'Se calcula con pedidos entregados o en reparto y el coste de carta del día.',
  },
  delivery_failed_delivery: {
    intro: 'Aviso si en un mismo día se acumulan entregas fallidas o canceladas tras salir a reparto:',
    footer: 'Cada pedido que pasa a incidencia o cancelado tras reparto suma al contador diario.',
  },
  delivery_unpaid_order: {
    intro: 'Aviso si un pedido ya entregado sigue sin cobrarse pasado este tiempo:',
    footer: 'Tiempo desde la entrega (o última actualización) hasta que queda registrado el cobro.',
  },
  delivery_repeat_incident_client: {
    intro: 'Aviso si el mismo cliente repite incidencias en el periodo indicado:',
    footer: 'Identifica por teléfono, nombre o ficha de cliente.',
  },
  delivery_driver_mismatch: {
    intro: 'Aviso al cerrar la caja de un repartidor si la diferencia supera:',
    footer: 'Compara el efectivo contado con lo que el sistema esperaba en esa sesión.',
  },
  delivery_cash_pending_close: {
    intro: 'Aviso si una caja TPV sigue abierta cuando debería estar cerrada:',
    footer: 'Tras la hora límite se espera la tolerancia en minutos antes de escalar la urgencia.',
  },
  delivery_register_not_opened: {
    intro: 'Aviso si a esta hora del día una caja activa aún no se ha abierto:',
    footer: 'Comprueba cada terminal activo del punto de venta.',
  },
  delivery_cash_discrepancy: {
    intro: 'Aviso al cerrar caja si la diferencia entre esperado y contado supera:',
    footer: 'Diferencia en valor absoluto (da igual si sobra o falta dinero).',
  },
  register_high_return: {
    intro: 'Aviso si el importe acumulado de devoluciones del día supera:',
    footer: 'Suma las devoluciones registradas en cierres de caja del día.',
  },
};

const RULE_FIELDS: Record<string, ThresholdFieldDef[]> = {
  delivery_order_very_delayed: [
    {
      source: 'delivery', path: 'delayThresholds.orderTotal', label: 'Tiempo total del pedido',
      hint: 'Minutos desde que se crea el pedido hasta que sigue activo (default 60 = 1 h).',
      suffix: 'min', min: 15, max: 240,
    },
  ],
  delivery_delayed_order: [
    {
      source: 'delivery', path: 'delayThresholds.pending', label: 'Estado «nuevo»',
      hint: 'Minutos máximos sin que nadie tome el pedido.',
      suffix: 'min', min: 3, max: 120,
    },
    {
      source: 'delivery', path: 'delayThresholds.kitchen', label: 'En cocina',
      hint: 'Minutos máximos en preparación.',
      suffix: 'min', min: 3, max: 120,
    },
    {
      source: 'delivery', path: 'delayThresholds.delivery', label: 'En reparto',
      hint: 'Minutos máximos hasta entregar al cliente.',
      suffix: 'min', min: 5, max: 180,
    },
  ],
  delivery_unattended: [
    {
      source: 'delivery', path: 'delayThresholds.pending', label: 'Sin atender',
      hint: 'Minutos desde que entra el pedido hasta que alguien lo gestiona.',
      suffix: 'min', min: 3, max: 120,
    },
  ],
  delivery_kitchen_saturated: [
    {
      source: 'delivery', path: 'kitchenCapacity', label: 'Capacidad cocina',
      hint: 'Nº de pedidos en cocina que consideras «normal» (tu techo operativo).',
      suffix: 'ped.', min: 1, max: 50,
    },
    {
      source: 'delivery', path: 'kitchenWarningPercent', label: 'Aviso carga alta',
      hint: '% de capacidad para aviso preventivo (antes del crítico).',
      suffix: '%', min: 30, max: 95,
    },
    {
      source: 'delivery', path: 'kitchenCriticalPercent', label: 'Saturación crítica',
      hint: '% de capacidad para alerta urgente de cocina llena.',
      suffix: '%', min: 50, max: 100,
    },
  ],
  delivery_queue_overflow: [
    {
      source: 'delivery', path: 'kitchenCapacity', label: 'Capacidad cocina',
      hint: 'Pedidos simultáneos que la cocina puede asumir sin desbordarse.',
      suffix: 'ped.', min: 1, max: 50,
    },
    {
      source: 'delivery', path: 'kitchenCriticalPercent', label: 'Desborde crítico',
      hint: '% de capacidad (cola + cocina) que dispara la alerta.',
      suffix: '%', min: 50, max: 100,
    },
  ],
  delivery_rider_saturated: [
    {
      source: 'delivery', path: 'maxOrdersPerRider', label: 'Máx. por repartidor',
      hint: 'Pedidos en reparto simultáneos por cada rider activo.',
      suffix: 'ped.', min: 1, max: 15,
    },
    {
      source: 'delivery', path: 'riderWarningRatio', label: 'Aviso previo',
      hint: 'Ratio pedidos/rider que activa aviso antes del máximo.',
      suffix: 'ratio', min: 1, max: 12,
    },
  ],
  delivery_unassigned_order: [
    {
      source: 'delivery', path: 'maxOrdersPerRider', label: 'Carga reparto',
      hint: 'Mismo tope de pedidos por rider (coherente con «Reparto saturado»).',
      suffix: 'ped.', min: 1, max: 15,
    },
  ],
  delivery_channel_silent: [
    {
      source: 'delivery', path: 'channelSilenceMinutes', label: 'Sin actividad',
      hint: 'Minutos sin ningún pedido nuevo en ese canal.',
      suffix: 'min', min: 15, max: 480,
    },
  ],
  delivery_low_margin: [
    {
      source: 'delivery', path: 'lowMarginThresholdPercent', label: 'Margen mínimo',
      hint: 'Porcentaje de margen; si el día cae por debajo, avisamos.',
      suffix: '%', min: 5, max: 60,
    },
  ],
  delivery_failed_delivery: [
    {
      source: 'delivery', path: 'failedDeliveryThreshold', label: 'Fallos en el día',
      hint: 'Nº de entregas fallidas o canceladas (tras reparto) que disparan alerta.',
      suffix: 'ud.', min: 1, max: 20,
    },
  ],
  delivery_unpaid_order: [
    {
      source: 'delivery', path: 'unpaidGraceMinutes', label: 'Tiempo de gracia',
      hint: 'Minutos tras la entrega antes de avisar que sigue sin cobrar.',
      suffix: 'min', min: 5, max: 240,
    },
  ],
  delivery_repeat_incident_client: [
    {
      source: 'delivery', path: 'repeatIncidentThreshold', label: 'Incidencias',
      hint: 'Cuántas incidencias del mismo cliente en el periodo.',
      suffix: 'ud.', min: 2, max: 15,
    },
    {
      source: 'delivery', path: 'repeatIncidentWindowDays', label: 'Periodo',
      hint: 'Días hacia atrás que miramos el historial del cliente.',
      suffix: 'días', min: 7, max: 365,
    },
  ],
  delivery_driver_mismatch: [
    {
      source: 'delivery', path: 'driverMismatchThreshold', label: 'Diferencia máx.',
      hint: 'Euros de descuadre al cerrar la caja del repartidor.',
      suffix: '€', min: 1, max: 100,
    },
  ],
  delivery_cash_pending_close: [
    {
      source: 'cashRegister', path: 'cashCloseDeadline', label: 'Hora límite cierre',
      hint: 'A partir de esta hora se espera que la caja esté cerrada.',
      type: 'time', min: 0, max: 0,
    },
    {
      source: 'cashRegister', path: 'cashMaxOpenHours', label: 'Máx. horas abierta',
      hint: 'Horas seguidas con sesión abierta (caja «olvidada»).',
      suffix: 'h', min: 4, max: 24,
    },
    {
      source: 'cashRegister', path: 'cashWarningMinutes', label: 'Tolerancia',
      hint: 'Minutos extra tras la hora límite antes de subir urgencia.',
      suffix: 'min', min: 5, max: 180,
    },
  ],
  delivery_register_not_opened: [
    {
      source: 'cashRegister', path: 'registerNotOpenedCheckHour', label: 'Comprobar desde',
      hint: 'Hora del día (0–23) a partir de la cual exigimos caja abierta.',
      suffix: 'h', min: 6, max: 14,
    },
  ],
  delivery_cash_discrepancy: [
    {
      source: 'cashRegister', path: 'discrepancyThreshold', label: 'Descuadre máx.',
      hint: 'Euros de diferencia al cerrar para generar alerta.',
      suffix: '€', min: 1, max: 500, step: 5,
    },
  ],
  register_high_return: [
    {
      source: 'cashRegister', path: 'highReturnThreshold', label: 'Devoluciones máx.',
      hint: 'Importe total de devoluciones del día que consideras elevado.',
      suffix: '€', min: 10, max: 1000, step: 10,
    },
  ],
};

export function getRuleThresholdFields(ruleId: string): ThresholdFieldDef[] | null {
  return RULE_FIELDS[ruleId] ?? null;
}

export function getRuleThresholdHelp(ruleId: string): RuleThresholdHelp | null {
  return RULE_HELP[ruleId] ?? null;
}

function readOpValue(
  delivery: DeliveryOperationalConfig,
  cash: CashRegisterOperationalConfig,
  field: ThresholdFieldDef,
): string | number {
  if (field.path.startsWith('delayThresholds.')) {
    const key = field.path.split('.')[1] as keyof DeliveryOperationalConfig['delayThresholds'];
    return delivery.delayThresholds[key];
  }
  const src = field.source === 'delivery' ? delivery : cash;
  const v = (src as Record<string, unknown>)[field.path];
  if (field.type === 'time') return String(v ?? '23:30');
  return Number(v ?? 0);
}

function writeOpValue(
  delivery: DeliveryOperationalConfig,
  cash: CashRegisterOperationalConfig,
  field: ThresholdFieldDef,
  raw: string,
): { delivery: DeliveryOperationalConfig; cashRegister: CashRegisterOperationalConfig } {
  if (field.path.startsWith('delayThresholds.')) {
    const key = field.path.split('.')[1] as keyof DeliveryOperationalConfig['delayThresholds'];
    return {
      delivery: {
        ...delivery,
        delayThresholds: { ...delivery.delayThresholds, [key]: Number(raw) },
      },
      cashRegister: cash,
    };
  }
  if (field.source === 'delivery') {
    return {
      delivery: { ...delivery, [field.path]: field.type === 'time' ? raw : Number(raw) },
      cashRegister: cash,
    };
  }
  return {
    delivery,
    cashRegister: {
      ...cash,
      [field.path]: field.type === 'time' ? raw : Number(raw),
    },
  };
}

const inputCls =
  'w-16 px-2 py-1.5 text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50';

export function RuleThresholdQuickEdit({
  ruleId,
  delivery,
  cashRegister,
  disabled,
  onChange,
}: {
  ruleId: string;
  delivery: DeliveryOperationalConfig;
  cashRegister: CashRegisterOperationalConfig;
  disabled?: boolean;
  onChange: (next: { delivery: DeliveryOperationalConfig; cashRegister: CashRegisterOperationalConfig }) => void;
}) {
  const fields = getRuleThresholdFields(ruleId);
  const help = getRuleThresholdHelp(ruleId);
  if (!fields?.length) return null;

  return (
    <div
      className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 px-3 py-3 dark:border-teal-900/50 dark:bg-teal-950/20"
      onClick={(e) => e.stopPropagation()}
    >
      {help?.intro ? (
        <p className="text-xs font-medium text-teal-900/90 dark:text-teal-100/90 leading-snug mb-3">
          {help.intro}
        </p>
      ) : null}

      <div className="space-y-3">
        {fields.map((field) => {
          const value = readOpValue(delivery, cashRegister, field);
          return (
            <div key={field.path} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <label className="flex shrink-0 items-center gap-2 sm:w-44 sm:pt-1">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                  {field.label}
                </span>
                {field.type === 'time' ? (
                  <input
                    type="time"
                    disabled={disabled}
                    title={field.hint}
                    className={`${inputCls} w-[6.5rem]`}
                    value={String(value)}
                    onChange={(e) => onChange(writeOpValue(delivery, cashRegister, field, e.target.value))}
                  />
                ) : (
                  <input
                    type="number"
                    disabled={disabled}
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    title={field.hint}
                    className={inputCls}
                    value={Number(value)}
                    onChange={(e) => onChange(writeOpValue(delivery, cashRegister, field, e.target.value))}
                  />
                )}
                {field.suffix ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{field.suffix}</span>
                ) : null}
              </label>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed sm:flex-1 sm:pt-1.5">
                {field.hint}
              </p>
            </div>
          );
        })}
      </div>

      {help?.footer ? (
        <p className="mt-3 pt-2 border-t border-teal-200/60 dark:border-teal-800/40 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {help.footer}
        </p>
      ) : null}

      {disabled ? (
        <p className="mt-2 text-[10px] italic text-gray-400">
          Activa la alerta (interruptor verde) para poder editar estos valores.
        </p>
      ) : null}
    </div>
  );
}
