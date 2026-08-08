import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Building2,
  MapPin,
  ArrowLeft,
  Search,
  Plus,
  Loader2,
  Home,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../../lib/realEstateScope';
import {
  RE_SITUACION_LABEL,
  RE_SIGUIENTE_ACCION_LABEL,
  situacionToResultado,
  type ReSituacion,
  type ReSiguienteAccion,
} from '../../../verticals/realEstate';

interface ReProperty extends VerticalEntity {
  referencia?: string;
  tipo?: string;
  direccion?: string;
  m2?: number;
  habitaciones?: number;
  precio?: number;
  operacion?: string;
  estado?: string;
}

interface ReVisit extends VerticalEntity {
  propiedad?: string;
  propiedadId?: string;
  direccion?: string;
  cliente?: string;
  telefono?: string;
  email?: string;
  fecha?: string;
  hora?: string;
  agente?: string;
  agenteUserId?: string;
  tipoVisita?: string;
  situacion?: string;
  resultado?: string;
  siguienteAccion?: string;
  fechaSeguimiento?: string;
  notas?: string;
}

type Screen = 'hoy' | 'cartera' | 'flow';
type FlowStep = 'direccion' | 'puerta' | 'contacto' | 'siguiente';

const SITUACIONES_PUERTA: ReSituacion[] = [
  'nadie',
  'hablo',
  'interesado',
  'no_interesado',
  'segunda_visita',
  'pendiente_doc',
];

