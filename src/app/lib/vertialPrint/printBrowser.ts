import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import type { TicketDocument } from './ticketDocument';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_STYLES = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:300px;margin:0 auto;padding:6px 12px 12px;font-size:14px;color:#000;line-height:1.4}
.c{text-align:center}.hr{border-top:1px dashed #333;margin:10px 0}
table{width:100%;border-collapse:collapse}.b{font-weight:bold}
.t td{font-size:16px;font-weight:bold;padding-top:6px}
.f{margin-top:10px;font-size:12px;text-align:center;color:#666;line-height:1.4}
.small{font-size:12px;color:#444}
.note{color:#b45309;font-size:12px;font-weight:bold}
.add{color:#047857;font-size:12px;font-weight:bold}
.rem{color:#b91c1c;font-size:12px;font-weight:bold;text-decoration:line-through}
.item{padding:8px 0;border-bottom:1px dotted #ccc}
.item:last-child{border-bottom:none}
.big{font-size:16px;font-weight:bold}
.order-note{background:#fef3c7;border:1px solid #f59e0b;padding:6px 8px;margin-top:8px;font-weight:bold;color:#92400e}
@media print{body{margin:0}}
`;

function buildLineDetailHtml(line: TicketDocument['lines'][number]): string {
  const bits: string[] = [];
  if (line.added?.length) {
    for (const name of line.added) {
      bits.push(`<div class="add">+ ${escapeHtml(name)}</div>`);
    }
  }
  if (line.removed?.length) {
    for (const name of line.removed) {
      bits.push(`<div class="rem">SIN ${escapeHtml(name)}</div>`);
    }
  }
  if (line.note) {
    bits.push(`<div class="note">NOTA: ${escapeHtml(line.note)}</div>`);
  }
  return bits.length > 0 ? `<div style="margin-top:3px;padding-left:8px">${bits.join('')}</div>` : '';
}

function buildHeaderHtml(doc: TicketDocument): string {
  return `<div class="c">
  <strong style="font-size:18px">${escapeHtml(doc.issuer)}</strong><br/>
  ${doc.taxId ? `<span class="small">NIF/CIF: ${escapeHtml(doc.taxId)}</span><br/>` : ''}
  ${doc.addressLine ? `<span class="small">${escapeHtml(doc.addressLine)}</span><br/>` : ''}
  ${doc.phone ? `<span class="small">Tel: ${escapeHtml(doc.phone)}</span><br/>` : ''}
</div>
<div class="hr"></div>
<div class="c">
  <strong style="font-size:22px">${escapeHtml(doc.title)}</strong><br/>
  <span class="small">${escapeHtml(doc.ticketNo)} - ${escapeHtml(doc.dateLabel)}</span>
</div>
<div class="hr"></div>`;
}

function buildKitchenTicketHtml(doc: TicketDocument): string {
  const rows = doc.lines.map((item) => {
    const detail = buildLineDetailHtml(item);
    return `<div class="item"><span class="b">${item.qty}x</span> ${escapeHtml(item.name)}${detail}</div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>Comanda ${escapeHtml(doc.ticketNo)}</title>
<style>${BASE_STYLES}</style></head><body>
${buildHeaderHtml(doc)}
${doc.salesPointName ? `<p>Tienda: ${escapeHtml(doc.salesPointName)}</p>` : ''}
<p>Pedido: <strong>#${escapeHtml(doc.orderNumber)}</strong></p>
${doc.deliveryTypeLabel ? `<p class="b">${escapeHtml(doc.deliveryTypeLabel)}</p>` : ''}
<p>Cliente: ${escapeHtml(doc.customerName)}</p>
${doc.customerPhone ? `<p>Tel: ${escapeHtml(doc.customerPhone)}</p>` : ''}
${doc.customerAddress ? `<p${doc.emphasizeCustomerAddress ? ' class="b"' : ''}>Dir: ${escapeHtml(doc.customerAddress)}</p>` : ''}
${doc.cashierName ? `<p>Atendido por: ${escapeHtml(doc.cashierName)}</p>` : ''}
<div class="hr"></div>
${rows}
${doc.orderNotes ? `<div class="order-note">NOTA PEDIDO: ${escapeHtml(doc.orderNotes)}</div>` : ''}
<div class="f">${escapeHtml(doc.footer)}</div>
</body></html>`;
}

function buildDeliverySlipHtml(doc: TicketDocument): string {
  const rows = doc.lines.map((item) => {
    const detail = buildLineDetailHtml(item);
    return `<div class="item"><span class="b">${item.qty}x</span> ${escapeHtml(item.name)}${detail}</div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>Reparto ${escapeHtml(doc.ticketNo)}</title>
<style>${BASE_STYLES}</style></head><body>
${buildHeaderHtml(doc)}
<p>Pedido: <strong>#${escapeHtml(doc.orderNumber)}</strong></p>
${doc.deliveryTypeLabel ? `<p class="b">${escapeHtml(doc.deliveryTypeLabel)}</p>` : ''}
<div class="hr"></div>
<p class="big">${escapeHtml(doc.customerName)}</p>
${doc.customerPhone ? `<p class="big">Tel: ${escapeHtml(doc.customerPhone)}</p>` : ''}
${doc.customerAddress ? `<p class="big${doc.emphasizeCustomerAddress ? ' b' : ''}">Dir: ${escapeHtml(doc.customerAddress)}</p>` : ''}
<div class="hr"></div>
${rows}
<div class="hr"></div>
<table class="t"><tr><td>TOTAL</td><td style="text-align:right">${doc.total.toFixed(2)}€</td></tr></table>
<p>${escapeHtml(doc.paymentStatusLabel)}${doc.paymentLabel && doc.paymentLabel !== '-' ? ` · ${escapeHtml(doc.paymentLabel)}` : ''}</p>
${doc.orderNotes ? `<div class="order-note">NOTA PEDIDO: ${escapeHtml(doc.orderNotes)}</div>` : ''}
<div class="f">${escapeHtml(doc.footer)}</div>
</body></html>`;
}

function buildCustomerTicketHtml(doc: TicketDocument): string {
  const rows = doc.lines.map((item) => {
    const detail = buildLineDetailHtml(item);
    return `<tr><td style="padding:4px 0;vertical-align:top"><span class="b">${item.qty}x</span> ${escapeHtml(item.name)}${detail}</td><td style="text-align:right;padding:4px 0;vertical-align:top">${item.total.toFixed(2)}€</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>${doc.isRefund ? 'Devolución' : 'Ticket'} ${escapeHtml(doc.ticketNo)}</title>
<style>${BASE_STYLES}</style></head><body>
${buildHeaderHtml(doc)}
${doc.salesPointName ? `<p>Tienda: ${escapeHtml(doc.salesPointName)}</p>` : ''}
<p>Pedido: <strong>#${escapeHtml(doc.orderNumber)}</strong></p>
<p>Cliente: ${escapeHtml(doc.customerName)}</p>
${doc.customerPhone ? `<p>Tel: ${escapeHtml(doc.customerPhone)}</p>` : ''}
${doc.customerAddress ? `<p${doc.emphasizeCustomerAddress ? ' class="b"' : ''}>Dir: ${escapeHtml(doc.customerAddress)}</p>` : ''}
${doc.deliveryTypeLabel ? `<p>${escapeHtml(doc.deliveryTypeLabel)}</p>` : ''}
${doc.cashierName ? `<p>Atendido por: ${escapeHtml(doc.cashierName)}</p>` : ''}
<div class="hr"></div>
<table>${rows}</table>
<div class="hr"></div>
<table>
  <tr><td>Base imponible</td><td style="text-align:right">${doc.base.toFixed(2)}€</td></tr>
  <tr><td>IVA ${doc.vatRate}%</td><td style="text-align:right">${doc.vat.toFixed(2)}€</td></tr>
</table>
<div class="hr"></div>
<table class="t"><tr><td>${doc.isRefund ? 'TOTAL DEVUELTO' : 'TOTAL'}</td><td style="text-align:right">${doc.isRefund ? '-' : ''}${doc.total.toFixed(2)}€</td></tr></table>
<div class="hr"></div>
<p>Método: ${escapeHtml(doc.paymentLabel)}</p>
${doc.refundReason ? `<p>Motivo: ${escapeHtml(doc.refundReason)}</p>` : ''}
<div class="f">
  ${escapeHtml(doc.footer)}<br/>
  Gracias por su visita
</div>
</body></html>`;
}

function buildTicketHtml(doc: TicketDocument): string {
  if (doc.variant === 'kitchen') return buildKitchenTicketHtml(doc);
  if (doc.variant === 'delivery') return buildDeliverySlipHtml(doc);
  return buildCustomerTicketHtml(doc);
}

function printHtmlInHiddenFrame(html: string): boolean {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden';
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return false;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const runPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      cleanup();
      return false;
    }
    setTimeout(cleanup, 1500);
    return true;
  };

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  setTimeout(() => runPrint(), 250);
  return true;
}

function printHtmlInPopup(html: string): void {
  const w = window.open('', '_blank', 'width=360,height=720');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  }, 300);
}

export function printDeliveryTicketBrowser(
  _options: DeliveryTicketPrintOptions,
  doc: TicketDocument,
) {
  const html = buildTicketHtml(doc);
  if (!printHtmlInHiddenFrame(html)) {
    printHtmlInPopup(html);
  }
}

export function printTestTicketBrowser(paperWidthMm: 58 | 80 = 80) {
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const doc: TicketDocument = {
    variant: 'customer',
    title: 'PRUEBA',
    ticketNo: 'TEST-001',
    dateLabel: now,
    issuer: 'Vertial TPV',
    taxId: '',
    addressLine: '',
    phone: '',
    salesPointName: '',
    orderNumber: '0000',
    customerName: 'Impresion de prueba',
    customerPhone: '',
    customerAddress: '',
    emphasizeCustomerAddress: false,
    deliveryTypeLabel: '',
    cashierName: '',
    lines: [{ qty: 1, name: 'Producto demo', total: 9.99 }],
    base: 8.26,
    vat: 1.73,
    vatRate: 21,
    total: 9.99,
    paymentLabel: 'Efectivo',
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes: '',
    footer: 'Si ves esto, la impresora funciona',
    isRefund: false,
  };
  printDeliveryTicketBrowser({} as DeliveryTicketPrintOptions, doc);
}
