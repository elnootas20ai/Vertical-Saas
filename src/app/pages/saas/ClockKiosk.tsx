import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Fingerprint,
  Clock,
  Play,
  Square,
  Coffee,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Building2,
  User,
  Lock,
  Timer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  type ClockinRecord,
  getTodayClockin,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  formatMinutes,
} from '../../lib/clockinsApi';

type KioskStep = 'login' | 'clock';

function computeLiveSeconds(record: ClockinRecord | null): { worked: number; breakSec: number } {
  if (!record) return { worked: 0, breakSec: 0 };
  const entries = record.entries;
  const clockInEntry = entries.find((e) => e.type === 'clock_in');
  if (!clockInEntry) return { worked: 0, breakSec: 0 };
  const clockOutEntry = entries.find((e) => e.type === 'clock_out');
  const now = Date.now();
  const endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : now;
  const totalMs = endMs - new Date(clockInEntry.time).getTime();
  let breakMs = 0;
  let breakStart: number | null = null;
  for (const e of entries) {
    if (e.type === 'break_start') breakStart = new Date(e.time).getTime();
    if (e.type === 'break_end' && breakStart !== null) {
      breakMs += new Date(e.time).getTime() - breakStart;
      breakStart = null;
    }
  }
  if (breakStart !== null) {
    breakMs += (clockOutEntry ? new Date(clockOutEntry.time).getTime() : now) - breakStart;
  }
  const workedMs = Math.max(0, totalMs - breakMs);
  return { worked: Math.floor(workedMs / 1000), breakSec: Math.floor(breakMs / 1000) };
}

const formatTimer = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const AUTO_LOGOUT_MS = 30_000;

