import { listClientInvoicesRequest } from '../../../../lib/clientInvoicesApi';
import { listPurchaseInvoicesRequest } from '../../../../lib/deliveryApi';
import { listFinanceMovements } from '../../../../lib/financeApi';
import { getClientPaymentBehavior } from '../../../../lib/crmFinanceIntegration';
import {
  fetchReconciliationStats,
  fetchReconciliationAlerts,
  listBankTransactions,
} from '../../../../lib/bankReconciliationApi';
import { buildVatBook } from '../../../../lib/vatBookApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  round2,
  yearNow,
  emptyResult,
} from './informeTypes';

export async function loadFacturacionInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('facturacion-')) return null;
  ctx.onProgress?.(20, 'Cargando facturación…');

  if (id === 'facturacion-emitida') {
    const invoices = await listClientInvoicesRequest(ctx.userId);
    const rows = invoices.map((inv: any) => ({
      Numero: inv.number || inv.invoiceNumber || inv.id,
      Cliente: inv.clientName || inv.customerName || '',
      Fecha: inv.date || inv.issuedAt || inv.createdAt || '',
      Estado: inv.status || '',
      Base: round2(inv.base || inv.subtotal || inv.amountBase || 0),
      IVA: round2(inv.tax || inv.vat || inv.taxAmount || 0),
      Total: round2(inv.total || inv.totalAmount || 0),
    }));
    const total = rows.reduce((s, r) => s + Number(r.Total), 0);
    return {
      rows,
      summary: `Facturación emitida: ${rows.length} facturas · ${euro(total)} €.`,
    };
  }

  if (id === 'facturacion-recibida') {
    const invoices = await listPurchaseInvoicesRequest(ctx.userId);
    const rows = invoices.map((inv: any) => ({
      Numero: inv.number || inv.invoiceNumber || inv.id,
      Proveedor: inv.supplierName || inv.vendorName || '',
      Fecha: inv.date || inv.createdAt || '',
      Estado: inv.status || '',
      Total: round2(inv.total || inv.totalAmount || 0),
    }));
    const total = rows.reduce((s, r) => s + Number(r.Total), 0);
    return {
      rows,
      summary: `Facturación recibida: ${rows.length} · ${euro(total)} €.`,
    };
  }

  if (id === 'facturacion-pendientes') {
    const invoices = await listClientInvoicesRequest(ctx.userId);
    const pending = invoices.filter((inv: any) => {
      const st = String(inv.status || '').toLowerCase();
      return st.includes('pending') || st.includes('pendiente') || st === 'unpaid' || st === 'overdue' || st === 'sent';
    });
    const rows = pending.map((inv: any) => ({
      Numero: inv.number || inv.id,
      Cliente: inv.clientName || '',
      Fecha: inv.date || '',
      Vencimiento: inv.dueDate || '',
      Total: round2(inv.total || inv.totalAmount || 0),
      Estado: inv.status || '',
    }));
    const total = rows.reduce((s, r) => s + Number(r.Total), 0);
    return {
      rows,
      summary: `Facturas pendientes: ${rows.length} · ${euro(total)} €.`,
    };
  }

  if (id === 'facturacion-dias-cobro') {
    const [invoices, movements] = await Promise.all([
      listClientInvoicesRequest(ctx.userId),
      listFinanceMovements(ctx.userId, ctx.businessId),
    ]);
    const names = [...new Set(invoices.map((i: any) => String(i.clientName || '').trim()).filter(Boolean))];
    const rows = names.map((Cliente) => {
      const b = getClientPaymentBehavior(movements, Cliente);
      return {
        Cliente,
        DiasMediosCobro: b.avgDaysToPayment != null ? round2(b.avgDaysToPayment) : '',
        PctATiempo: b.onTimePercentage != null ? round2(b.onTimePercentage) : '',
        Pagado: round2(b.totalPaid),
        Pendiente: round2(b.totalPending),
      };
    }).filter((r) => r.DiasMediosCobro !== '' || Number(r.Pendiente) > 0 || Number(r.Pagado) > 0);
    return {
      rows,
      summary: `Días medios de cobro por cliente (${rows.length} con historial financiero).`,
    };
  }

  if (id === 'facturacion-conciliacion') {
    const [stats, alerts, txs] = await Promise.all([
      fetchReconciliationStats(ctx.userId).catch(() => null),
      fetchReconciliationAlerts(ctx.userId).catch(() => []),
      listBankTransactions(ctx.userId).catch(() => []),
    ]);
    const rows: Record<string, unknown>[] = [
      { Concepto: 'Movimientos banco', Valor: (stats as any)?.totalTransactions ?? txs.length },
      { Concepto: 'Conciliados', Valor: (stats as any)?.matched ?? (stats as any)?.reconciled ?? '' },
      { Concepto: 'Pendientes', Valor: (stats as any)?.unmatched ?? (stats as any)?.pending ?? '' },
      { Concepto: 'Alertas', Valor: alerts.length },
      ...alerts.slice(0, 40).map((a: any, i: number) => ({
        Concepto: `Alerta ${i + 1}`,
        Valor: a.message || a.title || a.type || '',
      })),
    ];
    return {
      rows,
      summary: 'Conciliación bancaria: resumen + alertas del motor Vertial.',
    };
  }

  if (id === 'facturacion-desviaciones') {
    const alerts = await fetchReconciliationAlerts(ctx.userId).catch(() => []);
    const rows = alerts.map((a: any) => ({
      Tipo: a.type || a.severity || 'alerta',
      Mensaje: a.message || a.title || '',
      Importe: round2(a.amount || a.difference || 0),
      Fecha: a.date || a.createdAt || '',
    }));
    if (!rows.length) {
      return emptyResult('Sin desviaciones/alertas de conciliación ahora mismo.');
    }
    return {
      rows,
      summary: `Desviaciones contables / alertas conciliación: ${rows.length}.`,
    };
  }

  if (id === 'facturacion-exportacion') {
    const year = yearNow();
    const movements = await listFinanceMovements(ctx.userId, ctx.businessId);
    const book = buildVatBook(movements, year);
    const entries = book.quarters.flatMap((q) => [
      ...q.repercutido.entries.map((e) => ({
        Trimestre: `T${q.quarter}`,
        Tipo: 'Repercutido',
        Fecha: e.date,
        Concepto: e.concept,
        Contraparte: e.counterparty,
        Base: round2(e.baseAmount),
        IVA: round2(e.taxAmount),
        TipoIVA: e.taxRate,
      })),
      ...q.soportado.entries.map((e) => ({
        Trimestre: `T${q.quarter}`,
        Tipo: 'Soportado',
        Fecha: e.date,
        Concepto: e.concept,
        Contraparte: e.counterparty,
        Base: round2(e.baseAmount),
        IVA: round2(e.taxAmount),
        TipoIVA: e.taxRate,
      })),
    ]);
    return {
      rows: entries.length ? entries : [{ Nota: `Sin líneas IVA en ${year}` }],
      summary: `Exportación contable (libro IVA ${year}): ${entries.length} apuntes.`,
    };
  }

  return null;
}
