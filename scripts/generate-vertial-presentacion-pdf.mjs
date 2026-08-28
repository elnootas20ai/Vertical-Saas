/**
 * PDF presentación Vertial — diapositivas (horizontal A4)
 *
 * 1. Qué es Vertial
 * 2. De qué está compuesto (verticales · un corazón)
 * 3. El core compartido (RRHH, gestoría, alertas, tiempo real…)
 * 4. Operativa en vivo + alertas
 *
 * Uso: node scripts/generate-vertial-presentacion-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs');
const OUT_FILE = join(OUT_DIR, 'Vertial-Presentacion.pdf');

const C = {
  green: [34, 197, 94],
  teal: [20, 184, 166],
  blue: [37, 99, 235],
  dark: [11, 18, 32],
  ink: [15, 23, 42],
  muted: [100, 116, 139],
  soft: [248, 250, 252],
  white: [255, 255, 255],
  card: [255, 255, 255],
  line: [226, 232, 240],
  softBlue: [239, 246, 255],
  softGreen: [240, 253, 244],
  softTeal: [240, 253, 250],
};

/** Verticales reales del producto (sidebar / configs). */
const VERTICALES = [
  'Compraventa',
  'Delivery',
  'Bar / restaurante',
  'Heladería',
  'Carnicería',
  'Taller',
  'Desguace',
  'Recambios',
  'Taxi',
  'Lavadero',
  'Farmacia',
  'Veterinario',
  'Estanco',
  'Gimnasio',
  'Clínica',
  'Hotel',
  'Peluquería',
  'Discoteca',
  'Eventos',
  'Academia',
  'Inmobiliaria',
  'Abogados',
  'Constructora',
  'Limpieza',
];

const CORE_BLOCKS = [
  {
    title: 'Home & tiempo real',
    items: ['Dashboard operativo', 'Centro de alertas', 'Calendario', 'Chat de equipo'],
  },
  {
    title: 'Clientes / CRM',
    items: ['Clientes', 'Presupuestos', 'Promociones', 'Historial unificado'],
  },
  {
    title: 'RRHH',
    items: [
      'Equipo y roles',
      'Fichajes',
      'Horarios y vacaciones',
      'Solicitudes HR',
      'Comisiones',
      'Nóminas',
    ],
  },
  {
    title: 'Gestoría & docs',
    items: ['Gestoría', 'Documentación sociedad', 'Contratos y licencias', 'Archivos financieros'],
  },
  {
    title: 'Finanzas',
    items: ['Ingresos y gastos', 'EBITDA', 'Impuestos', 'Verifactu', 'Conciliación', 'Informes / KPIs'],
  },
  {
    title: 'Catálogo & stock',
    items: ['Catálogo', 'Inventario', 'Proveedores', 'Escandallo / costing', 'TPV en tablet'],
  },
];

