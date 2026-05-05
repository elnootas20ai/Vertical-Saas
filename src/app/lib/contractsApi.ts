import { v4 as uuidv4 } from 'uuid';
import { createClientInvoiceRequest } from './clientInvoicesApi';
import { getAuthHeaders } from './authApi';

interface CouchEnvelope {
  error?: string;
  details?: { reason?: string; error?: string };
  docs?: unknown[];
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

export type ContractType = 'venta' | 'reserva' | 'compra';
export type ContractStatus = 'draft' | 'signed' | 'cancelled';

export interface ContractRecord {
  _id: string;
  _rev?: string;
  type: 'contract';
  id: string;
  user_id: string;
  contractType: ContractType;
  clientId: string;
  clientName: string;
  clientDni: string;
  clientPhone: string;
  clientEmail: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  price: number;
  paymentMethod: string;
  notes: string;
  templateId: string;
  renderedHtml: string;
  invoiceId?: string;
  signatureData?: string;
  signedAt?: string;
  signedBy?: string;
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
  responsible: string;
  companyName: string;
  companyCif: string;
  companyAddress: string;
}

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;

  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';

  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');

  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';

  return `${protocol}://${host}:${port}`;
}

function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCouchHeaders() {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as T & CouchEnvelope;

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.details?.reason ||
        payload?.details?.error ||
        'Error guardando contrato en CouchDB',
    );
  }

  return payload;
}

async function ensureDatabase(dbName: string) {
  await request(`/api/couch/db/${encodeURIComponent(dbName)}`, { method: 'PUT' });
}

export const CONTRACTS_DB_NAME = normalizeDbName(
  env.VITE_CONTRACTS_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-contracts`,
);

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  if (!value) return '';
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

export function buildInvoiceNumber(date: string) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `FAC-${year}-${month}${day}-${rand}`;
}

export type CreateContractPayload = Omit<
  ContractRecord,
  '_id' | '_rev' | 'id' | 'type' | 'createdAt' | 'updatedAt' | 'invoiceId'
>;

export async function signContractInCouch(
  contractId: string,
  signatureData: string,
  signedBy: string,
): Promise<ContractRecord> {
  await ensureDatabase(CONTRACTS_DB_NAME);
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(CONTRACTS_DB_NAME)}`,
  );
  const existing = (payload.docs || []).find(
    (d): d is ContractRecord =>
      !!d && typeof d === 'object' && (d as ContractRecord)._id === contractId,
  );
  if (!existing) throw new Error('Contrato no encontrado');

  const updated: ContractRecord = {
    ...existing,
    signatureData,
    signedBy,
    signedAt: new Date().toISOString(),
    status: 'signed',
    updatedAt: new Date().toISOString(),
  };

  const result = await request<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(CONTRACTS_DB_NAME)}/${encodeURIComponent(contractId)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );

  return { ...updated, _rev: result.rev };
}

export async function createContractInCouch(
  payload: CreateContractPayload,
): Promise<ContractRecord> {
  await ensureDatabase(CONTRACTS_DB_NAME);

  const now = new Date().toISOString();
  const id = `contract-${uuidv4()}`;

  const document: ContractRecord = {
    _id: id,
    id,
    type: 'contract',
    ...payload,
    user_id: normalizeUserId(payload.user_id),
    createdAt: now,
    updatedAt: now,
  };

  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(CONTRACTS_DB_NAME)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(document) },
  );

  return { ...document, _rev: result.rev };
}

export async function listContractsRequest(userId: string): Promise<ContractRecord[]> {
  const normalizedUserId = normalizeUserId(userId);
  await ensureDatabase(CONTRACTS_DB_NAME);
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(CONTRACTS_DB_NAME)}`,
  );

  return (payload.docs || [])
    .filter(
      (d): d is ContractRecord =>
        !!d &&
        typeof d === 'object' &&
        (d as ContractRecord).type === 'contract' &&
        normalizeUserId((d as ContractRecord).user_id) === normalizedUserId,
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export interface SaveContractAndInvoiceParams {
  userId: string;
  contractPayload: CreateContractPayload;
}

export async function saveContractAndGenerateInvoice(params: SaveContractAndInvoiceParams) {
  const { userId, contractPayload } = params;
  const normalizedUserId = normalizeUserId(userId);

  const contract = await createContractInCouch({
    ...contractPayload,
    user_id: normalizeUserId(contractPayload.user_id || normalizedUserId),
  });

  const invoiceDate = contract.createdAt;
  const dueDate = invoiceDate;

  const invoice = await createClientInvoiceRequest(normalizedUserId, {
    clientId: contract.clientId,
    clientName: contract.clientName,
    number: buildInvoiceNumber(invoiceDate),
    vehicleName: contract.vehicleName,
    vehiclePlate: contract.vehiclePlate,
    date: invoiceDate,
    dueDate,
    total: contract.price,
    paid: contract.contractType === 'venta' ? contract.price : 0,
    status: contract.contractType === 'venta' ? 'paid' : 'pending',
    paymentMethod: contract.paymentMethod,
    notes: `Generada automáticamente al crear contrato de ${
      contract.contractType === 'venta'
        ? 'compraventa'
        : contract.contractType === 'reserva'
          ? 'reserva'
          : 'compra'
    } — ${contract.vehicleName} (${contract.vehiclePlate})`,
  });

  return { contract, invoice };
}

export function renderTemplateHtml(
  html: string,
  vars: Record<string, string>,
): string {
  return html.replace(/\{\{[^}]+\}\}/g, (match) => vars[match] ?? match);
}

export function buildTemplateVars(params: {
  companyName: string;
  companyCif: string;
  companyAddress: string;
  clientName: string;
  clientDni: string;
  clientPhone: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  price: number;
  responsible: string;
  date?: string;
}): Record<string, string> {
  const date = params.date ? new Date(params.date) : new Date();
  const formattedDate = date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return {
    '{{empresa.nombre}}': params.companyName || 'Sin especificar',
    '{{empresa.cif}}': params.companyCif || 'Sin especificar',
    '{{empresa.direccion}}': params.companyAddress || 'Sin especificar',
    '{{cliente.nombre}}': params.clientName,
    '{{cliente.dni}}': params.clientDni || 'Sin especificar',
    '{{cliente.telefono}}': params.clientPhone,
    '{{vehiculo.marca}}': params.vehicleBrand,
    '{{vehiculo.modelo}}': params.vehicleModel,
    '{{vehiculo.matricula}}': params.vehiclePlate || 'Sin matrícula',
    '{{venta.fecha}}': formattedDate,
    '{{venta.precio}}': `${params.price.toLocaleString('es-ES')} €`,
    '{{venta.responsable}}': params.responsible || 'Sin asignar',
  };
}
