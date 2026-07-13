import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  Globe,
  LoaderCircle,
  LogIn,
  Monitor,
  RefreshCw,
  Smartphone,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AuthUser } from '../../../lib/authApi';
import {
  fetchClientUsageRequest,
  healthBadgeClasses,
  type ClientUsageSummary,
} from '../../../lib/adminClientsApi';

function formatRelative(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deviceLabel(deviceInfo: Record<string, unknown>) {
  const platform = String(deviceInfo.platform || deviceInfo.os || '').trim();
  const browser = String(deviceInfo.browser || deviceInfo.userAgent || '').trim();
  if (platform && browser) return `${platform} · ${browser.slice(0, 40)}`;
  if (platform) return platform;
  if (browser) return browser.slice(0, 48);
  return 'Dispositivo desconocido';
}

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4">
      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-2">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {hint ? <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{hint}</p> : null}
    </div>
  );
}

function LoginChart({ weeks }: { weeks: Array<{ week: string; count: number }> }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
        Sin logins registrados en los últimos 30 días
      </p>
    );
  }
  return (
    <div className="flex items-end gap-2 h-24">
      {weeks.map((w) => (
        <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full rounded-t-md bg-blue-500/80 dark:bg-blue-400/70 transition-all"
            style={{ height: `${Math.max(8, (w.count / max) * 100)}%` }}
            title={`${w.count} logins`}
          />
          <span className="text-[9px] text-gray-400 truncate w-full text-center">
            {new Date(w.week).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminClientUsagePanel({ account }: { account: AuthUser }) {
  const [usage, setUsage] = useState<ClientUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsage(await fetchClientUsageRequest(account.user_id));
    } catch (err) {
      setUsage(null);
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [account.user_id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <LoaderCircle className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Cargando uso del cliente…</p>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-sm">{error || 'No se pudo cargar'}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-red-200 text-sm font-medium text-red-700"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  const { health, kpis } = usage;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${healthBadgeClasses(health.status)}`}
        >
          <Activity className="w-3.5 h-3.5" />
          {health.label}
          {health.daysSince != null ? ` · login hace ${health.daysSince}d` : ''}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Último login"
          value={formatRelative(usage.account.lastLoginAt)}
          hint={formatDateTime(usage.account.lastLoginAt)}
          icon={<LogIn className="w-3.5 h-3.5" />}
        />
        <KpiCard
          label="Días activos (30d)"
          value={String(kpis.activeLoginDays30)}
          hint={`${kpis.loginCount30} inicios de sesión`}
          icon={<CalendarIcon />}
        />
        <KpiCard
          label="Horas fichadas"
          value={`${kpis.clockedHours30}h`}
          hint={`${kpis.clockedDays30} días con fichaje`}
          icon={<Timer className="w-3.5 h-3.5" />}
        />
        <KpiCard
          label="Errores TPV (7d)"
          value={String(kpis.tpvErrors7d)}
          hint={`${kpis.apiRequests7d} peticiones API (7d)`}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Logins por semana (30d)</p>
        </div>
        <LoginChart weeks={usage.loginsByWeek} />
      </div>

      {usage.businesses.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Negocios</p>
          </div>
          <div className="space-y-2">
            {usage.businesses.map((b) => (
              <div
                key={b.businessId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{b.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {b.businessType || 'Sin vertical'} · {b.memberCount} miembros
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    {Math.round(b.clockedMinutes30 / 60 * 10) / 10}h fichadas
                  </p>
                  <p className="text-[11px] text-gray-500">{b.activeDays30} días activos · {b.clockSessions30} sesiones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sesiones ({kpis.activeSessionCount} activas)</p>
          </div>
          {usage.sessions.length === 0 ? (
            <p className="text-xs text-gray-500">Sin sesiones registradas</p>
          ) : (
            <ul className="space-y-2">
              {usage.sessions.map((s) => (
                <li key={s.sessionId} className="text-xs rounded-xl bg-gray-50 dark:bg-gray-900/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {String(s.deviceInfo?.mobile || '').includes('true') ? (
                      <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {deviceLabel(s.deviceInfo)}
                    </span>
                    {s.active ? (
                      <span className="ml-auto rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                        Activa
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-500 mt-1">
                    {formatRelative(s.lastActiveAt)} · {s.ipAddress || 'IP desconocida'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Última actividad</p>
          </div>
          {usage.recentActivity.length === 0 && usage.recentLogins.length === 0 ? (
            <p className="text-xs text-gray-500">Sin actividad reciente</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {usage.recentLogins.slice(0, 3).map((l, i) => (
                <li key={`login-${i}`} className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Login</span>
                  {' · '}
                  {formatRelative(l.at)}
                  {l.ip ? ` · ${l.ip}` : ''}
                </li>
              ))}
              {usage.recentActivity.map((a, i) => (
                <li key={`act-${i}`} className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {String(a.action || a.type || 'Acción')}
                  </span>
                  {' · '}
                  {formatRelative(String(a.createdAt || ''))}
                  {a.entityLabel ? ` · ${String(a.entityLabel)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Onboarding y engagement</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OnboardingChip ok={usage.onboarding.pixelOpened} label="Pixel abierto" />
          <OnboardingChip ok={usage.onboarding.pixelClicked} label="Pixel clic" />
          <OnboardingChip ok={usage.onboarding.imports.vehicles} label="Import vehículos" />
          <OnboardingChip ok={usage.onboarding.imports.clients} label="Import clientes" />
          <OnboardingChip ok={usage.onboarding.imports.team} label="Import equipo" />
          <OnboardingChip ok={usage.onboarding.imports.billing} label="Import facturación" />
          <OnboardingChip ok={usage.onboarding.ancoverAccess} label="Ancover" />
          <OnboardingChip
            ok={usage.onboarding.verificationStatus === 'approved'}
            label={`Verificación: ${usage.onboarding.verificationStatus}`}
          />
        </div>
      </div>

      {usage.tpvErrors.length > 0 ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">Errores TPV recientes</p>
          {usage.tpvErrors.map((e, i) => (
            <div key={i} className="text-xs text-red-700 dark:text-red-300">
              <span className="font-medium">{formatRelative(e.at)}</span>
              {e.context ? ` · ${e.context}` : ''}
              {e.message ? ` — ${e.message.slice(0, 120)}` : ''}
            </div>
          ))}
        </div>
      ) : null}

      {usage.topApiActivity7d.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Módulos más usados (7d)</p>
          <div className="flex flex-wrap gap-2">
            {usage.topApiActivity7d.map((item) => (
              <span
                key={item.resource}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300"
              >
                {item.resource}
                <span className="opacity-70">×{item.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarIcon() {
  return <Clock className="w-3.5 h-3.5" />;
}

function OnboardingChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {ok ? '✓' : '○'} {label}
    </span>
  );
}
