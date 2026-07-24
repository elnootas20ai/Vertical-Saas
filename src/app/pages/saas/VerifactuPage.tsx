import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useBusiness } from '../../context/BusinessContext';
import {
  getVerifactuSettings,
  saveVerifactuSettings,
  listVerifactuRecords,
  issueVerifactuRecord,
  type VerifactuSettings,
  type VerifactuRecord,
  type VerifactuLineInput,
} from '../../lib/verifactuApi';
import { Loader2, Plus, QrCode, ShieldCheck, X } from 'lucide-react';

const emptyLine = (): VerifactuLineInput => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxRate: 21,
});

export function VerifactuPage() {
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const [settings, setSettings] = useState<VerifactuSettings | null>(null);
  const [records, setRecords] = useState<VerifactuRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({
    recipientName: '',
    recipientNif: '',
    issueDate: new Date().toISOString().slice(0, 10),
    notes: '',
    lines: [emptyLine()],
  });

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [s, r] = await Promise.all([
        getVerifactuSettings(businessId),
        listVerifactuRecords(businessId, { year: new Date().getFullYear() }),
      ]);
      setSettings(s);
      setRecords(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar Verifactu');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!businessId || !settings) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await saveVerifactuSettings(businessId, settings);
      setSettings(saved);
      setSuccess('Ajustes guardados');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setIssuing(true);
    setError('');
    setSuccess('');
    try {
      const result = await issueVerifactuRecord(businessId, {
        issueDate: form.issueDate,
        recipientName: form.recipientName,
        recipientNif: form.recipientNif,
        notes: form.notes,
        lines: form.lines.filter((l) => l.description.trim()),
      });
      setSettings(result.settings);
      setShowForm(false);
      setForm({
        recipientName: '',
        recipientNif: '',
        issueDate: new Date().toISOString().slice(0, 10),
        notes: '',
        lines: [emptyLine()],
      });
      setSuccess(`Emitida ${result.record.fullNumber} (huella registrada)`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir');
    } finally {
      setIssuing(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Verifactu" subtitle="Motor de facturación verificable (España)">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Verifactu" subtitle="Motor fiscal Fase 1 — registro inmutable (sin envío AEAT aún)">
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Fase 1:</strong> se genera número, huella encadenada y QR de validación AEAT.
          El envío automático a Hacienda (certificado) es la siguiente fase.
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
            {success}
          </div>
        )}

        {settings && (
          <form
            onSubmit={(e) => void handleSaveSettings(e)}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-600" />
                Ajustes empresa
              </h2>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                />
                Activar emisión Verifactu
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Serie
                <input
                  value={settings.series}
                  onChange={(e) => setSettings({ ...settings, series: e.target.value.toUpperCase() })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Próximo nº
                <input
                  value={settings.nextNumber}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Entorno QR AEAT
                <select
                  value={settings.environment}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      environment: e.target.value === 'production' ? 'production' : 'sandbox',
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="sandbox">Pruebas (sandbox)</option>
                  <option value="production">Producción</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                NIF/CIF emisor
                <input
                  value={settings.issuerNif}
                  onChange={(e) => setSettings({ ...settings, issuerNif: e.target.value.toUpperCase() })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 sm:col-span-2">
                Razón social
                <input
                  value={settings.issuerName}
                  onChange={(e) => setSettings({ ...settings, issuerName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar ajustes'}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Registros emitidos {new Date().getFullYear()}</h2>
          <button
            type="button"
            disabled={!settings?.enabled}
            onClick={() => {
              setError('');
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Emitir factura
          </button>
        </div>

        {!settings?.enabled && (
          <p className="text-sm text-gray-500">Activa Verifactu arriba para poder emitir registros inmutables.</p>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {records.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">Sin registros todavía</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-semibold uppercase text-gray-400 dark:border-gray-700 dark:bg-gray-900/40">
                    <th className="px-4 py-2.5">Nº</th>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Cliente</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">AEAT</th>
                    <th className="px-4 py-2.5">QR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {records.map((r) => (
                    <tr key={r.id} className="text-sm">
                      <td className="px-4 py-2.5 font-semibold tabular-nums">{r.fullNumber}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-600 dark:text-gray-300">{r.issueDate}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900 dark:text-white">{r.recipient.name}</p>
                        <p className="text-xs text-gray-400">{r.recipient.nif || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{r.total.toFixed(2)} €</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                          {r.aeatStatus === 'pending_local' ? 'Local (sin envío)' : r.aeatStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <a
                          href={r.qrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                          title={r.huella}
                        >
                          <QrCode className="h-4 w-4" />
                          Ver
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:max-w-lg sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Emitir factura Verifactu</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleIssue(e)} className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Cliente
                <input
                  required
                  value={form.recipientName}
                  onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                NIF cliente (opcional)
                <input
                  value={form.recipientNif}
                  onChange={(e) => setForm((p) => ({ ...p, recipientNif: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                Fecha
                <input
                  type="date"
                  required
                  value={form.issueDate}
                  onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </label>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Líneas</p>
                {form.lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-6 gap-2">
                    <input
                      placeholder="Concepto"
                      required
                      value={line.description}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[idx] = { ...line, description: e.target.value };
                        setForm((p) => ({ ...p, lines }));
                      }}
                      className="col-span-3 rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[idx] = { ...line, quantity: Number(e.target.value) };
                        setForm((p) => ({ ...p, lines }));
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                        setForm((p) => ({ ...p, lines }));
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                    />
                    <input
                      type="number"
                      value={line.taxRate ?? 21}
                      onChange={(e) => {
                        const lines = [...form.lines];
                        lines[idx] = { ...line, taxRate: Number(e.target.value) };
                        setForm((p) => ({ ...p, lines }));
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                      title="% IVA"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }))}
                  className="text-xs font-semibold text-violet-600"
                >
                  + Línea
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Al emitir no se podrá editar: solo rectificativa en fases siguientes.
              </p>

              <button
                type="submit"
                disabled={issuing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Emitir (inmutable)
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
