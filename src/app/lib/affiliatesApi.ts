import { authFetch } from './authApi';
import { getApiBase } from './apiBase';
import type { AffiliateKycData, AffiliateKycPortalSnapshot } from './affiliateKyc';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AffiliateStatus = 'pending' | 'accepted' | 'rejected';
export type CommissionStatus = 'pending' | 'paid' | 'cancelled';
export type ContactType = 'lead' | 'client' | 'prospect';
export type FollowUpType = 'call' | 'email' | 'meeting' | 'note' | 'whatsapp';

/** Comisión base estándar del programa de afiliados (%). */
export const DEFAULT_AFFILIATE_COMMISSION_RATE = 20;

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
  message?: string;
  adminNotifiedAt?: string;
  applicantNotifiedAt?: string;
  statusEmailSentAt?: string;
  linkedAccountUserId?: string;
  portalAccessMode?: 'account' | 'code';
  accountLinked?: boolean;
  vertialAccountExists?: boolean;
  vertialAccountUserId?: string | null;
  vertialAccountName?: string | null;
  vertialAccountCompany?: string | null;
  canLinkAccount?: boolean;
  contractAcceptedAt?: string | null;
  contractVersion?: string | null;
  needsContractAcceptance?: boolean;
  kyc?: AffiliateKycData | null;
  kycStatus?: AffiliateKycPortalSnapshot['status'];
  kycSubmittedAt?: string | null;
  kycNeedsReview?: boolean;
  kycDni?: string | null;
  kycLegalName?: string | null;
  kycRejectionReason?: string | null;
  needsKycSubmission?: boolean;
  needsKycApproval?: boolean;
  kycApproved?: boolean;
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

const API_BASE = getApiBase();
const BASE = `${API_BASE}/api/affiliate`;

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

export interface AffiliateRequestCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export async function fetchAffiliateRequestCounts(userId: string): Promise<AffiliateRequestCounts> {
  const data = await apiRequest<AffiliateRequestCounts>(`${BASE}/admin/${userId}/affiliates/summary`);
  return {
    total: data.total ?? 0,
    pending: data.pending ?? 0,
    accepted: data.accepted ?? 0,
    rejected: data.rejected ?? 0,
  };
}

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

export async function linkAffiliateAccount(
  userId: string,
  affiliateId: string,
): Promise<{ affiliate: Affiliate; alreadyLinked: boolean }> {
  const data = await apiRequest<{ affiliate: Affiliate; alreadyLinked?: boolean }>(
    `${BASE}/admin/${userId}/affiliates/${affiliateId}/link-account`,
    { method: 'POST' },
  );
  return { affiliate: data.affiliate, alreadyLinked: Boolean(data.alreadyLinked) };
}

export async function updateAffiliateStatus(
  userId: string,
  affiliateId: string,
  status: AffiliateStatus,
): Promise<{ affiliate: Affiliate; statusEmailSent?: boolean; statusEmailError?: string | null }> {
  const data = await apiRequest<{ affiliate: Affiliate; statusEmailSent?: boolean; statusEmailError?: string | null }>(
    `${BASE}/admin/${userId}/affiliates/${affiliateId}/status`,
    {
      method: 'PUT',
      body: JSON.stringify({ status }),
    },
  );
  return {
    affiliate: data.affiliate,
    statusEmailSent: data.statusEmailSent,
    statusEmailError: data.statusEmailError ?? null,
  };
}

export async function deleteAffiliate(userId: string, affiliateId: string): Promise<void> {
  await apiRequest(`${BASE}/admin/${userId}/affiliates/${affiliateId}`, { method: 'DELETE' });
}

export async function clearAffiliateRequests(
  userId: string,
  statuses: AffiliateStatus[] = ['pending', 'rejected'],
): Promise<{ removed: number }> {
  const data = await apiRequest<{ removed: number }>(`${BASE}/admin/${userId}/affiliates/clear-requests`, {
    method: 'POST',
    body: JSON.stringify({ statuses }),
  });
  return { removed: data.removed ?? 0 };
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

export async function portalLoginWithAccount(email: string, password: string) {
  const res = await fetch(`${BASE}/portal/login-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
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

export async function portalAcceptContract(
  code: string,
  version: string,
): Promise<{ ok: boolean; affiliate?: Record<string, unknown>; error?: string }> {
  const res = await fetch(`${BASE}/portal/${code}/accept-contract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: true, version }),
  });
  return res.json();
}

export async function portalSubmitKyc(
  code: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; affiliate?: Record<string, unknown>; error?: string }> {
  const res = await fetch(`${BASE}/portal/${code}/kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchAffiliateKycAdmin(userId: string, affiliateId: string) {
  const data = await apiRequest<{ kyc: AffiliateKycData | null; affiliateName: string; affiliateEmail: string }>(
    `${BASE}/admin/${userId}/affiliates/${affiliateId}/kyc`,
  );
  return data;
}

export async function updateAffiliateKycStatus(
  userId: string,
  affiliateId: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<Affiliate> {
  const data = await apiRequest<{ affiliate: Affiliate }>(
    `${BASE}/admin/${userId}/affiliates/${affiliateId}/kyc`,
    {
      method: 'PUT',
      body: JSON.stringify({ status, rejectionReason }),
    },
  );
  return data.affiliate;
}

// ── Public: validate referral code ────────────────────────────────────────────

export async function validateReferralCode(code: string): Promise<{ valid: boolean; affiliateName?: string; affiliateCompany?: string }> {
  const res = await fetch(`${BASE}/referral/${encodeURIComponent(code)}/validate`);
  const data = await res.json();
  if (!data.ok) return { valid: false };
  return { valid: data.valid, affiliateName: data.affiliateName, affiliateCompany: data.affiliateCompany };
}

export async function listAffiliateVerticals(): Promise<string[]> {
  const res = await fetch(`${BASE}/verticals`);
  if (!res.ok) throw new Error(`Affiliate verticals: HTTP ${res.status}`);
  const data = await res.json().catch(() => ({ ok: false }));
  if (!data.ok || !Array.isArray(data.verticals)) throw new Error('Respuesta inválida');
  return data.verticals;
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
