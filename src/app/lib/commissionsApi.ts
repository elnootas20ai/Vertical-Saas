import { v4 as uuidv4 } from 'uuid';
import type { SaleRecord } from './salesTypes';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export type CommissionRuleType =
  | 'fixed'             // Importe fijo por venta
  | 'percent_sale'      // % sobre precio de venta
  | 'percent_margin'    // % sobre margen bruto (pvp - coste)
  | 'tiered_percent';   // % escalonado según tramos de precio

export interface CommissionTier {
  minAmount: number;
  maxAmount?: number;
  rate: number;
}

export interface CommissionRule {
  _id: string;
  _rev?: string;
  id: string;
  type: 'commission_rule';
  user_id: string;
  name: string;
  description?: string;
  ruleType: CommissionRuleType;
  fixedAmount?: number;
  percentRate?: number;
  tiers?: CommissionTier[];
  applicableTo?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRecord {
  _id: string;
  _rev?: string;
  id: string;
  type: 'commission_record';
  user_id: string;
  saleId: string;
  vehicleName: string;
  vehiclePlate: string;
  clientName: string;
  saleDate: string;
  salePrice: number;
  purchasePrice: number;
  grossMargin: number;
  agentId: string;
  agentName: string;
  ruleId: string;
  ruleName: string;
  commissionAmount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  paidAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateCommissionRulePayload = Omit<
  CommissionRule,
  '_id' | '_rev' | 'id' | 'type' | 'createdAt' | 'updatedAt'
>;

// ── Commission calculation ────────────────────────────────────────────────────

export function calculateCommission(rule: CommissionRule, salePrice: number, purchasePrice: number): number {
  const margin = Math.max(0, salePrice - purchasePrice);

  switch (rule.ruleType) {
    case 'fixed':
      return rule.fixedAmount ?? 0;

    case 'percent_sale':
      return salePrice * ((rule.percentRate ?? 0) / 100);

    case 'percent_margin':
      return margin * ((rule.percentRate ?? 0) / 100);

    case 'tiered_percent': {
      if (!rule.tiers || rule.tiers.length === 0) return 0;
      const sorted = [...rule.tiers].sort((a, b) => a.minAmount - b.minAmount);
      let rate = 0;
      for (const tier of sorted) {
        if (salePrice >= tier.minAmount && (tier.maxAmount === undefined || salePrice < tier.maxAmount)) {
          rate = tier.rate;
          break;
        }
      }
      return salePrice * (rate / 100);
    }

    default:
      return 0;
  }
}

export function buildCommissionRecord(params: {
  userId: string;
  sale: SaleRecord;
  agentId: string;
  agentName: string;
  rule: CommissionRule;
  vehicleName?: string;
  vehiclePlate?: string;
  clientName?: string;
}): CommissionRecord {
  const { userId, sale, agentId, agentName, rule } = params;
  const salePrice = sale.totalPrice ?? 0;
  const purchasePrice = sale.purchasePrice ?? 0;
  const commissionAmount = calculateCommission(rule, salePrice, purchasePrice);
  const now = new Date().toISOString();
  const id = `commission-${uuidv4()}`;

  return {
    _id: id,
    id,
    type: 'commission_record',
    user_id: userId,
    saleId: sale.id,
    vehicleName: params.vehicleName ?? sale.vehicleId,
    vehiclePlate: params.vehiclePlate ?? '',
    clientName: params.clientName ?? sale.clientId,
    saleDate: sale.createdAt ?? now,
    salePrice,
    purchasePrice,
    grossMargin: Math.max(0, salePrice - purchasePrice),
    agentId,
    agentName,
    ruleId: rule.id,
    ruleName: rule.name,
    commissionAmount: Math.round(commissionAmount * 100) / 100,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export interface CommissionSummary {
  agentId: string;
  agentName: string;
  totalSales: number;
  totalRevenue: number;
  totalMargin: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  commissions: CommissionRecord[];
}

export function buildCommissionSummaries(commissions: CommissionRecord[]): CommissionSummary[] {
  const grouped = commissions.reduce<Record<string, CommissionRecord[]>>((acc, c) => {
    if (!acc[c.agentId]) acc[c.agentId] = [];
    acc[c.agentId].push(c);
    return acc;
  }, {});

  return Object.entries(grouped).map(([agentId, records]) => ({
    agentId,
    agentName: records[0].agentName,
    totalSales: records.length,
    totalRevenue: records.reduce((s, r) => s + r.salePrice, 0),
    totalMargin: records.reduce((s, r) => s + r.grossMargin, 0),
    totalCommission: records.reduce((s, r) => s + r.commissionAmount, 0),
    pendingCommission: records
      .filter((r) => r.status === 'pending' || r.status === 'approved')
      .reduce((s, r) => s + r.commissionAmount, 0),
    paidCommission: records
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.commissionAmount, 0),
    commissions: records.sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
  }));
}

// ── Default rules ─────────────────────────────────────────────────────────────

export function buildDefaultRules(userId: string): CommissionRule[] {
  const now = new Date().toISOString();
  return [
    {
      _id: `commission-rule-${uuidv4()}`,
      id: `commission-rule-${uuidv4()}`,
      type: 'commission_rule',
      user_id: userId,
      name: 'Comisión estándar (3% venta)',
      description: 'Comisión del 3% sobre el precio final de venta',
      ruleType: 'percent_sale',
      percentRate: 3,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: `commission-rule-${uuidv4()}`,
      id: `commission-rule-${uuidv4()}`,
      type: 'commission_rule',
      user_id: userId,
      name: 'Comisión por margen (10%)',
      description: 'Comisión del 10% sobre el margen bruto de la operación',
      ruleType: 'percent_margin',
      percentRate: 10,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: `commission-rule-${uuidv4()}`,
      id: `commission-rule-${uuidv4()}`,
      type: 'commission_rule',
      user_id: userId,
      name: 'Comisión fija (200 €)',
      description: 'Importe fijo de 200 € por venta cerrada',
      ruleType: 'fixed',
      fixedAmount: 200,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: `commission-rule-${uuidv4()}`,
      id: `commission-rule-${uuidv4()}`,
      type: 'commission_rule',
      user_id: userId,
      name: 'Escalada por precio',
      description: '1% hasta 10.000€ · 2% de 10.000 a 30.000€ · 3% más de 30.000€',
      ruleType: 'tiered_percent',
      tiers: [
        { minAmount: 0, maxAmount: 10000, rate: 1 },
        { minAmount: 10000, maxAmount: 30000, rate: 2 },
        { minAmount: 30000, rate: 3 },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// ── CouchDB persistence ───────────────────────────────────────────────────────

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('udar_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

const RULES_DB = (env.VITE_COUCHDB_DB || 'udar') + '-commission-rules';
const COMMISSIONS_DB = (env.VITE_COUCHDB_DB || 'udar') + '-commissions';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en comisiones');
  return data;
}

async function ensureDb(name: string) {
  await req(`/api/couch/db/${encodeURIComponent(name)}`, { method: 'PUT' });
}

// Commission Rules

export async function listCommissionRules(userId: string): Promise<CommissionRule[]> {
  await ensureDb(RULES_DB);
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(RULES_DB)}`);
  return ((payload.docs || []) as CommissionRule[])
    .filter((d) => d?.type === 'commission_rule' && d?.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveCommissionRule(rule: CommissionRule): Promise<CommissionRule> {
  await ensureDb(RULES_DB);
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(RULES_DB)}/${encodeURIComponent(rule._id)}`,
    { method: 'PUT', body: JSON.stringify(rule) },
  );
  return { ...rule, _rev: result.rev };
}

export async function createCommissionRule(
  payload: CreateCommissionRulePayload,
): Promise<CommissionRule> {
  const id = `commission-rule-${uuidv4()}`;
  const now = new Date().toISOString();
  const rule: CommissionRule = {
    ...payload,
    _id: id,
    id,
    type: 'commission_rule',
    createdAt: now,
    updatedAt: now,
  };
  return saveCommissionRule(rule);
}

export async function deleteCommissionRule(ruleId: string): Promise<void> {
  await ensureDb(RULES_DB);
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(RULES_DB)}`);
  const doc = (payload.docs as CommissionRule[]).find((d) => d._id === ruleId);
  if (!doc) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(RULES_DB)}/${encodeURIComponent(ruleId)}?rev=${doc._rev}`,
    { method: 'DELETE' },
  );
}

// Commission Records

export async function listCommissions(userId: string): Promise<CommissionRecord[]> {
  await ensureDb(COMMISSIONS_DB);
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(COMMISSIONS_DB)}`);
  return ((payload.docs || []) as CommissionRecord[])
    .filter((d) => d?.type === 'commission_record' && d?.user_id === userId)
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
}

export async function saveCommissionRecord(record: CommissionRecord): Promise<CommissionRecord> {
  await ensureDb(COMMISSIONS_DB);
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(COMMISSIONS_DB)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(record) },
  );
  return { ...record, _rev: result.rev };
}

export async function updateCommissionStatus(
  record: CommissionRecord,
  status: CommissionRecord['status'],
): Promise<CommissionRecord> {
  const updated: CommissionRecord = {
    ...record,
    status,
    paidAt: status === 'paid' ? new Date().toISOString() : record.paidAt,
    updatedAt: new Date().toISOString(),
  };
  return saveCommissionRecord(updated);
}
