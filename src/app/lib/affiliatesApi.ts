import { authFetch } from './authApi';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AffiliateStatus = 'pending' | 'accepted' | 'rejected';
export type CommissionStatus = 'pending' | 'paid' | 'cancelled';
export type ContactType = 'lead' | 'client' | 'prospect';
export type FollowUpType = 'call' | 'email' | 'meeting' | 'note' | 'whatsapp';

export interface Affiliate {
  _id: string;
  id?: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  company?: string;
  website?: string;
  verticals?: string[];
  affiliateCode: string;
  referralCode?: string;
  status: AffiliateStatus;
  commissionRate: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferredAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  createdAt: string;
}

export interface AffiliateContact {
  _id: string;
  id?: string;
  user_id: string;
  affiliateId: string;
  affiliateName: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  contactType: ContactType;
  company?: string;
  notes?: string;
  verticals?: string[];
  signedSaas: boolean;
  emailSent?: boolean;
  emailSentAt?: string;
  emailOpened?: boolean;
  emailOpenedAt?: string;
  cardAdded?: boolean;
  cardAddedAt?: string;
  isPaying?: boolean;
  payingStartedAt?: string;
  monthlyAmount?: number;
  commissionPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateFollowUp {
  _id: string;
  id?: string;
  user_id: string;
  affiliateId: string;
  affiliateName: string;
  followUpType: FollowUpType;
  type: FollowUpType;
  title: string;
  content: string;
  date: string;
  createdAt: string;
}

export interface AffiliateCommission {
  _id: string;
  id?: string;
  user_id: string;
  affiliateId: string;
  affiliateName: string;
  contactId?: string;
  contactName?: string;
  description: string;
  amount: number;
  status: CommissionStatus;
  paidAt?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateSummary {
  affiliate: Affiliate;
  contactCount: number;
  signedCount: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

// ── API helpers ────────────────────────────────────────────────────────────────

const BASE = '/api/affiliate';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Error de API');
  return data;
}

function getId(doc: { _id?: string; id?: string }): string {
  return doc._id || doc.id || '';
}

// ── Admin: Affiliates ──────────────────────────────────────────────────────────

export async function listAffiliates(userId: string): Promise<Affiliate[]> {
  const data = await apiRequest<{ affiliates: Affiliate[] }>(`${BASE}/admin/${userId}/affiliates`);
  return data.affiliates;
}

export async function createAffiliate(userId: string, body: Record<string, unknown>): Promise<Affiliate> {
  const data = await apiRequest<{ affiliate: Affiliate }>(`${BASE}/admin/${userId}/affiliates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.affiliate;
}

export async function saveAffiliate(userId: string, affiliateId: string, body: Record<string, unknown>): Promise<Affiliate> {
  const data = await apiRequest<{ affiliate: Affiliate }>(`${BASE}/admin/${userId}/affiliates/${affiliateId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return data.affiliate;
}

export async function updateAffiliateStatus(userId: string, affiliateId: string, status: AffiliateStatus): Promise<Affiliate> {
  const data = await apiRequest<{ affiliate: Affiliate }>(`${BASE}/admin/${userId}/affiliates/${affiliateId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.affiliate;
}

export async function deleteAffiliate(userId: string, affiliateId: string): Promise<void> {
  await apiRequest(`${BASE}/admin/${userId}/affiliates/${affiliateId}`, { method: 'DELETE' });
}

// ── Admin: Contacts ────────────────────────────────────────────────────────────

export async function listContacts(userId: string): Promise<AffiliateContact[]> {
  const data = await apiRequest<{ contacts: AffiliateContact[] }>(`${BASE}/admin/${userId}/contacts`);
  return data.contacts;
}

export async function createContact(userId: string, body: Record<string, unknown>): Promise<AffiliateContact> {
  const data = await apiRequest<{ contact: AffiliateContact }>(`${BASE}/admin/${userId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.contact;
}

export async function saveContact(userId: string, contactId: string, body: Record<string, unknown>): Promise<AffiliateContact> {
  const data = await apiRequest<{ contact: AffiliateContact }>(`${BASE}/admin/${userId}/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return data.contact;
}

export async function deleteContact(userId: string, contactId: string): Promise<void> {
  await apiRequest(`${BASE}/admin/${userId}/contacts/${contactId}`, { method: 'DELETE' });
}

// ── Admin: Follow-ups ──────────────────────────────────────────────────────────

export async function listFollowUps(userId: string): Promise<AffiliateFollowUp[]> {
  const data = await apiRequest<{ followUps: AffiliateFollowUp[] }>(`${BASE}/admin/${userId}/followups`);
  return data.followUps;
}

export async function createFollowUp(userId: string, body: Record<string, unknown>): Promise<AffiliateFollowUp> {
  const data = await apiRequest<{ followUp: AffiliateFollowUp }>(`${BASE}/admin/${userId}/followups`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.followUp;
}

export async function deleteFollowUp(userId: string, followUpId: string): Promise<void> {
  await apiRequest(`${BASE}/admin/${userId}/followups/${followUpId}`, { method: 'DELETE' });
}

// ── Admin: Commissions ─────────────────────────────────────────────────────────

export async function listAffiliateCommissions(userId: string): Promise<AffiliateCommission[]> {
  const data = await apiRequest<{ commissions: AffiliateCommission[] }>(`${BASE}/admin/${userId}/commissions`);
  return data.commissions;
}

export async function createAffiliateCommission(userId: string, body: Record<string, unknown>): Promise<AffiliateCommission> {
  const data = await apiRequest<{ commission: AffiliateCommission }>(`${BASE}/admin/${userId}/commissions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.commission;
}

export async function updateCommissionStatus(userId: string, commissionId: string, status: CommissionStatus): Promise<AffiliateCommission> {
  const data = await apiRequest<{ commission: AffiliateCommission }>(`${BASE}/admin/${userId}/commissions/${commissionId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.commission;
}

export async function deleteAffiliateCommission(userId: string, commissionId: string): Promise<void> {
  await apiRequest(`${BASE}/admin/${userId}/commissions/${commissionId}`, { method: 'DELETE' });
}

// ── Portal (public, for affiliates) ────────────────────────────────────────────

export async function portalLogin(code: string) {
  const res = await fetch(`${BASE}/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export async function portalDashboard(code: string) {
  const res = await fetch(`${BASE}/portal/${code}/dashboard`);
  return res.json();
}

export async function portalRegisterClient(code: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/portal/${code}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function portalReferredAccounts(code: string): Promise<ReferredAccount[]> {
  const res = await fetch(`${BASE}/portal/${code}/referred`);
  const data = await res.json();
  return data.ok ? (data.referredAccounts || []) : [];
}

// ── Public: validate referral code ────────────────────────────────────────────

export async function validateReferralCode(code: string): Promise<{ valid: boolean; affiliateName?: string; affiliateCompany?: string }> {
  const res = await fetch(`${BASE}/referral/${encodeURIComponent(code)}/validate`);
  const data = await res.json();
  if (!data.ok) return { valid: false };
  return { valid: data.valid, affiliateName: data.affiliateName, affiliateCompany: data.affiliateCompany };
}

// ── Aggregated stats ──────────────────────────────────────────────────────────

export function buildAffiliateSummaries(
  affiliates: Affiliate[],
  contacts: AffiliateContact[],
  commissions: AffiliateCommission[]
): AffiliateSummary[] {
  return affiliates.map((aff) => {
    const affId = getId(aff);
    const affContacts = contacts.filter((c) => (getId(c) ? c.affiliateId === affId : false) || c.affiliateId === affId);
    const affCommissions = commissions.filter((c) => c.affiliateId === affId);
    return {
      affiliate: aff,
      contactCount: affContacts.length,
      signedCount: affContacts.filter((c) => c.signedSaas).length,
      totalCommission: affCommissions.reduce((s, c) => s + c.amount, 0),
      pendingCommission: affCommissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0),
      paidCommission: affCommissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0),
    };
  });
}
