import { jsPDF } from 'jspdf';
import type { InformeChart, InformeDashboard, InformeKpi, InformeTable } from './loaders/informeTypes';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';

const V = {
  green: [34, 197, 94] as [number, number, number],
  teal: [20, 184, 166] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  rose: [225, 29, 72] as [number, number, number],
  dark: [11, 18, 32] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  muted: [148, 163, 184] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  soft: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export type VertialInformePdfMeta = {
  title: string;
  summary?: string;
  businessName?: string;
  filename: string;
  rows: Record<string, unknown>[];
  dashboard?: InformeDashboard;
  periodLabel?: string;
};

function drawBrandBar(doc: jsPDF, pageW: number) {
  const bandH = 3.5;
  const third = pageW / 3;
  doc.setFillColor(...V.green);
  doc.rect(0, 0, third, bandH, 'F');
  doc.setFillColor(...V.teal);
  doc.rect(third, 0, third, bandH, 'F');
  doc.setFillColor(...V.blue);
  doc.rect(third * 2, 0, pageW - third * 2, bandH, 'F');
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, page: number, total: number) {
  doc.setDrawColor(...V.line);
  doc.setLineWidth(0.2);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...V.muted);
  doc.text('Generado con Vertial · Confidencial · Uso interno / asesoría', 14, pageH - 7);
  doc.text(`Pág. ${page} / ${total}`, pageW - 14, pageH - 7, { align: 'right' });
}

function formatCell(format: InformeTable['columns'][0]['format'], value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (format === 'money') return formatMoneyEs(value);
    if (format === 'pct') return `${formatNumberEs(value, { minFraction: 1, maxFraction: 1 })} %`;
    if (format === 'number') return formatNumberEs(value, { minFraction: 0, maxFraction: 2 });
  }
  return String(value);
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  need: number,
  pageW: number,
  pageH: number,
  margin: number,
): number {
  if (y + need < pageH - 16) return y;
  doc.addPage();
  drawBrandBar(doc, pageW);
  return margin;
}

function drawKpis(doc: jsPDF, kpis: InformeKpi[], y: number, pageW: number, margin: number): number {
  if (!kpis.length) return y;
  const gap = 3.5;
  const cols = Math.min(4, kpis.length);
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 20;
  let rowY = y;

  kpis.forEach((kpi, i) => {
    if (i > 0 && i % cols === 0) rowY += cardH + gap;
    const col = i % cols;
    const x = margin + col * (cardW + gap);
    doc.setFillColor(...V.soft);
    doc.setDrawColor(...V.line);
    doc.roundedRect(x, rowY, cardW, cardH, 2, 2, 'FD');
    doc.setFillColor(...V.blue);
    doc.rect(x, rowY, 1.2, cardH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...V.slate);
    doc.text(kpi.label.slice(0, 32), x + 4, rowY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...V.dark);
    doc.text(String(kpi.value).slice(0, 22), x + 4, rowY + 13);
    if (kpi.deltaPct != null) {
      doc.setFontSize(7);
      doc.setTextColor(kpi.deltaPct >= 0 ? V.green[0] : V.rose[0], kpi.deltaPct >= 0 ? V.green[1] : V.rose[1], kpi.deltaPct >= 0 ? V.green[2] : V.rose[2]);
      doc.text(`${kpi.deltaPct > 0 ? '+' : ''}${kpi.deltaPct} %`, x + 4, rowY + 17.5);
    }
  });
  return rowY + cardH + 8;
}

function drawSimpleChart(
  doc: jsPDF,
  chart: InformeChart,
  y: number,
  pageW: number,
  margin: number,
): number {
  if (!chart.points.length || !chart.series.length) return y;
  const chartH = 42;
  const chartW = pageW - margin * 2;
  const seriesKey = chart.series[0].key;
  const values = chart.points.map((p) => Number(p[seriesKey] || 0));
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...V.dark);
  doc.text(chart.title.slice(0, 70), margin, y);
  y += 4;

  doc.setFillColor(...V.soft);
  doc.roundedRect(margin, y, chartW, chartH, 2, 2, 'F');

  const n = chart.points.length;
  const barGap = 1.2;
  const usable = chartW - 8;
  const barW = Math.min(12, Math.max(2, usable / n - barGap));
  const baseY = y + chartH - 6;

  chart.points.forEach((p, i) => {
    const val = Number(p[seriesKey] || 0);
    const h = (Math.abs(val) / max) * (chartH - 14);
    const x = margin + 4 + i * (barW + barGap);
    const color = val >= 0 ? V.blue : V.rose;
    doc.setFillColor(...color);
    doc.rect(x, baseY - h, barW, h, 'F');
  });

  // second series as line if present
  if (chart.series[1]) {
    const key2 = chart.series[1].key;
    const vals2 = chart.points.map((p) => Number(p[key2] || 0));
    const max2 = Math.max(...vals2.map((v) => Math.abs(v)), max);
    doc.setDrawColor(...V.teal);
    doc.setLineWidth(0.6);
    for (let i = 0; i < chart.points.length - 1; i += 1) {
      const x1 = margin + 4 + i * (barW + barGap) + barW / 2;
      const x2 = margin + 4 + (i + 1) * (barW + barGap) + barW / 2;
      const y1 = baseY - (Math.abs(vals2[i]) / max2) * (chartH - 14);
      const y2 = baseY - (Math.abs(vals2[i + 1]) / max2) * (chartH - 14);
      doc.line(x1, y1, x2, y2);
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...V.muted);
  doc.text(chart.series.map((s) => s.label).join(' · ').slice(0, 80), margin + 2, y + chartH - 1.5);

  return y + chartH + 8;
}

