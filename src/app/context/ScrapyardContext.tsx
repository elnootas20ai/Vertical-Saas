import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import { useBusinessOptional } from './BusinessContext';
import type { ScrapyardVehicle, ScrapyardHistoryEntry, ScrapyardAlert } from '../lib/scrapyardTypes';
import {
  listScrapyardVehicles,
  createScrapyardVehicle,
  updateScrapyardVehicle,
  deleteScrapyardVehicle,
} from '../lib/scrapyardApi';

interface ScrapyardState {
  vehicles: ScrapyardVehicle[];
  loading: boolean;
  alerts: ScrapyardAlert[];
  addVehicle: (v: Partial<ScrapyardVehicle>) => Promise<ScrapyardVehicle>;
  updateVehicle: (id: string, v: Partial<ScrapyardVehicle>) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  getVehicle: (id: string) => ScrapyardVehicle | undefined;
  refresh: () => Promise<void>;
}

const ScrapyardCtx = createContext<ScrapyardState | null>(null);

export function useScrapyard() {
  const ctx = useContext(ScrapyardCtx);
  if (!ctx) throw new Error('useScrapyard must be inside ScrapyardProvider');
  return ctx;
}

function computeAlerts(vehicles: ScrapyardVehicle[]): ScrapyardAlert[] {
  const alerts: ScrapyardAlert[] = [];
  const matriculaMap = new Map<string, ScrapyardVehicle[]>();
  const bastidorMap = new Map<string, ScrapyardVehicle[]>();

  for (const v of vehicles) {
    if (v.matricula) {
      const key = v.matricula.toUpperCase().replace(/[\s-]/g, '');
      if (!matriculaMap.has(key)) matriculaMap.set(key, []);
      matriculaMap.get(key)!.push(v);
    }
    if (v.bastidor) {
      const key = v.bastidor.toUpperCase().replace(/[\s-]/g, '');
      if (!bastidorMap.has(key)) bastidorMap.set(key, []);
      bastidorMap.get(key)!.push(v);
    }
  }

  for (const [, group] of matriculaMap) {
    if (group.length > 1) {
      for (const v of group) {
        alerts.push({
          id: `dup-mat-${v.id}`,
          vehicleId: v.id,
          matricula: v.matricula,
          marcaModelo: `${v.marca} ${v.modelo}`,
          tipo: 'matricula_duplicada',
          mensaje: `Matricula ${v.matricula} duplicada (${group.length} vehiculos)`,
          severity: 'critical',
        });
      }
    }
  }

  for (const [, group] of bastidorMap) {
    if (group.length > 1) {
      for (const v of group) {
        alerts.push({
          id: `dup-vin-${v.id}`,
          vehicleId: v.id,
          matricula: v.matricula,
          marcaModelo: `${v.marca} ${v.modelo}`,
          tipo: 'bastidor_duplicado',
          mensaje: `Bastidor ${v.bastidor} duplicado (${group.length} vehiculos)`,
          severity: 'critical',
        });
      }
    }
  }

  const now = Date.now();
  for (const v of vehicles) {
    if (!v.documentacionCompleta) {
      const hoursOld = (now - new Date(v.fechaCreacion).getTime()) / 3_600_000;
      alerts.push({
        id: `doc-${v.id}`,
        vehicleId: v.id,
        matricula: v.matricula,
        marcaModelo: `${v.marca} ${v.modelo}`,
        tipo: 'sin_documentacion',
        mensaje: `Documentacion incompleta${hoursOld > 48 ? ' (mas de 48h)' : ''}`,
        severity: hoursOld > 48 ? 'critical' : 'warning',
      });
    }

    if (!v.ubicacion && !v.zonaId) {
      alerts.push({
        id: `loc-${v.id}`,
        vehicleId: v.id,
        matricula: v.matricula,
        marcaModelo: `${v.marca} ${v.modelo}`,
        tipo: 'sin_ubicacion',
        mensaje: 'Sin ubicacion asignada',
        severity: 'warning',
      });
    }

    if (v.estadoBaja === 'pendiente') {
      const daysOld = (now - new Date(v.fechaEntrada).getTime()) / 86_400_000;
      if (daysOld > 7) {
        alerts.push({
          id: `baja-${v.id}`,
          vehicleId: v.id,
          matricula: v.matricula,
          marcaModelo: `${v.marca} ${v.modelo}`,
          tipo: 'baja_pendiente',
          mensaje: `Baja pendiente de tramitar (${Math.floor(daysOld)} dias)`,
          severity: 'warning',
        });
      }
    }

    if (v.estado === 'recibido') {
      const daysOld = (now - new Date(v.fechaEntrada).getTime()) / 86_400_000;
      if (daysOld > 30) {
        alerts.push({
          id: `stale-${v.id}`,
          vehicleId: v.id,
          matricula: v.matricula,
          marcaModelo: `${v.marca} ${v.modelo}`,
          tipo: 'sin_procesar',
          mensaje: `Recibido hace ${Math.floor(daysOld)} dias sin iniciar despiece`,
          severity: 'info',
        });
      }
    }
  }

  return alerts;
}

