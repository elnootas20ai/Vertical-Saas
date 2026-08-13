import { jsPDF } from 'jspdf';

/** Colores marca Vertial (logo: verde → teal → azul) */
const V = {
  green: [34, 197, 94] as [number, number, number],
  teal: [20, 184, 166] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
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
};

type Kpi = { label: string; value: string };

function parseNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.').replace(/€/g, ''));
  return Number.isFinite(n) ? n : null;
}

function looksMoney(key: string): boolean {
  const k = key.toLowerCase();
  return /ingreso|gastado|gasto|ltv|ticket|margen|comision|valor|importe|€|euro|spent|revenue|total/.test(k);
}

function looksCount(key: string): boolean {
  const k = key.toLowerCase();
  return /pedido|unidad|cantidad|tickets|visitas|uds/.test(k);
}

function formatEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function formatNum(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

/** Extrae KPIs útiles de las filas del informe. */
export function buildInformeKpis(rows: Record<string, unknown>[]): Kpi[] {
  const kpis: Kpi[] = [
    { label: 'Registros', value: rows.length.toLocaleString('es-ES') },
  ];
  if (!rows.length) return kpis;

  const keys = Object.keys(rows[0]);
  for (const key of keys) {
    const nums = rows.map((r) => parseNum(r[key])).filter((n): n is number => n != null);
    if (nums.length < Math.max(1, Math.floor(rows.length * 0.4))) continue;

    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;

    if (looksMoney(key)) {
      kpis.push({ label: `Total ${key}`, value: formatEur(sum) });
      kpis.push({ label: `Media ${key}`, value: formatEur(avg) });
    } else if (looksCount(key) || /pedido|unidad/i.test(key)) {
      kpis.push({ label: `Total ${key}`, value: formatNum(sum) });
    }

    if (kpis.length >= 6) break;
  }

  return kpis.slice(0, 6);
}

function drawBrandBar(doc: jsPDF, pageW: number) {
  const bandH = 4;
  const third = pageW / 3;
  doc.setFillColor(...V.green);
  doc.rect(0, 0, third, bandH, 'F');
  doc.setFillColor(...V.teal);
  doc.rect(third, 0, third, bandH, 'F');
  doc.setFillColor(...V.blue);
  doc.rect(third * 2, 0, pageW - third * 2, bandH, 'F');
}

function drawHeader(
  doc: jsPDF,
  pageW: number,
  meta: VertialInformePdfMeta,
) {
  drawBrandBar(doc, pageW);

  doc.setFillColor(...V.dark);
  doc.rect(0, 4, pageW, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...V.white);
  doc.text('Vertial', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...V.muted);
  doc.text('Informe de negocio', 14, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...V.white);
  doc.text(meta.title, pageW - 14, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...V.muted);
  const when = new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const rightSub = meta.businessName
    ? `${meta.businessName} · ${when}`
    : when;
  doc.text(rightSub, pageW - 14, 22, { align: 'right' });
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, page: number, total: number) {
  doc.setDrawColor(...V.line);
  doc.setLineWidth(0.2);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...V.muted);
  doc.text('Generado con Vertial · Confidencial', 14, pageH - 7);
  doc.text(`Pág. ${page} / ${total}`, pageW - 14, pageH - 7, { align: 'right' });
}

function drawKpiCards(doc: jsPDF, kpis: Kpi[], startY: number, pageW: number): number {
  if (!kpis.length) return startY;
  const margin = 14;
  const gap = 4;
  const cols = Math.min(3, kpis.length);
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 18;
  let y = startY;

  kpis.forEach((kpi, i) => {
    if (i > 0 && i % cols === 0) y += cardH + gap;
    const col = i % cols;
    const x = margin + col * (cardW + gap);

    doc.setFillColor(...V.soft);
    doc.setDrawColor(...V.line);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...V.slate);
    doc.text(kpi.label.slice(0, 28), x + 3, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...V.dark);
    doc.text(kpi.value.slice(0, 18), x + 3, y + 13);
  });

  return y + cardH + 8;
}

/**
 * PDF informe Vertial: cabecera marca, KPIs y tabla de detalle.
 */
export function generateVertialInformePdf(meta: VertialInformePdfMeta): void {
  const rows = meta.rows;
  if (!rows.length) return;

  const keys = Object.keys(rows[0]);
  const landscape = keys.length > 5;
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const bottom = pageH - 16;

  drawHeader(doc, pageW, meta);

  let y = 40;

  if (meta.summary) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...V.slate);
    const lines = doc.splitTextToSize(meta.summary, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.2 + 4;
  }

  const kpis = buildInformeKpis(rows);
  y = drawKpiCards(doc, kpis, y, pageW);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...V.dark);
  doc.text('Detalle', margin, y);
  y += 5;

  const usableW = pageW - margin * 2;
  const colW = usableW / keys.length;
  const maxRowsFirst = 500; // safety
  const data = rows.slice(0, maxRowsFirst);

  const drawTableHeader = () => {
    doc.setFillColor(...V.blue);
    doc.rect(margin, y - 4, usableW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...V.white);
    keys.forEach((h, i) => {
      doc.text(String(h).slice(0, 16), margin + i * colW + 1.5, y);
    });
    y += 6;
  };

  drawTableHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  data.forEach((row, idx) => {
    if (y > bottom - 4) {
      doc.addPage();
      drawBrandBar(doc, pageW);
      y = 14;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...V.soft);
      doc.rect(margin, y - 3.5, usableW, 5.5, 'F');
    }

    doc.setTextColor(...V.dark);
    keys.forEach((k, i) => {
      const cell = String(row[k] ?? '').slice(0, 22);
      doc.text(cell, margin + i * colW + 1.5, y);
    });
    y += 5.5;
  });

  if (rows.length > maxRowsFirst) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...V.slate);
    doc.text(
      `Mostrando ${maxRowsFirst.toLocaleString('es-ES')} de ${rows.length.toLocaleString('es-ES')} filas. Usa Excel/CSV para el listado completo.`,
      margin,
      y,
    );
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    drawFooter(doc, pageW, pageH, p, totalPages);
  }

  doc.save(`${meta.filename}.pdf`);
}
