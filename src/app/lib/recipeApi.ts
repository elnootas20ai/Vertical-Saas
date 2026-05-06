import { getAuthHeaders } from './authApi';
import type { StockCategory } from './deliveryApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en recipe API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecipeIngredientSubstitute {
  catalogItemId: string;
  catalogItemName: string;
  conversionFactor: number;
}

export interface RecipeIngredient {
  catalogItemId: string;
  catalogItemName: string;
  quantity: number;
  unit: string;
  wastePercent: number;
  netQuantity: number;
  costPerUnit: number;
  totalCost: number;
  stockCategory: StockCategory;
  optional: boolean;
  substitutes: RecipeIngredientSubstitute[];
}

export interface Recipe {
  _id: string;
  _rev?: string;
  type: 'recipe';
  id: string;
  user_id: string;
  name: string;
  catalogItemId: string;
  catalogItemName: string;
  category: string;
  portions: number;
  active: boolean;
  ingredients: RecipeIngredient[];
  totalCost: number;
  costPerPortion: number;
  notes: string;
  preparationTime: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StockCheckIngredient {
  catalogItemId: string;
  name: string;
  required: number;
  available: number;
  sufficient: boolean;
  shortage: number;
  optional?: boolean;
  unit?: string;
}

export interface StockCheckDetail {
  catalogItemId: string;
  catalogItemName: string;
  hasRecipe: boolean;
  recipeId?: string;
  recipeName?: string;
  maxProducible?: number;
  ingredients: StockCheckIngredient[];
}

export interface StockCheckResult {
  ok: boolean;
  canFulfill: boolean;
  details: StockCheckDetail[];
}

export interface RecalculateCostsResult {
  ok: boolean;
  updated: number;
  total: number;
}

// ─── Recipe API ───────────────────────────────────────────────────────────────

export async function listRecipesRequest(
  userId: string,
  filters?: { category?: string; active?: boolean; catalogItemId?: string },
): Promise<Recipe[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.active !== undefined) params.set('active', String(filters.active));
  if (filters?.catalogItemId) params.set('catalogItemId', filters.catalogItemId);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; recipes: Recipe[] }>(
    `/api/recipes/${encodeURIComponent(id)}${qs}`,
  );
  return payload.recipes || [];
}

export async function getRecipeRequest(userId: string, recipeId: string): Promise<Recipe> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; recipe: Recipe }>(
    `/api/recipes/${encodeURIComponent(id)}/${encodeURIComponent(recipeId)}`,
  );
  if (!result.recipe) throw new Error('Respuesta invalida del servidor');
  return result.recipe;
}

export async function createRecipeRequest(userId: string, data: Partial<Recipe>): Promise<Recipe> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; recipe: Recipe }>(
    `/api/recipes/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ recipe: data }) },
  );
  if (!result.recipe) throw new Error('Respuesta invalida del servidor');
  return result.recipe;
}

export async function updateRecipeRequest(userId: string, recipe: Partial<Recipe> & { _id: string }): Promise<Recipe> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; recipe: Recipe }>(
    `/api/recipes/${encodeURIComponent(id)}/${encodeURIComponent(recipe._id)}`,
    { method: 'PUT', body: JSON.stringify({ recipe }) },
  );
  if (!result.recipe) throw new Error('Respuesta invalida del servidor');
  return result.recipe;
}

export async function deleteRecipeRequest(userId: string, recipeId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/recipes/${encodeURIComponent(id)}/${encodeURIComponent(recipeId)}`,
    { method: 'DELETE' },
  );
}

export async function duplicateRecipeRequest(userId: string, recipeId: string): Promise<Recipe> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; recipe: Recipe }>(
    `/api/recipes/${encodeURIComponent(id)}/${encodeURIComponent(recipeId)}/duplicate`,
    { method: 'POST' },
  );
  if (!result.recipe) throw new Error('Respuesta invalida del servidor');
  return result.recipe;
}

export async function getRecipesByProductRequest(userId: string, catalogItemId: string): Promise<Recipe[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; recipes: Recipe[] }>(
    `/api/recipes/${encodeURIComponent(id)}/by-product/${encodeURIComponent(catalogItemId)}`,
  );
  return payload.recipes || [];
}

export async function recalculateCostsRequest(userId: string): Promise<RecalculateCostsResult> {
  const id = normalizeUserId(userId);
  return request<RecalculateCostsResult>(
    `/api/recipes/${encodeURIComponent(id)}/recalculate-costs`,
    { method: 'POST' },
  );
}

export async function checkRecipeStockRequest(
  userId: string,
  items: { catalogItemId: string; quantity: number }[],
): Promise<StockCheckResult> {
  const id = normalizeUserId(userId);
  return request<StockCheckResult>(
    `/api/recipes/${encodeURIComponent(id)}/check-stock`,
    { method: 'POST', body: JSON.stringify({ items }) },
  );
}
