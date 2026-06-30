import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Printer,
  Wifi,
  Monitor,
  Smartphone,
  Receipt,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  DEFAULT_PRINTER_CONFIG,
  fetchBridgePrinters,
  loadPrinterConfig,
  printTestTicket,
  savePrinterConfig,
  type VertialPrinterConfig,
} from '../../lib/vertialPrint';
import {
  connectionToSetupKind,
  evaluatePrinterStatus,
  isAppleMobileDevice,
  setupKindToConnection,
  type PrinterSetupKind,
  type PrinterStatusSnapshot,
} from '../../lib/vertialPrint/printerSetupStatus';
import {
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
  settingsChoiceCardClass,
  settingsListCardClass,
} from './settings/settingsFormStyles';

const SETUP_OPTIONS: Array<{ id: PrinterSetupKind; label: string; hint: string; icon: typeof Wifi }> = [
  {
    id: 'wifi',
    label: 'Impresora por WiFi',
    hint: 'Epson u otra térmica en la misma red del local. Ideal para iPad y tablets.',
    icon: Wifi,
  },
  {
    id: 'pc',
    label: 'Impresora en el PC del mostrador',
    hint: 'Enchufada por USB al ordenador. El TPV manda imprimir a ese PC.',
    icon: Monitor,
  },
  {
    id: 'browser',
    label: 'Sin térmica / ventana del dispositivo',
    hint: 'Abre la pantalla de imprimir del sistema. En iPad solo impresoras AirPrint.',
    icon: Smartphone,
  },
];

