import React, { useEffect, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
  Star,
  ThumbsDown,
  Radio,
  User,
  Clock,
  Car,
  RotateCcw,
  DollarSign,
  ShieldAlert,
  Target,
  Eye,
  Flame,
  ExternalLink,
  Trophy,
  Timer,
  AlertTriangle,
} from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type MarketSentiment = 'NEUTRAL' | 'ALCISTA' | 'BAJISTA';

export interface AgentOperation {
  id: string;
  agente: string;
  vehiculo: string;
  margen: number;       // en €
  margenPct: number;    // en %
  dias: number;         // días en stock
}

export interface LiveOperation {
  id: string;
  agente: string;
  vehiculo: string;
  fase: 'Negociación' | 'Prueba' | 'Financiación' | 'Reserva' | 'Firma';
  minutos: number;      // tiempo en esta fase
}

export interface AgentRanking {
  id: string;
  agente: string;
  color: string;
  operaciones: number;
  margenTotal: number;    // en €
  diasMedio: number;      // días medios para cerrar
  tendencia: 'sube' | 'baja' | 'igual';
}

export interface StuckVehicle {
  id: string;
  vehiculo: string;
  agente: string;
  diasEnStock: number;
  precioActual: number;
  precioSugerido: number;
}

export interface PriceAlert {
  id: string;
  vehiculo: string;
  tipo: 'sube' | 'baja';
  cambioPct: number;
  precioAnterior: number;
  precioActual: number;
  minutos: number;
}

export interface LiveMarketData {
  sentiment: MarketSentiment;
  changePercent: number;       // ej: -22
  upMoves: number;             // ej: 78
  downMoves: number;           // ej: 140
  unrealizedPnL: number;       // ej: -214.98
  lastUpdated?: string;        // ISO
  totalSymbols?: number;       // ej: 220
}

/** Resumen de un evento de Polymarket para mostrar en el sidebar */
export interface PolymarketEventSummary {
  id: string;
  title: string;
  slug?: string;
  endDate?: string;
  yesPrice: number;    // 0-1
  noPrice: number;     // 0-1
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  enableOrderBook: boolean;
}

interface LiveMarketSidebarProps {
  data?: LiveMarketData;
  isOpen: boolean;
  onClose: () => void;
  /** Eventos de Polymarket para mostrar cierres próximos y mejores oportunidades */
  polymarketEvents?: PolymarketEventSummary[];
  /** Callback al hacer click en un evento de Polymarket */
  onPolymarketEventClick?: (id: string) => void;
}

// ─── Datos de demo ────────────────────────────────────────────────────────────

const DEMO_DATA: LiveMarketData = {
  sentiment: 'NEUTRAL',
  changePercent: 0,
  upMoves: 0,
  downMoves: 0,
  unrealizedPnL: 0,
  lastUpdated: new Date().toISOString(),
  totalSymbols: 0,
};

const TOP_OPS_DEMO: AgentOperation[] = [];

const BOTTOM_OPS_DEMO: AgentOperation[] = [];

const LIVE_OPS_DEMO: LiveOperation[] = [];

const AGENT_RANKING_DEMO: AgentRanking[] = [];

const SPEED_RANKING_DEMO: AgentRanking[] = [];

const STUCK_VEHICLES_DEMO: StuckVehicle[] = [];

const PRICE_ALERTS_DEMO: PriceAlert[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sentimentConfig(s: MarketSentiment) {
  switch (s) {
    case 'ALCISTA':
      return {
        label: 'Mercado al alza',
        sublabel: 'Hay más compradores que vendedores',
        dummyLabel: '',
        emoji: '🚀',
        icon: TrendingUp,
        dot: 'bg-emerald-400',
        badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        glow: 'shadow-emerald-100',
        bar: 'bg-emerald-500',
        pulse: 'bg-emerald-400',
        textColor: 'text-emerald-600',
      };
    case 'BAJISTA':
      return {
        label: 'Mercado a la baja',
        sublabel: 'Hay más vendedores que compradores',
        dummyLabel: '',
        emoji: '📉',
        icon: TrendingDown,
        dot: 'bg-red-400',
        badge: 'bg-red-100 text-red-700 border border-red-200',
        glow: 'shadow-red-100',
        bar: 'bg-red-500',
        pulse: 'bg-red-400',
        textColor: 'text-red-600',
      };
    default:
      return {
        label: 'Mercado en equilibrio',
        sublabel: 'Compradores y vendedores igualados',
        dummyLabel: '',
        emoji: '⚖️',
        icon: Activity,
        dot: 'bg-amber-400',
        badge: 'bg-amber-100 text-amber-700 border border-amber-200',
        glow: 'shadow-amber-100',
        bar: 'bg-amber-500',
        pulse: 'bg-amber-400',
        textColor: 'text-amber-600',
      };
  }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

function timeAgo(iso?: string) {
  if (!iso) return 'Ahora mismo';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}min`;
  return `Hace ${Math.floor(diff / 3600)}h`;
}

// ─── Mini sparkline animado ───────────────────────────────────────────────────

function Sparkline({ positive }: { positive: boolean }) {
  const points = positive
    ? [40, 35, 38, 30, 25, 28, 20, 15, 18, 10]
    : [10, 15, 12, 20, 25, 22, 30, 35, 32, 40];

  const max = Math.max(...points);
  const min = Math.min(...points);
  const h = 32;
  const w = 80;
  const pts = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${x},${y}`;
    })
    .join(' ');

  const color = positive ? '#10b981' : '#ef4444';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

