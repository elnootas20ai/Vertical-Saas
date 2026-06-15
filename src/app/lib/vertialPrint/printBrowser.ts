import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import type { TicketDocument } from './ticketDocument';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printDeliveryTicketBrowser(
  options: DeliveryTicketPrintOptions,
  doc: TicketDocument,
) {
  const w = window.open('', '_blank', 'width=360,height=720');
  if (!w) return;

  const rows = doc.lines.map((item) =>
    `<tr><td style="padding:2px 0">${item.qty}x ${escapeHtml(item.name)}</td><td style="text-align:right;padding:2px 0">${item.total.toFixed(2)}€</td></tr>`,
  ).join('');

  w.document.write(`<!DOCTYPE html><html><head><title>${doc.isRefund ? 'Devolución' : 'Ticket'} ${escapeHtml(doc.ticketNo)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:300px;margin:0 auto;padding:12px;font-size:12px;color:#000}
.c{text-align:center}.hr{border-top:1px dashed #333;margin:8px 0}
table{width:100%;border-collapse:collapse}.b{font-weight:bold}
.t td{font-size:14px;font-weight:bold;padding-top:4px}
.f{margin-top:16px;font-size:10px;text-align:center;color:#666;line-height:1.4}
.small{font-size:10px;color:#444}
@media print{body{margin:0}}
</style></head><body>
<div class="c">
  <strong style="font-size:15px">${escapeHtml(doc.issuer)}</strong><br/>
  ${doc.taxId ? `<span class="small">NIF/CIF: ${escapeHtml(doc.taxId)}</span><br/>` : ''}
  ${doc.addressLine ? `<span class="small">${escapeHtml(doc.addressLine)}</span><br/>` : ''}
  ${doc.phone ? `<span class="small">Tel: ${escapeHtml(doc.phone)}</span><br/>` : ''}
</div>
<div class="hr"></div>
<div class="c">
  <strong style="font-size:16px">${escapeHtml(doc.title)}</strong><br/>
  <span class="small">${escapeHtml(doc.ticketNo)} · ${escapeHtml(doc.dateLabel)}</span>
</div>
<div class="hr"></div>
${doc.salesPointName ? `<p>Tienda: ${escapeHtml(doc.salesPointName)}</p>` : ''}
<p>Pedido: <strong>#${escapeHtml(doc.orderNumber)}</strong></p>
<p>Cliente: ${escapeHtml(doc.customerName)}</p>
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
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
