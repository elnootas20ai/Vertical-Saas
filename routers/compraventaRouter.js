import { Router } from 'express';
import * as cacheService from '../services/cache.js';
import {
  couchRequest,
  ensureDatabase,
  getAllDocuments,
  getSalesDbName,
  getLeadsDbName,
  getFinanceDbName,
  getDocumentsDbName,
  VEHICLES_DB,
  BUSINESSES_DB,
  findAccountByUserId,
} from '../services/couchdb.js';

const compraventaRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(dateStr, now) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

async function fetchAllDocs(req, dbName) {
  return cacheService.getOrFetch(
    cacheService.buildKey('compraventa', dbName, '_raw'),
    async () => {
      await ensureDatabase(req, dbName);
      const docs = await getAllDocuments(req, dbName);
      return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
    },
    cacheService.TTL_PRESETS.KPI,
  );
}

function isManagerRole(role) {
  return ['Admin', 'Gerente'].includes(role);
}

// ─── GET /api/compraventa/:userId ───────────────────────────────────────────

compraventaRouter.get('/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const { branchId, responsibleId, vehicleStatus, salesChannel } = req.query;
    const authRole = req.authUser?.role || '';
    const isManager = isManagerRole(authRole);

    const cacheKey = cacheService.buildKey(
      'compraventa', userId, branchId || '', responsibleId || '', vehicleStatus || '', salesChannel || '',
    );
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    res.setHeader('X-Cache', 'MISS');

    const salesDb = getSalesDbName();
    const leadsDb = getLeadsDbName();
    const financeDb = getFinanceDbName();
    const documentsDb = getDocumentsDbName();

    const [vehicleDocs, saleDocs, leadDocs, financeDocs, documentDocs] = await Promise.all([
      fetchAllDocs(req, VEHICLES_DB).catch(() => []),
      fetchAllDocs(req, salesDb).catch(() => []),
      fetchAllDocs(req, leadsDb).catch(() => []),
      fetchAllDocs(req, financeDb).catch(() => []),
      fetchAllDocs(req, documentsDb).catch(() => []),
    ]);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // ── Filtrar vehículos del usuario ──
    let vehicles = vehicleDocs.filter(
      (v) => v.user_id === userId && v.active !== false && v.type === 'car',
    );

    // Perfil comercial: solo sus vehículos
    if (!isManager && !responsibleId) {
      vehicles = vehicles.filter((v) => !v.responsible || v.responsible === userId);
    }

    if (branchId) vehicles = vehicles.filter((v) => v.branch_id === branchId);
    if (responsibleId) vehicles = vehicles.filter((v) => v.responsible === responsibleId);
    if (vehicleStatus) vehicles = vehicles.filter((v) => v.status === vehicleStatus);

    // ── Leads ──
    let leads = leadDocs.filter((l) => l.user_id === userId && l.type === 'lead');
    if (!isManager) leads = leads.filter((l) => !l.responsible || l.responsible === userId);
    if (branchId) leads = leads.filter((l) => l.branch_id === branchId);
    if (salesChannel) leads = leads.filter((l) => l.source === salesChannel);

    // ── Ventas ──
    let sales = saleDocs.filter((s) => s.user_id === userId && s.type === 'sale');
    if (!isManager) sales = sales.filter((s) => !s.responsible || s.responsible === userId);
    if (branchId) sales = sales.filter((s) => s.branch_id === branchId);

    // ── Documentos del usuario ──
    const userDocs = documentDocs.filter((d) => d.user_id === userId);

    // ── Finanzas ──
    const userFinance = financeDocs.filter((d) => d.user_id === userId && !d.deletedAt);

    // ── KPI: Stock ──
    const stockVehicles = vehicles.filter((v) => v.status === 'available');
    const reservedVehicles = vehicles.filter((v) => v.status === 'reserved');
    const preparationVehicles = vehicles.filter((v) => v.status === 'preparation');
    const soldThisMonth = vehicles.filter((v) => {
      if (v.status !== 'sold' || !v.soldAt) return false;
      return String(v.soldAt) >= firstOfMonth;
    });

    const totalDaysInStock = stockVehicles.reduce((s, v) => {
      const days = v.daysInStock || daysBetween(v.createdAt || v.purchaseDate || now.toISOString(), now);
      return s + Math.max(0, days);
    }, 0);
    const avgDaysInStock = stockVehicles.length > 0 ? Math.round(totalDaysInStock / stockVehicles.length) : 0;

    // ── KPI: Finanzas del mes ──
    const salesVolume = soldThisMonth.reduce((s, v) => s + Number(v.salePrice || 0), 0);
    const marginTotal = soldThisMonth.reduce(
      (s, v) => s + (Number(v.salePrice || 0) - Number(v.purchasePrice || 0)),
      0,
    );
    const marginPct = salesVolume > 0 ? Math.round((marginTotal / salesVolume) * 100) : 0;

    const pendingSales = sales.filter((s) =>
      ['reserved', 'documentation', 'sold'].includes(s.stage) &&
      Number(s.depositPaid || 0) < Number(s.totalPrice || 0),
    );
    const cobrosPendientes = pendingSales.reduce(
      (sum, s) => sum + (Number(s.totalPrice || 0) - Number(s.depositPaid || 0)),
      0,
    );

    // ── KPI: Entregas ──
    const activeSales = sales.filter((s) => s.stage && s.stage !== 'interested' && s.stage !== 'delivered');
    const deliveriesDueToday = activeSales.filter((s) => String(s.expectedDelivery || '').startsWith(todayStr));
    const overdueDeliveries = activeSales.filter((s) => {
      if (!s.expectedDelivery) return false;
      return String(s.expectedDelivery) < todayStr && s.stage !== 'delivered';
    });

    // ── KPI: CRM ──
    const openLeads = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');
    const staleLeads = openLeads.filter((l) => {
      if (!l.lastContact) return true;
      return (now.getTime() - new Date(l.lastContact).getTime()) / (1000 * 60 * 60) > 48;
    });

    // Reservas sin contrato
    const reservedSales = sales.filter((s) => s.stage === 'reserved');
    const reservationsWithoutContract = reservedSales.filter((s) => {
      const hasContract = Array.isArray(s.generatedDocuments) && s.generatedDocuments.some(
        (d) => d.templateId === 'contrato-reserva' || d.templateId === 'contrato-compraventa',
      );
      const hasLinkedDoc = userDocs.some(
        (d) => d.vehicleId === s.vehicleId && (d.category === 'contrato' || d.templateId === 'contrato-reserva'),
      );
      return !hasContract && !hasLinkedDoc;
    });

    // ── Tablas: vehiculosStock (top 10 por días en stock desc) ──
    const vehiculosStock = stockVehicles
      .map((v) => ({
        id: v._id,
        matricula: v.registrationPlate || '',
        marca: v.brand || '',
        modelo: v.model || '',
        diasStock: v.daysInStock || daysBetween(v.createdAt || v.purchaseDate || now.toISOString(), now),
        precioVenta: Number(v.salePrice || 0),
        ubicacion: v.location || '',
        centro: v.workCenterId || '',
      }))
      .sort((a, b) => b.diasStock - a.diasStock)
      .slice(0, 10);

    // ── Tablas: reservasActivas ──
    const reservasActivas = reservedSales.map((s) => {
      const veh = vehicles.find((v) => v._id === s.vehicleId);
      const hasContract = Array.isArray(s.generatedDocuments) && s.generatedDocuments.length > 0;
      return {
        id: s._id,
        vehiculo: veh ? `${veh.brand || ''} ${veh.model || ''}`.trim() : (s.vehicleName || ''),
        matricula: veh?.registrationPlate || s.vehiclePlate || '',
        cliente: s.clientName || '',
        fechaReserva: s.createdAt || '',
        tieneContrato: hasContract,
        comercial: s.responsible || '',
      };
    }).slice(0, 10);

    // ── Tablas: ventasRecientes (mes actual, por fecha desc) ──
    const monthSales = sales.filter((s) => {
      const date = s.soldAt || s.updatedAt || s.createdAt || '';
      return String(date) >= firstOfMonth;
    });
    const ventasRecientes = monthSales
      .map((s) => {
        const veh = vehicles.find((v) => v._id === s.vehicleId);
        const precio = Number(s.totalPrice || 0);
        const compra = veh ? Number(veh.purchasePrice || 0) : 0;
        return {
          id: s._id,
          vehiculo: veh ? `${veh.brand || ''} ${veh.model || ''}`.trim() : (s.vehicleName || ''),
          cliente: s.clientName || '',
          importe: precio,
          margen: precio - compra,
          estadoPago: Number(s.depositPaid || 0) >= precio ? 'pagado' : 'pendiente',
          fecha: s.soldAt || s.createdAt || '',
          stage: s.stage || '',
        };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10);

    // ── Tablas: preparación ──
    const vehiculosPreparacion = preparationVehicles.map((v) => {
      const costsTotal = Array.isArray(v.associatedCosts)
        ? v.associatedCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
        : 0;
      return {
        id: v._id,
        matricula: v.registrationPlate || '',
        marca: v.brand || '',
        modelo: v.model || '',
        gastosRegistrados: costsTotal,
        numGastos: Array.isArray(v.associatedCosts) ? v.associatedCosts.length : 0,
      };
    }).slice(0, 10);

    // ── Entregas pendientes ──
    const entregasPendientes = activeSales
      .filter((s) => s.stage !== 'interested')
      .map((s) => {
        const veh = vehicles.find((v) => v._id === s.vehicleId);
        const expected = s.expectedDelivery || '';
        let badge = 'próxima';
        if (expected && expected.startsWith(todayStr)) badge = 'hoy';
        else if (expected && expected < todayStr) badge = 'retrasada';
        return {
          id: s._id,
          vehiculo: veh ? `${veh.brand || ''} ${veh.model || ''}`.trim() : (s.vehicleName || ''),
          cliente: s.clientName || '',
          fechaPrevista: expected,
          badge,
          stage: s.stage || '',
        };
      })
      .sort((a, b) => {
        const order = { retrasada: 0, hoy: 1, próxima: 2 };
        return (order[a.badge] ?? 3) - (order[b.badge] ?? 3);
      })
      .slice(0, 10);

    // ── Oportunidades CRM ──
    const oportunidades = openLeads
      .map((l) => ({
        id: l._id,
        nombre: l.name || l.fullName || '',
        fuente: l.source || '',
        estado: l.status || '',
        diasSinContacto: l.lastContact ? daysBetween(l.lastContact, now) : daysBetween(l.createdAt || now.toISOString(), now),
      }))
      .sort((a, b) => b.diasSinContacto - a.diasSinContacto)
      .slice(0, 10);

    // ── Alertas específicas compraventa ──
    const alertas = [];

    // Vehículos sin documentación (>3 días en stock)
    stockVehicles.forEach((v) => {
      const days = v.daysInStock || daysBetween(v.createdAt || now.toISOString(), now);
      if (days < 3) return;
      const hasDoc = userDocs.some((d) => d.vehicleId === v._id);
      if (!hasDoc) {
        alertas.push({
          id: `no_docs_${v._id}`,
          severity: 'warning',
          type: 'vehicle_no_docs',
          message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || ''}) lleva ${days} días sin documentación`,
          entityType: 'vehicle',
          entityId: v._id,
          route: `/saas/vehicles/${v._id}`,
        });
      }
    });

    // Reservas sin contrato
    reservationsWithoutContract.forEach((s) => {
      alertas.push({
        id: `no_contract_${s._id}`,
        severity: 'error',
        type: 'reservation_no_contract',
        message: `Reserva de ${s.clientName || 'cliente'} sin contrato generado`,
        entityType: 'sale',
        entityId: s._id,
        route: `/saas/sales/${s._id}`,
      });
    });

    // Gastos pendientes (preparación sin costes registrados)
    preparationVehicles.forEach((v) => {
      const hasCosts = Array.isArray(v.associatedCosts) && v.associatedCosts.length > 0;
      if (!hasCosts) {
        alertas.push({
          id: `pending_expense_${v._id}`,
          severity: 'warning',
          type: 'vehicle_pending_expense',
          message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || ''}) en preparación sin gastos registrados`,
          entityType: 'vehicle',
          entityId: v._id,
          route: `/saas/vehicles/${v._id}`,
        });
      }
    });

    // Pagos incompletos en ventas avanzadas
    pendingSales.forEach((s) => {
      const paid = Number(s.depositPaid || 0);
      const total = Number(s.totalPrice || 0);
      if (total > 0 && paid < total) {
        alertas.push({
          id: `incomplete_payment_${s._id}`,
          severity: 'error',
          type: 'sale_incomplete_payment',
          message: `Venta a ${s.clientName || 'cliente'}: pago incompleto (${Math.round(paid).toLocaleString('es-ES')}€ / ${Math.round(total).toLocaleString('es-ES')}€)`,
          entityType: 'sale',
          entityId: s._id,
          route: `/saas/sales/${s._id}`,
        });
      }
    });

    // Vehículos parados >60 días
    stockVehicles.forEach((v) => {
      const days = v.daysInStock || daysBetween(v.createdAt || now.toISOString(), now);
      if (days > 60) {
        alertas.push({
          id: `aging_${v._id}`,
          severity: days > 90 ? 'error' : 'warning',
          type: 'vehicle_stock_aging',
          message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || ''}) lleva ${days} días en stock`,
          entityType: 'vehicle',
          entityId: v._id,
          route: `/saas/vehicles/${v._id}`,
        });
      }
    });

    // ── Próximas acciones ──
    const proximasAcciones = [];

    overdueDeliveries.forEach((s) => {
      proximasAcciones.push({
        id: `delivery_${s._id}`,
        tipo: 'entrega',
        descripcion: `Entrega retrasada: ${s.clientName || 'cliente'}`,
        fecha: s.expectedDelivery || '',
        asignadoA: s.responsible || '',
        route: `/saas/sales/${s._id}`,
      });
    });

    deliveriesDueToday.forEach((s) => {
      proximasAcciones.push({
        id: `delivery_today_${s._id}`,
        tipo: 'entrega',
        descripcion: `Entrega hoy: ${s.clientName || 'cliente'}`,
        fecha: todayStr,
        asignadoA: s.responsible || '',
        route: `/saas/sales/${s._id}`,
      });
    });

    staleLeads.forEach((l) => {
      proximasAcciones.push({
        id: `followup_${l._id}`,
        tipo: 'seguimiento',
        descripcion: `Seguimiento pendiente: ${l.name || l.fullName || 'lead'}`,
        fecha: l.lastContact || l.createdAt || '',
        asignadoA: l.responsible || '',
        route: `/saas/crm/clientes/${l._id}`,
      });
    });

    proximasAcciones.sort((a, b) => a.fecha.localeCompare(b.fecha));

    // ── Rendimiento (solo gerente) ──
    let rendimiento = null;
    if (isManager) {
      const salesByDay = {};
      soldThisMonth.forEach((v) => {
        const day = String(v.soldAt || '').slice(0, 10);
        if (!day) return;
        if (!salesByDay[day]) salesByDay[day] = { ventas: 0, margen: 0 };
        salesByDay[day].ventas += Number(v.salePrice || 0);
        salesByDay[day].margen += Number(v.salePrice || 0) - Number(v.purchasePrice || 0);
      });

      rendimiento = {
        ventasPorDia: Object.entries(salesByDay)
          .map(([dia, data]) => ({ dia, ...data }))
          .sort((a, b) => a.dia.localeCompare(b.dia)),
        margenAcumulado: marginTotal,
        totalVentas: soldThisMonth.length,
      };
    }

    // ── KPI: Tasaciones y compras ──
    const userTradeIns = vehicleDocs.filter(
      (d) => d.user_id === userId && d.type === 'tradein' && d.active !== false && !d.deletedAt,
    );
    const userAcquisitions = vehicleDocs.filter(
      (d) => d.user_id === userId && d.type === 'vehicle_acquisition' && !d.deletedAt,
    );
    const pendingTradeIns = userTradeIns.filter((t) => ['pending', 'negotiation'].includes(t.status)).length;
    const openAcquisitions = userAcquisitions.filter(
      (a) => !['cerrada', 'cancelada', 'rechazada'].includes(a.status),
    ).length;

    const result = {
      ok: true,
      isManager,
      stock: {
        total: stockVehicles.length,
        reservados: reservedVehicles.length,
        enPreparacion: preparationVehicles.length,
        vendidosMes: soldThisMonth.length,
        diasPromedioStock: avgDaysInStock,
      },
      finanzas: {
        ventasMes: salesVolume,
        margenMes: marginTotal,
        margenPct,
        cobrosPendientes,
        cobrosCount: pendingSales.length,
      },
      entregas: {
        pendientes: activeSales.length,
        programadasHoy: deliveriesDueToday.length,
        retrasadas: overdueDeliveries.length,
      },
      crm: {
        oportunidadesAbiertas: openLeads.length,
        leadsSinContacto48h: staleLeads.length,
        reservasSinContrato: reservationsWithoutContract.length,
      },
      comercial: {
        tasacionesPendientes: pendingTradeIns,
        comprasAbiertas: openAcquisitions,
      },
      vehiculosStock,
      reservasActivas,
      ventasRecientes,
      vehiculosPreparacion,
      entregasPendientes,
      oportunidades,
      alertas,
      proximasAcciones: proximasAcciones.slice(0, 15),
      rendimiento,
      updatedAt: now.toISOString(),
    };

    cacheService.set(cacheKey, result, cacheService.TTL_PRESETS.KPI);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error calculando datos de compraventa',
    });
  }
});

export { compraventaRouter };
