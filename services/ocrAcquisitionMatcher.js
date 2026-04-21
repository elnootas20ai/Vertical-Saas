/**
 * OCR Acquisition Matcher
 * Vincula datos extraidos por OCR con vehiculos y adquisiciones existentes.
 */

import {
  VEHICLES_DB,
  ensureDatabase,
  getAllDocuments,
} from './couchdb.js';

const PLATE_REGEX = /\b\d{4}[A-Z]{3}\b|\b[A-Z]{1,2}\d{4}[A-Z]{2,3}\b/i;
const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/;
const NIF_REGEX = /\b\d{8}[A-Z]\b|\b[ABCDEFGHJNPQRSUVW]\d{7}[A-J0-9]\b/i;

const PURPOSE_KEYWORDS = {
  purchase: ['compra', 'adquisicion', 'venta', 'factura de compra', 'precio'],
  transport: ['transporte', 'grua', 'porte', 'envio', 'traslado'],
  gestoria: ['gestoria', 'tramitacion', 'baja', 'transferencia', 'dgt'],
  decontamination: ['descontaminacion', 'contaminacion', 'cat ', 'residuo', 'fluido'],
};

export function detectPurpose(text) {
  const lower = (text || '').toLowerCase();
  for (const [purpose, kws] of Object.entries(PURPOSE_KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw))) return purpose;
  }
  return 'other';
}

export function extractVehicleDataFromOcr(ocrResult) {
  const text = typeof ocrResult === 'string' ? ocrResult : JSON.stringify(ocrResult || '');

  const plateMatch = text.match(PLATE_REGEX);
  const vinMatch = text.match(VIN_REGEX);
  const nifMatch = text.match(NIF_REGEX);

  return {
    registrationPlate: plateMatch ? plateMatch[0].toUpperCase() : null,
    vin: vinMatch ? vinMatch[0].toUpperCase() : null,
    sellerNif: nifMatch ? nifMatch[0].toUpperCase() : null,
    purpose: detectPurpose(text),
  };
}

export async function matchOcrToVehicleAndAcquisition(req, userId, ocrExtracted) {
  const result = {
    vehicle: null,
    acquisition: null,
    costField: null,
  };

  if (!ocrExtracted.registrationPlate && !ocrExtracted.vin) return result;

  await ensureDatabase(req, VEHICLES_DB);
  const allDocs = await getAllDocuments(req, VEHICLES_DB);

  if (ocrExtracted.registrationPlate) {
    result.vehicle = allDocs.find(
      (d) => d.type === 'car' && !d.deletedAt && d.user_id === userId &&
        d.registrationPlate?.toUpperCase() === ocrExtracted.registrationPlate,
    ) || null;
  }

  if (!result.vehicle && ocrExtracted.vin) {
    result.vehicle = allDocs.find(
      (d) => d.type === 'car' && !d.deletedAt && d.user_id === userId &&
        d.vin?.toUpperCase() === ocrExtracted.vin,
    ) || null;
  }

  if (result.vehicle) {
    const openAcquisitions = allDocs.filter(
      (d) => d.type === 'vehicle_acquisition' && !d.deletedAt &&
        d.vehicleId === result.vehicle._id &&
        !['cerrada', 'cancelada'].includes(d.status),
    );
    result.acquisition = openAcquisitions[0] || null;
  }

  const purposeToCostField = {
    purchase: 'costCompra',
    transport: 'costTransporte',
    gestoria: 'costGestoria',
    decontamination: 'costDescontaminacion',
    other: 'costOtros',
  };
  result.costField = purposeToCostField[ocrExtracted.purpose] || 'costOtros';

  return result;
}
