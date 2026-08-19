import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Mail,
  RefreshCw,
  Shield,
} from 'lucide-react';
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
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type MailProvider = 'gmail' | 'outlook' | 'other';

const PROVIDER_PRESETS: Record<
  Exclude<MailProvider, 'other'>,
  { host: string; port: number; tls: boolean }
> = {
  gmail: { host: 'imap.gmail.com', port: 993, tls: true },
  outlook: { host: 'outlook.office365.com', port: 993, tls: true },
};

function detectProvider(host: string, user: string): MailProvider {
  const h = String(host || '').toLowerCase();
  const u = String(user || '').toLowerCase();
  if (h.includes('gmail') || u.endsWith('@gmail.com') || u.endsWith('@googlemail.com')) return 'gmail';
  if (
    h.includes('outlook')
    || h.includes('office365')
    || h.includes('hotmail')
    || u.endsWith('@outlook.com')
    || u.endsWith('@hotmail.com')
    || u.endsWith('@live.com')
  ) {
    return 'outlook';
  }
  return 'other';
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-300">
      {n}
    </span>
  );
}

/**
 * Asistente: conectar el correo del cliente para recibir facturas de proveedores.
 */
export function SupplierInvoiceEmailPage() {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { user } = useAuth();

  const bizId = currentBusiness?.business_id;
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const [invoiceEmailData, setInvoiceEmailData] = useState<InvoiceEmailConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [imapDraft, setImapDraft] = useState<Partial<SupplierInvoiceEmailConfig>>({});
  const [imapLoading, setImapLoading] = useState(false);
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapPolling, setImapPolling] = useState(false);
  const [pollSummary, setPollSummary] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState(false);
  const [provider, setProvider] = useState<MailProvider>('gmail');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showForwardAlt, setShowForwardAlt] = useState(false);
  const [showDonts, setShowDonts] = useState(false);

  useEffect(() => {
    if (!bizId) return;
    let cancelled = false;
    getInvoiceEmailConfig(bizId)
      .then((data) => {
        if (!cancelled) setInvoiceEmailData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bizId]);

  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    setImapLoading(true);
    getSupplierInvoiceEmailConfig(dataUserId)
      .then((cfg) => {
        if (cancelled) return;
        setImapDraft(cfg);
        const detected = detectProvider(cfg.imapHost || '', cfg.imapUser || '');
        setProvider(detected);
        if (
          cfg.imapHost
          && cfg.imapHost !== PROVIDER_PRESETS.gmail.host
          && cfg.imapHost !== PROVIDER_PRESETS.outlook.host
        ) {
          setShowAdvanced(true);
        }
      })
      .catch(() => {
        if (!cancelled) setImapDraft({});
      })
      .finally(() => {
        if (!cancelled) setImapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUserId]);

  // Al elegir Gmail/Outlook, rellenar host/puerto una sola vez (sin bucles).
  useEffect(() => {
    if (provider === 'other') return;
    const preset = PROVIDER_PRESETS[provider];
    setImapDraft((p) => {
      if (p.imapHost === preset.host && Number(p.imapPort) === preset.port) return p;
      return {
        ...p,
        imapHost: preset.host,
        imapPort: preset.port,
        imapTls: preset.tls,
      };
    });
  }, [provider]);

  const receptionEmail = invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@vertialapp.com`;
  const isConnected = Boolean(
    String(imapDraft.imapHost || '').trim()
    && String(imapDraft.imapUser || '').trim()
    && (imapDraft.enabled || lastTestOk),
  );

  const handleCopyEmail = useCallback(() => {
    navigator.clipboard.writeText(receptionEmail).then(() => {
      setCopied(true);
      toast.success('Correo copiado');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [receptionEmail]);

  const ensureReceptionEnabled = useCallback(async () => {
    if (!bizId) return;
    if (invoiceEmailData && !invoiceEmailData.enabled) {
      await saveInvoiceEmailConfig(bizId, { enabled: true });
      setInvoiceEmailData((prev) => (prev ? { ...prev, enabled: true } : prev));
    } else if (!invoiceEmailData) {
      await saveInvoiceEmailConfig(bizId, { enabled: true });
      setInvoiceEmailData({ email: receptionEmail, enabled: true } as InvoiceEmailConfig);
    }
  }, [bizId, invoiceEmailData, receptionEmail]);

  const handleSaveAndEnable = useCallback(async () => {
    if (!dataUserId) return;
    const userMail = String(imapDraft.imapUser || '').trim();
    if (!userMail) {
      toast.error('Pon el correo desde el que quieres leer facturas');
      return;
    }
    if (!String(imapDraft.imapHost || '').trim()) {
      toast.error('Elige Gmail, Outlook u Otro (avanzado)');
      return;
    }
    const passRaw = String(imapDraft.imapPassword || '');
    const passClean = passRaw === '••••••••' ? '' : passRaw.replace(/\s+/g, '').trim();
    if (!passClean) {
      toast.error('Pon la contraseña de aplicación (no la normal del correo)');
      return;
    }
    setImapSaving(true);
    try {
      await ensureReceptionEnabled();
      const saved = await saveSupplierInvoiceEmailConfig(dataUserId, {
        ...imapDraft,
        imapUser: userMail,
        imapPassword: passClean,
        enabled: true,
      });
      // Conservamos lo que escribió el usuario (con espacios) para que no “desaparezcan” caracteres en pantalla.
      // Al API / IMAP siempre va sin espacios.
      setImapDraft({
        ...saved,
        imapPassword: passRaw === '••••••••' ? passClean : passRaw,
      });
      toast.success('Correo guardado y recepción activada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar correo');
    } finally {
      setImapSaving(false);
    }
  }, [dataUserId, imapDraft, ensureReceptionEnabled]);

  const handleTestImap = useCallback(async () => {
    setImapTesting(true);
    setPollSummary(null);
    setLastTestOk(false);
    try {
      const passRaw = String(imapDraft.imapPassword || '');
      const passClean = passRaw === '••••••••' ? undefined : passRaw.replace(/\s+/g, '').trim() || undefined;
      const result = await testSupplierInvoiceImap({
        imapHost: imapDraft.imapHost,
        imapPort: imapDraft.imapPort,
        imapUser: imapDraft.imapUser,
        imapPassword: passClean,
        imapTls: imapDraft.imapTls,
        userId: dataUserId || undefined,
      });
      if (result.ok) {
        setLastTestOk(true);
        const n = Number(result.totalMessages) || 0;
        toast.success(
          n > 0
            ? `Conexión OK. Inbox IMAP: ${n.toLocaleString('es-ES')} mensajes (Gmail web puede mostrar menos; no se han importado).`
            : 'Conexión OK',
          { duration: 6000 },
        );
      } else {
        const errMsg = String(result.error || '');
        toast.error(
          /no password configured/i.test(errMsg)
            ? 'Falta la contraseña de aplicación. Vuelve a escribirla, guarda y prueba otra vez.'
            : (result.error || 'No se pudo conectar. Revisa la contraseña de aplicación.'),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al probar conexión');
    } finally {
      setImapTesting(false);
    }
  }, [imapDraft, dataUserId]);

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

  const tutorialSteps = useMemo(
    () => [
      {
        title: 'Elige el correo de facturas del negocio',
        body: 'Usa el correo donde ya llegan (o quieres que lleguen) las facturas de proveedores. Suele ser el Gmail o Outlook de la empresa.',
      },
      {
        title: 'Crea una contraseña de aplicación',
        body: 'No uses la contraseña normal del correo. En Gmail/Outlook crea una “contraseña de aplicación” solo para Vertial. Es más segura y es lo que pide el sistema.',
      },
      {
        title: 'Conecta aquí y prueba',
        body: 'Elige Gmail u Outlook, pega usuario + contraseña de aplicación, guarda y pulsa “Probar conexión”. Si sale OK, ya está.',
      },
      {
        title: 'Revisa facturas en Proveedores',
        body: 'Vertial lee los PDF, hace OCR y los deja en Proveedores → Facturas. Tú confirmas y pasan a gastos (y stock cuando toque).',
      },
    ],
    [],
  );

  const inputClass =
    'mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

  return (
    <Layout
      title="Correo de facturas"
      subtitle="Asistente para conectar tu correo y cargar facturas de proveedores"
    >
      <div className="mx-auto max-w-3xl space-y-5 pb-10">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <Mail className="h-5 w-5 text-[var(--v-blue,#2563eb)]" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Conecta tu correo (el del negocio)
              </h2>
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Vertial lee las facturas PDF que llegan a <strong>tu</strong> buzón, las prepara con OCR
                y las deja en Proveedores para que las confirmes. No cambia tu correo: sigue siendo el tuyo.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          <h3 className="mb-4 text-sm font-bold text-stone-900 dark:text-stone-100">
            Tutorial rápido (4 pasos)
          </h3>
          <ol className="space-y-4">
            {tutorialSteps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <StepBadge n={i + 1} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/20 sm:p-6">
          <button
            type="button"
            onClick={() => setShowDonts((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Qué NO debes hacer
            </span>
            {showDonts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showDonts ? (
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-amber-950/90 dark:text-amber-100/90">
              <li>
                <strong>No pongas la contraseña normal</strong> del Gmail/Outlook. Usa solo la{' '}
                <strong>contraseña de aplicación</strong>.
              </li>
              <li>
                <strong>No desactives la verificación en 2 pasos</strong> para “que sea más fácil”.
              </li>
              <li>
                <strong>No borres correos a ciegas</strong> antes de confirmar en Proveedores → Facturas.
              </li>
              <li>
                <strong>No compartas tu contraseña personal</strong> por WhatsApp; usa contraseña de aplicación.
              </li>
              <li>
                <strong>No mezcles el correo personal</strong> con el de facturas del bar si puedes evitarlo.
              </li>
            </ul>
          ) : null}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Asistente de conexión</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Elige proveedor → correo → contraseña de aplicación → probar
              </p>
            </div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Shield className="h-3.5 w-3.5" />
                Configurado
              </span>
            ) : null}
          </div>

          {imapLoading ? (
            <p className="text-sm text-stone-400">Cargando…</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                  1. ¿Qué correo usas?
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    { id: 'gmail' as const, label: 'Gmail' },
                    { id: 'outlook' as const, label: 'Outlook' },
                    { id: 'other' as const, label: 'Otro' },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setProvider(opt.id);
                        setLastTestOk(false);
                        setShowAdvanced(opt.id === 'other');
                      }}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                        provider === opt.id
                          ? 'border-blue-300 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:border-blue-800 dark:bg-blue-950/40'
                          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    2. Correo (usuario)
                  </span>
                  <input
                    type="email"
                    value={imapDraft.imapUser || ''}
                    onChange={(e) => {
                      setImapDraft((p) => ({ ...p, imapUser: e.target.value }));
                      setLastTestOk(false);
                    }}
                    placeholder={
                      provider === 'gmail'
                        ? 'facturas@tudominio.com o tu@gmail.com'
                        : provider === 'outlook'
                          ? 'facturas@tuempresa.com'
                          : 'usuario@tudominio.com'
                    }
                    className={inputClass}
                    autoComplete="username"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    3. Contraseña de aplicación
                  </span>
                  <input
                    type="password"
                    value={imapDraft.imapPassword || ''}
                    onChange={(e) => {
                      setImapDraft((p) => ({ ...p, imapPassword: e.target.value }));
                      setLastTestOk(false);
                    }}
                    placeholder="Pega la contraseña de aplicación (los espacios se quitan solos)"
                    className={inputClass}
                    autoComplete="new-password"
                  />
                  <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                    {provider === 'gmail' ? (
                      <>
                        Gmail: Cuenta Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.{' '}
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                        >
                          Abrir guía <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : provider === 'outlook' ? (
                      <>Outlook / Microsoft 365: Seguridad → Contraseñas de aplicación (con 2FA activo).</>
                    ) : (
                      <>Si tu proveedor pide IMAP, rellena también “Avanzado” abajo.</>
                    )}
                  </p>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
              >
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Avanzado (servidor IMAP / puerto) — solo si hace falta
              </button>

              {showAdvanced ? (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/50 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase text-stone-400">Servidor IMAP</span>
                    <input
                      type="text"
                      value={imapDraft.imapHost || ''}
                      onChange={(e) => setImapDraft((p) => ({ ...p, imapHost: e.target.value }))}
                      placeholder="imap.tudominio.com"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase text-stone-400">Puerto</span>
                    <input
                      type="number"
                      value={imapDraft.imapPort ?? 993}
                      onChange={(e) => setImapDraft((p) => ({ ...p, imapPort: Number(e.target.value) || 993 }))}
                      className={inputClass}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={imapDraft.imapTls !== false}
                      onChange={(e) => setImapDraft((p) => ({ ...p, imapTls: e.target.checked }))}
                      className="rounded border-stone-300"
                    />
                    Usar TLS/SSL (casi siempre sí)
                  </label>
                </div>
              ) : provider !== 'other' ? (
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Servidor: <span className="font-mono">{imapDraft.imapHost || '—'}</span>
                  {' · '}puerto {imapDraft.imapPort ?? 993}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleSaveAndEnable()}
                  disabled={imapSaving || !dataUserId}
                  className={VERTIAL_BTN_PRIMARY}
                >
                  {imapSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Guardar y activar
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestImap()}
                  disabled={imapTesting || !dataUserId}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  {imapTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Probar conexión
                </button>
                <button
                  type="button"
                  onClick={() => void handlePollInvoicesNow()}
                  disabled={imapPolling || !dataUserId}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  {imapPolling ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Sincronizar ahora
                </button>
              </div>

              {lastTestOk ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Conexión correcta. Eso no importa el histórico: al sincronizar solo se miran correos{' '}
                  <strong>no leídos</strong> con PDF/imagen de factura.
                </p>
              ) : null}
              {pollSummary ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{pollSummary}</p>
              ) : null}

              <button
                type="button"
                onClick={() => navigate('/saas/suppliers/facturas')}
                className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto`}
              >
                Ir a Proveedores → Facturas
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          <button
            type="button"
            onClick={() => setShowForwardAlt((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Alternativa: reenviar a una dirección Vertial
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Solo si no quieres conectar tu buzón. No es el camino principal.
              </p>
            </div>
            {showForwardAlt ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          </button>
          {showForwardAlt ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Puedes reenviar facturas PDF a esta dirección exclusiva de tu empresa.
              </p>
              <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-950/50 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {receptionEmail}
                </p>
                <button type="button" onClick={handleCopyEmail} className={VERTIAL_BTN_SECONDARY}>
                  <Copy className="h-4 w-4" />
                  {copied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </Layout>
  );
}