// ─── Barra de fuerza comprador/vendedor ───────────────────────────────────────

function StrengthBar({ up, down }: { up: number; down: number }) {
  const total = up + down;
  const upPct = total > 0 ? Math.round((up / total) * 100) : 50;
  const downPct = 100 - upPct;

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
        <span className="flex items-center gap-1">
          <ChevronUp className="w-3 h-3 text-emerald-500" />
          Compradores {upPct}%
        </span>
        <span className="flex items-center gap-1">
          Vendedores {downPct}%
          <ChevronDown className="w-3 h-3 text-red-500" />
        </span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
        <div
          className="bg-emerald-500 transition-all duration-700"
          style={{ width: `${upPct}%` }}
        />
        <div
          className="bg-red-400 transition-all duration-700"
          style={{ width: `${downPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
        <span>{up} subidas</span>
        <span>{down} bajadas</span>
      </div>
    </div>
  );
}

// ─── TOP MOVERS: bloque colapsable ───────────────────────────────────────────

type TopMoversVariant = 'top' | 'bottom' | 'live';

interface TopMoversBlockProps {
  variant: TopMoversVariant;
  topOps?: AgentOperation[];
  bottomOps?: AgentOperation[];
  liveOps?: LiveOperation[];
}

const FASE_COLORS: Record<LiveOperation['fase'], string> = {
  Negociación: 'bg-amber-100 text-amber-700',
  Prueba:       'bg-blue-100 text-blue-700',
  Financiación: 'bg-purple-100 text-purple-700',
  Reserva:      'bg-emerald-100 text-emerald-700',
  Firma:        'bg-indigo-100 text-indigo-700',
};

function TopMoversBlock({ variant, topOps = TOP_OPS_DEMO, bottomOps = BOTTOM_OPS_DEMO, liveOps = LIVE_OPS_DEMO }: TopMoversBlockProps) {
  const [open, setOpen] = useState(false);

  const config = {
    top: {
      label: 'Top operaciones · Agentes',
      sublabel: 'Mayores márgenes hoy',
      icon: <Star className="w-3.5 h-3.5 text-amber-500" />,
      headerClass: 'bg-amber-50 border-amber-200',
      dotClass: 'bg-amber-400',
      badgeClass: 'bg-amber-100 text-amber-700',
    },
    bottom: {
      label: 'Menos rentables · Agentes',
      sublabel: 'Operaciones con menor margen',
      icon: <ThumbsDown className="w-3.5 h-3.5 text-red-400" />,
      headerClass: 'bg-red-50 border-red-200',
      dotClass: 'bg-red-400',
      badgeClass: 'bg-red-100 text-red-600',
    },
    live: {
      label: 'En curso ahora mismo',
      sublabel: 'Operaciones activas en vivo',
      icon: <Radio className="w-3.5 h-3.5 text-indigo-500" />,
      headerClass: 'bg-indigo-50 border-indigo-200',
      dotClass: 'bg-indigo-400',
      badgeClass: 'bg-indigo-100 text-indigo-700',
    },
  }[variant];

  return (
    <section className={`rounded-2xl border overflow-hidden ${config.headerClass}`}>
      {/* Header colapsable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border ${config.headerClass} shadow-sm`}>
            {config.icon}
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">{config.label}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{config.sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${config.badgeClass}`}>
            {variant === 'live' ? `${liveOps.length} activas` : `${variant === 'top' ? topOps.length : bottomOps.length} ops`}
          </span>
          {open
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          }
        </div>
      </button>

      {/* Contenido expandido */}
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-3" />

          {variant === 'live' ? (
            liveOps.map((op) => (
              <div key={op.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex items-start gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 flex-shrink-0 mt-0.5">
                  <Radio className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Car className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{op.vehiculo}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <User className="w-2.5 h-2.5" />
                    <span>{op.agente}</span>
                    <span className="text-gray-300">·</span>
                    <Clock className="w-2.5 h-2.5" />
                    <span>{op.minutos}min</span>
                  </div>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${FASE_COLORS[op.fase]}`}>
                  {op.fase}
                </span>
              </div>
            ))
          ) : (
            (variant === 'top' ? topOps : bottomOps).map((op) => {
              const positive = op.margen >= 0;
              return (
                <div key={op.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex items-start gap-2.5">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 mt-0.5 ${positive ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {positive
                      ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Car className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{op.vehiculo}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                      <User className="w-2.5 h-2.5" />
                      <span>{op.agente}</span>
                      <span className="text-gray-300">·</span>
                      <Clock className="w-2.5 h-2.5" />
                      <span>{op.dias}d stock</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {positive ? '+' : ''}{op.margen.toLocaleString('es-ES')}€
                    </p>
                    <p className={`text-[10px] ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
                      {positive ? '+' : ''}{op.margenPct}%
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

// ─── RANKING DE AGENTES (por margen total) ───────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

function AgentLeaderboardBlock({ agents = AGENT_RANKING_DEMO }: { agents?: AgentRanking[] }) {
  const [open, setOpen] = useState(false);
  const totalMargen = agents.reduce((s, a) => s + a.margenTotal, 0);

  return (
    <section className="rounded-2xl border overflow-hidden bg-amber-50 border-amber-200">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-amber-200 shadow-sm">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Ranking · Agentes</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Clasificación por margen total generado</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">
            {agents.length} agentes
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-1" />
          {/* Total del equipo */}
          <div className="bg-amber-100/60 rounded-xl px-3 py-2 flex items-center justify-between mb-2 border border-amber-200/60">
            <p className="text-[10px] text-amber-800 font-semibold">Total equipo este periodo</p>
            <p className="text-sm font-black text-amber-700">+{totalMargen.toLocaleString('es-ES')}€</p>
          </div>
          {agents.map((agent, idx) => {
            const barWidth = Math.round((agent.margenTotal / agents[0].margenTotal) * 100);
            return (
              <div key={agent.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 text-center flex-shrink-0">
                    {idx < 3
                      ? <span className="text-base leading-none">{MEDALS[idx]}</span>
                      : <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                    }
                  </div>
                  <div className="w-5 h-5 rounded-full flex-shrink-0 shadow-sm border border-white/50" style={{ backgroundColor: agent.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{agent.agente}</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500">{agent.operaciones} ops · {agent.diasMedio}d medio</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black text-emerald-600">+{agent.margenTotal.toLocaleString('es-ES')}€</p>
                    <p className={`text-[9px] font-semibold ${agent.tendencia === 'sube' ? 'text-emerald-500' : agent.tendencia === 'baja' ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {agent.tendencia === 'sube' ? '▲ subiendo' : agent.tendencia === 'baja' ? '▼ bajando' : '● estable'}
                    </p>
                  </div>
                </div>
                {/* Barra de progreso relativa */}
                <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%`, backgroundColor: agent.color, opacity: 0.7 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── VELOCIDAD DE CIERRE (ranking por días medios) ────────────────────────────

function SpeedRankingBlock({ agents = SPEED_RANKING_DEMO }: { agents?: AgentRanking[] }) {
  const [open, setOpen] = useState(false);
  const best = agents[0];

  return (
    <section className="rounded-2xl border overflow-hidden bg-blue-50 border-blue-200">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 shadow-sm">
            <Timer className="w-3.5 h-3.5 text-blue-500" />
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Velocidad de Cierre</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Quién cierra operaciones más rápido</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">
            {agents.length} agentes
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-1" />
          {/* Campeón de velocidad */}
          {best && (
            <div className="bg-blue-100/60 rounded-xl px-3 py-2 flex items-center gap-2 mb-2 border border-blue-200/60">
              <span className="text-base">⚡</span>
              <div>
                <p className="text-[10px] font-bold text-blue-800">Más rápido: {best.agente}</p>
                <p className="text-[9px] text-blue-600">Cierra en {best.diasMedio} días de media</p>
              </div>
            </div>
          )}
          {agents.map((agent, idx) => {
            const worst = agents[agents.length - 1].diasMedio;
            const barWidth = Math.round(((worst - agent.diasMedio + 1) / (worst + 1)) * 100);
            const isTop = idx < 2;
            return (
              <div key={agent.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 text-center flex-shrink-0">
                    {idx < 3
                      ? <span className="text-base leading-none">{MEDALS[idx]}</span>
                      : <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                    }
                  </div>
                  <div className="w-5 h-5 rounded-full flex-shrink-0 shadow-sm border border-white/50" style={{ backgroundColor: agent.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{agent.agente}</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500">{agent.operaciones} ops cerradas</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-black tabular-nums ${isTop ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'}`}>
                      {agent.diasMedio}d
                    </p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500">por operación</p>
                  </div>
                </div>
                <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-blue-400"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── STOCK PARADO ─────────────────────────────────────────────────────────────

function StuckInventoryBlock({ vehicles = STUCK_VEHICLES_DEMO }: { vehicles?: StuckVehicle[] }) {
  const [open, setOpen] = useState(false);

  const urgencyStyle = (days: number) => {
    if (days > 60) return { badge: 'bg-red-100 text-red-700 border-red-200', border: 'border-red-100' };
    if (days > 30) return { badge: 'bg-orange-100 text-orange-700 border-orange-200', border: 'border-orange-100' };
    return { badge: 'bg-amber-100 text-amber-700 border-amber-200', border: 'border-amber-100' };
  };

  const totalPotential = vehicles.reduce((s, v) => s + (v.precioActual - v.precioSugerido), 0);

  return (
    <section className="rounded-2xl border overflow-hidden bg-red-50 border-red-200">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-red-200 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Stock Parado 🚨</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Vehículos urgentes con rebaja sugerida</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">
            {vehicles.length} coches
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-1" />
          {/* Rebaja total sugerida */}
          <div className="bg-red-100/60 rounded-xl px-3 py-2 flex items-center justify-between mb-2 border border-red-200/60">
            <p className="text-[10px] text-red-800 font-semibold">Rebaja total sugerida</p>
            <p className="text-sm font-black text-red-700">-{totalPotential.toLocaleString('es-ES')}€</p>
          </div>
          {vehicles.map((v) => {
            const u = urgencyStyle(v.diasEnStock);
            const difPct = Math.round(((v.precioActual - v.precioSugerido) / v.precioActual) * 100);
            return (
              <div key={v.id} className={`bg-white dark:bg-gray-800 rounded-xl border p-3 ${u.border}`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${u.badge}`}>
                    {v.diasEnStock}d
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight truncate">{v.vehiculo}</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500">{v.agente}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-2">
                  <div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Precio actual</p>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular-nums">{v.precioActual.toLocaleString('es-ES')}€</p>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-black text-red-500">−{difPct}%</span>
                    <div className="text-[8px] text-gray-400 dark:text-gray-500">bajar</div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Precio sugerido</p>
                    <p className="text-xs font-black text-emerald-600 tabular-nums">{v.precioSugerido.toLocaleString('es-ES')}€</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── ALERTAS DE PRECIO (tiempo real) ─────────────────────────────────────────

function PriceAlertsBlock({ alerts = PRICE_ALERTS_DEMO }: { alerts?: PriceAlert[] }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...alerts].sort((a, b) => a.minutos - b.minutos);
  const subidas = alerts.filter((a) => a.tipo === 'sube').length;
  const bajadas = alerts.length - subidas;

  return (
    <section className="rounded-2xl border overflow-hidden bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-violet-200 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-violet-500" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Alertas de Precio</p>
              <span
                key={tick}
                className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"
              />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Cambios en tiempo real del mercado</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">
            {alerts.length} alertas
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-1" />
          {/* Mini resumen */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center border border-emerald-100">
              <p className="text-base font-black text-emerald-600 tabular-nums">{subidas}</p>
              <p className="text-[9px] text-emerald-700 font-semibold">▲ Subieron</p>
            </div>
            <div className="bg-red-50 rounded-xl px-3 py-2 text-center border border-red-100">
              <p className="text-base font-black text-red-600 tabular-nums">{bajadas}</p>
              <p className="text-[9px] text-red-600 font-semibold">▼ Bajaron</p>
            </div>
          </div>
          {sorted.map((a) => {
            const isRecent = a.minutos < 15;
            return (
              <div
                key={a.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-3 flex items-center gap-2.5 ${
                  isRecent
                    ? a.tipo === 'sube' ? 'border-emerald-200' : 'border-red-200'
                    : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.tipo === 'sube' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  {a.tipo === 'sube'
                    ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{a.vehiculo}</p>
                    {isRecent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500">
                    hace {a.minutos}min · {a.precioAnterior.toLocaleString('es-ES')}€ → {a.precioActual.toLocaleString('es-ES')}€
                  </p>
                </div>
                <p className={`text-sm font-black tabular-nums flex-shrink-0 ${a.tipo === 'sube' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {a.tipo === 'sube' ? '+' : '−'}{a.cambioPct}%
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Tooltip informativo ──────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

// ─── Helpers Polymarket ───────────────────────────────────────────────────────

function timeUntilClose(endDate?: string): { label: string; level: 'high' | 'medium' | 'low' } | null {
  if (!endDate) return null;
  const diffMs = new Date(endDate).getTime() - Date.now();
  if (diffMs <= 0) return null; // ya cerrado, no mostrar
  const diffH = diffMs / 3_600_000;
  const diffD = diffH / 24;
  if (diffH < 24) return { label: `${Math.round(diffH)}h`, level: 'high' };
  if (diffD < 3)  return { label: `${Math.round(diffD)}d`, level: 'medium' };
  if (diffD < 8)  return { label: `${Math.round(diffD)}d`, level: 'low' };
  return null; // más de 7 días, no urgente
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function formatVol(n?: number): string {
  if (!n) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M$`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k$`;
  return `${n.toFixed(0)}$`;
}

// ─── Bloque: Cierran pronto ───────────────────────────────────────────────────

interface PolymarketBlockProps {
  events: PolymarketEventSummary[];
  onEventClick?: (id: string) => void;
}

function ClosingSoonBlock({ events, onEventClick }: PolymarketBlockProps) {
  const [open, setOpen] = useState(true);

  const closing = events
    .map(ev => ({ ev, time: timeUntilClose(ev.endDate) }))
    .filter(x => x.time !== null)
    .sort((a, b) => new Date(a.ev.endDate!).getTime() - new Date(b.ev.endDate!).getTime())
    .slice(0, 6);

  if (closing.length === 0) return null;

  const levelStyle = {
    high:   { badge: 'bg-red-100 text-red-700 border border-red-200', dot: 'bg-red-500', bar: 'bg-red-500' },
    medium: { badge: 'bg-amber-100 text-amber-700 border border-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-400' },
    low:    { badge: 'bg-blue-100 text-blue-700 border border-blue-200', dot: 'bg-blue-400', bar: 'bg-blue-400' },
  };

  return (
    <section className="rounded-2xl border overflow-hidden bg-orange-50 border-orange-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-orange-200 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Cierran pronto</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Mercados a punto de resolver</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {closing.some(x => x.time!.level === 'high') && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700">
            {closing.length}
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-3" />
          {closing.map(({ ev, time }) => {
            const s = levelStyle[time!.level];
            const positive = ev.yesPrice >= 0.5;
            return (
              <div
                key={ev.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3 cursor-pointer hover:border-orange-200 hover:shadow-sm transition-all"
                onClick={() => onEventClick?.(ev.id)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${s.dot}`} />
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 flex-1 leading-snug">
                    {ev.title}
                  </p>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.badge}`}>
                    {time!.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">Sí</span>
                    <span className={`text-xs font-bold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatPct(ev.yesPrice)}
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${positive ? 'bg-emerald-500' : 'bg-red-400'}`}
                      style={{ width: `${ev.yesPrice * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold ${!positive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatPct(ev.noPrice)}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">No</span>
                  </div>
                </div>
                {ev.enableOrderBook && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-emerald-600 font-medium">Acepta órdenes · puedes invertir</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Bloque: Mejor para ganar (mercados activos con order book) ───────────────

function BestToTradeBlock({ events, onEventClick }: PolymarketBlockProps) {
  const [open, setOpen] = useState(true);

  const tradeable = events
    .filter(ev => ev.enableOrderBook)
    .sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))
    .slice(0, 5);

  const nonTradeable = events
    .filter(ev => !ev.enableOrderBook)
    .sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))
    .slice(0, 3);

  const displayEvents = tradeable.length > 0 ? tradeable : nonTradeable;

  if (displayEvents.length === 0) return null;

  return (
    <section className="rounded-2xl border overflow-hidden bg-emerald-50 border-emerald-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 shadow-sm">
            <Flame className="w-3.5 h-3.5 text-emerald-600" />
          </span>
          <div>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">Mejor para ganar</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {tradeable.length > 0
                ? `${tradeable.length} mercados activos con order book`
                : 'Más volumen últimas 24h'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {tradeable.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
              EN VIVO
            </span>
          )}
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
            {displayEvents.length}
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="w-full h-px bg-white/60 mb-3" />
          {displayEvents.map((ev, idx) => {
            const isHigh = ev.yesPrice >= 0.7;
            const isLow  = ev.yesPrice <= 0.3;
            const isEdge = !isHigh && !isLow; // cerca de 50/50 = más incierto
            return (
              <div
                key={ev.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3 cursor-pointer hover:border-emerald-200 hover:shadow-sm transition-all"
                onClick={() => onEventClick?.(ev.id)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className={`flex-shrink-0 text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full ${
                    idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {idx + 1}
                  </span>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 flex-1 leading-snug">
                    {ev.title}
                  </p>
                </div>

                {/* Barra de probabilidad */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-emerald-600 font-bold w-7">{formatPct(ev.yesPrice)}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${ev.yesPrice * 100}%` }} />
                    <div className="h-full bg-red-400 transition-all" style={{ width: `${ev.noPrice * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-red-500 font-bold w-7 text-right">{formatPct(ev.noPrice)}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ev.enableOrderBook && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        En vivo
                      </span>
                    )}
                    {isEdge && (
                      <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                        50/50 · alta incertidumbre
                      </span>
                    )}
                    {isHigh && (
                      <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        Sí favorito
                      </span>
                    )}
                    {isLow && (
                      <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                        No favorito
                      </span>
                    )}
                  </div>
                  {ev.volume24hr != null && ev.volume24hr > 0 && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {formatVol(ev.volume24hr)} / 24h
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {tradeable.length === 0 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center pt-1">
              Ningún mercado acepta órdenes ahora mismo
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Bloque: Resumen de mercados Polymarket ────────────────────────────────────

function PolymarketSummaryBanner({ events, onEventClick }: PolymarketBlockProps) {
  const total = events.length;
  const live = events.filter(e => e.enableOrderBook).length;
  const closingIn24h = events.filter(e => {
    if (!e.endDate) return false;
    const h = (new Date(e.endDate).getTime() - Date.now()) / 3_600_000;
    return h > 0 && h < 24;
  }).length;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-300" />
        <p className="text-sm font-bold">Mercados Polymarket</p>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
          EN VIVO
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/15 rounded-xl p-2.5 text-center">
          <p className="text-xl font-extrabold">{total}</p>
          <p className="text-[10px] text-white/70 leading-tight">mercados</p>
        </div>
        <div className="bg-white/15 rounded-xl p-2.5 text-center">
          <p className="text-xl font-extrabold text-emerald-300">{live}</p>
          <p className="text-[10px] text-white/70 leading-tight">aceptan órdenes</p>
        </div>
        <div className="bg-white/15 rounded-xl p-2.5 text-center">
          <p className={`text-xl font-extrabold ${closingIn24h > 0 ? 'text-red-300' : 'text-white'}`}>{closingIn24h}</p>
          <p className="text-[10px] text-white/70 leading-tight">cierran &lt;24h</p>
        </div>
      </div>
      {live > 0 && (
        <p className="mt-3 text-[10px] text-white/80 leading-relaxed">
          Hay <strong className="text-emerald-300">{live} mercados activos</strong> donde puedes invertir ahora mismo desde Polymarket.com.
        </p>
      )}
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function LiveMarketSidebar({ data = DEMO_DATA, isOpen, onClose, polymarketEvents, onPolymarketEventClick }: LiveMarketSidebarProps) {
  useModalClose(isOpen, onClose);
  const cfg = sentimentConfig(data.sentiment);
  const SentimentIcon = cfg.icon;
  const pnlPositive = data.unrealizedPnL >= 0;
  const changePositive = data.changePercent >= 0;

  // Pulso vivo cada segundo
  const [pulse, setPulse] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timer.current = setInterval(() => setPulse((p) => !p), 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel lateral */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 z-50 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex flex-col border-b border-gray-100 dark:border-gray-800 bg-gray-950 overflow-hidden">
          {/* Línea de color top */}
          <div className={`h-0.5 ${pnlPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 shadow-lg shadow-indigo-900/40">
                <Zap className="w-4 h-4 text-white" />
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${cfg.pulse} transition-opacity duration-500 ${pulse ? 'opacity-100' : 'opacity-30'}`}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white leading-tight">Mercado en Vivo</p>
                  <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ABIERTO
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{timeAgo(data.lastUpdated)}</p>
                  {data.totalSymbols && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">· {data.totalSymbols} símbolos</p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Contenido scrollable ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ── Secciones Polymarket (cuando se pasan eventos) ── */}
          {polymarketEvents && polymarketEvents.length > 0 && (
            <>
              <PolymarketSummaryBanner events={polymarketEvents} onEventClick={onPolymarketEventClick} />
              <ClosingSoonBlock events={polymarketEvents} onEventClick={onPolymarketEventClick} />
              <BestToTradeBlock events={polymarketEvents} onEventClick={onPolymarketEventClick} />
              {/* Divisor */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Tu mercado interno</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            </>
          )}

          {/* 1 · Estado del mercado */}
          <section className={`rounded-2xl border overflow-hidden shadow-sm ${cfg.glow}`}>
            {/* Cabecera con emoji grande */}
            <div className={`flex items-center justify-between px-4 py-3 ${
              data.sentiment === 'ALCISTA' ? 'bg-emerald-50 border-b border-emerald-100' :
              data.sentiment === 'BAJISTA' ? 'bg-red-50 border-b border-red-100' :
              'bg-amber-50 border-b border-amber-100'
            }`}>
              <div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {data.sentiment}
                </span>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1.5 leading-tight">{cfg.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cfg.dummyLabel}</p>
              </div>
              <span className="text-4xl leading-none ml-2">{cfg.emoji}</span>
            </div>

            {/* Variación del día — número grande */}
            <div className="flex items-center justify-between bg-white dark:bg-gray-900 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Variación del día</p>
                <div className="flex items-center gap-1.5">
                  {changePositive ? (
                    <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5 text-red-500" />
                  )}
                  <span className={`text-3xl font-black tabular-nums ${changePositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {changePositive ? '+' : ''}{data.changePercent}%
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {changePositive ? 'Los precios subieron de media hoy' : 'Los precios bajaron de media hoy'}
                </p>
              </div>
              <Sparkline positive={changePositive} />
            </div>
          </section>

          {/* 2 · Fuerza compradores vs vendedores */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">¿Quién manda hoy?</p>
              <InfoTooltip text="Cuántos vehículos subieron de precio (compradores fuertes) vs cuántos bajaron (vendedores fuertes) en el mercado hoy." />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">Si suben más → buena señal para tu inventario</p>
            <StrengthBar up={data.upMoves} down={data.downMoves} />
          </section>

          {/* 3 · P&L No Realizado */}
          <section className={`rounded-2xl border overflow-hidden ${
            pnlPositive ? 'border-emerald-200' : 'border-red-200'
          }`}>
            {/* Cabecera */}
            <div className={`flex items-center justify-between px-4 py-3 ${
              pnlPositive ? 'bg-emerald-600' : 'bg-red-600'
            }`}>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-white/80" />
                <p className="text-sm font-bold text-white">Si vendes ahora…</p>
              </div>
              <InfoTooltip text="Es el dinero que ganarías o perderías si vendieras todo tu stock ahora mismo. Aún no se ha cobrado." />
            </div>

            {/* Número grande */}
            <div className={`px-4 pt-4 pb-3 ${pnlPositive ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Ganancia / Pérdida latente
              </p>
              <p className={`text-4xl font-black tabular-nums tracking-tight ${
                pnlPositive ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {formatCurrency(data.unrealizedPnL)}
              </p>

              {/* Explicación en lenguaje llano */}
              <div className={`mt-3 rounded-xl px-3 py-2.5 ${
                pnlPositive ? 'bg-emerald-100 border border-emerald-200' : 'bg-red-100 border border-red-200'
              }`}>
                <p className={`text-xs font-semibold leading-relaxed ${pnlPositive ? 'text-emerald-800' : 'text-red-800'}`}>
                  {pnlPositive
                    ? '✓ Tu inventario vale más de lo que costó. Si vendes ahora, ese dinero es tuyo.'
                    : '⚠ Tu inventario vale menos de lo que costó. El mercado bajó los precios de tus coches.'}
                </p>
                <p className={`text-[10px] mt-1 ${pnlPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {pnlPositive
                    ? 'Aún no es real hasta que se venda el vehículo.'
                    : 'Si esperas a que suba el mercado, puedes recuperarlo.'}
                </p>
              </div>
            </div>
          </section>

          {/* 4 · Resumen rápido */}
          <section className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Resumen rápido de hoy</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Vehículos cuyo precio cambió en el mercado</p>
            </div>
            <div className="grid grid-cols-2">
              <div className="bg-white dark:bg-gray-900 p-4 text-center border-r border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <ChevronUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600">Subieron</span>
                </div>
                <p className="text-3xl font-black text-emerald-600 tabular-nums">{data.upMoves}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">vehículos → oportunidad</p>
              </div>

              <div className="bg-white dark:bg-gray-900 p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <ChevronDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-500">Bajaron</span>
                </div>
                <p className="text-3xl font-black text-red-500 tabular-nums">{data.downMoves}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">vehículos → revisar precio</p>
              </div>
            </div>
          </section>

          {/* ── Divisor: secciones de agentes ── */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Operaciones</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* 5 · En vivo ahora mismo */}
          <TopMoversBlock variant="live" />

          {/* 6 · TOP MOVERS: mejores operaciones */}
          <TopMoversBlock variant="top" />

          {/* 7 · BOTTOM MOVERS: peores operaciones */}
          <TopMoversBlock variant="bottom" />

          {/* ── Divisor: rendimiento de agentes ── */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Agentes</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* 8 · Ranking de agentes por margen */}
          <AgentLeaderboardBlock />

          {/* 9 · Velocidad de cierre */}
          <SpeedRankingBlock />

          {/* ── Divisor: inteligencia de mercado ── */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Mercado</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* 10 · Alertas de precio tiempo real */}
          <PriceAlertsBlock />

          {/* 11 · Stock parado */}
          <StuckInventoryBlock />

          {/* ── Divisor: recomendaciones ── */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Acción</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* 12 · Qué significa esto para ti */}
          <section className="rounded-2xl overflow-hidden border border-indigo-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-white" />
              <div>
                <p className="text-sm font-bold text-white">¿Qué hago ahora?</p>
                <p className="text-[10px] text-indigo-200">Acciones recomendadas para hoy</p>
              </div>
            </div>

            {/* Acciones */}
            <div className="bg-indigo-50 p-3 space-y-2">
              {data.sentiment === 'ALCISTA' && (
                <>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-emerald-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] mt-0.5">1</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Sube precios en stock caliente</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">El mercado aguanta precios más altos ahora mismo</p>
                    </div>
                  </div>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-emerald-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] mt-0.5">2</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Vende antes de que baje</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">El alza no dura para siempre, cierra operaciones</p>
                    </div>
                  </div>
                </>
              )}
              {data.sentiment === 'BAJISTA' && (
                <>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-red-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-red-100 text-red-600 font-black text-[10px] mt-0.5">1</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Ajusta precios a la baja</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Rotar stock rápido es mejor que esperar en pérdidas</p>
                    </div>
                  </div>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-red-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-red-100 text-red-600 font-black text-[10px] mt-0.5">2</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">No compres stock nuevo aún</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Espera a que el mercado se estabilice</p>
                    </div>
                  </div>
                </>
              )}
              {data.sentiment === 'NEUTRAL' && (
                <>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-amber-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 font-black text-[10px] mt-0.5">1</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Mantén los precios actuales</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">El mercado está indeciso, sin movimientos bruscos</p>
                    </div>
                  </div>
                  <div className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-amber-100">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 font-black text-[10px] mt-0.5">2</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Vigila el stock más antiguo</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Los coches con más días parados son los más urgentes</p>
                    </div>
                  </div>
                </>
              )}

              {/* Tip final */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-indigo-100/60 rounded-xl border border-indigo-200/50 mt-1">
                <Eye className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-indigo-700 leading-relaxed">
                  <span className="font-bold">Recuerda:</span> cada vehículo vendido al precio correcto es dinero real para tu concesionario.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3 text-gray-600 dark:text-gray-400" />
            <p className="text-[10px] text-gray-600 dark:text-gray-400">En tiempo real · {data.totalSymbols ?? 220} símbolos</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-bold ${
            data.sentiment === 'ALCISTA' ? 'text-emerald-400' :
            data.sentiment === 'BAJISTA' ? 'text-red-400' : 'text-amber-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
            EN VIVO
          </span>
        </div>
      </aside>
    </>
  );
}

// ─── Botón de acceso rápido (para usar en topbar/sidebar) ─────────────────────

interface LiveMarketButtonProps {
  data?: LiveMarketData;
  onClick: () => void;
}

export function LiveMarketButton({ data = DEMO_DATA, onClick }: LiveMarketButtonProps) {
  const cfg = sentimentConfig(data.sentiment);
  const pnlPositive = data.unrealizedPnL >= 0;
  const changePositive = data.changePercent >= 0;
  const total = data.upMoves + data.downMoves;
  const upPct = total > 0 ? Math.round((data.upMoves / total) * 100) : 50;

  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setClockStr(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Gauge arc SVG: semicírculo 180°, el puntero va de rojo (izq) a verde (der)
  const GAUGE_R = 26;
  const GAUGE_CX = 32;
  const GAUGE_CY = 32;
  const gaugeValue = data.sentiment === 'ALCISTA' ? 82 : data.sentiment === 'BAJISTA' ? 18 : 50;
  const gaugeRad = (gaugeValue / 100) * Math.PI; // 0..π
  const needleX = GAUGE_CX + GAUGE_R * Math.cos(Math.PI - gaugeRad);
  const needleY = GAUGE_CY - GAUGE_R * Math.sin(Math.PI - gaugeRad) + GAUGE_R;
  const arcPath = (from: number, to: number, r: number) => {
    const x1 = GAUGE_CX + r * Math.cos(Math.PI - from * Math.PI);
    const y1 = GAUGE_CY - r * Math.sin(Math.PI - from * Math.PI) + GAUGE_R;
    const x2 = GAUGE_CX + r * Math.cos(Math.PI - to * Math.PI);
    const y2 = GAUGE_CY - r * Math.sin(Math.PI - to * Math.PI) + GAUGE_R;
    const large = (to - from) > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col min-w-[230px] rounded-2xl border border-gray-800 bg-gray-950 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-950/40 overflow-hidden text-left"
    >
      {/* Glow ambiental al hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 65%)' }}
      />

      {/* Barra de color superior */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 transition-all duration-700 ${
          pnlPositive ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-500 via-red-400 to-red-500'
        }`}
      />

      {/* ── Fila 1: título + ABIERTO ── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.pulse}`} />
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            Mercado en Vivo
          </span>
        </div>
        <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
          <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${tick % 2 === 0 ? 'opacity-100' : 'opacity-40'} transition-opacity duration-500`} />
          ABIERTO
        </span>
      </div>

      {/* ── Fila 2: Gauge + variación ── */}
      <div className="flex items-center gap-2 px-3 pb-2">
        {/* Mini gauge semicircular */}
        <div className="flex-shrink-0">
          <svg width="64" height="38" viewBox="0 0 64 38" aria-hidden>
            {/* Track gris */}
            <path d={arcPath(0, 1, GAUGE_R - 1)} fill="none" stroke="#374151" strokeWidth="5" strokeLinecap="round" />
            {/* Rojo (bajista) */}
            <path d={arcPath(0, 0.33, GAUGE_R - 1)} fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
            {/* Amarillo (neutral) */}
            <path d={arcPath(0.33, 0.66, GAUGE_R - 1)} fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
            {/* Verde (alcista) */}
            <path d={arcPath(0.66, 1, GAUGE_R - 1)} fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
            {/* Aguja */}
            <line
              x1={GAUGE_CX} y1={GAUGE_CY + GAUGE_R - 2}
              x2={needleX} y2={needleY}
              stroke="white" strokeWidth="1.5" strokeLinecap="round"
              style={{ transition: 'all 0.8s ease' }}
            />
            <circle cx={GAUGE_CX} cy={GAUGE_CY + GAUGE_R - 2} r="2.5" fill="white" />
            {/* Emoji centrado */}
            <text x={GAUGE_CX} y={GAUGE_CY + GAUGE_R + 2} textAnchor="middle" fontSize="10" dominantBaseline="middle">
              {cfg.emoji}
            </text>
          </svg>
        </div>

        {/* Descripción del estado */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-white leading-tight">{cfg.label}</p>
          <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{cfg.dummyLabel}</p>
        </div>

        {/* Variación del día */}
        <div className="flex-shrink-0 text-right">
          <span className={`text-2xl font-black tabular-nums tracking-tight leading-none ${changePositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {changePositive ? '+' : ''}{data.changePercent}%
          </span>
          <p className="text-[8px] text-gray-600 dark:text-gray-400 mt-0.5">variación hoy</p>
        </div>
      </div>

      {/* ── Fila 3: barra compradores vs vendedores ── */}
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between text-[9px] mb-1">
          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
            <span>↑</span> Suben precio
          </span>
          <span className="text-[9px] text-gray-600 dark:text-gray-400 font-medium">{upPct}% vs {100 - upPct}%</span>
          <span className="text-red-400 font-bold flex items-center gap-0.5">
            Bajan precio <span>↓</span>
          </span>
        </div>
        <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700"
            style={{ width: `${upPct}%` }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-red-600 to-red-400 transition-all duration-700"
            style={{ width: `${100 - upPct}%` }}
          />
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-700 -translate-x-px" />
        </div>
        <div className="flex justify-between text-[8px] mt-1 tabular-nums font-semibold">
          <span className="text-emerald-500">{data.upMoves} vehículos</span>
          <span className="text-red-400">{data.downMoves} vehículos</span>
        </div>
      </div>

      {/* ── Fila 4: Si vendes ahora (PnL en lenguaje claro) ── */}
      <div className={`px-3 py-2.5 border-t border-gray-800/60 ${pnlPositive ? 'bg-emerald-950/30' : 'bg-red-950/20'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
              {pnlPositive ? '💰 Si vendes ahora, ganas:' : '📉 Si vendes ahora, pierdes:'}
            </p>
            <p className={`text-xl font-black tabular-nums leading-tight ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(data.unrealizedPnL)}
            </p>
          </div>
          <div className={`flex-shrink-0 text-center text-[8px] font-bold px-2 py-1.5 rounded-lg border leading-tight ${
            pnlPositive
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
              : 'bg-red-500/15 text-red-300 border-red-500/25'
          }`}>
            {pnlPositive ? (
              <><span className="text-base">✓</span><br />Ganancia</>
            ) : (
              <><span className="text-base">⚠</span><br />Pérdida</>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer: reloj + símbolo ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/60 border-t border-gray-800/60">
        <span className="flex items-center gap-1 text-[9px] text-gray-600 dark:text-gray-400 font-mono">
          <RotateCcw className="w-2.5 h-2.5" />
          {clockStr}
        </span>
        <span className="text-[9px] text-gray-600 dark:text-gray-400">
          {data.totalSymbols ?? 220} símbolos
        </span>
      </div>

      {/* CTA hint */}
      <div className="absolute bottom-7 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-[8px] text-indigo-400 font-semibold">Ver detalles →</span>
      </div>
    </button>
  );
}
