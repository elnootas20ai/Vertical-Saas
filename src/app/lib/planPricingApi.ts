import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

import { VERTIAL_PLANS, vertialPlanToPricingFeatures } from './planCatalog';

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

export const DEFAULT_PLANS: PlanDefinition[] = VERTIAL_PLANS.map((plan, index) => ({
  id: plan.id,
  name: plan.displayName,
  monthlyPrice: plan.priceMonthly,
  features: vertialPlanToPricingFeatures(plan),
  highlight: plan.id === 'normal',
  badge: plan.id === 'normal' ? 'Más popular' : undefined,
  order: index,
}));

export const DEFAULT_ANNUAL_DISCOUNT = 0.20;

const CONFIG_DOC_ID = 'plan-pricing-config';

// ── HTTP helpers ──────────────────────────────────────────────────────────────


function getCouchHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
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
  await ensureCouchDb(CONFIG_DB, () => req(`/api/couch/db/${encodeURIComponent(CONFIG_DB)}`, { method: 'PUT' }));
}

function mergePlansWithCatalogDefaults(plans: PlanDefinition[]): PlanDefinition[] {
  return (plans || []).map((plan) => {
    const def = DEFAULT_PLANS.find((d) => d.id === plan.id);
    if (!def) return plan;
    // Catálogo = fuente de verdad de cupos/textos (evita Couch con «2 PDV» de la oferta vieja).
    return {
      ...plan,
      name: def.name,
      features: def.features,
      badge: plan.badge ?? def.badge,
      highlight: plan.highlight ?? def.highlight,
      order: Number.isFinite(plan.order) ? plan.order : def.order,
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getPlanPricingConfig(): Promise<PlanPricingConfig> {
  await ensureDb();
  try {
    const doc = await req<PlanPricingConfig>(
      `/api/couch/doc/${encodeURIComponent(CONFIG_DB)}/${encodeURIComponent(CONFIG_DOC_ID)}`,
    );
    if (doc && doc.type === 'plan_pricing_config' && Array.isArray(doc.plans)) {
      return {
        ...doc,
        plans: mergePlansWithCatalogDefaults(doc.plans),
      };
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