const NEXT_ACTIONS: Exclude<ReSiguienteAccion, ''>[] = ['llamar', 'segunda_visita', 'descartar'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function visitAddress(v: ReVisit): string {
  return String(v.direccion || v.propiedad || '').trim() || 'Sin dirección';
}

function agentName(user: { fullName?: string; firstName?: string; lastName?: string } | null | undefined): string {
  if (!user) return 'Agente';
  if (user.fullName) return user.fullName;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Agente';
}

export function WorkerTpvRealEstate() {
  const { user } = useAuth();
  const { userId: dataUserId, listOptions, ready } = useRealEstateScope();
  const navigate = useNavigate();

  const selfUserId = String(user?.user_id || user?.id || '').trim();
  const myName = agentName(user);

  const visitsApi = useMemo(() => createVerticalApi<ReVisit>('realestate', 'visits'), []);
  const propsApi = useMemo(() => createVerticalApi<ReProperty>('realestate', 'properties'), []);

  const [screen, setScreen] = useState<Screen>('hoy');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visits, setVisits] = useState<ReVisit[]>([]);
  const [properties, setProperties] = useState<ReProperty[]>([]);
  const [search, setSearch] = useState('');

  const [flowStep, setFlowStep] = useState<FlowStep>('direccion');
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [direccion, setDireccion] = useState('');
  const [propiedadId, setPropiedadId] = useState('');
  const [situacion, setSituacion] = useState<ReSituacion>('hablo');
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');
  const [siguienteAccion, setSiguienteAccion] = useState<Exclude<ReSiguienteAccion, ''>>('llamar');
  const [fechaSeguimiento, setFechaSeguimiento] = useState('');

  const today = todayStr();

  const loadAll = useCallback(async () => {
    if (!dataUserId || !ready) {
      setVisits([]);
      setProperties([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [vList, pList] = await Promise.all([
        visitsApi.list(dataUserId, listOptions),
        propsApi.list(dataUserId, listOptions),
      ]);
      setVisits(vList);
      setProperties(pList);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [dataUserId, ready, listOptions, visitsApi, propsApi]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const isMine = useCallback(
    (v: ReVisit) => {
      const aid = String(v.agenteUserId || '').trim();
      if (aid && selfUserId && aid === selfUserId) return true;
      const an = String(v.agente || '').trim().toLowerCase();
      if (an && myName && an === myName.toLowerCase()) return true;
      if (!aid && !an) return true;
      return false;
    },
    [selfUserId, myName],
  );

  const myTodayVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits
      .filter((v) => String(v.fecha || '').slice(0, 10) === today)
      .filter(isMine)
      .filter((v) => {
        if (!q) return true;
        return (
          visitAddress(v).toLowerCase().includes(q) ||
          String(v.cliente || '').toLowerCase().includes(q) ||
          String(v.telefono || '').includes(q)
        );
      })
      .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  }, [visits, today, isMine, search]);

  const followUps = useMemo(() => {
    return visits
      .filter(isMine)
      .filter((v) => {
        const fs = String(v.fechaSeguimiento || '').slice(0, 10);
        return fs && fs <= today && v.resultado !== 'descartado' && v.siguienteAccion !== 'descartar';
      });
  }, [visits, isMine, today]);

  const filteredProperties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties.filter((p) => {
      if (!q) return true;
      return (
        String(p.direccion || '').toLowerCase().includes(q) ||
        String(p.referencia || '').toLowerCase().includes(q)
      );
    });
  }, [properties, search]);

  const resetFlow = () => {
    setFlowStep('direccion');
    setEditingVisitId(null);
    setDireccion('');
    setPropiedadId('');
    setSituacion('hablo');
    setCliente('');
    setTelefono('');
    setEmail('');
    setNotas('');
    setSiguienteAccion('llamar');
    setFechaSeguimiento('');
  };

  const startCaptacion = (prefill?: { direccion?: string; propiedadId?: string; visit?: ReVisit }) => {
    resetFlow();
    if (prefill?.visit) {
      const v = prefill.visit;
      setEditingVisitId(v._id);
      setDireccion(visitAddress(v));
      setPropiedadId(String(v.propiedadId || ''));
      setSituacion((v.situacion as ReSituacion) || 'hablo');
      setCliente(String(v.cliente || ''));
      setTelefono(String(v.telefono || ''));
      setEmail(String(v.email || ''));
      setNotas(String(v.notas || ''));
      const next = (v.siguienteAccion as Exclude<ReSiguienteAccion, ''>) || 'llamar';
      setSiguienteAccion(next === 'descartar' || next === 'segunda_visita' || next === 'llamar' ? next : 'llamar');
      setFechaSeguimiento(String(v.fechaSeguimiento || '').slice(0, 10));
      setFlowStep(v.situacion && v.situacion !== 'pendiente' ? 'contacto' : 'puerta');
    } else {
      setDireccion(prefill?.direccion || '');
      setPropiedadId(prefill?.propiedadId || '');
    }
    setScreen('flow');
  };

  const saveVisit = async () => {
    if (!dataUserId) {
      toast.error('Sesión no válida');
      return;
    }
    const addr = direccion.trim();
    if (!addr) {
      toast.error('Indica la dirección');
      setFlowStep('direccion');
      return;
    }

    const resultado =
      siguienteAccion === 'descartar' ? 'descartado' : situacionToResultado(situacion);
    let fs = fechaSeguimiento;
    if (siguienteAccion === 'llamar' || siguienteAccion === 'segunda_visita') {
      if (!fs) {
        const d = new Date();
        d.setDate(d.getDate() + (siguienteAccion === 'segunda_visita' ? 3 : 1));
        fs = d.toISOString().slice(0, 10);
      }
    } else {
      fs = '';
    }

    const payload: Partial<ReVisit> = {
      propiedad: addr,
      direccion: addr,
      propiedadId: propiedadId || undefined,
      cliente: cliente.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      fecha: today,
      hora: new Date().toTimeString().slice(0, 5),
      agente: myName,
      agenteUserId: selfUserId,
      tipoVisita: editingVisitId ? 'seguimiento' : 'captacion',
      situacion,
      resultado,
      siguienteAccion: siguienteAccion === 'descartar' ? 'descartar' : siguienteAccion,
      fechaSeguimiento: fs || undefined,
      notas: notas.trim(),
    };

    setSaving(true);
    try {
      if (editingVisitId) {
        await visitsApi.update(dataUserId, editingVisitId, payload, listOptions);
      } else {
        await visitsApi.create(dataUserId, payload, listOptions);
      }
      toast.success('Visita guardada');
      resetFlow();
      setScreen('hoy');
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const scheduleFromProperty = (p: ReProperty) => {
    startCaptacion({
      direccion: String(p.direccion || ''),
      propiedadId: p._id,
    });
  };

  if (screen === 'flow') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (flowStep === 'direccion') {
                resetFlow();
                setScreen('hoy');
              } else if (flowStep === 'puerta') setFlowStep('direccion');
              else if (flowStep === 'contacto') setFlowStep('puerta');
              else setFlowStep('contacto');
            }}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {editingVisitId ? 'Completar visita' : 'Nueva captación'}
            </p>
            <p className="text-xs text-gray-500">
              {flowStep === 'direccion' && '1/4 Dirección'}
              {flowStep === 'puerta' && '2/4 En puerta'}
              {flowStep === 'contacto' && '3/4 Contacto'}
              {flowStep === 'siguiente' && '4/4 Siguiente paso'}
            </p>
          </div>
        </header>

        <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">
          {flowStep === 'direccion' && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dirección *</span>
                <input
                  value={direccion}
                  onChange={(e) => {
                    setDireccion(e.target.value);
                    setPropiedadId('');
                  }}
                  placeholder="Calle, número, piso…"
                  className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                />
              </label>
              {properties.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500 mb-2">O elige de cartera</p>
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {properties.slice(0, 20).map((p) => (
                      <li key={p._id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDireccion(String(p.direccion || ''));
                            setPropiedadId(p._id);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm ${
                            propiedadId === p._id
                              ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {p.direccion || p.referencia || p._id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                disabled={!direccion.trim()}
                onClick={() => setFlowStep('puerta')}
                className="w-full py-3 rounded-xl bg-[var(--v-blue,#2563eb)] text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {flowStep === 'puerta' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="w-4 h-4 inline mr-1" />
                {direccion}
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">¿Qué pasó en puerta?</p>
              <div className="grid grid-cols-1 gap-2">
                {SITUACIONES_PUERTA.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSituacion(s)}
                    className={`px-4 py-3 rounded-xl border text-left text-sm font-medium ${
                      situacion === s
                        ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {RE_SITUACION_LABEL[s]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFlowStep('contacto')}
                className="w-full py-3 rounded-xl bg-[var(--v-blue,#2563eb)] text-white font-semibold inline-flex items-center justify-center gap-2"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {flowStep === 'contacto' && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</span>
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Teléfono</span>
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  inputMode="tel"
                  className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inputMode="email"
                  className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</span>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={3}
                  className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 resize-none"
                />
              </label>
              <button
                type="button"
                onClick={() => setFlowStep('siguiente')}
                className="w-full py-3 rounded-xl bg-[var(--v-blue,#2563eb)] text-white font-semibold inline-flex items-center justify-center gap-2"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {flowStep === 'siguiente' && (
            <>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Siguiente paso</p>
              <div className="grid grid-cols-1 gap-2">
                {NEXT_ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setSiguienteAccion(a)}
                    className={`px-4 py-3 rounded-xl border text-left text-sm font-medium ${
                      siguienteAccion === a
                        ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {RE_SIGUIENTE_ACCION_LABEL[a]}
                  </button>
                ))}
              </div>
              {siguienteAccion !== 'descartar' ? (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Fecha seguimiento</span>
                  <input
                    type="date"
                    value={fechaSeguimiento}
                    onChange={(e) => setFechaSeguimiento(e.target.value)}
                    className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  />
                </label>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveVisit()}
                className="w-full py-3 rounded-xl bg-[var(--v-blue,#2563eb)] text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar visita
              </button>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">TPV Inmobiliaria</p>
            <p className="text-xs text-gray-500 truncate">{myName}</p>
          </div>
          <button
            type="button"
            onClick={() => startCaptacion()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--v-blue,#2563eb)] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Captación
          </button>
        </div>
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-950">
          <button
            type="button"
            onClick={() => setScreen('hoy')}
            className={`flex-1 inline-flex items-center justify-center py-2.5 text-sm font-medium rounded-lg text-center ${
              screen === 'hoy' ? 'bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'
            }`}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setScreen('cartera')}
            className={`flex-1 inline-flex items-center justify-center py-2.5 text-sm font-medium rounded-lg text-center ${
              screen === 'cartera' ? 'bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'
            }`}
          >
            Cartera
          </button>
        </div>
      </header>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={screen === 'hoy' ? 'Buscar visita…' : 'Buscar propiedad…'}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
      </div>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--v-blue,#2563eb)]" />
          </div>
        ) : screen === 'hoy' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500">Visitas hoy</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{myTodayVisits.length}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500">Seguimientos</p>
                <p className="text-xl font-bold text-amber-600">{followUps.length}</p>
              </div>
            </div>

            {followUps.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-amber-700 mb-2">Pendientes de seguimiento</p>
                <ul className="space-y-2">
                  {followUps.slice(0, 5).map((v) => (
                    <li key={v._id}>
                      <button
                        type="button"
                        onClick={() => startCaptacion({ visit: v })}
                        className="w-full text-left rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-3"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{visitAddress(v)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {String(v.fechaSeguimiento || '').slice(0, 10)}
                          {v.cliente ? ` · ${v.cliente}` : ''}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Hoy
              </p>
              {myTodayVisits.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">No hay visitas asignadas hoy</p>
                  <button
                    type="button"
                    onClick={() => startCaptacion()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--v-blue,#2563eb)] text-white text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    Nueva captación
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {myTodayVisits.map((v) => {
                    const sit = (v.situacion || 'pendiente') as ReSituacion;
                    return (
                      <li key={v._id}>
                        <button
                          type="button"
                          onClick={() => startCaptacion({ visit: v })}
                          className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {visitAddress(v)}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {v.hora || '—'} · {RE_SITUACION_LABEL[sit] || sit}
                                {v.cliente ? ` · ${v.cliente}` : ''}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Propiedades ({filteredProperties.length})
            </p>
            {filteredProperties.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Sin propiedades en cartera</p>
            ) : (
              <ul className="space-y-2">
                {filteredProperties.map((p) => (
                  <li
                    key={p._id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3"
                  >
                    <div className="flex items-start gap-2">
                      <Home className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {p.direccion || p.referencia || 'Sin dirección'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.tipo || '—'} · {p.operacion || '—'} · {formatCurrency(Number(p.precio) || 0)}
                          {p.estado ? ` · ${p.estado}` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => scheduleFromProperty(p)}
                          className="mt-2 text-sm font-semibold text-[var(--v-blue,#2563eb)]"
                        >
                          Programar visita
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
