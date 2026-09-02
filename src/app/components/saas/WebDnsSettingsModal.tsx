import { useMemo, useState } from 'react';
import { Check, Copy, Globe, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

/** Host Vertial al que el cliente apunta su CNAME. */
export const VERTIAL_WEB_CNAME_TARGET = 'shops.vertialapp.com';

type DnsRow = {
  type: string;
  name: string;
  value: string;
  note?: string;
};

export function normalizeWebCustomDomain(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function dnsHostLabel(domain: string): string {
  const host = normalizeWebCustomDomain(domain);
  if (!host) return 'pedidos';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return '@';
  return parts[0] || 'pedidos';
}

interface Props {
  open: boolean;
  onClose: () => void;
  domain: string;
  onChangeDomain: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function WebDnsSettingsModal({
  open,
  onClose,
  domain,
  onChangeDomain,
  onSave,
  saving,
}: Props) {
  const [copiedKey, setCopiedKey] = useState('');
  const normalized = useMemo(() => normalizeWebCustomDomain(domain), [domain]);
  const recordName = useMemo(() => dnsHostLabel(normalized), [normalized]);

  const dnsRows = useMemo<DnsRow[]>(() => {
    if (!normalized) return [];
    return [
      {
        type: 'CNAME',
        name: recordName,
        value: VERTIAL_WEB_CNAME_TARGET,
        note:
          recordName === '@'
            ? 'Raíz del dominio: muchos paneles no permiten CNAME en @. Usa pedidos.tudominio.es o ALIAS/ANAME si tu DNS lo ofrece.'
            : 'En el panel DNS del dominio (Cloudflare, Dinahosting, etc.)',
      },
    ];
  }, [normalized, recordName]);

  if (!open) return null;

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

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="web-dns-settings-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <div className="min-w-0">
            <p
              id="web-dns-settings-title"
              className="inline-flex items-center gap-2 text-sm font-bold text-stone-900 dark:text-stone-100"
            >
              <Settings2 className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
              DNS · dominio propio
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              Conecta tu dominio a la web de pedidos de Vertial
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
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Tu dominio</h3>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Recomendado: un subdominio tipo <strong>pedidos.tunegocio.es</strong>. El enlace Vertial (
              <code className="text-xs">/web/…</code>) sigue funcionando igual.
            </p>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={domain}
                onChange={(e) => onChangeDomain(e.target.value)}
                placeholder="pedidos.tunegocio.es"
                className="min-h-11 w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3.5 font-mono text-sm text-stone-900 outline-none focus:border-[var(--v-blue,#2563eb)] focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Registro DNS</h3>
            {!normalized ? (
              <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-400">
                Escribe el dominio arriba para ver el CNAME exacto a copiar en tu panel DNS.
              </p>
            ) : (
              <>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  En el DNS de <strong>{normalized}</strong> crea este registro:
                </p>
                <ul className="space-y-2">
                  {dnsRows.map((row, idx) => {
                    const key = `${row.type}-${idx}`;
                    const line = [row.type, row.name, row.value].join(' · ');
                    return (
                      <li
                        key={key}
                        className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-950/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                              {line}
                            </p>
                            {row.note ? (
                              <p className="text-xs text-stone-500">{row.note}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyText(key, row.value)}
                            className={`${VERTIAL_BTN_SECONDARY} !min-h-9 shrink-0 !px-2.5 !text-xs`}
                            title="Copiar destino"
                          >
                            {copiedKey === key ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => void copyText('target', VERTIAL_WEB_CNAME_TARGET)}
                  className={`${VERTIAL_BTN_SECONDARY} !text-xs`}
                >
                  {copiedKey === 'target' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copiar destino ({VERTIAL_WEB_CNAME_TARGET})
                </button>
              </>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-4 py-3 dark:border-stone-800">
          <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY}>
            Cerrar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className={VERTIAL_BTN_PRIMARY}
          >
            {saving ? 'Guardando…' : 'Guardar dominio'}
          </button>
        </div>
      </div>
    </div>
  );
}
