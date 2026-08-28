/**
 * PDF Vertial Pro vs stack de mercado — SOLO precios públicos verificables
 *
 * Escenario alineado al plan Pro (planCatalog.ts):
 *   12 trabajadores · 1 PDV · Vertial Pro = 349 €/mes
 *
 * Reglas:
 *   1. Solo módulos que Vertial Pro incluye de verdad
 *   2. Solo apps con tarifa pública (web del proveedor)
 *   3. Precio TOTAL €/mes a la derecha
 *   4. Si no hay precio público → lista aparte, NO suma al total
 *   5. Sin “ahorros de tiempo/pérdidas” inventados
 *
 * Uso: node scripts/generate-vertial-apps-equivalencias-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs');
const OUT_FILE = join(OUT_DIR, 'Vertial-Aplicaciones-Equivalencias.pdf');

/** Igual que VERTIAL_PLANS.pro en planCatalog.ts */
const VERTIAL = {
  plan: 'Pro',
  price: 349,
  workers: 12,
  pdv: 1,
};

const C = {
  green: [34, 197, 94],
  teal: [20, 184, 166],
  blue: [37, 99, 235],
  dark: [11, 18, 32],
  muted: [100, 116, 139],
  soft: [248, 250, 252],
  white: [255, 255, 255],
  red: [220, 38, 38],
  slate: [51, 65, 85],
};

/**
 * Stack con precio PÚBLICO.
 * Total = lo que pagaría el negocio al mes por esa herramienta (escenario 12 usuarios).
 */
const CON_PRECIO = [
  {
    vertial: 'Chat de equipo',
    app: 'Slack Pro',
    precio: Math.round(6.75 * VERTIAL.workers),
    base: `6,75 €/usuario × ${VERTIAL.workers}`,
    fuente: 'slack.com/pricing (facturación anual, €)',
  },
  {
    vertial: 'Documentos + calendario',
    app: 'Google Workspace Business Starter',
    precio: Math.round(8.1 * VERTIAL.workers),
    base: `8,10 €/usuario × ${VERTIAL.workers}`,
    fuente: 'workspace.google.com/pricing — Drive, Calendar y Gmail',
  },
  {
    vertial: 'RRHH (equipo, fichajes, horarios, ausencias)',
    app: 'Factorial (entrada)',
    precio: Math.round(5.5 * VERTIAL.workers),
    base: `desde 5,50 €/empleado × ${VERTIAL.workers}`,
    fuente: 'factorial.es — “desde”; módulos extra cotizan aparte',
  },
  {
    vertial: 'Nóminas',
    app: 'Holded Nóminas',
    precio: Math.round(5 * VERTIAL.workers),
    base: `5 €/empleado × ${VERTIAL.workers}`,
    fuente: 'holded.com/es/precios (add-on)',
  },
  {
    vertial: 'Facturación + finanzas básicas',
    app: 'Holded Estándar',
    precio: 59,
    base: '59 €/mes (pago mensual)',
    fuente: 'holded.com/es/precios',
  },
  {
    vertial: 'Stock / inventario',
    app: 'Holded Inventario',
    precio: 25,
    base: 'desde 25 €/mes',
    fuente: 'holded.com/es/precios (add-on)',
  },
  {
    vertial: 'Sala + reservas',
    app: 'CoverManager Essential',
    precio: 89,
    base: '89 €/mes',
    fuente: 'covermanager.com/es/precios',
  },
  {
    vertial: 'Mesas / sala (comandas)',
    app: 'Qamarero',
    precio: 119,
    base: 'desde 119 €/mes',
    fuente: 'qamarero.com — sin permanencia',
  },
  {
    vertial: 'TPV + caja',
    app: 'Revo XEF ONE',
    precio: 50,
    base: '49,90 €/mes + IVA',
    fuente: 'Revo XEF ONE (plan publicado por partners / comparadores)',
  },
  {
    vertial: 'Informes / dashboard',
    app: 'Microsoft Power BI Pro',
    precio: Math.round(10 * 2),
    base: '~10 €/usuario × 2 gestores',
    fuente: 'microsoft.com/power-bi/pricing',
  },
];

/**
 * Incluido en Vertial Pro, pero el equivalente de mercado NO publica precio fijo.
 * Se listan para ser honestos — NO entran en la suma.
 */
const SIN_PRECIO_PUBLICO = [
  {
    vertial: 'Centro operativo delivery (agregadores, cocina, reparto)',
    app: 'Deliverect / UrbanPiper / similares',
    nota: 'Precio bajo presupuesto comercial; no hay tarifa pública fija.',
  },
  {
    vertial: 'Escandallos / food cost',
    app: 'Mastery / food-cost SaaS',
    nota: 'Precio bajo presupuesto; no hay tarifa pública fija usable aquí.',
  },
];

const TOTAL_MERCADO = CON_PRECIO.reduce((s, r) => s + r.precio, 0);
const AHORRO = TOTAL_MERCADO - VERTIAL.price;
const PCT = Math.round((AHORRO / TOTAL_MERCADO) * 100);

function eur(n) {
  return `${Math.round(n).toLocaleString('es-ES')} €/mes`;
}

