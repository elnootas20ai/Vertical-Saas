import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Shield,
  FileText,
  UserX,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  RefreshCw,
  ChevronDown,
  Eye,
  Ban,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { useAuth } from '../../context/AuthContext';
import * as gdprApi from '../../lib/gdprApi';
import type {
  GdprConsent,
  GdprRequest,
  GdprRightType,
  GdprRequestStatus,
  ConsentPurpose,
  ConsentChannel,
  ErasureCertificate,
} from '../../lib/gdprApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const PURPOSE_LABELS: Record<ConsentPurpose | string, string> = {
  marketing: 'Marketing',
  analytics: 'Analítica',
  functional: 'Funcional',
  communications: 'Comunicaciones',
  data_transfer: 'Transferencia de datos',
  profiling: 'Elaboración de perfiles',
  other: 'Otro',
};

const CHANNEL_LABELS: Record<ConsentChannel | string, string> = {
  web: 'Web',
  phone: 'Teléfono',
  email: 'Email',
  in_person: 'Presencial',
  app: 'App',
  other: 'Otro',
};

const RIGHT_LABELS: Record<GdprRightType, { label: string; article: string; color: string }> = {
  access: { label: 'Acceso', article: 'Art. 15', color: 'bg-blue-100 text-blue-800' },
  rectification: { label: 'Rectificación', article: 'Art. 16', color: 'bg-yellow-100 text-yellow-800' },
  erasure: { label: 'Supresión', article: 'Art. 17', color: 'bg-red-100 text-red-800' },
  portability: { label: 'Portabilidad', article: 'Art. 20', color: 'bg-purple-100 text-purple-800' },
  objection: { label: 'Oposición', article: 'Art. 21', color: 'bg-orange-100 text-orange-800' },
  restriction: { label: 'Limitación', article: 'Art. 18', color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<GdprRequestStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: { label: 'Pendiente', icon: <Clock className="w-3 h-3" />, className: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'En proceso', icon: <RefreshCw className="w-3 h-3" />, className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', icon: <CheckCircle className="w-3 h-3" />, className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazada', icon: <XCircle className="w-3 h-3" />, className: 'bg-red-100 text-red-800' },
};

type TabId = 'consents' | 'requests' | 'erasure';

// ─── Component ────────────────────────────────────────────────────────────────

export function GdprPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'consents';

  const [consents, setConsents] = useState<GdprConsent[]>([]);
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [loading, setLoading] = useState(false);

  // Consent modal
  const [consentModal, setConsentModal] = useState(false);
  const [consentDetail, setConsentDetail] = useState<GdprConsent | null>(null);

  // Request modal
  const [requestModal, setRequestModal] = useState(false);
  const [requestDetail, setRequestDetail] = useState<GdprRequest | null>(null);

  // Erasure modal
  const [erasureModal, setErasureModal] = useState(false);
  const [erasureStep, setErasureStep] = useState<'form' | 'confirm' | 'done'>(  'form');
  const [erasureCertificate, setErasureCertificate] = useState<ErasureCertificate | null>(null);
  const [erasureForm, setErasureForm] = useState({
    clientId: '',
    clientName: '',
    reason: '',
    confirmText: '',
  });

  // ─── Load data ──────────────────────────────────────────────────────────────

  const loadConsents = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await gdprApi.listConsents(user.id);
      setConsents(data);
    } catch (err) {
      toast.error('Error al cargar consentimientos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await gdprApi.listRequests(user.id);
      setRequests(data);
    } catch (err) {
      toast.error('Error al cargar solicitudes de derechos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'consents') loadConsents();
    if (activeTab === 'requests') loadRequests();
    if (activeTab === 'erasure') loadRequests();
  }, [activeTab, loadConsents, loadRequests]);

  const setTab = (tab: TabId) => {
    setSearchParams({ tab });
  };

  // ─── Consent actions ────────────────────────────────────────────────────────

  const [consentForm, setConsentForm] = useState<Partial<GdprConsent>>({
    purpose: 'marketing',
    channel: 'web',
    legalBasis: 'consent',
    granted: true,
  });

  const handleSaveConsent = async () => {
    if (!user?.id) return;
    try {
      if (consentDetail) {
        await gdprApi.updateConsent(user.id, consentDetail.id, consentForm);
        toast.success('Consentimiento actualizado');
      } else {
        await gdprApi.createConsent(user.id, consentForm);
        toast.success('Consentimiento registrado');
      }
      setConsentModal(false);
      setConsentDetail(null);
      setConsentForm({ purpose: 'marketing', channel: 'web', legalBasis: 'consent', granted: true });
      loadConsents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar consentimiento');
    }
  };

  const handleRevokeConsent = async (consent: GdprConsent) => {
    if (!user?.id) return;
    try {
      await gdprApi.revokeConsent(user.id, consent.id, consent);
      toast.success(`Consentimiento de ${consent.clientName} revocado`);
      loadConsents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al revocar');
    }
  };

  // ─── Request actions ─────────────────────────────────────────────────────────

  const [requestForm, setRequestForm] = useState<Partial<GdprRequest>>({
    rightType: 'access',
    status: 'pending',
  });

  const handleSaveRequest = async () => {
    if (!user?.id) return;
    try {
      if (requestDetail) {
        await gdprApi.updateRequest(user.id, requestDetail.id, requestForm);
        toast.success('Solicitud actualizada');
      } else {
        await gdprApi.createRequest(user.id, requestForm);
        toast.success('Solicitud registrada');
      }
      setRequestModal(false);
      setRequestDetail(null);
      setRequestForm({ rightType: 'access', status: 'pending' });
      loadRequests();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar solicitud');
    }
  };

  const handleUpdateStatus = async (request: GdprRequest, status: GdprRequestStatus) => {
    if (!user?.id) return;
    try {
      await gdprApi.updateRequest(user.id, request.id, { ...request, status });
      toast.success(`Estado actualizado a: ${STATUS_CONFIG[status].label}`);
      loadRequests();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar estado');
    }
  };

  // ─── Erasure actions ──────────────────────────────────────────────────────────

  const handleErasure = async () => {
    if (!user?.id) return;
    try {
      const result = await gdprApi.executeErasure(user.id, erasureForm);
      setErasureCertificate(result.certificate);
      setErasureStep('done');
      toast.success('Derecho al olvido ejecutado correctamente');
      loadRequests();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al ejecutar eliminación');
    }
  };

  const downloadCertificate = () => {
    if (!erasureCertificate) return;
    const text = [
      '══════════════════════════════════════════════════',
      '  CERTIFICADO DE DERECHO AL OLVIDO — Art. 17 RGPD',
      '══════════════════════════════════════════════════',
      '',
      `ID de certificado:  ${erasureCertificate.id}`,
      `Fecha de ejecución: ${new Date(erasureCertificate.executedAt).toLocaleString('es-ES')}`,
      `Ejecutado por:      ${erasureCertificate.executedBy}`,
      `Base legal:         ${erasureCertificate.legalBasis}`,
      '',
      '── Datos del interesado ──',
      `Nombre:             ${erasureCertificate.clientName}`,
      `ID interno:         ${erasureCertificate.clientId}`,
      '',
      '── Bases de datos afectadas ──',
      ...erasureCertificate.affectedDatabases.map(
        (db) =>
          `  · ${db.type.padEnd(15)} ${db.error ? `ERROR: ${db.error}` : `${db.anonymized ?? 0} registros anonimizados`}`,
      ),
      '',
      '══════════════════════════════════════════════════',
      '  Este certificado acredita el cumplimiento del',
      '  Reglamento (UE) 2016/679 (RGPD) y la LOPDGDD.',
      '══════════════════════════════════════════════════',
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificado-olvido-${erasureCertificate.clientId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const TABS: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'consents', label: 'Registro de consentimientos', icon: <Shield className="w-4 h-4" />, count: consents.length },
    { id: 'requests', label: 'Solicitudes de derechos', icon: <FileText className="w-4 h-4" />, count: requests.length },
    { id: 'erasure', label: 'Derecho al olvido', icon: <UserX className="w-4 h-4" /> },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              Panel RGPD / GDPR
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registro de consentimientos y gestión de derechos — Reglamento (UE) 2016/679 · LOPDGDD
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'consents' && (
              <Button
                size="sm"
                onClick={() => {
                  setConsentDetail(null);
                  setConsentForm({ purpose: 'marketing', channel: 'web', legalBasis: 'consent', granted: true });
                  setConsentModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Nuevo consentimiento
              </Button>
            )}
            {activeTab === 'requests' && (
              <Button
                size="sm"
                onClick={() => {
                  setRequestDetail(null);
                  setRequestForm({ rightType: 'access', status: 'pending' });
                  setRequestModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Nueva solicitud
              </Button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Consentimientos activos"
            value={consents.filter((c) => c.granted).length}
            sub={`de ${consents.length} totales`}
            color="text-green-600"
          />
          <StatCard
            label="Revocados"
            value={consents.filter((c) => !c.granted).length}
            color="text-red-500"
          />
          <StatCard
            label="Solicitudes pendientes"
            value={requests.filter((r) => r.status === 'pending').length}
            color="text-yellow-600"
          />
          <StatCard
            label="Plazos en riesgo"
            value={requests.filter((r) => r.status !== 'completed' && r.status !== 'rejected' && daysUntil(r.legalDeadline) <= 7 && daysUntil(r.legalDeadline) >= 0).length}
            color="text-red-600"
            alert
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── TAB: Consentimientos ─────────────────────────────────────────────── */}
        {activeTab === 'consents' && (
          <div className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}
            {!loading && consents.length === 0 && (
              <EmptyState
                icon={<Shield className="w-8 h-8" />}
                title="Sin consentimientos registrados"
                description="Registra el primer consentimiento de tratamiento de datos."
              />
            )}
            {!loading && consents.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Interesado</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Finalidad</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Canal</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {consents.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{c.clientName}</div>
                          {c.clientEmail && (
                            <div className="text-xs text-muted-foreground">{c.clientEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            {PURPOSE_LABELS[c.purpose] || c.purpose}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {CHANNEL_LABELS[c.channel] || c.channel}
                        </td>
                        <td className="px-4 py-3">
                          {c.granted ? (
                            <span className="flex items-center gap-1 text-green-700 text-xs font-medium">
                              <CheckCircle className="w-3.5 h-3.5" /> Activo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
                              <XCircle className="w-3.5 h-3.5" /> Revocado
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(c.grantedAt || c.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                              title="Ver detalle"
                              onClick={() => {
                                setConsentDetail(c);
                                setConsentForm(c);
                                setConsentModal(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {c.granted && (
                              <button
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500"
                                title="Revocar consentimiento"
                                onClick={() => handleRevokeConsent(c)}
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Solicitudes de derechos ─────────────────────────────────────── */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}
            {!loading && requests.length === 0 && (
              <EmptyState
                icon={<FileText className="w-8 h-8" />}
                title="Sin solicitudes registradas"
                description="Registra solicitudes de ejercicio de derechos RGPD."
              />
            )}
            {!loading && requests.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Solicitante</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Derecho</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plazo legal</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recibida</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map((r) => {
                      const days = daysUntil(r.legalDeadline);
                      const urgent = r.status !== 'completed' && r.status !== 'rejected' && days <= 7 && days >= 0;
                      const overdue = r.status !== 'completed' && r.status !== 'rejected' && days < 0;
                      const right = RIGHT_LABELS[r.rightType];
                      const statusCfg = STATUS_CONFIG[r.status];
                      return (
                        <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.clientName}</div>
                            {r.clientEmail && (
                              <div className="text-xs text-muted-foreground">{r.clientEmail}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${right.color}`}>
                              {right.label}
                            </span>
                            <div className="text-xs text-muted-foreground mt-0.5">{right.article}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusCfg.className}`}>
                              {statusCfg.icon}
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className={`text-xs font-medium ${overdue ? 'text-red-600' : urgent ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                              {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                              {formatDate(r.legalDeadline)}
                              {r.status !== 'completed' && r.status !== 'rejected' && (
                                <div className="text-xs">{overdue ? `Vencida (${Math.abs(days)}d)` : `${days}d restantes`}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(r.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                title="Ver / editar"
                                onClick={() => {
                                  setRequestDetail(r);
                                  setRequestForm(r);
                                  setRequestModal(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {r.status === 'pending' && (
                                <button
                                  className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                                  title="Marcar en proceso"
                                  onClick={() => handleUpdateStatus(r, 'in_progress')}
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                              {(r.status === 'pending' || r.status === 'in_progress') && (
                                <button
                                  className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors"
                                  title="Marcar completada"
                                  onClick={() => handleUpdateStatus(r, 'completed')}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Derecho al olvido ───────────────────────────────────────────── */}
        {activeTab === 'erasure' && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">Acción irreversible</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  El derecho al olvido (Art. 17 RGPD) implica la anonimización permanente de todos los datos personales
                  del interesado en todos los módulos del sistema. Esta acción no puede deshacerse.
                  Se generará un certificado de cumplimiento.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border p-6 space-y-4">
              <h3 className="font-semibold text-base">Solicitar eliminación de datos personales</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="erasure-client-id">ID de cliente interno</Label>
                  <Input
                    id="erasure-client-id"
                    placeholder="client-xxxxxxxx"
                    value={erasureForm.clientId}
                    onChange={(e) => setErasureForm((f) => ({ ...f, clientId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="erasure-client-name">Nombre completo del interesado</Label>
                  <Input
                    id="erasure-client-name"
                    placeholder="Nombre Apellidos"
                    value={erasureForm.clientName}
                    onChange={(e) => setErasureForm((f) => ({ ...f, clientName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="erasure-reason">Motivo de la solicitud</Label>
                <Textarea
                  id="erasure-reason"
                  placeholder="Describe el motivo por el que el interesado solicita la eliminación de sus datos..."
                  rows={3}
                  value={erasureForm.reason}
                  onChange={(e) => setErasureForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>

              <Button
                variant="destructive"
                className="w-full"
                disabled={!erasureForm.clientId || !erasureForm.clientName}
                onClick={() => setErasureModal(true)}
              >
                <UserX className="w-4 h-4 mr-2" />
                Iniciar proceso de eliminación
              </Button>
            </div>

            {/* Historial de erasures */}
            {requests.filter((r) => r.rightType === 'erasure').length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Historial de eliminaciones
                </h4>
                {requests
                  .filter((r) => r.rightType === 'erasure')
                  .map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{r.clientName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(r.completedAt || r.createdAt)}</p>
                      </div>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[r.status].className}`}>
                        {STATUS_CONFIG[r.status].icon}
                        {STATUS_CONFIG[r.status].label}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Consentimiento ──────────────────────────────────────────────── */}
      <Dialog open={consentModal} onOpenChange={(o) => { if (!o) { setConsentModal(false); setConsentDetail(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{consentDetail ? 'Detalle del consentimiento' : 'Nuevo consentimiento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre del interesado *</Label>
                <Input
                  value={consentForm.clientName || ''}
                  onChange={(e) => setConsentForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="Nombre Apellidos"
                />
              </div>
              <div className="space-y-1.5">
                <Label>DNI / NIF</Label>
                <Input
                  value={consentForm.clientDni || ''}
                  onChange={(e) => setConsentForm((f) => ({ ...f, clientDni: e.target.value }))}
                  placeholder="12345678A"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={consentForm.clientEmail || ''}
                  onChange={(e) => setConsentForm((f) => ({ ...f, clientEmail: e.target.value }))}
                  placeholder="cliente@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  value={consentForm.clientPhone || ''}
                  onChange={(e) => setConsentForm((f) => ({ ...f, clientPhone: e.target.value }))}
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Finalidad *</Label>
                <Select
                  value={consentForm.purpose || 'marketing'}
                  onValueChange={(v) => setConsentForm((f) => ({ ...f, purpose: v as ConsentPurpose }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal de obtención</Label>
                <Select
                  value={consentForm.channel || 'web'}
                  onValueChange={(v) => setConsentForm((f) => ({ ...f, channel: v as ConsentChannel }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Base jurídica</Label>
              <Select
                value={consentForm.legalBasis || 'consent'}
                onValueChange={(v) => setConsentForm((f) => ({ ...f, legalBasis: v as GdprConsent['legalBasis'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consent">Consentimiento explícito (Art. 6.1.a)</SelectItem>
                  <SelectItem value="contract">Ejecución de contrato (Art. 6.1.b)</SelectItem>
                  <SelectItem value="legal_obligation">Obligación legal (Art. 6.1.c)</SelectItem>
                  <SelectItem value="legitimate_interest">Interés legítimo (Art. 6.1.f)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Notas adicionales</Label>
              <Textarea
                rows={2}
                value={consentForm.notes || ''}
                onChange={(e) => setConsentForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Información adicional sobre este consentimiento..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConsentModal(false); setConsentDetail(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConsent}>
              {consentDetail ? 'Guardar cambios' : 'Registrar consentimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Solicitud de derechos ──────────────────────────────────────── */}
      <Dialog open={requestModal} onOpenChange={(o) => { if (!o) { setRequestModal(false); setRequestDetail(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{requestDetail ? 'Detalle de la solicitud' : 'Nueva solicitud de derechos'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre del interesado *</Label>
                <Input
                  value={requestForm.clientName || ''}
                  onChange={(e) => setRequestForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="Nombre Apellidos"
                />
              </div>
              <div className="space-y-1.5">
                <Label>DNI / NIF</Label>
                <Input
                  value={requestForm.clientDni || ''}
                  onChange={(e) => setRequestForm((f) => ({ ...f, clientDni: e.target.value }))}
                  placeholder="12345678A"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={requestForm.clientEmail || ''}
                  onChange={(e) => setRequestForm((f) => ({ ...f, clientEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  value={requestForm.clientPhone || ''}
                  onChange={(e) => setRequestForm((f) => ({ ...f, clientPhone: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de derecho *</Label>
                <Select
                  value={requestForm.rightType || 'access'}
                  onValueChange={(v) => setRequestForm((f) => ({ ...f, rightType: v as GdprRightType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RIGHT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label} ({v.article})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={requestForm.status || 'pending'}
                  onValueChange={(v) => setRequestForm((f) => ({ ...f, status: v as GdprRequestStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción / motivo</Label>
              <Textarea
                rows={2}
                value={requestForm.description || ''}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe la solicitud del interesado..."
              />
            </div>

            {requestDetail && (
              <div className="space-y-1.5">
                <Label>Respuesta al interesado</Label>
                <Textarea
                  rows={2}
                  value={requestForm.response || ''}
                  onChange={(e) => setRequestForm((f) => ({ ...f, response: e.target.value }))}
                  placeholder="Respuesta o resolución de la solicitud..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRequestModal(false); setRequestDetail(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRequest}>
              {requestDetail ? 'Guardar cambios' : 'Registrar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmación derecho al olvido ──────────────────────────────── */}
      <Dialog open={erasureModal} onOpenChange={(o) => {
        if (!o) {
          setErasureModal(false);
          setErasureStep('form');
          setErasureCertificate(null);
          setErasureForm((f) => ({ ...f, confirmText: '' }));
        }
      }}>
        <DialogContent className="max-w-md">
          {erasureStep === 'form' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  Confirmar derecho al olvido
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Vas a anonimizar permanentemente todos los datos personales de{' '}
                  <strong className="text-foreground">{erasureForm.clientName}</strong> en todos
                  los módulos del sistema. Esta acción es irreversible.
                </p>
                <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                  <p>· Clientes, ventas, leads, facturas y documentos</p>
                  <p>· Registros de consentimiento RGPD</p>
                  <p>· Se generará un certificado de cumplimiento Art. 17 RGPD</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Para confirmar, escribe exactamente:{' '}
                    <code className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono text-xs">
                      ELIMINAR PERMANENTEMENTE
                    </code>
                  </Label>
                  <Input
                    value={erasureForm.confirmText}
                    onChange={(e) => setErasureForm((f) => ({ ...f, confirmText: e.target.value }))}
                    placeholder="ELIMINAR PERMANENTEMENTE"
                    className={erasureForm.confirmText === 'ELIMINAR PERMANENTEMENTE' ? 'border-green-500' : ''}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setErasureModal(false)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  disabled={erasureForm.confirmText !== 'ELIMINAR PERMANENTEMENTE'}
                  onClick={handleErasure}
                >
                  <UserX className="w-4 h-4 mr-2" />
                  Ejecutar eliminación
                </Button>
              </DialogFooter>
            </>
          )}

          {erasureStep === 'done' && erasureCertificate && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  Datos eliminados correctamente
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Los datos de <strong className="text-foreground">{erasureCertificate.clientName}</strong> han
                  sido anonimizados correctamente en{' '}
                  {erasureCertificate.affectedDatabases.filter((d) => !d.error).length} módulos.
                </p>
                <div className="rounded-lg border border-border divide-y divide-border text-xs">
                  {erasureCertificate.affectedDatabases.map((db, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <span className="font-medium capitalize">{db.type}</span>
                      {db.error ? (
                        <span className="text-red-500">Error: {db.error}</span>
                      ) : (
                        <span className="text-green-600">{db.anonymized ?? 0} registros anonimizados</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Certificado ID: <code className="font-mono">{erasureCertificate.id}</code>
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setErasureModal(false); setErasureStep('form'); }}>
                  Cerrar
                </Button>
                <Button onClick={downloadCertificate}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar certificado
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
  alert,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${alert && value > 0 ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' : 'border-border bg-card'}`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <div className="mb-3 opacity-30">{icon}</div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm mt-1">{description}</p>
    </div>
  );
}