function drawTable(
  doc: jsPDF,
  table: InformeTable,
  startY: number,
  pageW: number,
  pageH: number,
  margin: number,
): number {
  let y = startY;
  y = ensureSpace(doc, y, 20, pageW, pageH, margin);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...V.dark);
  doc.text(table.title.slice(0, 80), margin, y);
  y += 5;

  const cols = table.columns;
  const usableW = pageW - margin * 2;
  const colW = usableW / Math.max(cols.length, 1);

  const header = () => {
    doc.setFillColor(...V.blue);
    doc.rect(margin, y - 3.5, usableW, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...V.white);
    cols.forEach((c, i) => {
      doc.text(c.label.slice(0, 18), margin + i * colW + 1.2, y);
    });
    y += 5;
  };

  header();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  const maxRows = 40;
  table.rows.slice(0, maxRows).forEach((row, idx) => {
    y = ensureSpace(doc, y, 8, pageW, pageH, margin);
    if (y < margin + 8) {
      // new page from ensureSpace
      header();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(...V.soft);
      doc.rect(margin, y - 3.2, usableW, 5, 'F');
    }
    const isResult = String(row.Tipo || '') === 'result' || String(row.Concepto || '').startsWith('=');
    doc.setFont('helvetica', isResult ? 'bold' : 'normal');
    doc.setTextColor(...V.dark);
    cols.forEach((c, i) => {
      const text = formatCell(c.format, row[c.key]).slice(0, 22);
      const x = margin + i * colW + 1.2;
      if (c.align === 'right' || c.format === 'money' || c.format === 'pct') {
        doc.text(text, margin + (i + 1) * colW - 1.2, y, { align: 'right' });
      } else {
        doc.text(text, x, y);
      }
    });
    y += 5;
  });

  if (table.rows.length > maxRows) {
    y += 2;
    doc.setFontSize(7);
    doc.setTextColor(...V.slate);
    doc.text(`… ${table.rows.length - maxRows} filas más (usa Excel para el listado completo)`, margin, y);
    y += 5;
  }

  return y + 6;
}

/**
 * PDF informe Vertial — versión dashboard (portada + KPIs + gráfico + tablas).
 * Fallback: tabla plana si no hay dashboard.
 */
export function generateVertialInformePdf(meta: VertialInformePdfMeta): void {
  const dashboard = meta.dashboard;
  const rows = meta.rows;
  if (!dashboard && !rows.length) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Portada / cabecera
  drawBrandBar(doc, pageW);
  doc.setFillColor(...V.dark);
  doc.rect(0, 3.5, pageW, 32, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...V.white);
  doc.text('Vertial', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...V.muted);
  doc.text('Informe financiero', margin, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...V.white);
  doc.text(meta.title.slice(0, 48), pageW - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...V.muted);
  const when = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const right = [meta.businessName, meta.periodLabel, when].filter(Boolean).join(' · ');
  doc.text(right.slice(0, 70), pageW - margin, 22, { align: 'right' });

  let y = 44;

  if (meta.summary) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...V.slate);
    const lines = doc.splitTextToSize(meta.summary, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.2 + 5;
  }

  if (dashboard) {
    y = drawKpis(doc, dashboard.kpis, y, pageW, margin);

    if (dashboard.alerts?.length) {
      for (const a of dashboard.alerts.slice(0, 6)) {
        y = ensureSpace(doc, y, 10, pageW, pageH, margin);
        doc.setFillColor(a.severity === 'danger' ? 255 : a.severity === 'warning' ? 255 : 240, a.severity === 'danger' ? 241 : a.severity === 'warning' ? 251 : 249, a.severity === 'danger' ? 242 : a.severity === 'warning' ? 235 : 255);
        doc.roundedRect(margin, y - 3, pageW - margin * 2, 7, 1.5, 1.5, 'F');
        doc.setFontSize(7);
        doc.setTextColor(...V.dark);
        doc.text(a.message.slice(0, 110), margin + 2, y + 1.5);
        y += 9;
      }
      y += 2;
    }

    if (dashboard.chart) {
      y = ensureSpace(doc, y, 55, pageW, pageH, margin);
      y = drawSimpleChart(doc, dashboard.chart, y, pageW, margin);
    }

    for (const table of dashboard.tables) {
      y = drawTable(doc, table, y, pageW, pageH, margin);
    }
  } else {
    // Fallback flat table
    const keys = Object.keys(rows[0] || {});
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...V.dark);
    doc.text('Detalle', margin, y);
    y += 5;
    const usableW = pageW - margin * 2;
    const colW = usableW / Math.max(keys.length, 1);
    doc.setFillColor(...V.blue);
    doc.rect(margin, y - 4, usableW, 7, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...V.white);
    keys.forEach((h, i) => doc.text(String(h).slice(0, 14), margin + i * colW + 1, y));
    y += 6;
    doc.setTextColor(...V.dark);
    rows.slice(0, 80).forEach((row, idx) => {
      if (y > pageH - 16) {
        doc.addPage();
        drawBrandBar(doc, pageW);
        y = 14;
      }
      if (idx % 2 === 0) {
        doc.setFillColor(...V.soft);
        doc.rect(margin, y - 3.5, usableW, 5.5, 'F');
      }
      keys.forEach((k, i) => {
        doc.text(String(row[k] ?? '').slice(0, 18), margin + i * colW + 1, y);
      });
      y += 5.5;
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    drawFooter(doc, pageW, pageH, p, totalPages);
  }

  doc.save(`${meta.filename}.pdf`);
}

/** Compat: KPIs auto desde filas (informes legacy sin dashboard). */
export function buildInformeKpis(rows: Record<string, unknown>[]) {
  return [{ label: 'Registros', value: rows.length.toLocaleString('es-ES') }];
}
