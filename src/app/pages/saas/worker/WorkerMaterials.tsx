import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  listDeliveriesRequest,
  createMaterialRequestRequest,
  listMaterialRequestsRequest,
  confirmDeliveryRequest,
  type MaterialDelivery,
  type MaterialRequest,
} from '../../../lib/cleaningMaterialsApi';
import {
  Boxes, Package, Truck, Send, Check, CheckCircle, Clock,
  Loader2, RefreshCw, ArrowLeft, ChevronDown, Plus, AlertTriangle,
} from 'lucide-react';

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    draft:     { bg: 'bg-gray-100',    text: 'text-gray-600',    label: 'Borrador' },
    delivered: { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Entregado' },
    pending:   { bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Pendiente' },
    approved:  { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Aprobado' },
    rejected:  { bg: 'bg-red-50',      text: 'text-red-600',     label: 'Rechazado' },
    cancelled: { bg: 'bg-gray-100',    text: 'text-gray-500',    label: 'Cancelado' },
  };
  const cfg = map[status] || map.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

export function WorkerMaterials() {
  const { user } = useAuth();
  const userId = user?.userId || user?.id || '';
  const memberId = user?.teamMemberId || user?.memberId || '';

  const [tab, setTab] = useState<'stock' | 'requests'>('stock');
  const [deliveries, setDeliveries] = useState<MaterialDelivery[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ materialName: '', quantity: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [dels, reqs] = await Promise.all([
        listDeliveriesRequest(userId, { workerId: memberId }),
        listMaterialRequestsRequest(userId, { workerId: memberId }),
      ]);
      setDeliveries(dels);
      setRequests(reqs);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar materiales');
    } finally {
      setLoading(false);
    }
  }, [userId, memberId]);

  useEffect(() => { loadData(); }, [loadData]);

  const myStock = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; unit: string }>();
    for (const d of deliveries.filter(d => d.status === 'delivered')) {
      for (const line of d.lines) {
        const key = line.catalogItemId || line.materialName;
        const existing = map.get(key) || { name: line.materialName, qty: 0, unit: line.unit };
        existing.qty += line.quantity - (line.returnedQuantity || 0);
        map.set(key, existing);
      }
    }
    return Array.from(map.entries()).filter(([, v]) => v.qty > 0).map(([id, v]) => ({ id, ...v }));
  }, [deliveries]);

  const pendingDeliveries = useMemo(() => deliveries.filter(d => d.status === 'delivered' && !d.receivedConfirmation), [deliveries]);

  const handleConfirm = async (deliveryId: string) => {
    try {
      await confirmDeliveryRequest(userId, deliveryId);
      toast.success('Entrega confirmada');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSubmitRequest = async () => {
    if (!requestForm.materialName.trim()) return toast.error('Indica el material');
    if (!requestForm.quantity) return toast.error('Indica la cantidad');
    setSubmitting(true);
    try {
      await createMaterialRequestRequest(userId, {
        workerId: memberId,
        workerName: user?.fullName || user?.name || '',
        materialName: requestForm.materialName,
        quantity: Number(requestForm.quantity),
        unit: 'ud',
        reason: requestForm.reason,
      });
      toast.success('Solicitud enviada');
      setShowRequestForm(false);
      setRequestForm({ materialName: '', quantity: '', reason: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Boxes className="w-6 h-6 text-sky-500" />
          Mi Material
        </h1>
        <button onClick={loadData} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Pending confirmations */}
      {pendingDeliveries.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Entregas pendientes de confirmar
          </p>
          {pendingDeliveries.map((d) => (
            <div key={d._id} className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold">{d.deliveryNumber}</span>
                <span className="text-xs text-gray-500">{d.date}</span>
              </div>
              <div className="space-y-1">
                {d.lines.map((l) => (
                  <div key={l.id} className="flex justify-between text-sm">
                    <span>{l.materialName}</span>
                    <span className="font-medium">{l.quantity} {l.unit}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleConfirm(d._id)}
                className="w-full mt-2 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1 hover:bg-emerald-700 transition"
              >
                <Check className="w-4 h-4" /> Confirmar recepción
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button onClick={() => setTab('stock')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === 'stock' ? 'bg-white dark:bg-gray-700 shadow text-sky-600' : 'text-gray-500'}`}>
          <Package className="w-4 h-4 inline mr-1" /> Mi Stock
        </button>
        <button onClick={() => setTab('requests')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === 'requests' ? 'bg-white dark:bg-gray-700 shadow text-sky-600' : 'text-gray-500'}`}>
          <Send className="w-4 h-4 inline mr-1" /> Solicitudes
        </button>
      </div>

      {/* Stock tab */}
      {tab === 'stock' && (
        <div className="space-y-3">
          {myStock.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tienes material asignado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className="text-sm font-bold text-sky-600">{item.qty} {item.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <div className="space-y-3">
          <button
            onClick={() => setShowRequestForm(true)}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-sky-300 text-sky-600 text-sm font-medium flex items-center justify-center gap-1 hover:bg-sky-50 transition"
          >
            <Plus className="w-4 h-4" /> Solicitar material
          </button>

          {showRequestForm && (
            <div className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-4 space-y-3">
              <input
                type="text" placeholder="Material…" value={requestForm.materialName}
                onChange={(e) => setRequestForm(prev => ({ ...prev, materialName: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-white text-sm"
              />
              <input
                type="number" placeholder="Cantidad" value={requestForm.quantity}
                onChange={(e) => setRequestForm(prev => ({ ...prev, quantity: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-white text-sm"
              />
              <input
                type="text" placeholder="Motivo (opcional)" value={requestForm.reason}
                onChange={(e) => setRequestForm(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-white text-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowRequestForm(false)} className="flex-1 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 transition">Cancelar</button>
                <button onClick={handleSubmitRequest} disabled={submitting} className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enviar'}
                </button>
              </div>
            </div>
          )}

          {requests.length === 0 && !showRequestForm ? (
            <div className="text-center py-8 text-gray-500">
              <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin solicitudes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r._id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.materialName}</p>
                    <p className="text-xs text-gray-500">{r.quantity} {r.unit} · {r.requestNumber}</p>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
