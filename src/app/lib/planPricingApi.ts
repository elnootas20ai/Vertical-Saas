import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanDefinition {
  id: string;
  name: string;
  monthlyPrice: number;
  features: PlanFeature[];
  highlight: boolean;
  badge?: string;
  order: number;
}

export interface PlanPricingConfig {
  _id: string;
  _rev?: string;
  type: 'plan_pricing_config';
  plans: PlanDefinition[];
  annualDiscount: number;
  updatedAt: string;
  updatedBy: string;
}

// ── Defaults (match current hardcoded values) ─────────────────────────────────

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    id: 'basic',
    name: 'Básico',
    monthlyPrice: 49,
    features: [
      { text: 'Hasta 3 usuarios', included: true },
      { text: '1 ubicación', included: true },
      { text: 'Stock hasta 50 vehículos', included: true },
      { text: 'Documentos básicos', included: true },
      { text: 'API completa', included: false },
      { text: 'Gestor dedicado', included: false },
    ],
    highlight: false,
    order: 0,
  },
  {
    id: 'normal',
    name: 'Normal',
    monthlyPrice: 149,
    features: [
      { text: 'Hasta 10 usuarios', included: true },
      { text: 'Hasta 3 ubicaciones', included: true },
      { text: 'Stock ilimitado', included: true },
      { text: 'Todos los módulos', included: true },
      { text: 'API completa', included: false },
      { text: 'Gestor dedicado', included: false },
    ],
    highlight: true,
    badge: 'Más popular',
    order: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 349,
    features: [
      { text: 'Usuarios ilimitados', included: true },
      { text: 'Hasta 10 ubicaciones', included: true },
      { text: 'Stock ilimitado', included: true },
      { text: 'Todos los módulos', included: true },
      { text: 'API completa', included: true },
      { text: 'Gestor dedicado', included: true },
    ],
    highlight: false,
    order: 2,
  },
];

export const DEFAULT_ANNUAL_DISCOUNT = 0.20;

const CONFIG_DOC_ID = 'plan-pricing-config';

// ── HTTP helpers ──────────────────────────────────────────────────────────────


function getCouchHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en configuración de planes');
  return data;
}

const CONFIG_DB = (env.VITE_COUCHDB_DB || 'vertial') + '-config';

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(CONFIG_DB)}`, { method: 'PUT' });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getPlanPricingConfig(): Promise<PlanPricingConfig> {
  await ensureDb();
  try {
    const doc = await req<PlanPricingConfig>(
      `/api/couch/doc/${encodeURIComponent(CONFIG_DB)}/${encodeURIComponent(CONFIG_DOC_ID)}`,
    );
    if (doc && doc.type === 'plan_pricing_config' && Array.isArray(doc.plans)) {
      return doc;
    }
  } catch {
    // doc doesn't exist yet
  }
  return {
    _id: CONFIG_DOC_ID,
    type: 'plan_pricing_config',
    plans: DEFAULT_PLANS,
    annualDiscount: DEFAULT_ANNUAL_DISCOUNT,
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export async function savePlanPricingConfig(
  config: PlanPricingConfig,
  userId: string,
): Promise<PlanPricingConfig> {
  await ensureDb();
  const toSave: PlanPricingConfig = {
    ...config,
    _id: CONFIG_DOC_ID,
    type: 'plan_pricing_config',
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(CONFIG_DB)}/${encodeURIComponent(CONFIG_DOC_ID)}`,
    { method: 'PUT', body: JSON.stringify(toSave) },
  );
  return { ...toSave, _rev: result.rev };
}
