import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  getInvoiceEmailConfig,
  saveInvoiceEmailConfig,
  type InvoiceEmailConfig,
} from '../../lib/configApi';
import {
  getSupplierInvoiceEmailConfig,
  pollSupplierInvoicesNow,
  saveSupplierInvoiceEmailConfig,
  testSupplierInvoiceImap,
  type SupplierInvoiceEmailConfig,
} from '../../lib/supplierInvoiceApi';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';

/**
 * Correo de recepción de facturas de proveedores (dirección Vertial + IMAP).
 * Vive en Catálogo y Proveedores (sidebar), no en Configuración general.
 */
export function SupplierInvoiceEmailPage() {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { user } = useAuth();

  const bizId = currentBusiness?.business_id;
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const [invoiceEmailData, setInvoiceEmailData] = useState<InvoiceEmailConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [imapConfig, setImapConfig] = useState<SupplierInvoiceEmailConfig | null>(null);
  const [imapDraft, setImapDraft] = useState<Partial<SupplierInvoiceEmailConfig>>({});
  const [imapLoading, setImapLoading] = useState(false);
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapPolling, setImapPolling] = useState(false);
  const [pollSummary, setPollSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!bizId) return;
    getInvoiceEmailConfig(bizId).then(setInvoiceEmailData).catch(() => {});
  }, [bizId]);

  useEffect(() => {
    if (!dataUserId) return;
    setImapLoading(true);
    getSupplierInvoiceEmailConfig(dataUserId)
      .then((cfg) => {
        setImapConfig(cfg);
        setImapDraft(cfg);
      })
      .catch(() => {
        setImapConfig(null);
        setImapDraft({});
      })
      .finally(() => setImapLoading(false));
  }, [dataUserId]);

  const handleCopyEmail = useCallback(() => {
    const email = invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@vertialapp.com`;
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      toast.success('Email copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [invoiceEmailData, bizId]);

  const handleToggleInvoiceEmail = useCallback(async () => {
    if (!bizId || !invoiceEmailData) return;
    try {
      const next = !invoiceEmailData.enabled;
      await saveInvoiceEmailConfig(bizId, { enabled: next });
      setInvoiceEmailData((prev) => (prev ? { ...prev, enabled: next } : prev));
      if (dataUserId) {
        const cfg = await getSupplierInvoiceEmailConfig(dataUserId).catch(() => imapConfig);
        const merged = { ...(cfg || imapDraft), enabled: next };
        await saveSupplierInvoiceEmailConfig(dataUserId, merged);
        setImapConfig(merged as SupplierInvoiceEmailConfig);
        setImapDraft(merged);
      }
      toast.success(next ? 'Recepción de facturas activada' : 'Recepción de facturas desactivada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    }
  }, [bizId, invoiceEmailData, dataUserId, imapConfig, imapDraft]);

  const handleSaveImapConfig = useCallback(async () => {
    if (!dataUserId) return;
    setImapSaving(true);
    try {
      const saved = await saveSupplierInvoiceEmailConfig(dataUserId, {
        ...imapDraft,
        enabled: imapDraft.enabled ?? invoiceEmailData?.enabled ?? false,
      });
      setImapConfig(saved);
      setImapDraft(saved);
      toast.success('Sesión de correo guardada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar correo');
    } finally {
      setImapSaving(false);
    }
  }, [dataUserId, imapDraft, invoiceEmailData?.enabled]);

  const handleTestImap = useCallback(async () => {
    setImapTesting(true);
    setPollSummary(null);
    try {
      const result = await testSupplierInvoiceImap({
        imapHost: imapDraft.imapHost,
        imapPort: imapDraft.imapPort,
        imapUser: imapDraft.imapUser,
        imapPassword: imapDraft.imapPassword === '••••••••' ? undefined : imapDraft.imapPassword,
        imapTls: imapDraft.imapTls,
      });
      if (result.ok) {
        toast.success(`Conexión OK · ${result.totalMessages ?? 0} mensajes en bandeja`);
      } else {
        toast.error(result.error || 'No se pudo conectar al correo');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al probar conexión');
    } finally {
      setImapTesting(false);
    }
  }, [imapDraft]);

  const handlePollInvoicesNow = useCallback(async () => {
    if (!dataUserId) return;
    setImapPolling(true);
    setPollSummary(null);
    try {
      const summary = await pollSupplierInvoicesNow(dataUserId);
      const msg = `${summary.processed} emails · ${summary.created} facturas nuevas · ${summary.alerts} avisos`;
      setPollSummary(msg);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al sincronizar correo');
    } finally {
      setImapPolling(false);
    }
  }, [dataUserId]);

  return (
    <Layout
      title="Correo de facturas"
      subtitle="Recepción automática de facturas de proveedores"
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Correo recepción de facturas</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Envía o reenvía facturas de proveedores a esta dirección para procesarlas automáticamente
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Tu correo de recepción
              </p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 truncate">
                {invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@vertialapp.com`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleInvoiceEmail()}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                  invoiceEmailData?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-label={invoiceEmailData?.enabled ? 'Desactivar recepción' : 'Activar recepción'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    invoiceEmailData?.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={handleCopyEmail}
                className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
              >
                {copied ? '¡Copiado!' : 'Copiar correo'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Info className="w-4 h-4 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Las facturas recibidas se procesan con OCR y aparecen en{' '}
              <button
                type="button"
                onClick={() => navigate('/saas/suppliers/facturas')}
                className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                Proveedores → Facturas
              </button>
              . Revisa también la sesión IMAP abajo si usas un buzón propio.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Sesión de correo (IMAP)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Conecta el buzón donde llegan las facturas para volcarlas al sistema automáticamente
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleTestImap()}
                  disabled={imapTesting || imapLoading || !dataUserId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {imapTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Probar conexión
                </button>
                <button
                  type="button"
                  onClick={() => void handlePollInvoicesNow()}
                  disabled={imapPolling || imapLoading || !dataUserId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  {imapPolling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Sincronizar ahora
                </button>
              </div>
            </div>

            {imapLoading ? (
              <p className="text-xs text-gray-400">Cargando configuración de correo…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Servidor IMAP</span>
                  <input
                    type="text"
                    value={imapDraft.imapHost || ''}
                    onChange={(e) => setImapDraft((p) => ({ ...p, imapHost: e.target.value }))}
                    placeholder="imap.tudominio.com"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Puerto</span>
                  <input
                    type="number"
                    value={imapDraft.imapPort ?? 993}
                    onChange={(e) => setImapDraft((p) => ({ ...p, imapPort: Number(e.target.value) || 993 }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Usuario</span>
                  <input
                    type="text"
                    value={imapDraft.imapUser || ''}
                    onChange={(e) => setImapDraft((p) => ({ ...p, imapUser: e.target.value }))}
                    placeholder="facturas@tuempresa.com"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-gray-400">Contraseña</span>
                  <input
                    type="password"
                    value={imapDraft.imapPassword || ''}
                    onChange={(e) => setImapDraft((p) => ({ ...p, imapPassword: e.target.value }))}
                    placeholder="••••••••"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={imapDraft.imapTls !== false}
                  onChange={(e) => setImapDraft((p) => ({ ...p, imapTls: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                Usar TLS/SSL
              </label>
              <button
                type="button"
                onClick={() => void handleSaveImapConfig()}
                disabled={imapSaving || !dataUserId}
                className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold disabled:opacity-50"
              >
                {imapSaving ? 'Guardando…' : 'Guardar sesión de correo'}
              </button>
            </div>

            {pollSummary ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{pollSummary}</p>
            ) : null}
          </div>
        </section>
      </div>
    </Layout>
  );
}
