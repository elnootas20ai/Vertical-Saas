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
} from 'lucide-react';
import {
  DEFAULT_PRINTER_CONFIG,
  fetchBridgeHealth,
  fetchBridgePrinters,
  loadPrinterConfig,
  printTestTicket,
  savePrinterConfig,
  type VertialPrinterConfig,
  type VertialPrinterConnectionType,
} from '../../../lib/vertialPrint';
import {
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
  settingsChoiceCardClass,
  settingsListCardClass,
} from './settingsFormStyles';

/** Modo sencillo: lo que ve el usuario ≠ nombres técnicos internos */
type SimpleMode = 'normal' | 'wifi' | 'pc';

function modeToConnection(mode: SimpleMode): VertialPrinterConnectionType {
  if (mode === 'wifi') return 'network';
  if (mode === 'pc') return 'system';
  return 'browser';
}

function connectionToMode(type: VertialPrinterConnectionType): SimpleMode {
  if (type === 'network') return 'wifi';
  if (type === 'system') return 'pc';
  return 'normal';
}

export function TpvPrinterSettingsTab() {
  const [config, setConfig] = useState<VertialPrinterConfig>(() => loadPrinterConfig());
  const [mode, setMode] = useState<SimpleMode>(() => connectionToMode(loadPrinterConfig().connectionType));
  const [printers, setPrinters] = useState<Array<{ name: string }>>([]);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bridgeOk, setBridgeOk] = useState(false);

  const refreshPrinters = useCallback(async () => {
    const health = await fetchBridgeHealth();
    setBridgeOk(health.ok);
    if (health.ok) {
      setPrinters(await fetchBridgePrinters());
    }
  }, []);

  useEffect(() => {
    void refreshPrinters();
  }, [refreshPrinters]);

  const patch = (partial: Partial<VertialPrinterConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      savePrinterConfig(next);
      return next;
    });
  };

  const selectMode = (next: SimpleMode) => {
    setMode(next);
    patch({ connectionType: modeToConnection(next) });
  };

  const handleTest = async () => {
    savePrinterConfig(config);
    setTesting(true);
    try {
      await printTestTicket();
    } finally {
      setTesting(false);
    }
  };

  const modeOptions: Array<{ id: SimpleMode; label: string; hint: string; icon: typeof Wifi }> = [
    {
      id: 'normal',
      label: 'Tablet o PC (lo habitual)',
      hint: 'Al cobrar, sale la ventana «Imprimir» de tu dispositivo. Nada que instalar.',
      icon: Smartphone,
    },
    {
      id: 'wifi',
      label: 'Impresora de tickets por WiFi',
      hint: 'La impresora está en la misma WiFi que la tablet. Necesitas el número que trae en una pegatina.',
      icon: Wifi,
    },
    {
      id: 'pc',
      label: 'Impresora enchufada al PC',
      hint: 'Tickets desde el ordenador del mostrador, con la impresora ya instalada en Windows.',
      icon: Monitor,
    },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impresión de tickets</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Elige cómo quieres imprimir cuando vendes en el TPV
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          ¿Cómo tienes la impresora?
        </h3>
        <div className="grid gap-3">
          {modeOptions.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectMode(id)}
              className={`${settingsChoiceCardClass(mode === id)} flex gap-3 items-start text-left w-full`}
            >
              <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{hint}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {mode === 'normal' && (
        <section className={`${settingsListCardClass()} space-y-3`}>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Cuando pulses «Imprimir ticket» en una venta, se abrirá la pantalla de imprimir de tu tablet o PC.
            Solo tienes que elegir tu impresora y confirmar — igual que imprimir una foto o un PDF.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Consejo: en la tablet, añade la impresora antes en <strong>Ajustes → Impresión</strong> del sistema.
          </p>
        </section>
      )}

      {mode === 'wifi' && (
        <section className={`${settingsListCardClass()} space-y-4`}>
          <div>
            <label className="block">
              <span className={settingsLabelClass}>Número de la impresora</span>
              <input
                className={settingsInputClass}
                value={config.networkHost}
                onChange={(e) => patch({ networkHost: e.target.value.trim() })}
                placeholder="Ejemplo: 192.168.0.50"
              />
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              Suele estar en una <strong>pegatina debajo</strong> de la impresora o en el papel que sale al encenderla.
              Son cuatro grupos de números separados por puntos. Si no lo encuentras, pide ayuda a quien te instaló la impresora
              o usa la opción «Tablet o PC» de arriba.
            </p>
          </div>
          {!bridgeOk && (
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3 py-2">
              Para imprimir sola por WiFi hace falta el programita Vertial Print en el PC del TPV (lo instalaremos automáticamente en producción).
              Mientras tanto, usa «Tablet o PC».
            </p>
          )}
        </section>
      )}

      {mode === 'pc' && (
        <section className={`${settingsListCardClass()} space-y-3`}>
          <label className="block">
            <span className={settingsLabelClass}>Elige tu impresora</span>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Si la lista está vacía, instala la impresora en Windows primero (Configuración → Impresoras).
              También puedes usar «Tablet o PC» mientras tanto.
            </p>
          )}
        </section>
      )}

      <section className={`${settingsListCardClass()} space-y-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tamaño del ticket</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => patch({ paperWidthMm: 80 })}
            className={settingsChoiceCardClass(config.paperWidthMm === 80) + ' px-4 py-2 text-sm font-medium'}
          >
            Normal (la más común)
          </button>
          <button
            type="button"
            onClick={() => patch({ paperWidthMm: 58 })}
            className={settingsChoiceCardClass(config.paperWidthMm === 58) + ' px-4 py-2 text-sm font-medium'}
          >
            Estrecho
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
          className={settingsPrimaryBtnClass}
        >
          <Printer className="w-4 h-4" />
          {testing ? 'Imprimiendo…' : 'Probar impresión'}
        </button>
      </section>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Opciones técnicas
        </button>
        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 text-xs text-gray-500">
            <label className="block">
              Puerto de red (no tocar salvo que te lo indiquen)
              <input
                className={`${settingsInputClass} mt-1`}
                type="number"
                value={config.networkPort}
                onChange={(e) => patch({ networkPort: Number(e.target.value) || 9100 })}
              />
            </label>
            <p>Vertial Print: {bridgeOk ? 'activo en este dispositivo' : 'no detectado'}</p>
            <button
              type="button"
              className="underline"
              onClick={() => {
                patch({ ...DEFAULT_PRINTER_CONFIG, connectionType: 'browser' });
                setMode('normal');
                toast.success('Restaurado');
              }}
            >
              Restaurar todo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