function statusToneClass(tone: PrinterStatusSnapshot['tone']): string {
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800';
  if (tone === 'warn') return 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800';
  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function TpvPrinterSetupPanel({
  variant = 'page',
  onClose,
}: {
  variant?: 'page' | 'modal';
  onClose?: () => void;
}) {
  const [config, setConfig] = useState<VertialPrinterConfig>(() => loadPrinterConfig());
  const [kind, setKind] = useState<PrinterSetupKind>(() => connectionToSetupKind(loadPrinterConfig().connectionType));
  const [printers, setPrinters] = useState<Array<{ name: string }>>([]);
  const [testing, setTesting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [status, setStatus] = useState<PrinterStatusSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const refreshStatus = useCallback(async (nextConfig = config) => {
    setStatusLoading(true);
    try {
      setStatus(await evaluatePrinterStatus(nextConfig));
      if (nextConfig.connectionType !== 'browser') {
        setPrinters(await fetchBridgePrinters(nextConfig));
      }
    } finally {
      setStatusLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status && !status.configured && !showSetup) {
      setShowSetup(true);
    }
  }, [status, showSetup]);

  const patch = (partial: Partial<VertialPrinterConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      savePrinterConfig(next);
      void refreshStatus(next);
      return next;
    });
  };

  const selectKind = (next: PrinterSetupKind) => {
    setKind(next);
    patch({ connectionType: setupKindToConnection(next) });
    setShowSetup(true);
  };

  const handleTest = async () => {
    savePrinterConfig(config);
    setTesting(true);
    try {
      await printTestTicket();
      await refreshStatus();
    } finally {
      setTesting(false);
    }
  };

  const showIpadBridgeHint = isAppleMobileDevice() && kind !== 'browser';

  return (
    <div className={variant === 'page' ? 'space-y-6 max-w-2xl' : 'flex flex-col min-h-0'}>
      {variant === 'modal' && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impresora de tickets</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Se configura una vez por tienda. Funciona en iPad y PC.</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      )}

      <div className={variant === 'modal' ? 'flex-1 overflow-y-auto px-5 py-4 space-y-5' : 'space-y-5'}>
        {variant === 'page' && (
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresión de tickets</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  También disponible en el TPV (icono de impresora con la caja abierta)
                </p>
              </div>
            </div>
          </header>
        )}

        <section className={`${settingsListCardClass()} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${statusLoading ? 'bg-gray-300 animate-pulse' : status?.tone === 'ok' ? 'bg-emerald-500' : status?.tone === 'warn' ? 'bg-amber-500' : 'bg-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {statusLoading ? 'Comprobando…' : status?.label || 'Sin configurar'}
              </p>
              {!statusLoading && status?.detail && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{status.detail}</p>
              )}
            </div>
            {!statusLoading && status && (
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ${statusToneClass(status.tone)}`}>
                {status.tone === 'ok' ? 'Lista' : status.tone === 'warn' ? 'Revisar' : 'Básica'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className={`${settingsPrimaryBtnClass} w-full`}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {testing ? 'Imprimiendo…' : 'Probar impresión'}
          </button>
        </section>

        <div>
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 py-2"
          >
            <span>{showSetup ? 'Ocultar configuración' : 'Configurar impresora'}</span>
            {showSetup ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showSetup && (
            <div className="space-y-4 mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Elige cómo está conectada en tu local. No depende de si usas iPad o PC: todos los dispositivos de la tienda usarán la misma impresora.
              </p>

              <div className="grid gap-2">
                {SETUP_OPTIONS.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectKind(id)}
                    className={`${settingsChoiceCardClass(kind === id)} flex gap-3 items-start text-left w-full`}
                  >
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{hint}</p>
                    </div>
                  </button>
                ))}
              </div>

              {kind === 'wifi' && (
                <div className={`${settingsListCardClass()} space-y-4`}>
                  <label className="block">
                    <span className={settingsLabelClass}>Número de la impresora</span>
                    <input
                      className={settingsInputClass}
                      value={config.networkHost}
                      onChange={(e) => patch({ networkHost: e.target.value.trim() })}
                      placeholder="Ejemplo: 192.168.0.50"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Mantén pulsado el botón de la impresora unos segundos hasta que salga un ticket. El número suele estar abajo, tipo <strong>192.168.1.45</strong>.
                  </p>
                </div>
              )}

              {kind === 'pc' && (
                <div className={`${settingsListCardClass()} space-y-3`}>
                  <label className="block">
                    <span className={settingsLabelClass}>Impresora en este PC</span>
                    <select
                      className={settingsInputClass}
                      value={config.systemPrinterName}
                      onChange={(e) => patch({ systemPrinterName: e.target.value })}
                    >
                      <option value="">— Elige en la lista —</option>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  {printers.length === 0 && (
                    <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Instala la impresora en Windows y asegúrate de que Vertial Print está activo en este PC.
                    </p>
                  )}
                </div>
              )}

              {kind === 'browser' && (
                <div className={`${settingsListCardClass()} space-y-2`}>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Al cobrar se abrirá la ventana de imprimir de tu dispositivo, como una foto o un PDF.
                  </p>
                  {isAppleMobileDevice() && (
                    <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      En iPad solo aparecen impresoras AirPrint. Para una Epson térmica, usa «Impresora por WiFi».
                    </p>
                  )}
                </div>
              )}

              {showIpadBridgeHint && (
                <div className={`${settingsListCardClass()} space-y-3`}>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    ¿Usas iPad u otra tablet?
                  </p>
                  <label className="block">
                    <span className={settingsLabelClass}>Número del PC del mostrador (opcional)</span>
                    <input
                      className={settingsInputClass}
                      value={config.bridgeHost}
                      onChange={(e) => patch({ bridgeHost: e.target.value.trim() })}
                      placeholder="Ejemplo: 192.168.0.20"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Déjalo vacío si imprimes desde el mismo PC. En iPad, pon la IP del PC encendido del mostrador (misma WiFi).
                  </p>
                </div>
              )}

              <div className={`${settingsListCardClass()} space-y-3`}>
                <p className={settingsLabelClass}>Ancho del ticket</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ paperWidthMm: 80 })}
                    className={settingsChoiceCardClass(config.paperWidthMm === 80) + ' px-4 py-2 text-sm font-medium'}
                  >
                    Normal (80 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ paperWidthMm: 58 })}
                    className={settingsChoiceCardClass(config.paperWidthMm === 58) + ' px-4 py-2 text-sm font-medium'}
                  >
                    Estrecho (58 mm)
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                onClick={() => {
                  patch({ ...DEFAULT_PRINTER_CONFIG, connectionType: 'browser' });
                  setKind('browser');
                  toast.success('Restaurado');
                }}
              >
                Restaurar valores por defecto
              </button>
            </div>
          )}
        </div>

        {status?.bridgeOk && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Servicio de impresión conectado. iPad y PC pueden imprimir tickets.
          </p>
        )}
      </div>

      {variant === 'modal' && onClose && (
        <div className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  );
}

export function TpvPrinterSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex p-3 sm:p-4 items-end sm:items-center justify-center">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[min(92svh,720px)] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="tpv-printer-setup-title"
      >
        <TpvPrinterSetupPanel variant="modal" onClose={onClose} />
      </div>
    </div>
  );
}
