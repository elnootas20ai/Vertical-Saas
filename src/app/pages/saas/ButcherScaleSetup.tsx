import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import {
  listScaleDevicesRequest,
  createScaleDeviceRequest,
  deleteScaleDeviceRequest,
  assignScaleToTerminalRequest,
  getTerminalScaleRequest,
  type ScaleDevice,
} from '../../lib/deliveryApi';
import {
  ensureButcherTpvTarget,
  persistButcherTpvIds,
} from '../../lib/butcherTpvScope';
import { Scale, Plus, Trash2, Loader2, Wifi, Link2, CheckCircle2 } from 'lucide-react';

function deviceId(d: ScaleDevice) {
  return String(d.id || (d as { _id?: string })._id || '');
}

export function ButcherScaleSetup() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const [devices, setDevices] = useState<ScaleDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Báscula mostrador');
  const [connectionType, setConnectionType] = useState<'usb_serial' | 'bluetooth' | 'network'>('usb_serial');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pdvLabel, setPdvLabel] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [pdvId, setPdvId] = useState('');
  const [assignedScaleId, setAssignedScaleId] = useState<string | null>(null);

  const refreshAssignment = useCallback(async () => {
    if (!userId) return;
    try {
      const { pdv, terminalId: tid } = await ensureButcherTpvTarget(userId);
      setPdvId(pdv._id);
      setTerminalId(tid);
      const term = (pdv.terminals || []).find((t) => t.id === tid);
      setPdvLabel(`${pdv.name}${pdv.code ? ` · ${pdv.code}` : ''}${term?.name ? ` / ${term.name}` : ''}`);
      const device = await getTerminalScaleRequest(userId, pdv._id, tid);
      setAssignedScaleId(device ? deviceId(device) : (term?.scaleDeviceId || null));
    } catch (e) {
      setPdvLabel('');
      toast.error(e instanceof Error ? e.message : 'No se pudo preparar el TPV para báscula');
    }
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await listScaleDevicesRequest(userId);
      setDevices(list || []);
      await refreshAssignment();
    } catch {
      toast.error('No se pudieron cargar las básculas');
    } finally {
      setLoading(false);
    }
  }, [userId, refreshAssignment]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!userId || !name.trim()) return;
    setSaving(true);
    try {
      const { pdv, terminalId: tid } = await ensureButcherTpvTarget(userId);
      setPdvId(pdv._id);
      setTerminalId(tid);
      const created = await createScaleDeviceRequest(userId, {
        name: name.trim(),
        connectionType,
        network: connectionType === 'network' ? { host: host.trim(), port: 4001 } : undefined,
        weighing: { unit: 'kg', precision: 3 },
        // ASCII genérico (Dibal/Gram/etc.). BLE: Web Bluetooth; USB: Web Serial.
        protocol: connectionType === 'bluetooth' ? 'ble_ascii' : 'generic_ascii',
        notes: connectionType === 'bluetooth'
          ? 'Pulsa «Conectar» en el TPV; el navegador pedirá el dispositivo BLE.'
          : undefined,
      } as Partial<ScaleDevice>);
      toast.success('Báscula registrada');
      setName('Báscula mostrador');
      const id = deviceId(created);
      if (id) {
        await assignScaleToTerminalRequest(userId, pdv._id, tid, id);
        persistButcherTpvIds(pdv._id, tid);
        setAssignedScaleId(id);
        toast.success('Asignada al TPV de mostrador');
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const assignToTpv = async (id: string) => {
    if (!userId) return;
    setAssigning(id);
    try {
      const { pdv, terminalId: tid } = await ensureButcherTpvTarget(userId);
      await assignScaleToTerminalRequest(userId, pdv._id, tid, id);
      persistButcherTpvIds(pdv._id, tid);
      setPdvId(pdv._id);
      setTerminalId(tid);
      setAssignedScaleId(id);
      toast.success('Báscula asignada al TPV. Ya puedes pesarla en el mostrador.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar');
    } finally {
      setAssigning(null);
    }
  };

  const remove = async (id: string) => {
    if (!userId) return;
    try {
      if (assignedScaleId === id && pdvId && terminalId) {
        await assignScaleToTerminalRequest(userId, pdvId, terminalId, '').catch(() => {});
        setAssignedScaleId(null);
      }
      await deleteScaleDeviceRequest(userId, id);
      toast.success('Eliminada');
      await load();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <Layout title="Básculas" subtitle="Registro y asignación al TPV de mostrador">
      <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm">
        <p className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
          <Link2 className="w-4 h-4" /> TPV vinculado
        </p>
        <p className="text-emerald-800/80 dark:text-emerald-200/80 text-xs mt-1">
          {pdvLabel
            ? `${pdvLabel}`
            : 'Al guardar o asignar se crea/usa el punto de venta de carnicería automáticamente.'}
          {pdvId && terminalId ? (
            <span className="block mt-1 font-mono text-[10px] opacity-70">
              pdv={pdvId.slice(0, 12)}… · terminal={terminalId.slice(0, 12)}…
            </span>
          ) : null}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
          <h3 className="font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Registrar báscula</h3>
          <input
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-transparent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
          />
          <select
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
            value={connectionType}
            onChange={(e) => setConnectionType(e.target.value as typeof connectionType)}
          >
            <option value="usb_serial">USB / Serial (Chrome)</option>
            <option value="bluetooth">Bluetooth</option>
            <option value="network">Red (IP)</option>
          </select>
          {connectionType === 'network' && (
            <input
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-transparent"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="IP de la báscula"
            />
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => { void create(); }}
            className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar y asignar al TPV'}
          </button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Scale className="w-10 h-10 mx-auto mb-2 opacity-40" />
              Sin básculas registradas
            </div>
          ) : (
            devices.map((d) => {
              const id = deviceId(d);
              const isActive = assignedScaleId === id;
              return (
                <div key={id} className={`flex items-center justify-between gap-3 p-4 rounded-xl border bg-white dark:bg-gray-800 ${isActive ? 'border-emerald-400 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-1.5">
                      {d.name}
                      {isActive && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      {d.connectionType || '—'} · {d.protocol || 'generic'}
                      {isActive ? ' · Activa en TPV' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        disabled={!!assigning}
                        onClick={() => { void assignToTpv(id); }}
                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                      >
                        {assigning === id ? '…' : 'Usar en TPV'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { void remove(id); }}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
