import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  buildGestoriaHubSnapshot,
  isTaxModelDocument,
  type GestoriaWorkerRef,
} from '../../lib/gestoriaLaborMetrics';
import { listDocumentsRequest } from '../../lib/documentsApi';
import {
  createPayrollDocumentRequest,
  finalizePayrollDocumentUpload,
  getDocumentExpiryStatus,
  listPayrollDocumentsRequest,
  PAYROLL_DOC_TYPE_LABELS,
  payrollUploadSuccessMessage,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import { filterRealTeamMembers } from '../../lib/schedulesDisplay';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import type { AuthUser } from '../../lib/authApi';

type HubTab = 'resumen' | 'laboral' | 'modelos' | 'equipo';

function Kpi({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'slate' | 'blue' | 'rose' | 'emerald' | 'amber';
}) {
  const tones = {
    slate: 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900',
    blue: 'border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/30',
    rose: 'border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30',
    emerald: 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30',
    amber: 'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function GestoriaUploadModal({
  members,
  currentUser,
  businessId,
  initialType = 'nomina',
  initialWorkerId = '',
  onClose,
  onUploaded,
}: {
  members: AuthUser[];
  currentUser: AuthUser;
  businessId: string;
  initialType?: PayrollDocumentType;
  initialWorkerId?: string;
  onClose: () => void;
  onUploaded: (doc: PayrollDocument) => void;
}) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [documentType, setDocumentType] = useState<PayrollDocumentType>(initialType);
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = members.find((m) => m.user_id === workerId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!workerId) {
      setError('Selecciona un trabajador.');
      return;
    }
    if (!name.trim() || !file) {
      setError('Nombre y archivo son obligatorios.');
      return;
    }
    setBusy(true);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const doc = await createPayrollDocumentRequest({
        business_id: businessId,
        worker_id: workerId,
        worker_name: selected?.fullName || '',
        documentType,
        name: name.trim(),
        period: period.trim() || undefined,
        fileData,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
        uploadedBy: currentUser.user_id,
        uploadedByName: currentUser.fullName,
      });
      onUploaded(doc);
      void finalizePayrollDocumentUpload(doc);
      toast.success(payrollUploadSuccessMessage(doc));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Subir documento laboral</h2>
        <p className="mt-0.5 text-xs text-stone-500">Nóminas, contratos, DNI… visible para el trabajador al instante.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-stone-600">
            Trabajador
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
            >
              <option value="">Seleccionar…</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.fullName || m.email}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-stone-600">
              Tipo
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as PayrollDocumentType)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
              >
                {(Object.entries(PAYROLL_DOC_TYPE_LABELS) as [PayrollDocumentType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-stone-600">
              Período
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-stone-600">
            Nombre *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Nómina julio 2026"
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
            />
          </label>
          <label className="block text-xs font-semibold text-stone-600">
            Archivo *
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className={`${VERTIAL_BTN_PRIMARY} flex-1`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Subir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GestoriaHubPage() {
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const [tab, setTab] = useState<HubTab>('resumen');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [payrollDocs, setPayrollDocs] = useState<PayrollDocument[]>([]);
  const [taxModelsCount, setTaxModelsCount] = useState(0);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState<PayrollDocumentType>('nomina');
  const [uploadWorkerId, setUploadWorkerId] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !user) return;
    setLoading(true);
    try {
      const [users, docs, companyDocs] = await Promise.all([
        listUsers(businessId).catch(() => [] as AuthUser[]),
        listPayrollDocumentsRequest({ businessId }),
        listDocumentsRequest(user.user_id).catch(() => []),
      ]);
      const real = filterRealTeamMembers(users) as AuthUser[];
      setMembers(real);
      setPayrollDocs(docs);
      setTaxModelsCount(companyDocs.filter((d) => !d.archived && isTaxModelDocument(d)).length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar gestoría');
    } finally {
      setLoading(false);
    }
  }, [businessId, listUsers, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const workerRefs: GestoriaWorkerRef[] = useMemo(
    () =>
      members.map((m) => ({
        user_id: m.user_id,
        fullName: m.fullName || m.email || m.user_id,
        email: m.email,
        personalData: m.personalData,
        employment: m.employment,
        workerIdentityCompleted: m.workerIdentityCompleted,
      })),
    [members],
  );

  const expiringOrExpiredCount = useMemo(
    () =>
      payrollDocs.filter((d) => {
        const s = getDocumentExpiryStatus(d);
        return s === 'expiring' || s === 'expired';
      }).length,
    [payrollDocs],
  );

  const snapshot = useMemo(
    () =>
      buildGestoriaHubSnapshot({
        workers: workerRefs,
        payrollDocs,
        taxModelsCount,
        expiringOrExpiredCount,
      }),
    [workerRefs, payrollDocs, taxModelsCount, expiringOrExpiredCount],
  );

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payrollDocs;
    return payrollDocs.filter(
      (d) =>
        d.name.toLowerCase().includes(q)
        || d.worker_name.toLowerCase().includes(q)
        || PAYROLL_DOC_TYPE_LABELS[d.documentType]?.toLowerCase().includes(q),
    );
  }, [payrollDocs, search]);

  const incompleteWorkers = useMemo(
    () =>
      snapshot.workers.filter((w) => w.missingLabels.length > 0).sort((a, b) => b.missingLabels.length - a.missingLabels.length),
    [snapshot.workers],
  );

  const openUpload = (type: PayrollDocumentType = 'nomina', workerId = '') => {
    setUploadType(type);
    setUploadWorkerId(workerId);
    setShowUpload(true);
  };

  const tabs: { id: HubTab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'laboral', label: 'Documentos laborales' },
    { id: 'modelos', label: 'Modelos / Impuestos' },
    { id: 'equipo', label: 'Equipo incompleto' },
  ];

  if (loading) {
    return (
      <Layout title="Gestoría" subtitle="Laboral, documentación y modelos">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Gestoría" subtitle="Estadísticas del equipo, nóminas, DNI y modelos de impuestos">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button type="button" onClick={() => openUpload('nomina')} className={VERTIAL_BTN_PRIMARY}>
            <Upload className="h-4 w-4" />
            Subir documento
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-100/80 p-1 dark:border-stone-700 dark:bg-stone-800/80">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-10 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-white text-[var(--v-blue,#2563eb)] shadow-sm dark:bg-stone-900'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Trabajadores" value={snapshot.totalWorkers} tone="blue" hint={`${snapshot.workersReadyPercent}% con identidad OK`} />
              <Kpi label="Nóminas este mes" value={snapshot.payslipsThisMonth} tone="emerald" />
              <Kpi label="Sin escaneo DNI" value={snapshot.missingIdentityScanCount} tone={snapshot.missingIdentityScanCount ? 'rose' : 'slate'} />
              <Kpi label="Modelos / impuestos" value={snapshot.taxModelsCount} tone="amber" hint="Documentos → Impuestos" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Contratos archivados" value={snapshot.contractsCount} />
              <Kpi label="Docs laborales" value={snapshot.laborDocsTotal} />
              <Kpi label="Caducan / caducados" value={snapshot.expiringOrExpiredCount} tone={snapshot.expiringOrExpiredCount ? 'amber' : 'slate'} />
              <Kpi label="Sin DNI (dato)" value={snapshot.missingDniNumberCount} tone={snapshot.missingDniNumberCount ? 'rose' : 'slate'} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => openUpload('nomina')} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-blue-300 dark:border-stone-700 dark:bg-stone-900">
                <Receipt className="h-5 w-5 text-emerald-600" />
                <span><span className="block text-sm font-semibold">Subir nómina</span><span className="text-xs text-stone-500">Para un trabajador</span></span>
              </button>
              <button type="button" onClick={() => openUpload('contrato')} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-blue-300 dark:border-stone-700 dark:bg-stone-900">
                <FileText className="h-5 w-5 text-blue-600" />
                <span><span className="block text-sm font-semibold">Subir contrato</span><span className="text-xs text-stone-500">Laboral / anexo</span></span>
              </button>
              <button type="button" onClick={() => navigate('/saas/documents?tab=financial')} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-blue-300 dark:border-stone-700 dark:bg-stone-900">
                <Wallet className="h-5 w-5 text-amber-600" />
                <span><span className="block text-sm font-semibold">Ir a modelos</span><span className="text-xs text-stone-500">Impuestos de la empresa</span></span>
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'laboral' ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por trabajador o tipo…"
                className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-stone-700 dark:bg-stone-900"
              />
            </div>
            <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-700 dark:bg-stone-900">
              {filteredDocs.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-stone-500">
                  Aún no hay documentos laborales. Sube nóminas, contratos o DNI.
                </div>
              ) : (
                filteredDocs.map((doc) => (
                  <div key={doc._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{doc.name}</p>
                      <p className="text-xs text-stone-500">
                        {doc.worker_name} · {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                        {doc.period ? ` · ${doc.period}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/saas/team/${doc.worker_id}`)}
                      className="text-xs font-semibold text-[var(--v-blue,#2563eb)]"
                    >
                      Ver ficha
                    </button>
                    {doc.fileData ? (
                      <a href={doc.fileData} download={doc.fileName || doc.name} className="text-xs font-semibold text-stone-600 hover:underline">
                        Descargar
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === 'modelos' ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Modelos de impuestos</h3>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Hay <span className="font-semibold">{snapshot.taxModelsCount}</span> documentos de impuestos / modelos
                  en Documentación de la empresa. Sube el 303, 111, 190, etc. desde Impuestos para que gestoría y
                  dirección los vean juntos.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate('/saas/documents?tab=financial')} className={VERTIAL_BTN_PRIMARY}>
                    <Wallet className="h-4 w-4" />
                    Abrir Impuestos
                  </button>
                  <button type="button" onClick={() => navigate('/saas/payroll')} className={VERTIAL_BTN_SECONDARY}>
                    Ir a Nóminas
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'equipo' ? (
          <div className="space-y-3">
            {incompleteWorkers.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 dark:border-emerald-900 dark:bg-emerald-950/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                  Todo el equipo tiene lo básico para gestoría.
                </p>
              </div>
            ) : (
              incompleteWorkers.map((w) => (
                <div
                  key={w.user_id}
                  className="flex flex-wrap items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
                >
                  <Users className="mt-0.5 h-5 w-5 text-stone-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{w.fullName}</p>
                    <p className="text-xs text-stone-500">{w.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {w.missingLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!w.hasIdentityScan ? (
                      <button type="button" onClick={() => openUpload('dni_nie', w.user_id)} className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !text-xs`}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Subir DNI
                      </button>
                    ) : null}
                    {!w.hasPayslipThisMonth ? (
                      <button type="button" onClick={() => openUpload('nomina', w.user_id)} className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !text-xs`}>
                        Nómina
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => navigate(`/saas/team/${w.user_id}`)}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !text-xs`}
                    >
                      Ficha
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {showUpload && user && businessId ? (
        <GestoriaUploadModal
          members={members}
          currentUser={user}
          businessId={businessId}
          initialType={uploadType}
          initialWorkerId={uploadWorkerId}
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => setPayrollDocs((prev) => [doc, ...prev])}
        />
      ) : null}
    </Layout>
  );
}