export function ClockKiosk() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, posSwitchUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const [step, setStep] = useState<KioskStep>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [kioskUser, setKioskUser] = useState<{ id: string; name: string } | null>(null);
  const [record, setRecord] = useState<ClockinRecord | null>(null);
  const [acting, setActing] = useState(false);
  const [clockError, setClockError] = useState('');
  const [, setTick] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');

  const isClockedIn = record?.status === 'active' || record?.status === 'break';
  const isOnBreak = record?.status === 'break';
  const { worked: elapsedSeconds, breakSec: breakSeconds } = computeLiveSeconds(record);

  useEffect(() => {
    if (!isClockedIn) return;
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  useEffect(() => {
    if (step !== 'clock' || !kioskUser) return;
    const timer = setTimeout(() => {
      handleReturnToLogin();
    }, AUTO_LOGOUT_MS);
    return () => clearTimeout(timer);
  }, [step, kioskUser, record, elapsedSeconds]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLoading || !username.trim() || !password.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await posSwitchUser(username.trim(), password.trim());
      if (!result.success) {
        setLoginError(result.error || t('clockKiosk.loginFailed', 'Credenciales incorrectas'));
        setLoginLoading(false);
        return;
      }

      const memberId = user?.user_id || '';
      const memberName = user?.fullName || username.trim();
      setKioskUser({ id: memberId, name: memberName });

      const today = await getTodayClockin(businessId, memberId);
      setRecord(today);
      setStep('clock');
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setLoginError(err.message || t('clockKiosk.loginFailed', 'Error de autenticación'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleReturnToLogin = useCallback(() => {
    setStep('login');
    setKioskUser(null);
    setRecord(null);
    setClockError('');
    setSuccessMsg('');
  }, []);

  const handleClockIn = async () => {
    if (acting || !businessId || !kioskUser) return;
    setActing(true);
    setClockError('');
    try {
      const rec = await clockIn(businessId, kioskUser.id, kioskUser.name, {
        device_type: 'kiosk',
      });
      setRecord(rec);
      setSuccessMsg(t('clockKiosk.clockedIn', 'Entrada registrada correctamente'));
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      setClockError(e.message || 'Error al fichar entrada');
    } finally {
      setActing(false);
    }
  };

  const handleClockOut = async () => {
    if (acting || !record) return;
    setActing(true);
    setClockError('');
    try {
      const rec = await clockOut(record);
      setRecord(rec);
      setSuccessMsg(t('clockKiosk.clockedOut', 'Salida registrada correctamente'));
      setTimeout(() => {
        setSuccessMsg('');
        handleReturnToLogin();
      }, 3000);
    } catch (e: any) {
      setClockError(e.message || 'Error al fichar salida');
    } finally {
      setActing(false);
    }
  };

  const handleBreakToggle = async () => {
    if (acting || !record) return;
    setActing(true);
    setClockError('');
    try {
      const rec = isOnBreak ? await endBreak(record) : await startBreak(record);
      setRecord(rec);
      setSuccessMsg(
        isOnBreak
          ? t('clockKiosk.breakEnded', 'Descanso finalizado')
          : t('clockKiosk.breakStarted', 'Descanso iniciado'),
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e: any) {
      setClockError(e.message || 'Error al gestionar descanso');
    } finally {
      setActing(false);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.back', 'Volver')}</span>
          </button>
          <div className="h-5 w-px bg-white/20" />
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-white/80">
              {currentBusiness?.name || t('clockKiosk.title', 'Fichaje')}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white font-mono">{timeStr}</p>
          <p className="text-xs text-white/40 capitalize">{dateStr}</p>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6">
        {step === 'login' ? (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-500/30">
                <Fingerprint className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {t('clockKiosk.title', 'Fichaje')}
              </h1>
              <p className="text-white/50 text-sm">
                {t('clockKiosk.subtitle', 'Identifícate para fichar entrada o salida')}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {loginError}
                </div>
              )}

              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('clockKiosk.usernamePlaceholder', 'Usuario')}
                  className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white text-lg placeholder:text-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('clockKiosk.passwordPlaceholder', 'Contraseña')}
                  className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white text-lg placeholder:text-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading || !username.trim() || !password.trim()}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-bold shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {loginLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Fingerprint className="w-6 h-6" />
                )}
                {t('clockKiosk.identify', 'Identificarse')}
              </button>
            </form>
          </div>
        ) : (
          <div className="w-full max-w-lg">
            {/* Worker identified */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                {kioskUser?.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-2xl font-bold text-white">{kioskUser?.name}</h2>
              <button
                onClick={handleReturnToLogin}
                className="mt-1 inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                {t('clockKiosk.switchUser', 'Cambiar usuario')}
              </button>
            </div>

            {/* Success message */}
            {successMsg && (
              <div className="flex items-center justify-center gap-2 mb-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm animate-in fade-in duration-300">
                <CheckCircle2 className="w-5 h-5" />
                {successMsg}
              </div>
            )}

            {/* Error */}
            {clockError && (
              <div className="flex items-center justify-center gap-2 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {clockError}
              </div>
            )}

            {/* Clock card */}
            <div className={`rounded-2xl p-8 text-center transition-all duration-500 ${
              isClockedIn
                ? isOnBreak
                  ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30'
                  : 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30'
                : 'bg-white/5 border border-white/10'
            }`}>
              {isClockedIn && (
                <p className="text-white/50 text-sm mb-2">
                  {isOnBreak
                    ? t('worker.clock.onBreak', 'En descanso')
                    : t('worker.clock.working', 'Trabajando')}
                </p>
              )}

              {isClockedIn && (
                <div className="text-5xl font-bold text-white font-mono tracking-wider mb-1">
                  {formatTimer(elapsedSeconds)}
                </div>
              )}

              {breakSeconds > 0 && (
                <p className="text-white/40 text-xs mb-4">
                  <Coffee className="w-3 h-3 inline mr-1" />
                  {t('worker.clock.breakTime', 'Descanso')}: {formatTimer(breakSeconds)}
                </p>
              )}

              {record?.status === 'completed' && (
                <div className="mb-4 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                  <p className="text-white/60 text-sm">
                    {t('clockKiosk.alreadyCompleted', 'Jornada completada hoy')}
                  </p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {formatMinutes(record.totalMinutes)}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 mt-4">
                {!isClockedIn && record?.status !== 'completed' && (
                  <button
                    onClick={handleClockIn}
                    disabled={acting}
                    className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-emerald-600/30 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {acting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                    {t('worker.clock.clockIn', 'Fichar entrada')}
                  </button>
                )}

                {isClockedIn && (
                  <>
                    <button
                      onClick={handleBreakToggle}
                      disabled={acting}
                      className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 ${
                        isOnBreak
                          ? 'bg-amber-500 text-white hover:bg-amber-400'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coffee className="w-5 h-5" />}
                      {isOnBreak ? t('worker.clock.endBreak', 'Fin descanso') : t('worker.clock.startBreak', 'Descanso')}
                    </button>
                    <button
                      onClick={handleClockOut}
                      disabled={acting}
                      className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white rounded-xl font-semibold shadow-lg shadow-red-600/30 hover:bg-red-500 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
                      {t('worker.clock.clockOut', 'Fichar salida')}
                    </button>
                  </>
                )}
              </div>

              {!isClockedIn && record?.status !== 'completed' && (
                <p className="text-white/30 text-xs mt-4">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {t('clockKiosk.noActiveSession', 'Sin fichaje activo hoy')}
                </p>
              )}
            </div>

            {/* Auto-logout notice */}
            <p className="text-center text-white/20 text-[10px] mt-6 flex items-center justify-center gap-1">
              <Timer className="w-3 h-3" />
              {t('clockKiosk.autoLogout', 'La sesión se cerrará automáticamente por seguridad')}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="shrink-0 text-center py-3 text-white/15 text-xs">
        {t('clockKiosk.footer', 'Terminal de fichaje')} — {currentBusiness?.name}
      </footer>
    </div>
  );
}
