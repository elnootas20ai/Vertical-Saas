/** Etiqueta térmica de producto (carnicería) — ESC/POS de etiqueta, no ticket de venta. */

import { toast } from 'sonner';
import { encodeButcherLabelEscpos } from './vertialPrint/escposEncode';
import { resolveEffectivePrinterConfig } from './vertialPrint/printerActiveScope';
import { normalizeVertialPrinterConfig } from './vertialPrint/printerConfigNormalize';
import { DELIVERY_TICKET_PAPER_WIDTH_MM } from './vertialPrint/printerConfig';
import { isVertialNativeApp } from './vertialPrint';
import { sendNativeEscpos } from './vertialPrint/nativePrintClient';
import {
  NATIVE_PRINTER_PRINT_FAILED_MESSAGE,
  resolveNativePrinterForPrint,
} from './vertialPrint/nativePrinterFlow';
import { fetchBridgeHealth, sendEscposToBridge } from './vertialPrint/printBridgeClient';
import { shouldBlockBrowserPrintOnNative, NATIVE_WIFI_PRINTER_SETUP_MESSAGE } from './vertialPrint/nativePrintRouting';

export type ButcherLabelData = {
  nombre: string;
  precioKg: number;
  pesoKg?: number;
  lote?: string | null;
  caducidad?: string | null;
  origen?: string | null;
  alergenos?: string | null;
  businessName?: string;
};

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatDateEs(iso?: string | null) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function buildButcherLabelHtml(data: ButcherLabelData): string {
  const lines: { text: string; big?: boolean }[] = [
    { text: data.businessName || 'Carnicería' },
    { text: data.nombre, big: true },
    { text: `${formatEur(data.precioKg)}/kg`, big: true },
  ];
  if (data.pesoKg && data.pesoKg > 0) {
    lines.push({ text: `Peso: ${data.pesoKg.toFixed(3)} kg` });
    lines.push({ text: `Importe: ${formatEur(data.pesoKg * data.precioKg)}`, big: true });
  }
  if (data.lote) lines.push({ text: `Lote: ${data.lote}` });
  if (data.caducidad) lines.push({ text: `Cad: ${formatDateEs(data.caducidad)}` });
  if (data.origen) lines.push({ text: `Origen: ${data.origen}` });
  if (data.alergenos) lines.push({ text: `Alérgenos: ${data.alergenos}` });

  const body = lines
    .map((l) =>
      l.big
        ? `<div style="font-size:16px;font-weight:800;margin:4px 0;text-align:center">${l.text}</div>`
        : `<div style="font-size:12px;margin:2px 0;text-align:center">${l.text}</div>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:monospace;width:220px;padding:10px;margin:0}
  </style></head><body>${body}<div style="text-align:center;margin-top:8px;font-size:11px">Producto fresco</div></body></html>`;
}

function printHtmlFallback(data: ButcherLabelData) {
  const html = buildButcherLabelHtml(data);
  const w = window.open('', '_blank', 'width=280,height=420');
  if (!w) throw new Error('Popup bloqueado — permite ventanas emergentes para imprimir etiqueta');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 200);
}

export async function printButcherProductLabel(data: ButcherLabelData): Promise<void> {
  const config = normalizeVertialPrinterConfig({
    ...resolveEffectivePrinterConfig(),
    paperWidthMm: DELIVERY_TICKET_PAPER_WIDTH_MM === 80 ? 58 : DELIVERY_TICKET_PAPER_WIDTH_MM,
  });
  // Preferir 58mm para etiqueta de mostrador
  const paper = (config.paperWidthMm === 80 ? 58 : config.paperWidthMm) as 58 | 80;
  const escpos = encodeButcherLabelEscpos(data, paper);

  if (isVertialNativeApp()) {
    const prepared = resolveNativePrinterForPrint(config);
    if (!prepared.ready) {
      toast.error(prepared.error || NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
      throw new Error(prepared.error || 'Configura la impresora en el TPV');
    }
    const result = await sendNativeEscpos(escpos, prepared.config, { timeoutMs: 5_000 });
    if (result.ok) return;
    toast.error(result.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, { duration: 10000 });
    throw new Error(result.error || 'No se pudo imprimir la etiqueta');
  }

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const bridgeResult = await sendEscposToBridge(escpos, config);
      if (bridgeResult.ok) return;
    }
  }

  if (shouldBlockBrowserPrintOnNative()) {
    toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
    throw new Error('Configura la impresora WiFi');
  }

  printHtmlFallback(data);
}
