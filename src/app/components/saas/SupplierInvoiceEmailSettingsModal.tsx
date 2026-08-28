import { useMemo, useState } from 'react';
import { Check, Copy, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SupplierInvoiceEmailConfig } from '../../lib/supplierInvoiceApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type MailProvider = 'gmail' | 'outlook' | 'other';

type DnsRow = {
  type: string;
  name: string;
  value: string;
  priority?: string;
  note?: string;
};

function dnsRowsForProvider(provider: MailProvider, domain: string): DnsRow[] {
  const host = domain || 'tudominio.com';
  if (provider === 'gmail') {
    return [
      {
        type: 'MX',
        name: '@',
        value: 'aspmx.l.google.com',
        priority: '1',
        note: 'Google Workspace / correo @dominio',
      },
      { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', priority: '5' },
      { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com', priority: '5' },
      {
        type: 'TXT',
        name: '@',
        value: 'v=spf1 include:_spf.google.com ~all',
        note: 'SPF (recomendado)',
      },
    ];
  }
  if (provider === 'outlook') {
    return [
      {
        type: 'MX',
        name: '@',
        value: `${host.replace(/\./g, '-')}.mail.protection.outlook.com`,
        priority: '0',
        note: 'Microsoft 365 — confirma el host exacto en el panel de Microsoft',
      },
      {
        type: 'TXT',
        name: '@',
        value: 'v=spf1 include:spf.protection.outlook.com -all',
        note: 'SPF (recomendado)',
      },
    ];
  }
  return [
    {
      type: 'MX',
      name: '@',
      value: 'mail.tudominio.com',
      priority: '10',
      note: 'Pide a tu proveedor de correo el MX exacto',
    },
    {
      type: 'TXT',
      name: '@',
      value: 'v=spf1 mx ~all',
      note: 'SPF genérico; ajústalo a tu hosting',
    },
  ];
}

function extractDomain(email: string): string {
  const at = String(email || '').trim().toLowerCase().indexOf('@');
  if (at < 0) return '';
  return String(email).trim().toLowerCase().slice(at + 1);
}

function isConsumerMailbox(email: string): boolean {
  const d = extractDomain(email);
  return (
    d === 'gmail.com'
    || d === 'googlemail.com'
    || d === 'outlook.com'
    || d === 'hotmail.com'
    || d === 'live.com'
    || d === 'icloud.com'
    || d === 'yahoo.com'
    || d === 'yahoo.es'
  );
}

type PdvStatusRow = {
  pdvId: string;
  label: string;
  connected: boolean;
  imapUser: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  storeLabel: string;
  provider: MailProvider;
  draft: Partial<SupplierInvoiceEmailConfig>;
  onChangeDraft: (patch: Partial<SupplierInvoiceEmailConfig>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  canSave: boolean;
  pdvRows: PdvStatusRow[];
  onSelectPdv: (pdvId: string) => void;
}

export function SupplierInvoiceEmailSettingsModal({
  open,
  onClose,
  storeLabel,
  provider,
  draft,
  onChangeDraft,
  onSave,
  saving,
  canSave,
  pdvRows,
  onSelectPdv,
}: Props) {
  const [copiedKey, setCopiedKey] = useState('');
  const email = String(draft.imapUser || '').trim();
  const domain = extractDomain(email);
  const consumer = isConsumerMailbox(email);
  const dnsRows = useMemo(() => dnsRowsForProvider(provider, domain), [provider, domain]);

  if (!open) return null;

  const alertCfg = draft.alertConfig || {
    duplicateEnabled: true,
    noAttachmentEnabled: true,
    unknownSupplierEnabled: true,
    ocrFailedEnabled: true,
    overdueEnabled: true,
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success('Copiado');
      window.setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const toggleAlert = (key: keyof typeof alertCfg, value: boolean) => {
    onChangeDraft({
      alertConfig: { ...alertCfg, [key]: value },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sinv-email-settings-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <div className="min-w-0">
            <p
              id="sinv-email-settings-title"
              className="inline-flex items-center gap-2 text-sm font-bold text-stone-900 dark:text-stone-100"
            >
              <Settings2 className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
              Ajustes · correo facturas
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              Tienda: <strong className="text-stone-700 dark:text-stone-300">{storeLabel || '—'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-200 p-2 text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">DNS (dominio propio)</h3>
            {consumer || !domain ? (
              <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-400">
                {consumer
                  ? 'Este buzón es de un proveedor público (Gmail/Outlook…). No hace falta tocar DNS: solo contraseña de aplicación e IMAP.'
                  : 'Escribe el correo de esta tienda en la ficha principal para ver los registros DNS de su dominio.'}
              </p>
            ) : (
              <>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Para que lleguen facturas a <strong>@{domain}</strong>, en el panel DNS del dominio
                  (Cloudflare, Dinahosting, etc.) configura al menos los <strong>MX</strong>. SPF ayuda a
                  que no marquen spam al responder.
                </p>
                <ul className="space-y-2">
                  {dnsRows.map((row, idx) => {
                    const key = `${row.type}-${idx}`;
                    const line = [
                      row.type,
                      row.name,
                      row.priority ? `prio ${row.priority}` : null,
                      row.value,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li
                        key={key}
                        className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-950/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                              {row.type}{' '}
                              {row.priority ? (
                                <span className="text-stone-500">prio {row.priority}</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-stone-600 dark:text-stone-400">
                              {row.name} → {row.value}
                            </p>
                            {row.note ? (
                              <p className="mt-1 text-[11px] text-stone-500">{row.note}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyText(key, line)}
                            className="shrink-0 rounded-lg border border-stone-200 bg-white p-1.5 text-stone-500 hover:text-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-900"
                            title="Copiar"
                          >
                            {copiedKey === key ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">
              Operativa de esta tienda
            </h3>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                Revisar correo cada (minutos)
              </span>
              <input
                type="number"
                min={1}
                max={120}
                value={draft.pollIntervalMinutes ?? 5}
                onChange={(e) =>
                  onChangeDraft({
                    pollIntervalMinutes: Math.max(1, Number(e.target.value) || 5),
                  })
                }
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5 dark:border-stone-700">
              <span className="text-sm text-stone-700 dark:text-stone-200">
                Crear pago en Finanzas al aprobar
              </span>
              <input
                type="checkbox"
                checked={Boolean(draft.autoCreateFinance)}
                onChange={(e) => onChangeDraft({ autoCreateFinance: e.target.checked })}
                className="h-4 w-4 rounded border-stone-300 text-[var(--v-blue,#2563eb)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                Categoría por defecto
              </span>
              <input
                type="text"
                value={draft.defaultCategory || 'proveedores'}
                onChange={(e) => onChangeDraft({ defaultCategory: e.target.value })}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950"
              />
            </label>
            <div className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                Avisos de este buzón
              </p>
              {(
                [
                  ['duplicateEnabled', 'Factura duplicada'],
                  ['noAttachmentEnabled', 'Email sin adjunto'],
                  ['unknownSupplierEnabled', 'Proveedor no encontrado'],
                  ['ocrFailedEnabled', 'OCR fallido'],
                  ['overdueEnabled', 'Factura vencida'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-stone-700 dark:text-stone-200">{label}</span>
                  <input
                    type="checkbox"
                    checked={alertCfg[key] !== false}
                    onChange={(e) => toggleAlert(key, e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[var(--v-blue,#2563eb)]"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">
              Estado por tienda
            </h3>
            {pdvRows.length === 0 ? (
              <p className="text-sm text-stone-500">Sin PDVs activos en esta empresa.</p>
            ) : (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-700">
                {pdvRows.map((row) => (
                  <li key={row.pdvId} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {row.label}
                      </p>
                      <p className="truncate text-[11px] text-stone-500">
                        {row.connected ? row.imapUser || 'Conectado' : 'Sin correo'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={VERTIAL_BTN_SECONDARY + ' !min-h-9 !px-3 !py-1.5 !text-xs'}
                      onClick={() => {
                        onSelectPdv(row.pdvId);
                        onClose();
                      }}
                    >
                      {row.connected ? 'Editar' : 'Configurar'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-stone-100 px-4 py-3 dark:border-stone-800 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY}>
            Cerrar
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void onSave()}
            className={VERTIAL_BTN_PRIMARY}
          >
            {saving ? 'Guardando…' : 'Guardar ajustes de esta tienda'}
          </button>
        </div>
      </div>
    </div>
  );
}
