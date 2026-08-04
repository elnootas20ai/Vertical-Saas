import type { OcrData, CompraventaDocCategory } from './documentsApi';

/** Mapeo OCR → subcategoría de expediente compraventa. */
export const OCR_TYPE_TO_SUB_CATEGORY: Record<string, CompraventaDocCategory> = {
  permiso_circulacion: 'permiso_circulacion',
  ficha_tecnica: 'ficha_tecnica',
  contrato_compra: 'contrato_compra',
  contrato_venta: 'contrato_venta',
  factura_compra: 'factura_compra',
  factura_venta: 'factura_venta',
  itv: 'itv',
  seguro: 'seguro',
  reparacion: 'reparacion',
  doc_cliente: 'doc_cliente',
  documento_cliente: 'doc_cliente',
  informe_trafico: 'informe_trafico',
  factura_proveedor: 'factura_compra',
  factura_cliente: 'factura_venta',
  contrato_comercial: 'contrato_venta',
};

export type OcrVehicleRef = {
  id: string;
  brand?: string;
  model?: string;
  registrationPlate?: string;
  vin?: string;
};

export type OcrClientRef = {
  id: string;
  name?: string;
  nif?: string;
  dni?: string;
};

export function normalizePlateOrVin(value?: string | null): string {
  return String(value || '')
    .replace(/[\s.-]/g, '')
    .toUpperCase();
}

export function matchVehicleByPlateOrVin(
  vehicles: OcrVehicleRef[],
  plate?: string | null,
  vin?: string | null,
): OcrVehicleRef | null {
  const nPlate = normalizePlateOrVin(plate);
  const nVin = normalizePlateOrVin(vin);
  if (!nPlate && !nVin) return null;
  return (
    vehicles.find((v) => {
      const vPlate = normalizePlateOrVin(v.registrationPlate);
      const vVin = normalizePlateOrVin(v.vin);
      if (nPlate && vPlate && vPlate === nPlate) return true;
      if (nVin && vVin && vVin === nVin) return true;
      return false;
    }) || null
  );
}

export function matchClientByNif(
  clients: OcrClientRef[],
  nif?: string | null,
): OcrClientRef | null {
  const n = normalizePlateOrVin(nif);
  if (!n) return null;
  return (
    clients.find((c) => {
      const cNif = normalizePlateOrVin(c.nif || c.dni);
      return Boolean(cNif && cNif === n);
    }) || null
  );
}

export function resolveDocSubCategory(ocrData?: OcrData | null): CompraventaDocCategory | undefined {
  const type = String(ocrData?.documentType || '').trim();
  if (!type) return undefined;
  return OCR_TYPE_TO_SUB_CATEGORY[type];
}

/** Campos listos para POST /api/documents (auto-link backend + expediente). */
export function buildOcrDocumentFields(input: {
  name: string;
  ocrData?: OcrData | null;
  vehicleId?: string | null;
  clientId?: string | null;
  vehicles?: OcrVehicleRef[];
  clients?: OcrClientRef[];
  mimeType?: string;
  fileName?: string;
}) {
  const ocrData = input.ocrData || undefined;
  const plate = ocrData?.registrationPlate || undefined;
  const vin = ocrData?.vin || undefined;
  const matchedVehicle =
    (input.vehicleId
      ? input.vehicles?.find((v) => v.id === input.vehicleId) || null
      : null) ||
    matchVehicleByPlateOrVin(input.vehicles || [], plate, vin);

  const nifHint = ocrData?.ownerNif || ocrData?.buyerNif || ocrData?.sellerNif || undefined;
  const matchedClient =
    (input.clientId
      ? input.clients?.find((c) => c.id === input.clientId) || null
      : null) || matchClientByNif(input.clients || [], nifHint);

  const vehicleId = matchedVehicle?.id || input.vehicleId || undefined;
  const vehicleName = matchedVehicle
    ? `${matchedVehicle.brand || ''} ${matchedVehicle.model || ''}`.trim()
    : undefined;
  const clientId = matchedClient?.id || input.clientId || undefined;
  const clientName = matchedClient?.name || undefined;
  const docSubCategory = resolveDocSubCategory(ocrData);

  return {
    name: input.name,
    docType: ocrData?.documentType || 'other',
    status: 'pending' as const,
    ocrData,
    mimeType: input.mimeType,
    fileName: input.fileName,
    docSubCategory,
    registrationPlate: matchedVehicle?.registrationPlate || plate || undefined,
    vin: matchedVehicle?.vin || vin || undefined,
    itvExpiryDate: docSubCategory === 'itv' ? ocrData?.expiryDate || undefined : undefined,
    ocrConfidence: ocrData?.confidence ?? undefined,
    vehicleId,
    vehicleName: vehicleName || undefined,
    clientId,
    clientName,
    relatedTo: vehicleId ? 'vehicle' : clientId ? 'client' : undefined,
    relatedToId: vehicleId || clientId || undefined,
  };
}
