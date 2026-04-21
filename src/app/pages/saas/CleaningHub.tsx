import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { useCleaningHubData } from '../../hooks/useCleaningHubData';
import {
  BarChart, Bar, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  SprayCan, CalendarCheck, Repeat, UserCheck, Clock, AlertTriangle,
  Euro, TrendingUp, Package, ArrowUpRight, ArrowDownRight,
  Minus, Bell, RefreshCw, Users, Receipt, Wallet, BarChart3,
  ClipboardCheck, Star, MessageSquare, Plus, Building2,
  Shield, ChevronDown, ChevronUp, MapPin, Phone,
  CircleCheck, CircleX, CircleDot, Timer, UserMinus, UserX,
  CheckCircle, Pause, Play, LogOut, Route, ArrowRight,
  Loader2,
} from 'lucide-react';
import type { CleaningAlertType } from '../../lib/cleaningHubApi';
import type { CleaningServiceStatus } from '../../lib/cleaningApi';

type UserRole = 'gerente' | 'trabajador';
type AlertSev = 'error' | 'warning' | 'info';

const ST: Record<CleaningServiceStatus, { label: string; dot: string; bg: string; text: string }> = {
  pending: { label: 'Pendiente', dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  assigned: { label: 'Asignado', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  in_progress: { label: 'En curso', dot: 'bg-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
  completed: { label: 'Completado', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelado', dot: 'bg-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
};
const AS: Record<AlertSev, { border: string; bg: string; text: string }> = {
  error: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400' },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  info: { border: 'border-l-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400' },
};
const AI: Record<CleaningAlertType, React.ReactNode> = { service_uncovered: <UserX className="w-4 h-4" />, worker_absent: <UserMinus className="w-4 h-4" />, clockin_pending: <Clock className="w-4 h-4" />, incident_open: <AlertTriangle className="w-4 h-4" />, material_critical: <Package className="w-4 h-4" />, service_delayed: <Timer className="w-4 h-4" />, billing_pending: <Receipt className="w-4 h-4" /> };
const TL: Record<string, string> = { general: 'General', office: 'Oficina', industrial: 'Industrial', post_construction: 'Post-obra', windows: 'Cristales', disinfection: 'Desinfeccion', deep: 'Profunda' };
const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });


function KPI({ title, value, sub, icon, iconBg, iconColor, trend, onClick }: { title: string; value: string; sub: string; icon: React.ReactNode; iconBg: string; iconColor: string; trend?: { value: string; up: boolean | null }; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
        <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}><span className={iconColor}>{icon}</span></div>
      </div>
      <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {trend && <span className={`flex items-center gap-0.5 text-[11px] font-bold ${trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-gray-400'}`}>{trend.up === true ? <ArrowUpRight className="w-3 h-3" /> : trend.up === false ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}{trend.value}</span>}
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</span>
      </div>
    </button>
  );
}

function QB({ label, icon, route, color, bg }: { label: string; icon: React.ReactNode; route: string; color: string; bg: string }) {
  const nav = useNavigate();
  return <button onClick={() => nav(route)} className={`${bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}><span className={color}>{icon}</span><span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{label}</span></button>;
}

function Badge({ status }: { status: CleaningServiceStatus }) {
  const c = ST[status];
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}</span>;
}

export function CleaningHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [role, setRole] = useState<UserRole>('gerente');
  const [sseVersion, setSseVersion] = useState(0);

  useSSE({
    userId: user?.userId ?? null,
    token: user?.token ?? null,
    businessId: currentBusiness?.id ?? null,
    handlers: useMemo(() => ({
      cleaning_service_updated: () => setSseVersion(v => v + 1),
      cleaning_worker_updated: () => setSseVersion(v => v + 1),
      cleaning_incident_updated: () => setSseVersion(v => v + 1),
      clockin_updated: () => setSseVersion(v => v + 1),
    }), []),
    enabled: true,
  });
  const [fCli, setFCli] = useState('todos');
  const [fZona, setFZona] = useState('todas');
  const [fTrab, setFTrab] = useState('todos');
  const [fTipo, setFTipo] = useState('todos');
  const [fEst, setFEst] = useState('todos');
  const [showAl, setShowAl] = useState(true);
  const [tab, setTab] = useState<'all' | CleaningServiceStatus>('all');
  const [lastUp, setLastUp] = useState(new Date());
  const { data, loading, error, refresh: reloadData } = useCleaningHubData(sseVersion);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => { setRefreshing(true); await reloadData(); setLastUp(new Date()); setRefreshing(false); }, [reloadData]);
  const crit = data.alerts.filter(a => a.severity === 'error').length;
  const warn = data.alerts.filter(a => a.severity === 'warning').length;
  const filtered = useMemo(() => {
    let l = data.services;
    if (tab !== 'all') l = l.filter(x => x.status === tab);
    if (fCli !== 'todos') l = l.filter(x => x.clientName === fCli);
    if (fZona !== 'todas') l = l.filter(x => x.zoneName === fZona);
    if (fTrab !== 'todos') l = l.filter(x => x.assignedToName === fTrab);
    if (fTipo !== 'todos') l = l.filter(x => x.cleaningType === fTipo);
    if (fEst !== 'todos') l = l.filter(x => x.status === fEst);
    return l.sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart));
  }, [data.services, tab, fCli, fZona, fTrab, fTipo, fEst]);
  const clients = [...new Set(data.services.map(x => x.clientName))];
  const zones = [...new Set(data.services.map(x => x.zoneName).filter(Boolean))];
  const myW = data.workers[0] ?? { id:'', name:'', avatar:'--', clockedIn:false, hoursToday:0, incidents:0, rating:0, servicesTotal:0, servicesCompleted:0 };
  const mySvc = data.services.filter(x => x.assignedToName === myW.name).sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart));
  const qa = [
    { label:'Servicios', icon:<SprayCan className="w-5 h-5" />, route:'/saas/cleaning-services', color:'text-blue-600', bg:'bg-blue-50 dark:bg-blue-950/40' },
    { label:'Nuevo', icon:<Plus className="w-5 h-5" />, route:'/saas/cleaning-services', color:'text-emerald-600', bg:'bg-emerald-50 dark:bg-emerald-950/40' },
    { label:'Checklist', icon:<ClipboardCheck className="w-5 h-5" />, route:'/saas/cleaning-checklist', color:'text-violet-600', bg:'bg-violet-50 dark:bg-violet-950/40' },
    { label:'Calidad', icon:<Star className="w-5 h-5" />, route:'/saas/cleaning-quality', color:'text-amber-600', bg:'bg-amber-50 dark:bg-amber-950/40' },
    { label:'Resenas', icon:<MessageSquare className="w-5 h-5" />, route:'/saas/cleaning-reviews', color:'text-cyan-600', bg:'bg-cyan-50 dark:bg-cyan-950/40' },
    { label:'Incidencias', icon:<AlertTriangle className="w-5 h-5" />, route:'/saas/cleaning-incidents', color:'text-red-600', bg:'bg-red-50 dark:bg-red-950/40' },
    { label:'Equipo', icon:<Users className="w-5 h-5" />, route:'/saas/team', color:'text-indigo-600', bg:'bg-indigo-50 dark:bg-indigo-950/40' },
    { label:'Fichajes', icon:<Clock className="w-5 h-5" />, route:'/saas/clockins', color:'text-gray-600', bg:'bg-gray-100 dark:bg-gray-800' },
    { label:'Facturas', icon:<Receipt className="w-5 h-5" />, route:'/saas/cleaning-billing', color:'text-emerald-600', bg:'bg-emerald-50 dark:bg-emerald-950/40' },
    { label:'Finanzas', icon:<Wallet className="w-5 h-5" />, route:'/saas/finance', color:'text-cyan-600', bg:'bg-cyan-50 dark:bg-cyan-950/40' },
    { label:'Clientes', icon:<Building2 className="w-5 h-5" />, route:'/saas/clients', color:'text-blue-600', bg:'bg-blue-50 dark:bg-blue-950/40' },
    { label:'Dashboard', icon:<BarChart3 className="w-5 h-5" />, route:'/saas/dashboard', color:'text-blue-600', bg:'bg-blue-50 dark:bg-blue-950/40' },
  ];
  const qaW = [
    { label:'Fichar', icon:<Clock className="w-5 h-5" />, route:'/saas/worker/clock', color:'text-blue-600', bg:'bg-blue-50 dark:bg-blue-950/40' },
    { label:'Mis servicios', icon:<SprayCan className="w-5 h-5" />, route:'/saas/worker/tpv', color:'text-emerald-600', bg:'bg-emerald-50 dark:bg-emerald-950/40' },
    { label:'Incidencia', icon:<AlertTriangle className="w-5 h-5" />, route:'/saas/cleaning-incidents', color:'text-red-600', bg:'bg-red-50 dark:bg-red-950/40' },
    { label:'Mi checklist', icon:<ClipboardCheck className="w-5 h-5" />, route:'/saas/cleaning-checklist', color:'text-violet-600', bg:'bg-violet-50 dark:bg-violet-950/40' },
  ];

  if (loading && data.services.length === 0) {
    return (
      <Layout title="Centro Operativo" subtitle="Limpieza - Operativa diaria">
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-500">Cargando datos operativos...</p>
        </div>
      </Layout>
    );
  }

  if (error && data.services.length === 0) {
    return (
      <Layout title="Centro Operativo" subtitle="Limpieza - Operativa diaria">
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm text-red-600 font-semibold">{error}</p>
          <button onClick={refresh} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Centro Operativo" subtitle="Limpieza - Operativa diaria">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              {(['gerente','trabajador'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${role===r ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {r==='gerente' ? <Shield className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />} {r==='gerente' ? 'Gerente' : 'Trabajador'}
                </button>
              ))}
            </div>
            {role==='gerente' && <div className="flex items-center gap-2 flex-wrap">
              <select value={fCli} onChange={e=>setFCli(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"><option value="todos">Todos los clientes</option>{clients.map(c=><option key={c} value={c}>{c}</option>)}</select>
              <select value={fZona} onChange={e=>setFZona(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"><option value="todas">Todas las zonas</option>{zones.map(z=><option key={z} value={z}>{z}</option>)}</select>
              <select value={fTrab} onChange={e=>setFTrab(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"><option value="todos">Todos</option>{data.workers.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}</select>
              <select value={fTipo} onChange={e=>setFTipo(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"><option value="todos">Tipo</option>{Object.entries(TL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
              <select value={fEst} onChange={e=>setFEst(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"><option value="todos">Estado</option>{Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
            </div>}
          </div>
          <div className="flex items-center gap-3">
            {refreshing ? <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...</span> : <span className="flex items-center gap-1.5 text-[10px] text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />En vivo - {lastUp.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>}
            <button onClick={refresh} disabled={refreshing} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"><RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`} /></button>
          </div>
        </div>

        {role==='gerente' && (<>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI title="Servicios hoy" value={String(data.kpis.servicesToday)} sub={`${data.kpis.servicesCompleted} completados`} icon={<CalendarCheck className="w-4 h-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600" onClick={()=>navigate('/saas/cleaning-services')} />
            <KPI title="Recurrentes / Puntuales" value={`${data.kpis.recurrentServices} / ${data.kpis.oneTimeServices}`} sub={`${data.kpis.servicesToday>0?Math.round(data.kpis.recurrentServices/data.kpis.servicesToday*100):0}% recurrentes`} icon={<Repeat className="w-4 h-4" />} iconBg="bg-violet-100 dark:bg-violet-900/40" iconColor="text-violet-600" onClick={()=>navigate('/saas/cleaning-services')} />
            <KPI title="Equipo activo" value={`${data.kpis.activeWorkers} / ${data.kpis.totalWorkers}`} sub={data.kpis.absentWorkers>0?`${data.kpis.absentWorkers} ausente(s)`:'Todos fichados'} icon={<UserCheck className="w-4 h-4" />} iconBg={data.kpis.absentWorkers>0?'bg-amber-100 dark:bg-amber-900/40':'bg-indigo-100 dark:bg-indigo-900/40'} iconColor={data.kpis.absentWorkers>0?'text-amber-600':'text-indigo-600'} trend={data.kpis.absentWorkers>0?{value:`${data.kpis.absentWorkers} sin fichar`,up:false}:undefined} onClick={()=>navigate('/saas/clockins')} />
            <KPI title="Horas trabajadas" value={`${data.kpis.hoursWorkedToday}h`} sub={`Media ${data.kpis.activeWorkers>0?(data.kpis.hoursWorkedToday/data.kpis.activeWorkers).toFixed(1):'0'}h/trab.`} icon={<Clock className="w-4 h-4" />} iconBg="bg-cyan-100 dark:bg-cyan-900/40" iconColor="text-cyan-600" onClick={()=>navigate('/saas/clockins')} />
            <KPI title="Incidencias" value={String(data.kpis.openIncidents)} sub={`${data.incidents.filter(i=>i.status==='open').length} abiertas`} icon={<AlertTriangle className="w-4 h-4" />} iconBg={data.kpis.openIncidents>0?'bg-red-100 dark:bg-red-900/40':'bg-gray-100 dark:bg-gray-700'} iconColor={data.kpis.openIncidents>0?'text-red-600':'text-gray-400'} trend={data.kpis.openIncidents>0?{value:'Requiere atencion',up:false}:undefined} onClick={()=>navigate('/saas/cleaning-incidents')} />
            <KPI title="Facturacion hoy" value={eur(data.kpis.billingToday)} sub={`${eur(data.kpis.billingPending)} pdte.`} icon={<Euro className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600" onClick={()=>navigate('/saas/cleaning-billing')} />
            <KPI title="Rentabilidad" value={`${data.kpis.profitabilityAvg}%`} sub="+2.1% vs semana ant." icon={<TrendingUp className="w-4 h-4" />} iconBg="bg-green-100 dark:bg-green-900/40" iconColor="text-green-600" trend={{value:'+2.1%',up:true}} onClick={()=>navigate('/saas/finance')} />
            <KPI title="Materiales criticos" value={String(data.kpis.criticalMaterials)} sub={data.kpis.criticalMaterials>0?'Bajo stock minimo':'Todo en orden'} icon={<Package className="w-4 h-4" />} iconBg={data.kpis.criticalMaterials>0?'bg-red-100 dark:bg-red-900/40':'bg-gray-100 dark:bg-gray-700'} iconColor={data.kpis.criticalMaterials>0?'text-red-600':'text-gray-400'} trend={data.kpis.criticalMaterials>0?{value:`${data.kpis.criticalMaterials} alertas`,up:false}:undefined} />
          </div>
          {/* Quick access */}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">{qa.map(i=><QB key={i.label} {...i} />)}</div>
          {/* Alerts */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <button onClick={()=>setShowAl(!showAl)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
              <div className="flex items-center gap-3"><Bell className="w-5 h-5 text-gray-500" /><span className="font-bold text-gray-900 dark:text-gray-100">Alertas Limpieza</span>{crit>0&&<span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-[10px] font-bold">{crit} criticas</span>}{warn>0&&<span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-[10px] font-bold">{warn} avisos</span>}</div>
              {showAl?<ChevronUp className="w-4 h-4 text-gray-400" />:<ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showAl&&<div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">{data.alerts.map(a=>{const st=AS[a.severity];return(<div key={a.id} className={`flex items-center gap-3 px-4 py-3 border-l-4 ${st.border} ${st.bg}`}><span className={st.text}>{AI[a.type]}</span><p className={`flex-1 text-xs font-medium ${st.text}`}>{a.message}</p><button onClick={()=>navigate(a.route)} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-white transition-colors border border-gray-200 dark:border-gray-600">Ver</button></div>);})}</div>}
          </div>
          {/* Services + Workers */}
          <div className="grid lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-blue-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Servicios del dia</span><span className="text-xs text-gray-400">{filtered.length}</span></div><button onClick={()=>navigate('/saas/cleaning-services')} className="text-xs text-blue-600 font-semibold flex items-center gap-1">Ver todos <ArrowRight className="w-3 h-3" /></button></div>
              <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">{([['all','Todos',data.services.length],['pending','Pendientes',data.services.filter(x=>x.status==='pending'||x.status==='assigned').length],['in_progress','En curso',data.services.filter(x=>x.status==='in_progress').length],['completed','Completados',data.services.filter(x=>x.status==='completed').length]] as const).map(([k,l,c])=>(<button key={k} onClick={()=>setTab(k as typeof tab)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${tab===k?'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{l} <span className="ml-1 opacity-60">{c}</span></button>))}</div>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">{filtered.map(sv=>(<div key={sv.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"><div className="flex flex-col items-center gap-0.5 pt-0.5 w-12 flex-shrink-0"><span className="text-xs font-bold text-gray-900 dark:text-gray-100">{sv.estimatedStart}</span><span className="text-[10px] text-gray-400">{sv.estimatedEnd}</span></div><div className={`w-1 self-stretch rounded-full flex-shrink-0 ${ST[sv.status].dot}`} /><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5 flex-wrap">{sv.isRecurrent?<span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400"><Repeat className="w-3 h-3" />{sv.recurrencePattern}</span>:<span className="text-[10px] font-bold text-amber-600">Puntual</span>}<span className="text-[10px] text-gray-400">{sv.zoneName}</span></div><p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{sv.clientName}</p><p className="text-[11px] text-gray-500 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{sv.address}</p><div className="flex items-center gap-2 mt-1.5 flex-wrap"><span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-medium">{TL[sv.cleaningType]||sv.cleaningType}</span>{sv.assignedToName?<span className="text-[10px] text-gray-600 dark:text-gray-300 font-medium">{sv.assignedToName}</span>:<span className="text-[10px] text-red-600 font-bold bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded">SIN ASIGNAR</span>}<Badge status={sv.status} /></div>{sv.checklistTotal>0&&<div className="flex items-center gap-2 mt-1.5"><div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${(sv.checklistDone/sv.checklistTotal)*100}%`}} /></div><span className="text-[10px] text-gray-400 font-medium">{sv.checklistDone}/{sv.checklistTotal}</span></div>}</div><span className="text-sm font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">{eur(sv.price)}</span></div>))}</div>
            </div>
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Equipo</span><span className="text-xs text-gray-400">{data.kpis.activeWorkers}/{data.kpis.totalWorkers}</span></div><button onClick={()=>navigate('/saas/team')} className="text-xs text-blue-600 font-semibold flex items-center gap-1">Ver equipo <ArrowRight className="w-3 h-3" /></button></div>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">{data.workers.map(w=>(<div key={w.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"><div className="flex items-center gap-3 mb-2"><div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${w.clockedIn?'bg-indigo-500':'bg-gray-400'}`}>{w.avatar}</div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{w.name}</p>{w.clockedIn?<span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Fichado {w.clockInTime}</span>:<span className="flex items-center gap-1 text-[10px] text-red-600 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />No fichado</span>}</div>{w.clockedIn&&<span className="text-[11px] font-semibold text-gray-500">{w.hoursToday}h</span>}</div>{w.clockedIn&&<>{w.currentService&&<p className="text-[11px] text-gray-500 ml-12 mb-1"><span className="font-semibold text-indigo-600">En curso:</span> {w.currentService.clientName}</p>}{w.nextService&&<p className="text-[11px] text-gray-500 ml-12 mb-1"><span className="font-medium">Siguiente:</span> {w.nextService.clientName} - {w.nextService.time}</p>}<div className="ml-12 flex items-center gap-2"><div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{width:`${w.servicesTotal>0?(w.servicesCompleted/w.servicesTotal)*100:0}%`}} /></div><span className="text-[10px] text-gray-400 font-medium">{w.servicesCompleted}/{w.servicesTotal}</span></div></>}{!w.clockedIn&&<div className="ml-12 flex items-center gap-2 mt-1"><button className="text-[10px] font-semibold text-blue-600 flex items-center gap-1"><Phone className="w-3 h-3" />Contactar</button><button className="text-[10px] font-semibold text-amber-600 flex items-center gap-1"><Route className="w-3 h-3" />Reasignar</button></div>}</div>))}</div>
            </div>
          </div>
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4"><div className="flex items-center gap-2 mb-4"><BarChart3 className="w-5 h-5 text-blue-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Servicios por hora</span></div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.servicesByHour} margin={{top:5,right:10,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" /><XAxis dataKey="hour" tick={{fontSize:10,fill:'#9CA3AF'}} /><YAxis tick={{fontSize:10,fill:'#9CA3AF'}} /><Tooltip content={({active,payload})=>{if(!active||!payload?.length) return null; const p=payload[0].payload as {hour:string;scheduled:number;completed:number}; return <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg"><p className="opacity-60 mb-0.5">{p.hour}</p><p>Programados: {p.scheduled}</p><p className="text-emerald-400">Completados: {p.completed}</p></div>}} /><Area type="monotone" dataKey="scheduled" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={2} /><Area type="monotone" dataKey="completed" stroke="#10B981" fill="#10B981" fillOpacity={0.15} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4"><div className="flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-emerald-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Rentabilidad por cliente</span></div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.profitByClient} layout="vertical" margin={{top:0,right:40,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" horizontal={false} /><XAxis type="number" tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>`${v/1000}k`} /><YAxis type="category" dataKey="client" tick={{fontSize:10,fill:'#9CA3AF'}} width={100} /><Tooltip content={({active,payload})=>{if(!active||!payload?.length) return null; const p=payload[0].payload as {client:string;revenue:number;cost:number;margin:number}; return <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg"><p className="opacity-60 mb-0.5">{p.client}</p><p>Ingresos: {eur(p.revenue)}</p><p>Coste: {eur(p.cost)}</p><p className="text-emerald-400">Margen: {p.margin}%</p></div>}} /><Bar dataKey="revenue" fill="#10B981" radius={[0,4,4,0]} maxBarSize={16} /><Bar dataKey="cost" fill="#9CA3AF" fillOpacity={0.3} radius={[0,4,4,0]} maxBarSize={16} /></BarChart></ResponsiveContainer></div></div>
          </div>
          {/* Incidents + Materials */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /><span className="font-bold text-gray-900 dark:text-gray-100">Incidencias abiertas</span><span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 rounded-full text-[10px] font-bold">{data.incidents.filter(i=>i.status==='open').length}</span></div><button onClick={()=>navigate('/saas/cleaning-incidents')} className="text-xs text-blue-600 font-semibold flex items-center gap-1">Ver todas <ArrowRight className="w-3 h-3" /></button></div><div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-72 overflow-y-auto">{data.incidents.map(inc=>{const st=AS[inc.severity];return(<div key={inc.id} className={`p-3 border-l-4 ${st.border}`}><div className="flex items-center justify-between mb-1"><span className={`text-xs font-bold ${st.text}`}>{inc.type}</span><span className="text-[10px] text-gray-400">{inc.time}</span></div><p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1">{inc.description}</p><p className="text-[10px] text-gray-400">{inc.serviceNumber} - {inc.clientName} - {inc.workerName}</p><div className="flex gap-2 mt-2"><button className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 hover:bg-emerald-100 transition-colors">Resolver</button><button className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200 transition-colors">Escalar</button></div></div>);})}</div></div>
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2"><Package className="w-5 h-5 text-orange-500" /><span className="font-bold text-gray-900 dark:text-gray-100">Materiales</span>{data.kpis.criticalMaterials>0&&<span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 rounded-full text-[10px] font-bold">{data.kpis.criticalMaterials} criticos</span>}</div></div><div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-72 overflow-y-auto">{[...data.materials].sort((a,b)=>Number(b.isCritical)-Number(a.isCritical)).map(m=>{const pct=Math.min((m.currentStock/m.minStock)*100,100);const low=m.currentStock<m.minStock;return(<div key={m.id} className="p-3"><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2">{m.isCritical?<CircleX className="w-3.5 h-3.5 text-red-500" />:low?<CircleDot className="w-3.5 h-3.5 text-amber-500" />:<CircleCheck className="w-3.5 h-3.5 text-emerald-500" />}<span className={`text-xs font-semibold ${m.isCritical?'text-red-700 dark:text-red-400':'text-gray-900 dark:text-gray-100'}`}>{m.name}</span></div><span className="text-[11px] text-gray-500">{m.currentStock}/{m.minStock} {m.unit}</span></div><div className="flex items-center gap-2 ml-5"><div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${m.isCritical?'bg-red-500':low?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${pct}%`}} /></div>{m.isCritical&&<button className="px-2 py-0.5 text-[10px] font-semibold rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 hover:bg-red-100 transition-colors">Pedir</button>}</div>{m.lastRestocked&&<p className="text-[10px] text-gray-400 mt-0.5 ml-5">Reposicion: {m.lastRestocked}</p>}</div>);})}</div></div>
          </div>
          {/* Billing */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2"><Euro className="w-5 h-5 text-emerald-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Facturacion del dia</span></div><button onClick={()=>navigate('/saas/finance')} className="text-xs text-blue-600 font-semibold flex items-center gap-1">Ver finanzas <ArrowRight className="w-3 h-3" /></button></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-gray-100 dark:border-gray-700/50">{[{l:'Facturado hoy',v:eur(data.kpis.billingToday),c:'text-emerald-600'},{l:'Pdte. facturar',v:eur(data.kpis.billingPending),c:'text-amber-600'},{l:'Cobros pdte.',v:eur(540),c:'text-red-500'},{l:'Margen dia',v:`${data.kpis.profitabilityAvg}%`,c:'text-blue-600'}].map(i=><div key={i.l} className="text-center"><p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">{i.l}</p><p className={`text-lg font-black ${i.c}`}>{i.v}</p></div>)}</div>{data.unbilled.length>0&&<div className="p-4"><p className="text-xs font-semibold text-gray-500 mb-2">Sin facturar:</p><div className="space-y-2">{data.unbilled.map(x=><div key={x.id} className="flex items-center gap-3 text-xs"><span className="font-mono text-gray-400">#{x.serviceNumber}</span><span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{x.clientName}</span><span className="text-gray-500">{TL[x.cleaningType]||x.cleaningType}</span><span className="font-bold text-gray-900 dark:text-gray-100">{eur(x.price)}</span><button className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 hover:bg-emerald-100 transition-colors">Facturar</button></div>)}</div></div>}</div>
          {/* Performance */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700"><BarChart3 className="w-5 h-5 text-indigo-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Rendimiento por trabajador</span></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500"><th className="text-left p-3 font-semibold">Trabajador</th><th className="text-center p-3 font-semibold">Servicios</th><th className="text-center p-3 font-semibold">Horas</th><th className="text-center p-3 font-semibold">Incid.</th><th className="text-center p-3 font-semibold">Valoracion</th><th className="text-center p-3 font-semibold">Rend.</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{data.workers.filter(w=>w.clockedIn).map(w=>{const cp=w.servicesTotal>0?(w.servicesCompleted/w.servicesTotal)*100:0;const pf=cp>80&&w.incidents===0&&w.rating>4.5?{l:'Alto',c:'text-emerald-700',b:'bg-emerald-50 dark:bg-emerald-900/30'}:cp>=50&&w.incidents<=1?{l:'Normal',c:'text-amber-700',b:'bg-amber-50 dark:bg-amber-900/30'}:{l:'Bajo',c:'text-red-700',b:'bg-red-50 dark:bg-red-900/30'};return(<tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-750"><td className="p-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">{w.avatar}</div><span className="font-semibold text-gray-900 dark:text-gray-100">{w.name}</span></div></td><td className="p-3 text-center"><span className="font-bold">{w.servicesCompleted}</span><span className="text-gray-400">/{w.servicesTotal}</span></td><td className="p-3 text-center font-medium text-gray-700">{w.hoursToday}h</td><td className="p-3 text-center"><span className={w.incidents>0?'font-bold text-red-600':'text-gray-400'}>{w.incidents}</span></td><td className="p-3 text-center">&#9733; {w.rating.toFixed(1)}</td><td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pf.b} ${pf.c}`}>{pf.l}</span></td></tr>);})}</tbody></table></div></div>
        </>)}

        {/* WORKER VIEW */}
        {role==='trabajador' && (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[{t:'Mis servicios',v:`${myW.servicesCompleted}/${myW.servicesTotal}`,s:'completados',c:''},{t:'Horas hoy',v:`${myW.hoursToday}h`,s:'acumuladas',c:'text-cyan-600'},{t:'Incidencias',v:String(myW.incidents),s:'abiertas',c:myW.incidents>0?'text-red-600':'text-emerald-600'},{t:'Mi valoracion',v:myW.rating.toFixed(1),s:'media clientes',c:'text-amber-500'}].map(k=><div key={k.t} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center"><p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-1">{k.t}</p><p className={`text-2xl font-black ${k.c||'text-gray-900 dark:text-gray-100'}`}>{k.t==='Mi valoracion'?`\u2605 ${k.v}`:k.v}</p><p className="text-[11px] text-gray-400">{k.s}</p></div>)}
          </div>
          <div className="grid grid-cols-4 gap-2">{qaW.map(i=><QB key={i.label} {...i} />)}</div>
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700"><CalendarCheck className="w-5 h-5 text-blue-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Mis servicios hoy</span><span className="text-xs text-gray-400">{mySvc.length}</span></div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">{mySvc.map((sv,idx)=>(<div key={sv.id} className={`p-4 ${sv.status==='in_progress'?'bg-indigo-50/50 dark:bg-indigo-950/20':''}`}><div className="flex items-start gap-3"><div className="flex flex-col items-center gap-1 pt-0.5"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${sv.status==='completed'?'bg-emerald-500 text-white':sv.status==='in_progress'?'bg-indigo-500 text-white':'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>{sv.status==='completed'?<CheckCircle className="w-4 h-4" />:idx+1}</div>{idx<mySvc.length-1&&<div className={`w-0.5 h-8 ${sv.status==='completed'?'bg-emerald-300':'bg-gray-200 dark:bg-gray-700'}`} />}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-bold text-gray-900 dark:text-gray-100">{sv.estimatedStart} - {sv.estimatedEnd}</span><Badge status={sv.status} />{sv.isRecurrent&&<span className="text-[10px] text-violet-600 font-medium"><Repeat className="w-3 h-3 inline" /> {sv.recurrencePattern}</span>}</div><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sv.clientName}</p><p className="text-[11px] text-gray-500 flex items-center gap-1 mb-2"><MapPin className="w-3 h-3" />{sv.address}</p><div className="flex items-center gap-2 mb-2"><div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${(sv.checklistDone/sv.checklistTotal)*100}%`}} /></div><span className="text-[10px] text-gray-400 font-medium">{sv.checklistDone}/{sv.checklistTotal} tareas</span></div>{sv.status==='assigned'&&<button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1"><Play className="w-3 h-3" /> Iniciar</button>}{sv.status==='in_progress'&&<div className="flex gap-2"><button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completar</button><button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Incidencia</button></div>}</div></div></div>))}</div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700"><Route className="w-5 h-5 text-violet-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Mi ruta del dia</span></div><div className="p-4 space-y-3">{mySvc.map((x,i)=><div key={x.id} className="flex items-start gap-3"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${x.status==='completed'?'bg-emerald-100 text-emerald-700':x.status==='in_progress'?'bg-indigo-100 text-indigo-700':'bg-gray-100 text-gray-500'}`}>{i+1}</div><div><p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{x.estimatedStart} - {x.clientName}</p><p className="text-[10px] text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{x.address}</p></div></div>)}</div></div>
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"><div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700"><Clock className="w-5 h-5 text-blue-600" /><span className="font-bold text-gray-900 dark:text-gray-100">Mi fichaje hoy</span></div><div className="p-4 space-y-4"><div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl"><div className="flex items-center gap-2"><LogOut className="w-4 h-4 text-emerald-600 rotate-180" /><span className="text-xs font-semibold text-gray-700">Entrada</span></div><span className="text-sm font-bold text-emerald-600">{myW.clockInTime}</span></div><div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl"><div className="flex items-center gap-2"><LogOut className="w-4 h-4 text-gray-400" /><span className="text-xs font-semibold text-gray-700">Salida</span></div><button className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">Fichar salida</button></div><div className="flex items-center justify-between p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl"><div className="flex items-center gap-2"><Timer className="w-4 h-4 text-cyan-600" /><span className="text-xs font-semibold text-gray-700">Horas acumuladas</span></div><span className="text-sm font-bold text-cyan-600">{myW.hoursToday}h</span></div><div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl"><div className="flex items-center gap-2"><Pause className="w-4 h-4 text-amber-600" /><span className="text-xs font-semibold text-gray-700">Pausas</span></div><span className="text-sm font-bold text-amber-600">0</span></div></div></div>
          </div>
        </>)}
      </div>
    </Layout>
  );
}
