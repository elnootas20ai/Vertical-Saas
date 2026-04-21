import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Music,
  Users,
  Wine,
  Star,
  Search,
  Plus,
  X,
  LogIn,
  LogOut,
  Minus,
  Euro,
  MapPin,
} from 'lucide-react';

type GuestStatus = 'pendiente' | 'dentro' | 'salido';

interface GuestEntry {
  id: string;
  nombre: string;
  vip: boolean;
  /** Mesa, zona VIP, pista, etc. */
  reserva: string;
  estado: GuestStatus;
  creadoEn: string;
}

interface BarLine {
  id: string;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  mesaBarra: string;
  creadoEn: string;
}

const ESTADO_CFG: Record<GuestStatus, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' },
  dentro:    { label: 'Dentro',    color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' },
  salido:    { label: 'Salido',    color: 'text-gray-600 dark:text-gray-400',       bg: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-600' },
};

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function GuestCard({
  g,
  onDentro,
  onSalido,
  onPendiente,
}: {
  g: GuestEntry;
  onDentro: (id: string) => void;
  onSalido: (id: string) => void;
  onPendiente: (id: string) => void;
}) {
  const cfg = ESTADO_CFG[g.estado];
  return (
    <div className={`p-4 rounded-2xl border-2 transition-all ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{g.nombre}</span>
            {g.vip && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-600 text-white shrink-0">
                <Star className="w-3 h-3 fill-current" /> VIP
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate" title={g.id}>
            {g.id.slice(0, 8)}…
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border shrink-0 ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      {g.reserva.trim() && (
        <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 mb-3">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="truncate">{g.reserva}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {g.estado !== 'dentro' && (
          <button
            type="button"
            onClick={() => onDentro(g.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5" /> Check-in
          </button>
        )}
        {g.estado === 'dentro' && (
          <button
            type="button"
            onClick={() => onSalido(g.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 hover:opacity-90"
          >
            <LogOut className="w-3.5 h-3.5" /> Salida
          </button>
        )}
        {g.estado === 'salido' && (
          <button
            type="button"
            onClick={() => onPendiente(g.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Volver a pendiente
          </button>
        )}
      </div>
    </div>
  );
}

type Subview = 'main' | 'nuevo_invitado';

export function WorkerTpvNightclub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Operario';

  const [subview, setSubview] = useState<Subview>('main');
  const [tab, setTab] = useState<'puerta' | 'barra'>('puerta');
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [barLines, setBarLines] = useState<BarLine[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<GuestStatus | 'all'>('all');
  const [aforoMax, setAforoMax] = useState(250);
  /** Entradas contadas en puerta sin ficha en lista (walk-in). */
  const [extrasPuerta, setExtrasPuerta] = useState(0);

  const [guestForm, setGuestForm] = useState({ nombre: '', vip: false, reserva: '' });
  const [barForm, setBarForm] = useState({ concepto: '', cantidad: 1, precioUnitario: 0, mesaBarra: '' });

  const dentroLista = useMemo(() => guests.filter(g => g.estado === 'dentro').length, [guests]);
  const aforoActual = dentroLista + extrasPuerta;
  const reservasVip = useMemo(
    () => guests.filter(g => g.vip && (g.estado === 'pendiente' || g.estado === 'dentro')).length,
    [guests],
  );
  const ventasBarra = useMemo(
    () => barLines.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0),
    [barLines],
  );

  const filteredGuests = useMemo(() => {
    const q = search.toLowerCase().trim();
    return guests.filter(g => {
      if (filterEstado !== 'all' && g.estado !== filterEstado) return false;
      if (!q) return true;
      return (
        g.nombre.toLowerCase().includes(q) ||
        g.reserva.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guests, search, filterEstado]);

  const filteredBar = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return barLines;
    return barLines.filter(
      l =>
        l.concepto.toLowerCase().includes(q) ||
        l.mesaBarra.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    );
  }, [barLines, search]);

  const setGuestEstado = (id: string, estado: GuestStatus) => {
    setGuests(prev => prev.map(g => (g.id === id ? { ...g, estado } : g)));
  };

  const handleAddGuest = () => {
    if (!guestForm.nombre.trim()) return;
    setGuests(prev => [
      ...prev,
      {
        id: uuidv4(),
        nombre: guestForm.nombre.trim(),
        vip: guestForm.vip,
        reserva: guestForm.reserva.trim(),
        estado: 'pendiente',
        creadoEn: new Date().toISOString(),
      },
    ]);
    setGuestForm({ nombre: '', vip: false, reserva: '' });
    setSubview('main');
  };

  const handleAddBarLine = () => {
    if (!barForm.concepto.trim() || barForm.cantidad < 1 || barForm.precioUnitario < 0) return;
    setBarLines(prev => [
      ...prev,
      {
        id: uuidv4(),
        concepto: barForm.concepto.trim(),
        cantidad: Math.floor(barForm.cantidad),
        precioUnitario: barForm.precioUnitario,
        mesaBarra: barForm.mesaBarra.trim() || 'Barra',
        creadoEn: new Date().toISOString(),
      },
    ]);
    setBarForm(f => ({ ...f, concepto: '', cantidad: 1 }));
  };

  const removeBarLine = (id: string) => setBarLines(prev => prev.filter(l => l.id !== id));

  const bumpExtras = (delta: number) => {
    setExtrasPuerta(prev => Math.max(0, prev + delta));
  };

  if (subview === 'nuevo_invitado') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSubview('main')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo en lista</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={guestForm.nombre}
              onChange={e => setGuestForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre y apellidos"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Reserva (mesa / zona)</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={guestForm.reserva}
              onChange={e => setGuestForm(f => ({ ...f, reserva: e.target.value }))}
              placeholder="Mesa 12, Zona VIP norte…"
            />
          </div>
          <label className="flex items-center gap-3 p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={guestForm.vip}
              onChange={e => setGuestForm(f => ({ ...f, vip: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Star className="w-4 h-4 text-violet-500" /> Invitado VIP
            </span>
          </label>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button type="button" onClick={() => setSubview('main')} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button type="button" onClick={handleAddGuest} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md">
            Añadir a la lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-fuchsia-100 dark:bg-fuchsia-900/40 rounded-xl flex items-center justify-center shrink-0">
              <Music className="w-5 h-5 text-fuchsia-700 dark:text-fuchsia-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Discoteca</h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => { setTab('puerta'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'puerta' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4" /> Puerta
          </button>
          <button
            type="button"
            onClick={() => { setTab('barra'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'barra' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Wine className="w-4 h-4" /> Barra
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl border-2 border-fuchsia-200 dark:border-fuchsia-900/50 bg-fuchsia-50 dark:bg-fuchsia-950/30 p-2.5 text-center">
            <p className="text-xl font-bold text-fuchsia-800 dark:text-fuchsia-200">{aforoActual}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">Aforo</p>
            <p className="text-[9px] text-fuchsia-600/80 dark:text-fuchsia-400/80 mt-0.5">máx. {aforoMax}</p>
          </div>
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/30 p-2.5 text-center">
            <p className="text-xl font-bold text-violet-800 dark:text-violet-200">{reservasVip}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">VIP activos</p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200 leading-tight">{formatEur(ventasBarra)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Ventas barra</p>
          </div>
        </div>

        {tab === 'puerta' && (
          <>
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3 mb-3 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Aforo y capacidad</span>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>Aforo máx.</span>
                  <input
                    type="number"
                    min={1}
                    className="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs font-mono"
                    value={aforoMax}
                    onChange={e => setAforoMax(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${aforoActual > aforoMax ? 'bg-red-500' : 'bg-fuchsia-500'}`}
                  style={{ width: `${Math.min(100, (aforoActual / aforoMax) * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-gray-600 dark:text-gray-400">Entrada / salida rápida (sin lista):</span>
                <button
                  type="button"
                  onClick={() => bumpExtras(1)}
                  disabled={aforoActual >= aforoMax}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => bumpExtras(-1)}
                  disabled={extrasPuerta <= 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5" /> Salida (extra)
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Lista: <strong>{dentroLista}</strong> dentro · Extras puerta: <strong>{extrasPuerta}</strong>
              </p>
            </div>

            <div className="flex gap-1.5 mb-2 flex-wrap">
              {([
                { id: 'all' as const, label: 'Todos' },
                { id: 'pendiente' as const, label: 'Pendiente' },
                { id: 'dentro' as const, label: 'Dentro' },
                { id: 'salido' as const, label: 'Salido' },
              ]).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterEstado(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterEstado === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'puerta' ? 'Buscar nombre, reserva, UUID…' : 'Buscar consumición, mesa, UUID…'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'puerta' ? (
          filteredGuests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Users className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay invitados en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredGuests.map(g => (
                <GuestCard
                  key={g.id}
                  g={g}
                  onDentro={id => {
                    if (aforoActual >= aforoMax && guests.find(x => x.id === id)?.estado !== 'dentro') {
                      return;
                    }
                    setGuestEstado(id, 'dentro');
                  }}
                  onSalido={id => setGuestEstado(id, 'salido')}
                  onPendiente={id => setGuestEstado(id, 'pendiente')}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2 pb-4">
            {filteredBar.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Wine className="w-10 h-10 mb-2" />
                <p className="text-sm font-medium">No hay líneas en esta vista</p>
              </div>
            ) : (
              filteredBar.map(l => (
                <div
                  key={l.id}
                  className="flex items-start justify-between gap-3 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{l.concepto}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{l.id.slice(0, 8)}… · {l.mesaBarra}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {l.cantidad} × {formatEur(l.precioUnitario)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100">{formatEur(l.cantidad * l.precioUnitario)}</p>
                    <button
                      type="button"
                      onClick={() => removeBarLine(l.id)}
                      className="mt-2 text-xs text-red-600 hover:underline font-medium"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
            {barLines.length > 0 && (
              <div className="sticky bottom-0 mt-4 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Total sesión barra</span>
                <span className="text-lg font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-1">
                  <Euro className="w-5 h-5" /> {formatEur(ventasBarra)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'puerta' ? (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <button
            type="button"
            onClick={() => setSubview('nuevo_invitado')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Añadir a la lista / Check-in previo
          </button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Consumición</label>
              <input
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                value={barForm.concepto}
                onChange={e => setBarForm(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Cerveza, copa, botella…"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                value={barForm.cantidad}
                onChange={e => setBarForm(f => ({ ...f, cantidad: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Precio u. (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                value={barForm.precioUnitario}
                onChange={e => setBarForm(f => ({ ...f, precioUnitario: Number(e.target.value) }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Mesa o barra</label>
              <input
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                value={barForm.mesaBarra}
                onChange={e => setBarForm(f => ({ ...f, mesaBarra: e.target.value }))}
                placeholder="Barra, Mesa 4, VIP…"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddBarLine}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 shadow-md"
          >
            <Plus className="w-4 h-4" /> Registrar pedido
          </button>
        </div>
      )}
    </div>
  );
}
