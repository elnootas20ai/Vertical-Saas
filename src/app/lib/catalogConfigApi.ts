import { getAuthHeaders } from './authApi';
import type { BusinessType } from './businessApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CatalogFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'boolean' | 'image' | 'relation';
  required: boolean;
  options?: string[];
  default?: unknown;
}

export interface VerticalCatalogConfig {
  itemLabel: string;
  itemLabelPlural: string;
  categories: string[];
  units: { value: string; label: string }[];
  fields: CatalogFieldDef[];
  features: {
    allergens: boolean;
    stock: boolean;
    supplier: boolean;
    webStore: boolean;
    salesPoints: boolean;
  };
  customFields: CatalogFieldDef[];
}

interface CatalogConfigEnvelope {
  ok: boolean;
  error?: string;
  businessType: string;
  config: VerticalCatalogConfig;
}

// ─── Cache in-memory ────────────────────────────────────────────────────────

const configCache = new Map<string, { config: VerticalCatalogConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// ─── API ────────────────────────────────────────────────────────────────────

export async function fetchCatalogConfig(businessType: BusinessType | string): Promise<VerticalCatalogConfig> {
  const key = businessType || 'default';
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  const response = await fetch(`${API_BASE}/api/catalog-config/${encodeURIComponent(key)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as CatalogConfigEnvelope;
  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || 'Error al obtener configuración de catálogo');
  }

  configCache.set(key, { config: payload.config, ts: Date.now() });
  return payload.config;
}

export function invalidateCatalogConfigCache(businessType?: string) {
  if (businessType) {
    configCache.delete(businessType);
  } else {
    configCache.clear();
  }
}