export function ScrapyardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const [vehicles, setVehicles] = useState<ScrapyardVehicle[]>([]);
  const [loading, setLoading] = useState(false);

  const userId = (user as any)?.id || (user as any)?.uid || '';
  const businessId =
    currentBusiness?.business_id || (currentBusiness as { id?: string } | null)?.id || null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listScrapyardVehicles(userId, businessId);
      setVehicles(res.vehicles || []);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addVehicle = useCallback(async (v: Partial<ScrapyardVehicle>) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const userName = (user as any)?.name || (user as any)?.email || 'Sistema';
    const entry: ScrapyardHistoryEntry = {
      id: uuidv4(),
      fecha: now,
      tipo: 'entrada',
      descripcion: `Vehiculo registrado: ${v.marca || ''} ${v.modelo || ''} (${v.matricula || ''})`,
      usuario: userName,
    };
    const vehicle: ScrapyardVehicle = {
      id,
      matricula: '',
      bastidor: '',
      marca: '',
      modelo: '',
      anio: new Date().getFullYear(),
      km: 0,
      combustible: 'diesel',
      tipoProcedencia: 'particular',
      tipoAdquisicion: 'compra',
      propietarioNombre: '',
      fechaEntrada: now.slice(0, 10),
      costeCompra: 0,
      documentos: [],
      documentacionCompleta: false,
      fichaTecnica: false,
      permisoCirculacion: false,
      contratoCompraventa: false,
      certificadoBaja: false,
      estadoBaja: 'pendiente',
      estado: 'recibido',
      fotos: [],
      creadoPor: userId,
      creadoPorNombre: userName,
      fechaCreacion: now,
      ultimaModificacion: now,
      ...v,
      historial: [entry, ...(v.historial || [])],
    };

    setVehicles(prev => [vehicle, ...prev]);
    try {
      await createScrapyardVehicle(userId, vehicle, businessId);
    } catch { /* optimistic */ }
    return vehicle;
  }, [userId, businessId, user]);

  const updateVehicleHandler = useCallback(async (id: string, partial: Partial<ScrapyardVehicle>) => {
    const now = new Date().toISOString();
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...partial, ultimaModificacion: now } : v));
    try {
      await updateScrapyardVehicle(userId, id, { ...partial, ultimaModificacion: now });
    } catch { /* optimistic */ }
  }, [userId]);

  const removeVehicle = useCallback(async (id: string) => {
    setVehicles(prev => prev.filter(v => v.id !== id));
    try {
      await deleteScrapyardVehicle(userId, id);
    } catch { /* optimistic */ }
  }, [userId]);

  const getVehicle = useCallback((id: string) => vehicles.find(v => v.id === id), [vehicles]);

  const alerts = useMemo(() => computeAlerts(vehicles), [vehicles]);

  const value = useMemo<ScrapyardState>(
    () => ({ vehicles, loading, alerts, addVehicle, updateVehicle: updateVehicleHandler, removeVehicle, getVehicle, refresh }),
    [vehicles, loading, alerts, addVehicle, updateVehicleHandler, removeVehicle, getVehicle, refresh],
  );

  return <ScrapyardCtx.Provider value={value}>{children}</ScrapyardCtx.Provider>;
}
