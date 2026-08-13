import {
  Package,
  BarChart2,
  Users,
  Wallet,
  FileText,
  ScanLine,
  Layers,
  Clock,
  AlertTriangle,
  Store,
  ShoppingBag,
  Percent,
  TrendingUp,
  Repeat,
  UserX,
  PieChart,
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Scale,
  CalendarRange,
  Target,
  Building2,
  Filter,
  Info,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type {
  DeliveryInformeCategoryId,
  DeliveryInformeEntry,
  DeliveryInformeNivel,
} from './deliveryInformesCatalog';
import {
  DELIVERY_INFORMES_CATEGORIES,
  DELIVERY_INFORMES_CATALOG,
  countInformesInCategory,
  getInformesByCategory,
} from './deliveryInformesCatalog';

const CATEGORY_ICON: Record<DeliveryInformeCategoryId, LucideIcon> = {
  finanzas: Wallet,
  negocio: BarChart2,
  clientes: Users,
  stock: Package,
  equipo: Users,
  facturacion: FileText,
  ocr: ScanLine,
};

const ENTRY_ICON: Partial<Record<DeliveryInformeEntry['id'], LucideIcon>> = {
  resumen: TrendingUp,
  canales: BarChart2,
  rendimiento: Clock,
  incidencias: AlertTriangle,
  productos: Package,
  tiendas: Store,
  'negocio-ticket-medio': TrendingUp,
  'negocio-volumen': Layers,
  'negocio-embudo': Filter,
  'negocio-ciclo': Clock,
  'negocio-conversiones': Percent,
  'negocio-prevision': Target,
  'clientes-activos': Users,
  'clientes-nuevos-vs-recurrentes': Users,
  'clientes-ingresos': TrendingUp,
  'clientes-frecuencia-compra': Repeat,
  'clientes-en-riesgo': UserX,
  'clientes-ltv': PieChart,
  'clientes-productos-top': ShoppingBag,
  'clientes-proporcion-ticket': Percent,
  'clientes-evolucion-ticket': TrendingUp,
  'clientes-frecuencia': Repeat,
  'clientes-inactivos': UserX,
  'clientes-concentracion': PieChart,
  'finanzas-ingresos': ArrowUpCircle,
  'finanzas-gastos': ArrowDownCircle,
  'finanzas-margen': Percent,
  'finanzas-flujo-caja': Landmark,
  'finanzas-cuenta-resultados': FileText,
  'finanzas-resultado-ytd': CalendarRange,
  'finanzas-presupuesto-vs-real': Target,
  'finanzas-rentabilidad-centro': Building2,
  'finanzas-ebitda': Scale,
  'finanzas-caja': Wallet,
  'equipo-fichajes': Users,
  'equipo-horas': Clock,
  'equipo-asistencia': Users,
  'equipo-consumos': Package,
  'equipo-productividad': TrendingUp,
  'equipo-rendimiento-depto': Building2,
  'equipo-coste-hora': Percent,
  'equipo-impacto-resultados': Target,
  'equipo-ventas-trabajador': Users,
  'facturacion-emitida': FileText,
  'facturacion-recibida': FileText,
  'facturacion-pendientes': FileText,
  'facturacion-dias-cobro': Clock,
  'facturacion-conciliacion': Landmark,
  'facturacion-desviaciones': AlertTriangle,
  'facturacion-exportacion': FileText,
  'stock-estado': Package,
  'stock-alertas': AlertTriangle,
  'stock-rotacion': Package,
  'stock-compras-proveedor': Truck,
  'stock-dependencia-proveedores': Building2,
  'stock-punto-pedido': Target,
  'stock-escandallo': FileText,
  'stock-reductores': Percent,
};

function NivelBadge({ nivel }: { nivel?: DeliveryInformeNivel }) {
  if (!nivel || nivel === 'base') return null;
  if (nivel === 'normal') {
    return (
      <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        NORMAL
      </span>
    );
  }
  return (
    <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      PRO
    </span>
  );
}

function InformeRow({
  entry,
  onOpen,
}: {
  entry: DeliveryInformeEntry;
  onOpen: (entry: DeliveryInformeEntry) => void;
}) {
  const Icon = ENTRY_ICON[entry.id] || CATEGORY_ICON[entry.category] || FileText;
  const iconTone =
    entry.category === 'clientes'
      ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300'
      : entry.category === 'stock'
        ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300'
        : entry.category === 'equipo'
          ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300'
          : entry.category === 'facturacion'
            ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300'
            : entry.category === 'negocio'
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
              : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300';
  const hoverTone =
    entry.category === 'clientes'
      ? 'hover:border-teal-200 hover:bg-teal-50/40 dark:hover:border-teal-800 dark:hover:bg-teal-950/20'
      : entry.category === 'stock'
        ? 'hover:border-orange-200 hover:bg-orange-50/40 dark:hover:border-orange-800 dark:hover:bg-orange-950/20'
        : entry.category === 'equipo'
          ? 'hover:border-red-200 hover:bg-red-50/40 dark:hover:border-red-800 dark:hover:bg-red-950/20'
          : entry.category === 'facturacion'
            ? 'hover:border-violet-200 hover:bg-violet-50/40 dark:hover:border-violet-800 dark:hover:bg-violet-950/20'
            : 'hover:border-rose-200 hover:bg-rose-50/40 dark:hover:border-rose-800 dark:hover:bg-rose-950/20';
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={`group flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-colors dark:border-stone-700 dark:bg-stone-900 ${hoverTone}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{entry.title}</span>
          <NivelBadge nivel={entry.nivel} />
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-stone-500">
        Ver →
      </span>
    </button>
  );
}

export function DeliveryInformesCatalogView({
  category,
  onCategoryChange,
  onOpen,
}: {
  category: DeliveryInformeCategoryId;
  onCategoryChange: (id: DeliveryInformeCategoryId) => void;
  onOpen: (entry: DeliveryInformeEntry) => void;
}) {
  const items = getInformesByCategory(category);
  const extraHidden = DELIVERY_INFORMES_CATALOG.filter(
    (e) => e.category === category && e.hubHidden,
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-stone-200 pb-px dark:border-stone-700">
        {DELIVERY_INFORMES_CATEGORIES.map((cat) => {
          const count = countInformesInCategory(cat.id);
          const active = cat.id === category;
          const Icon = CATEGORY_ICON[cat.id];
          const activeCls =
            cat.id === 'clientes'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : cat.id === 'stock'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : cat.id === 'equipo'
                  ? 'border-red-500 text-red-600 dark:text-red-400'
                  : cat.id === 'facturacion'
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-rose-500 text-rose-600 dark:text-rose-400';
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                active
                  ? activeCls
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>
                {cat.label}
                {count > 0 ? ` (${count})` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Sin informes en esta categoría</p>
          <p className="mt-1 text-xs text-stone-500">Mándame la captura y los relleno.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((entry) => (
            <InformeRow key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      )}

      {extraHidden.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
            {category === 'clientes' ? 'Delivery · métricas pedido' : 'Delivery · datos reales'}
          </p>
          {extraHidden.map((entry) => (
            <InformeRow key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      )}

      <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div>
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">Catálogo de informes</p>
          <p className="mt-0.5 text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/80">
            Los informes marcados con NORMAL o PRO requieren una suscripción de nivel superior. Todos los informes utilizan la misma plantilla unificada con gráficos interactivos, filtros avanzados y exportación.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DeliveryInformeSkeletonPanel({
  entry,
  onBack,
}: {
  entry: DeliveryInformeEntry;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
      >
        ← Volver al catálogo
      </button>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{entry.title}</h2>
          <NivelBadge nivel={entry.nivel} />
        </div>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{entry.description}</p>
        <p className="mt-4 text-xs text-stone-500">
          Esqueleto — sin datos todavía. Lo definimos cuando toque.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
          ))}
        </div>
        <div className="mt-4 h-48 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
        <div className="mt-4 h-32 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
      </div>
    </div>
  );
}