function generate() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 12;
  const cw = W - m * 2;
  const rx = W - m - 1;
  const bottom = H - 11;
  let y = 0;

  const brand = () => {
    const t = W / 3;
    doc.setFillColor(...C.green);
    doc.rect(0, 0, t, 2.5, 'F');
    doc.setFillColor(...C.teal);
    doc.rect(t, 0, t, 2.5, 'F');
    doc.setFillColor(...C.blue);
    doc.rect(t * 2, 0, W - t * 2, 2.5, 'F');
  };

  const ensure = (need) => {
    if (y + need > bottom) {
      doc.addPage();
      brand();
      y = 10;
    }
  };

  const bar = (fill, h, left, right, lc, rc, ls = 8, rs = 10) => {
    ensure(h + 1);
    doc.setFillColor(...fill);
    doc.rect(m, y, cw, h, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(ls);
    doc.setTextColor(...lc);
    doc.text(left, m + 2, y + h / 2 + 1.1);
    if (right) {
      doc.setFontSize(rs);
      doc.setTextColor(...rc);
      doc.text(right, rx, y + h / 2 + 1.1, { align: 'right' });
    }
    y += h;
  };

  // —— Cabecera ——
  brand();
  doc.setFillColor(...C.dark);
  doc.rect(0, 2.5, W, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.white);
  doc.text('Vertial Pro vs stack de mercado (precios públicos)', m, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(
    `Escenario = plan Pro real: ${VERTIAL.workers} trabajadores · ${VERTIAL.pdv} PDV · Vertial Pro ${VERTIAL.price} €/mes`,
    m,
    15,
  );
  doc.text(
    'Solo sumamos apps con tarifa pública. Sin inventar precios. Sin “ahorro de tiempo” inventado.',
    m,
    19.5,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.green);
  doc.text('Fuente de cada línea bajo el nombre de la app.', m, 24);

  y = 30;

  // —— Tabla con precio ——
  bar(C.blue, 7, 'MÓDULO VERTIAL → APP CON PRECIO PÚBLICO', 'TOTAL', C.white, C.white, 7.5, 7.5);

  CON_PRECIO.forEach((row, i) => {
    const h = 12;
    ensure(h + 1);
    if (i % 2 === 0) {
      doc.setFillColor(...C.soft);
      doc.rect(m, y, cw, h, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(m, y + h, m + cw, y + h);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.blue);
    doc.text(row.vertial, m + 2, y + 3.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.slate);
    doc.text(row.app, m + 2, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.muted);
    doc.text(`${row.base} · ${row.fuente}`, m + 2, y + 10.2, { maxWidth: cw - 42 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.red);
    doc.text(eur(row.precio), rx, y + 7, { align: 'right' });

    y += h;
  });

  y += 2;
  bar([45, 45, 55], 8, `SUMA stack con precio público (${CON_PRECIO.length} apps)`, eur(TOTAL_MERCADO), C.white, C.red, 8, 11);
  bar([20, 55, 35], 8, `Vertial ${VERTIAL.plan} — todo incluido`, eur(VERTIAL.price), C.white, C.green, 8, 11);
  bar([22, 101, 52], 9, `DIFERENCIA (solo estas apps) · ${PCT}% menos`, eur(AHORRO), C.white, C.green, 9, 12);

  // —— Sin precio público ——
  y += 4;
  bar([71, 85, 105], 7, 'INCLUIDO EN VERTIAL PRO — sin tarifa pública usable (NO suman)', '', C.white, C.white, 7, 7);

  SIN_PRECIO_PUBLICO.forEach((row, i) => {
    const lines = doc.splitTextToSize(row.nota, cw - 4);
    const h = 9 + lines.length * 3;
    ensure(h + 1);
    if (i % 2 === 0) {
      doc.setFillColor(...C.soft);
      doc.rect(m, y, cw, h, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.blue);
    doc.text(row.vertial, m + 2, y + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.slate);
    doc.text(row.app, m + 2, y + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(lines, m + 2, y + 10);
    y += h;
  });

  y += 3;
  ensure(18);
  doc.setFillColor(...C.dark);
  doc.rect(m, y, cw, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.white);
  doc.text('Lectura honesta', m + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  const note = doc.splitTextToSize(
    `Con solo las ${CON_PRECIO.length} apps de precio público, el stack sale a ${TOTAL_MERCADO} €/mes frente a Vertial Pro ${VERTIAL.price} €/mes (diferencia ${AHORRO} €/mes). ` +
      'TPV SaaS, hub de delivery y escandallos suelen sumar más, pero no tienen tarifa pública fija: por eso no se inventan ni se meten en el total. ' +
      'Precios sin IVA. Verificar siempre en la web del proveedor (pueden cambiar).',
    cw - 4,
  );
  doc.text(note, m + 2, y + 9);
  y += 16;

  // Footers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(
      'Vertial · Comparativa con precios públicos · Sin estimaciones inventadas en el total',
      m,
      H - 5,
    );
    doc.text(`Pág. ${p}/${pages}`, W - m, H - 5, { align: 'right' });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, Buffer.from(doc.output('arraybuffer')));

  console.log(`PDF: ${OUT_FILE}`);
  console.log('--- CON PRECIO PÚBLICO ---');
  for (const a of CON_PRECIO) console.log(`  ${a.precio} €  ${a.app}  (${a.fuente})`);
  console.log(`SUMA: ${TOTAL_MERCADO} € | Vertial Pro: ${VERTIAL.price} € | Dif: ${AHORRO} €`);
  console.log('--- SIN PRECIO PÚBLICO (no suman) ---');
  for (const a of SIN_PRECIO_PUBLICO) console.log(`  ${a.vertial} → ${a.app}`);
}

generate();
