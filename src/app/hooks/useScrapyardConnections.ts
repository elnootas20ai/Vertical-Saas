import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useScrapyard } from '../context/ScrapyardContext';
import type { ScrapyardVehicle, ScrapyardHistoryEntry, ScrapyardVehicleStatus, ScrapyardBajaStatus } from '../lib/scrapyardTypes';

/**
 * Provides cross-module actions that tie the scrapyard vehicle entry
 * to other application modules (finance, documents, parts, deregistrations, locations).
 */
export function useScrapyardConnections() {
  const navigate = useNavigate();
  const { updateVehicle } = useScrapyard();

  const addHistoryEntry = useCallback((
    vehicle: ScrapyardVehicle,
    tipo: ScrapyardHistoryEntry['tipo'],
    descripcion: string,
    usuario: string,
  ): ScrapyardHistoryEntry[] => {
    const entry: ScrapyardHistoryEntry = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      tipo,
      descripcion,
      usuario,
    };
    return [entry, ...vehicle.historial];
  }, []);

  const moveVehicle = useCallback(async (
    vehicle: ScrapyardVehicle,
    newLocation: string,
    userName: string,
  ) => {
    const oldLocation = vehicle.ubicacion || 'Sin asignar';
    const historial = addHistoryEntry(
      vehicle,
      'movimiento',
      `Movido de "${oldLocation}" a "${newLocation}"`,
      userName,
    );
    await updateVehicle(vehicle.id, {
      ubicacion: newLocation,
      historial,
    });
  }, [updateVehicle, addHistoryEntry]);

  const changeStatus = useCallback(async (
    vehicle: ScrapyardVehicle,
    newStatus: ScrapyardVehicleStatus,
    userName: string,
  ) => {
    const historial = addHistoryEntry(vehicle, 'cambio_estado', `Estado cambiado a: ${newStatus}`, userName);
    await updateVehicle(vehicle.id, { estado: newStatus, historial });
  }, [updateVehicle, addHistoryEntry]);

  const initiateBaja = useCallback(async (
    vehicle: ScrapyardVehicle,
    newBajaStatus: ScrapyardBajaStatus,
    userName: string,
  ) => {
    const historial = addHistoryEntry(vehicle, 'baja', `Baja: ${newBajaStatus}`, userName);
    const updates: Partial<ScrapyardVehicle> = {
      estadoBaja: newBajaStatus,
      historial,
    };
    if (newBajaStatus === 'completada') {
      updates.fechaBaja = new Date().toISOString().slice(0, 10);
    }
    await updateVehicle(vehicle.id, updates);
  }, [updateVehicle, addHistoryEntry]);

  const startDisassembly = useCallback(async (
    vehicle: ScrapyardVehicle,
    userName: string,
  ) => {
    const historial = addHistoryEntry(vehicle, 'despiece', 'Despiece iniciado', userName);
    await updateVehicle(vehicle.id, { estado: 'en_despiece', historial });
  }, [updateVehicle, addHistoryEntry]);

  const goToFinance = useCallback(() => navigate('/saas/finance'), [navigate]);
  const goToDocuments = useCallback(() => navigate('/saas/documents'), [navigate]);
  const goToParts = useCallback(() => navigate('/saas/scrapyard-parts'), [navigate]);
  const goToDeregistrations = useCallback(() => navigate('/saas/scrapyard-deregistrations'), [navigate]);
  const goToInventory = useCallback(() => navigate('/saas/scrapyard-inventory'), [navigate]);
  const goToSales = useCallback(() => navigate('/saas/scrapyard-sales'), [navigate]);
  const goToDashboard = useCallback(() => navigate('/saas/vertical/desguaces'), [navigate]);
  const goToVehicleDetail = useCallback((id: string) => navigate(`/saas/scrapyard-vehicles/${id}`), [navigate]);

  return {
    moveVehicle,
    changeStatus,
    initiateBaja,
    startDisassembly,
    addHistoryEntry,
    goToFinance,
    goToDocuments,
    goToParts,
    goToDeregistrations,
    goToInventory,
    goToSales,
    goToDashboard,
    goToVehicleDetail,
  };
}