function generate() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 14;
  const pages = [];

  const brandBar = () => {
    const t = W / 3;
    doc.setFillColor(...C.green);
    doc.rect(0, 0, t, 3, 'F');
    doc.setFillColor(...C.teal);
    doc.rect(t, 0, t, 3, 'F');
    doc.setFillColor(...C.blue);
    doc.rect(t * 2, 0, W - t * 2, 3, 'F');
  };

  const footer = (n, total) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('Vertial · Plataforma de autogestión multi-vertical', m, H - 6);
    doc.text(`${n} / ${total}`, W - m, H - 6, { align: 'right' });
  };

  const pageShell = (n, total) => {
    doc.setFillColor(...C.soft);
    doc.rect(0, 0, W, H, 'F');
    brandBar();
    footer(n, total);
  };

  const eyebrow = (text, x, y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.blue);
    doc.text(String(text).toUpperCase(), x, y);
  };

  const title = (text, x, y, size = 28) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...C.dark);
    doc.text(text, x, y);
  };

  const body = (text, x, y, maxW, size = 12, color = C.muted) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW);
    doc.text(lines, x, y);
    return lines.length;
  };

  const card = (x, y, w, h, fill = C.card) => {
    doc.setFillColor(...fill);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');
  };

  // ─── Slide 1: Qué es Vertial ───────────────────────────────────────────────
  pages.push((n, total) => {
    pageShell(n, total);
    eyebrow('Presentación', m, 18);
    title('Vertial', m, 34, 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...C.ink);
    doc.text('La plataforma de autogestión que lo conecta todo', m, 48);
    doc.text('en tiempo real.', m, 56);

    body(
      'Vertial es un SaaS multi-vertical: un solo sistema para dirigir el negocio sin depender de Excel, WhatsApp y media docena de apps sueltas. Operativa del día, equipo, clientes, dinero y documentos viven en el mismo sitio — actualizados al instante.',
      m,
      70,
      W * 0.55,
      11,
      C.muted,
    );

    const pillars = [
      {
        t: 'Autogestión',
        d: 'El negocio se gobierna desde un panel: roles, permisos y flujos listos para usar.',
      },
      {
        t: 'Todo conectado',
        d: 'Core compartido + vertical de tu sector. Misma fuente de verdad para toda la empresa.',
      },
      {
        t: 'Tiempo real',
        d: 'Dashboard, alertas y operativa del día con datos vivos — no cierres de ayer.',
      },
    ];

    const cardW = (W - m * 2 - 10) / 3;
    pillars.forEach((p, i) => {
      const x = m + i * (cardW + 5);
      const y = 108;
      card(x, y, cardW, 52, C.white);
      doc.setFillColor(...(i === 0 ? C.green : i === 1 ? C.teal : C.blue));
      doc.roundedRect(x + 4, y + 5, 8, 8, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...C.dark);
      doc.text(p.t, x + 16, y + 11);
      body(p.d, x + 4, y + 24, cardW - 8, 9.5, C.muted);
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.teal);
    doc.text('Hecha en España · Datos en Europa · Sin permanencia', m, H - 16);
  });

  // ─── Slide 2: De qué está compuesto ────────────────────────────────────────
  pages.push((n, total) => {
    pageShell(n, total);
    eyebrow('Arquitectura', m, 18);
    title('De qué está compuesto', m, 32, 26);

    body(
      'Un corazón Vertial para todo tipo de negocios. El core es común; cada vertical aporta su operativa (pedidos, expedientes, TPV, flota…). Misma plataforma, distinto traje.',
      m,
      42,
      W - m * 2,
      11,
    );

    // Corazón / core
    const hx = m;
    const hy = 58;
    const hw = 78;
    const hh = 112;
    card(hx, hy, hw, hh, C.softBlue);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.blue);
    doc.text('CORAZÓN VERTIAL', hx + 6, hy + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);
    const heartLines = [
      'Cuenta y negocio',
      'Usuarios y permisos',
      'PDV / centros de trabajo',
      'Dashboard y alertas',
      'CRM y chat',
      'RRHH y gestoría',
      'Finanzas y documentos',
      'Catálogo / stock base',
      'Informes transversales',
    ];
    heartLines.forEach((line, i) => {
      doc.setFillColor(...C.blue);
      doc.circle(hx + 8, hy + 24 + i * 9.2, 1.1, 'F');
      doc.setTextColor(...C.ink);
      doc.text(line, hx + 13, hy + 25.2 + i * 9.2);
    });

    // Verticales grid
    const vx = hx + hw + 8;
    const vy = hy;
    const vw = W - m - vx;
    card(vx, vy, vw, hh, C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.teal);
    doc.text('VERTICALES', vx + 6, vy + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text('Operativa específica por sector · un motor, muchos negocios', vx + 6, vy + 19);

    const cols = 4;
    const gap = 3;
    const chipW = (vw - 12 - gap * (cols - 1)) / cols;
    const chipH = 9;
    VERTICALES.forEach((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = vx + 6 + col * (chipW + gap);
      const cy = vy + 26 + row * (chipH + 2.5);
      doc.setFillColor(...C.softTeal);
      doc.roundedRect(cx, cy, chipW, chipH, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.ink);
      doc.text(name, cx + chipW / 2, cy + 6, { align: 'center' });
    });
  });

  // ─── Slide 3: Todo lo que tiene (core) ─────────────────────────────────────
  pages.push((n, total) => {
    pageShell(n, total);
    eyebrow('Core compartido', m, 18);
    title('Todo lo que incluye Vertial', m, 32, 24);
    body(
      'Además de la vertical de tu sector, tienes el día a día de empresa: personas, papeles, dinero y comunicación — sin cambiar de herramienta.',
      m,
      42,
      W - m * 2,
      11,
    );

    const cols = 3;
    const gapX = 5;
    const gapY = 5;
    const cardW = (W - m * 2 - gapX * (cols - 1)) / cols;
    const cardH = 52;

    CORE_BLOCKS.forEach((block, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = m + col * (cardW + gapX);
      const y = 56 + row * (cardH + gapY);
      const fills = [C.softGreen, C.softTeal, C.softBlue, C.softGreen, C.softTeal, C.softBlue];
      card(x, y, cardW, cardH, fills[i]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...C.dark);
      doc.text(block.title, x + 4, y + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.ink);
      block.items.forEach((item, j) => {
        doc.text(`·  ${item}`, x + 4, y + 18 + j * 5.2);
      });
    });
  });

  // ─── Slide 4: Tiempo real + alertas ────────────────────────────────────────
  pages.push((n, total) => {
    pageShell(n, total);
    eyebrow('Operación del día', m, 18);
    title('Tiempo real y alertas', m, 32, 26);

    body(
      'Vertial no es un archivo estático: el panel, el chat, los fichajes y la operativa del vertical se alimentan de lo que ocurre ahora. Las alertas avisan cuando hay que actuar.',
      m,
      44,
      W - m * 2,
      11,
    );

    const leftW = (W - m * 2 - 8) / 2;
    card(m, 62, leftW, 100, C.white);
    doc.setFillColor(...C.green);
    doc.roundedRect(m + 5, 68, 10, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.dark);
    doc.text('Tiempo real', m + 20, 75);
    const realtime = [
      'Dashboard con KPIs del día',
      'Operativa vertical en vivo (pedidos, caja, plazos…)',
      'Equipo: fichajes, chat y calendario compartidos',
      'Stock y márgenes actualizados al operar',
      'Misma fuente de verdad para titular, gestor y equipo',
    ];
    realtime.forEach((t, i) => {
      doc.setFillColor(...C.green);
      doc.circle(m + 9, 92 + i * 12, 1.4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C.ink);
      doc.text(t, m + 15, 93.5 + i * 12);
    });

    card(m + leftW + 8, 62, leftW, 100, C.white);
    doc.setFillColor(...C.blue);
    doc.roundedRect(m + leftW + 13, 68, 10, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.dark);
    doc.text('Centro de alertas', m + leftW + 28, 75);
    const alerts = [
      'Avisos in-app (y por canales según plan)',
      'Lo positivo: lo que salió bien (plan Básico)',
      'Lo crítico: caja, dinero, operación (plan Pro)',
      'Configurables por rol y negocio',
      'Menos sorpresas: el sistema te llama cuando importa',
    ];
    alerts.forEach((t, i) => {
      doc.setFillColor(...C.blue);
      doc.circle(m + leftW + 17, 92 + i * 12, 1.4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C.ink);
      doc.text(t, m + leftW + 23, 93.5 + i * 12);
    });
  });

  // ─── Slide 5: Cierre ───────────────────────────────────────────────────────
  pages.push((n, total) => {
    pageShell(n, total);
    eyebrow('En una frase', m, 18);
    title('Un sistema. Tu vertical. Todo conectado.', m, 36, 24);

    const summary = [
      {
        k: '01',
        t: 'Qué es',
        d: 'Plataforma de autogestión multi-vertical en tiempo real.',
      },
      {
        k: '02',
        t: 'De qué se compone',
        d: 'Un corazón común + verticales por sector.',
      },
      {
        k: '03',
        t: 'Qué incluye',
        d: 'RRHH, gestoría, CRM, finanzas, docs, stock, TPV, chat…',
      },
      {
        k: '04',
        t: 'Cómo se vive',
        d: 'Operativa del día + alertas cuando hay que actuar.',
      },
    ];

    summary.forEach((s, i) => {
      const y = 55 + i * 22;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...C.blue);
      doc.text(s.k, m, y);
      doc.setFontSize(13);
      doc.setTextColor(...C.dark);
      doc.text(s.t, m + 18, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...C.muted);
      doc.text(s.d, m + 18, y + 8);
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.teal);
    doc.text('Vertial — más tiempo, menos tareas, más control.', m, H - 18);
  });

  const total = pages.length;
  pages.forEach((draw, i) => {
    if (i > 0) doc.addPage();
    draw(i + 1, total);
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const buf = Buffer.from(doc.output('arraybuffer'));
  writeFileSync(OUT_FILE, buf);
  console.log(`OK → ${OUT_FILE} (${total} diapositivas)`);
}

generate();
