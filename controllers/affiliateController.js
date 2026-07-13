import { sendEmail } from '../services/email.js';
import { sendAdminAlert } from '../services/adminAlerts.js';
import { getAffiliateAdminInbox } from '../services/adminInbox.js';
import logger from '../services/logger.js';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  deleteDocument,
  findAccountByUserId,
  findAccountByEmail,
  saveAccount,
  verifyPassword,
} from '../services/couchdb.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { VERTIAL_SUPER_ADMIN_EMAIL } from '../utils/superAdmin.js';

// ── Public constants ───────────────────────────────────────────────────────────

const VERTICALS = [
  'Automoción',
  'Taller mecánico',
  'Gimnasio / Fitness',
  'Clínica / Salud',
  'Hotel / Alojamiento',
  'Restauración / Food',
  'Limpieza profesional',
  'E-commerce',
  'Consultoría',
  'Otro',
];

/** Comisión base estándar del programa de afiliados (%). */
export const DEFAULT_AFFILIATE_COMMISSION_RATE = 20;

// ── Database name ──────────────────────────────────────────────────────────────

export const AFFILIATES_DB = 'affiliates';

// ── Helpers ────────────────────────────────────────────────────────────────────

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureAffiliatesDb(req) {
  await ensureDatabase(req, AFFILIATES_DB);
}

function filterByUser(docs, userId, type) {
  return docs.filter((d) => d.type === type && d.user_id === userId && !d.deletedAt);
}

function generateAffiliateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AFF-';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'REF-';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

async function findAffiliateByCode(req, code) {
  await ensureAffiliatesDb(req);
  const all = await getAllDocuments(req, AFFILIATES_DB);
  return all.find((d) => d.type === 'affiliate' && d.affiliateCode === code && !d.deletedAt) || null;
}

async function findAcceptedAffiliateByEmail(req, email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return null;
  await ensureAffiliatesDb(req);
  const all = await getAllDocuments(req, AFFILIATES_DB);
  return all.find(
    (d) => d.type === 'affiliate'
      && !d.deletedAt
      && d.status === 'accepted'
      && String(d.email || '').trim().toLowerCase() === norm,
  ) || null;
}

async function findAffiliateByLinkedAccount(req, accountUserId) {
  const uid = String(accountUserId || '').trim();
  if (!uid) return null;
  await ensureAffiliatesDb(req);
  const all = await getAllDocuments(req, AFFILIATES_DB);
  return all.find(
    (d) => d.type === 'affiliate' && !d.deletedAt && String(d.linkedAccountUserId || '').trim() === uid,
  ) || null;
}

/** Enlaza afiliado ↔ cuenta Vertial (mismo email). Idempotente. */
async function linkAffiliateToVertialAccount(req, affiliate, account) {
  if (!affiliate?._id || !account?.user_id) return affiliate;
  const now = new Date().toISOString();
  const linkedAffiliate = {
    ...affiliate,
    linkedAccountUserId: account.user_id,
    portalAccessMode: 'account',
    updatedAt: now,
  };
  await putDocument(req, AFFILIATES_DB, affiliate._id, linkedAffiliate);

  const needsAccountUpdate =
    account.affiliateId !== affiliate._id
    || account.affiliateCode !== affiliate.affiliateCode;
  if (needsAccountUpdate) {
    await saveAccount(req, {
      ...account,
      affiliateId: affiliate._id,
      affiliateCode: affiliate.affiliateCode || account.affiliateCode || '',
      updatedAt: now,
    });
  }
  return linkedAffiliate;
}

async function syncAffiliateAccountLink(req, affiliate) {
  const email = String(affiliate?.email || '').trim();
  if (!email) return affiliate;
  try {
    const account = await findAccountByEmail(req, email);
    if (!account) return affiliate;
    return await linkAffiliateToVertialAccount(req, affiliate, account);
  } catch (err) {
    logger.warn({ tag: 'AFFILIATE', err, affiliateId: affiliate._id }, 'No se pudo enlazar afiliado con cuenta Vertial');
    return affiliate;
  }
}

/** Tras registro Vertial: si el email ya es afiliado aceptado, enlazar automáticamente. */
export async function syncAffiliateLinkForAccount(req, account) {
  if (!account?.email) return null;
  const affiliate = await findAcceptedAffiliateByEmail(req, account.email);
  if (!affiliate) return null;
  return linkAffiliateToVertialAccount(req, affiliate, account);
}

function isAffiliateAccountLinked(affiliate) {
  return Boolean(
    String(affiliate?.linkedAccountUserId || '').trim()
    || affiliate?.portalAccessMode === 'account',
  );
}

/** Metadatos de cuenta Vertial para el backoffice admin (sin datos sensibles). */
async function enrichAffiliateWithAccountMeta(req, affiliate) {
  if (!affiliate) return affiliate;

  const accountLinked = isAffiliateAccountLinked(affiliate);
  let vertialAccountExists = false;
  let vertialAccountUserId = null;
  let vertialAccountName = null;
  let vertialAccountCompany = null;

  try {
    const account = await findAccountByEmail(req, affiliate.email);
    if (account?.user_id) {
      vertialAccountExists = true;
      vertialAccountUserId = account.user_id;
      vertialAccountName = String(account.fullName || account.name || '').trim() || null;
      vertialAccountCompany = String(account.companyName || account.company || '').trim() || null;
    }
  } catch (err) {
    logger.warn({ tag: 'AFFILIATE_ADMIN', err, affiliateId: affiliate._id }, 'No se pudo consultar cuenta Vertial del afiliado');
  }

  return {
    ...affiliate,
    accountLinked,
    vertialAccountExists,
    vertialAccountUserId: accountLinked
      ? String(affiliate.linkedAccountUserId || vertialAccountUserId || '').trim() || null
      : vertialAccountUserId,
    vertialAccountName,
    vertialAccountCompany,
    canLinkAccount: affiliate.status === 'accepted' && vertialAccountExists && !accountLinked,
    kycStatus: affiliate.kyc?.status || null,
    kycSubmittedAt: affiliate.kyc?.submittedAt || null,
    kycNeedsReview: affiliate.kyc?.status === 'pending' && Boolean(affiliate.kyc?.submittedAt),
    kycDni: affiliate.kyc?.dni || null,
    kycLegalName: affiliate.kyc?.legalName || null,
    kycRejectionReason: affiliate.kyc?.rejectionReason || null,
  };
}

function getAffiliateContactEmail() {
  return getAffiliateAdminInbox() || 'hola@vertialapp.com';
}

function getPublicSiteUrl() {
  return process.env.APP_URL || 'https://vertialapp.com';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function affiliatePortalUrl() {
  return `${getPublicSiteUrl()}/panel-afiliado`;
}

function affiliateRequestFormUrl() {
  return `${getPublicSiteUrl()}/affiliados`;
}

const AFFILIATE_EMAIL_ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AFFILIATE_EMAIL_ACTIONS = new Set(['accept', 'reject', 'pending']);

function getAffiliateActionSecret() {
  return (
    process.env.AFFILIATE_ACTION_SECRET
    || process.env.JWT_SECRET
    || 'vertial-dev-secret-change-in-production'
  );
}

function signAffiliateEmailActionToken(affiliateId, action) {
  const ts = Date.now();
  const payload = `${String(affiliateId).trim()}:${action}:${ts}`;
  const sig = crypto
    .createHmac('sha256', getAffiliateActionSecret())
    .update(payload)
    .digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

function verifyAffiliateEmailActionToken(token) {
  const rawToken = String(token || '').trim();
  const dot = rawToken.lastIndexOf('.');
  if (dot <= 0) return null;
  const encodedPayload = rawToken.slice(0, dot);
  const sig = rawToken.slice(dot + 1);
  let payload = '';
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', getAffiliateActionSecret())
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const [affiliateId, action, tsRaw] = payload.split(':');
  if (!affiliateId || !AFFILIATE_EMAIL_ACTIONS.has(action)) return null;
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Date.now() - ts > AFFILIATE_EMAIL_ACTION_TTL_MS) return null;
  return { affiliateId, action };
}

function buildAffiliateEmailActionUrl(affiliateId, action) {
  const token = signAffiliateEmailActionToken(affiliateId, action);
  return `${getPublicSiteUrl().replace(/\/+$/, '')}/api/affiliate/email-action?token=${encodeURIComponent(token)}`;
}

function adminAffiliateRequestsUrl() {
  return `${getPublicSiteUrl().replace(/\/+$/, '')}/saas/admin?tab=affiliate_requests`;
}

async function resolvePlatformAffiliateOwnerUserId(req) {
  const explicit = String(process.env.AFFILIATE_OWNER_USER_ID || '').trim();
  if (explicit) return explicit;
  try {
    const account = await findAccountByEmail(req, VERTIAL_SUPER_ADMIN_EMAIL);
    return String(account?.user_id || account?._id || '').trim() || null;
  } catch {
    return null;
  }
}

async function applyAffiliateStatusChange(
  req,
  affiliateId,
  status,
  { ownerUserId = null, sendStatusEmail = true } = {},
) {
  await ensureAffiliatesDb(req);
  const existing = await getDocument(req, AFFILIATES_DB, affiliateId);
  if (!existing || existing.type !== 'affiliate' || existing.deletedAt) {
    const err = new Error('Afiliado no encontrado');
    err.code = 'AFFILIATE_NOT_FOUND';
    throw err;
  }

  const previousStatus = existing.status;
  if (previousStatus === status) {
    return {
      doc: existing,
      previousStatus,
      statusEmailSent: false,
      statusEmailError: null,
      unchanged: true,
    };
  }

  let doc = {
    ...existing,
    status,
    user_id:
      existing.user_id === 'public_request' && ownerUserId
        ? ownerUserId
        : existing.user_id,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'accepted' && !doc.referralCode) {
    doc.referralCode = generateReferralCode();
  }
  await putDocument(req, AFFILIATES_DB, affiliateId, doc);

  if (status === 'accepted') {
    doc = await syncAffiliateAccountLink(req, doc);
  }

  let statusEmailSent = false;
  let statusEmailError = null;
  if (
    sendStatusEmail
    && (status === 'accepted' || status === 'rejected')
  ) {
    try {
      if (status === 'accepted') {
        await sendEmail({
          to: doc.email,
          subject: '¡Tu solicitud de afiliado ha sido aceptada! · Vertial',
          html: buildAffiliateAcceptedEmail(doc),
        });
      } else {
        await sendEmail({
          to: doc.email,
          subject: 'Actualización sobre tu solicitud de afiliación · Vertial',
          html: buildAffiliateRejectedEmail(doc),
        });
      }
      statusEmailSent = true;
      const stamped = {
        ...doc,
        statusEmailSentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await putDocument(req, AFFILIATES_DB, affiliateId, stamped);
      return {
        doc: stamped,
        previousStatus,
        statusEmailSent,
        statusEmailError: null,
        unchanged: false,
      };
    } catch (emailErr) {
      statusEmailError = emailErr?.message || 'No se pudo enviar el correo';
      logger.warn({ tag: 'AFFILIATE', affiliateId, status, emailErr }, 'Fallo email de cambio de estado');
    }
  }

  return {
    doc,
    previousStatus,
    statusEmailSent,
    statusEmailError,
    unchanged: false,
  };
}

export async function findAffiliateByReferralCode(req, code) {
  await ensureAffiliatesDb(req);
  const all = await getAllDocuments(req, AFFILIATES_DB);
  return all.find((d) => d.type === 'affiliate' && d.referralCode === code && !d.deletedAt) || null;
}

// ── Public routes ──────────────────────────────────────────────────────────────

export function getVerticals(req, res) {
  return res.json({ ok: true, verticals: VERTICALS });
}

export async function submitAffiliateRequest(req, res) {
  const { name, email, phone, whatsapp, company, website, verticals, message } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'El nombre es obligatorio (mínimo 2 caracteres).' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ ok: false, error: 'El email no es válido.' });
  }

  if (!phone || phone.trim().length < 6) {
    return res.status(400).json({ ok: false, error: 'El teléfono es obligatorio.' });
  }

  if (!verticals || !Array.isArray(verticals) || verticals.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debes seleccionar al menos una vertical.' });
  }

  const invalidVerticals = verticals.filter((v) => !VERTICALS.includes(v));
  if (invalidVerticals.length > 0) {
    return res.status(400).json({ ok: false, error: 'Una o más verticales seleccionadas no son válidas.' });
  }

  try {
    await ensureAffiliatesDb(req);

    const now = new Date().toISOString();
    const id = `aff-${uuidv4()}`;
    const affiliateCode = generateAffiliateCode();
    const referralCode = generateReferralCode();

    const trimmedMessage = message?.trim() || '';
    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      whatsapp: whatsapp?.trim() || phone?.trim() || '',
      company: company?.trim() || '',
      website: website?.trim() || '',
      verticals: verticals || [],
      message: trimmedMessage,
    };

    const doc = {
      _id: id,
      type: 'affiliate',
      user_id: 'public_request',
      ...payload,
      affiliateCode,
      referralCode,
      commissionRate: DEFAULT_AFFILIATE_COMMISSION_RATE,
      status: 'pending',
      notes: trimmedMessage,
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);

    logger.info({ tag: 'AFFILIATE', email, verticals, affiliateCode }, 'Solicitud de afiliado recibida');

    const emailMeta = await sendAffiliateRequestEmails({
      ...payload,
      affiliateCode,
      affiliateId: id,
    });
    if (emailMeta.adminNotifiedAt || emailMeta.applicantNotifiedAt) {
      await putDocument(req, AFFILIATES_DB, id, {
        ...doc,
        adminNotifiedAt: emailMeta.adminNotifiedAt,
        applicantNotifiedAt: emailMeta.applicantNotifiedAt,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      message: 'Solicitud enviada correctamente.',
      emails: {
        admin: Boolean(emailMeta.adminNotifiedAt),
        applicant: Boolean(emailMeta.applicantNotifiedAt),
      },
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE', err }, 'Error al guardar solicitud de afiliado');
    return res.status(500).json({ ok: false, error: 'No se pudo enviar la solicitud. Inténtalo más tarde.' });
  }
}

// ── Portal: Affiliate accesses their own panel ─────────────────────────────────

export async function portalLogin(req, res) {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return badRequest(res, 'Código de afiliado requerido');
  }

  try {
    const affiliate = await findAffiliateByCode(req, code.trim().toUpperCase());
    if (!affiliate) {
      return res.status(404).json({ ok: false, error: 'Código de afiliado no encontrado' });
    }
    if (affiliate.status !== 'accepted') {
      return res.status(403).json({ ok: false, error: 'Tu solicitud aún no ha sido aprobada' });
    }

    if (!affiliate.referralCode) {
      affiliate.referralCode = generateReferralCode();
      affiliate.updatedAt = new Date().toISOString();
      await putDocument(req, AFFILIATES_DB, affiliate._id, affiliate);
    }

    const linked = await syncAffiliateAccountLink(req, affiliate);

    return res.json({
      ok: true,
      affiliate: sanitizeAffiliate(linked),
      accessMode: linked.portalAccessMode || 'code',
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error en login de portal');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

/** Acceso al panel con email + contraseña de la cuenta Vertial (recomendado). */
export async function portalLoginWithAccount(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return badRequest(res, 'Email y contraseña son obligatorios');
  }

  try {
    const account = await findAccountByEmail(req, email);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos' });
    }

    let affiliate = null;
    if (account.affiliateId) {
      try {
        affiliate = await getDocument(req, AFFILIATES_DB, account.affiliateId);
      } catch {
        affiliate = null;
      }
    }
    if (!affiliate || affiliate.deletedAt || affiliate.type !== 'affiliate') {
      affiliate = await findAffiliateByLinkedAccount(req, account.user_id);
    }
    if (!affiliate) {
      affiliate = await findAcceptedAffiliateByEmail(req, email);
    }

    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(403).json({
        ok: false,
        error: 'Esta cuenta no tiene acceso al programa de afiliados. Solicita acceso en la página de afiliados.',
      });
    }

    affiliate = await linkAffiliateToVertialAccount(req, affiliate, account);

    if (!affiliate.referralCode) {
      affiliate.referralCode = generateReferralCode();
      affiliate.updatedAt = new Date().toISOString();
      await putDocument(req, AFFILIATES_DB, affiliate._id, affiliate);
    }

    return res.json({
      ok: true,
      affiliate: sanitizeAffiliate(affiliate),
      accessMode: 'account',
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error en login de portal con cuenta');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

export async function portalDashboard(req, res) {
  const { code } = req.params;
  if (!code) return badRequest(res, 'Código requerido');

  try {
    const affiliate = await findAffiliateByCode(req, code.toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado o no activo' });
    }

    if (!affiliate.referralCode) {
      affiliate.referralCode = generateReferralCode();
      affiliate.updatedAt = new Date().toISOString();
      await putDocument(req, AFFILIATES_DB, affiliate._id, affiliate);
    }

    const all = await getAllDocuments(req, AFFILIATES_DB);

    const clients = all
      .filter((d) => d.type === 'affiliate_contact' && d.affiliateId === affiliate._id && !d.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const commissions = all
      .filter((d) => d.type === 'affiliate_commission' && d.affiliateId === affiliate._id && !d.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalEarned = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);
    const pendingAmount = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0);

    return res.json({
      ok: true,
      affiliate: sanitizeAffiliate(affiliate),
      clients,
      commissions,
      stats: {
        totalClients: clients.length,
        signedClients: clients.filter((c) => c.signedSaas).length,
        totalEarned,
        pendingAmount,
      },
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error al cargar dashboard del portal');
    return res.status(500).json({ ok: false, error: 'Error al cargar datos' });
  }
}

export async function portalRegisterClient(req, res) {
  const { code } = req.params;
  const { contactName, contactEmail, contactPhone, company, notes, verticals } = req.body;

  if (!code) return badRequest(res, 'Código requerido');
  if (!contactName?.trim()) return badRequest(res, 'El nombre del contacto es obligatorio');

  try {
    const affiliate = await findAffiliateByCode(req, code.toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado o no activo' });
    }
    if (!isAffiliateKycApproved(affiliate)) {
      return res.status(403).json({ ok: false, error: 'Debes completar la verificación de identidad antes de registrar clientes' });
    }

    const safeVerticals = Array.isArray(verticals)
      ? verticals.filter((v) => VERTICALS.includes(v))
      : [];

    const now = new Date().toISOString();
    const id = `cnt-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'affiliate_contact',
      user_id: affiliate.user_id,
      affiliateId: affiliate._id,
      affiliateName: affiliate.name,
      contactName: contactName.trim(),
      contactEmail: contactEmail?.trim() || '',
      contactPhone: contactPhone?.trim() || '',
      contactType: 'lead',
      company: company?.trim() || '',
      notes: notes?.trim() || '',
      verticals: safeVerticals,
      signedSaas: false,
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);
    logger.info({ tag: 'AFFILIATE_PORTAL', affiliateCode: code, contactName }, 'Cliente registrado desde portal');
    return res.status(201).json({ ok: true, contact: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error al registrar cliente');
    return res.status(500).json({ ok: false, error: 'Error al registrar cliente' });
  }
}

/** Versión del contrato — mantener alineada con AFFILIATE_AGREEMENT_VERSION (frontend). */
export const AFFILIATE_AGREEMENT_VERSION_EXPORT = '2026-07-06-v1';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const AFFILIATE_KYC_MAX_BYTES = 2 * 1024 * 1024;
const AFFILIATE_KYC_DOC_KINDS = ['dni_front', 'dni_back'];

function validateDniOrNie(value) {
  const v = String(value || '').trim().toUpperCase();
  const dni = v.match(/^(\d{8})([A-Z])$/);
  if (dni) return DNI_LETTERS[parseInt(dni[1], 10) % 23] === dni[2];
  const nie = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nie) {
    const prefix = { X: '0', Y: '1', Z: '2' }[nie[1]];
    const num = parseInt(prefix + nie[2], 10);
    return DNI_LETTERS[num % 23] === nie[3];
  }
  return false;
}

function validateSpanishIban(value) {
  const iban = String(value || '').replace(/\s+/g, '').toUpperCase();
  return /^ES\d{22}$/.test(iban);
}

function getAffiliateKycSnapshot(kyc) {
  if (!kyc?.submittedAt) {
    return {
      status: null,
      needsKycSubmission: true,
      needsKycApproval: false,
      kycApproved: false,
    };
  }
  const status = kyc.status || 'pending';
  return {
    status,
    needsKycSubmission: status === 'rejected',
    needsKycApproval: status === 'pending',
    kycApproved: status === 'approved',
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt || null,
    rejectionReason: status === 'rejected' ? (kyc.rejectionReason || '') : '',
    dni: status === 'approved' ? kyc.dni : undefined,
    legalName: status === 'approved' ? kyc.legalName : undefined,
  };
}

function isAffiliateKycApproved(affiliate) {
  return affiliate?.kyc?.status === 'approved' && Boolean(affiliate?.kyc?.submittedAt);
}

function sanitizeAffiliate(aff) {
  const contractVersion = String(aff.contractVersion || '').trim();
  const contractAcceptedAt = aff.contractAcceptedAt || null;
  const kycSnapshot = getAffiliateKycSnapshot(aff.kyc);
  const needsContractAcceptance = !contractAcceptedAt
    || contractVersion !== AFFILIATE_AGREEMENT_VERSION_EXPORT;

  return {
    id: aff._id,
    name: aff.name,
    email: aff.email,
    phone: aff.phone,
    whatsapp: aff.whatsapp || '',
    company: aff.company,
    affiliateCode: aff.affiliateCode,
    referralCode: aff.referralCode || '',
    commissionRate: aff.commissionRate,
    status: aff.status,
    createdAt: aff.createdAt,
    contractAcceptedAt,
    contractVersion: contractVersion || null,
    needsContractAcceptance,
    kyc: kycSnapshot,
    needsKycSubmission: kycSnapshot.needsKycSubmission,
    needsKycApproval: kycSnapshot.needsKycApproval,
    kycApproved: kycSnapshot.kycApproved,
  };
}

export async function portalSubmitKyc(req, res) {
  const { code } = req.params;
  const {
    dni,
    legalName,
    address,
    city,
    postalCode,
    country,
    iban,
    billingTaxId,
    documents,
  } = req.body || {};

  if (!code) return badRequest(res, 'Código requerido');

  const dniNorm = String(dni || '').trim().toUpperCase();
  const legalNameNorm = String(legalName || '').trim();
  const addressNorm = String(address || '').trim();
  const cityNorm = String(city || '').trim();
  const postalCodeNorm = String(postalCode || '').trim();
  const countryNorm = String(country || 'España').trim();
  const ibanNorm = String(iban || '').replace(/\s+/g, '').toUpperCase();
  const billingTaxIdNorm = String(billingTaxId || '').trim().toUpperCase();

  if (!legalNameNorm) return badRequest(res, 'El nombre legal es obligatorio');
  if (!validateDniOrNie(dniNorm)) return badRequest(res, 'DNI/NIE no válido');
  if (!addressNorm) return badRequest(res, 'La dirección es obligatoria');
  if (!cityNorm) return badRequest(res, 'La ciudad es obligatoria');
  if (!postalCodeNorm) return badRequest(res, 'El código postal es obligatorio');
  if (!validateSpanishIban(ibanNorm)) return badRequest(res, 'IBAN español no válido (formato ES + 22 dígitos)');
  if (!Array.isArray(documents) || documents.length < 2) {
    return badRequest(res, 'Debes subir el anverso y el reverso del DNI/NIE');
  }

  const parsedDocs = [];
  for (const doc of documents) {
    const kind = String(doc?.kind || '').trim();
    if (!AFFILIATE_KYC_DOC_KINDS.includes(kind)) {
      return badRequest(res, 'Tipo de documento no válido');
    }
    const fileName = String(doc?.fileName || '').trim();
    const mimeType = String(doc?.mimeType || '').trim();
    const dataUrl = String(doc?.dataUrl || '').trim();
    const size = Number(doc?.size) || 0;
    if (!fileName || !dataUrl.startsWith('data:')) {
      return badRequest(res, 'Documento incompleto o corrupto');
    }
    if (size > AFFILIATE_KYC_MAX_BYTES) {
      return badRequest(res, `Cada archivo debe pesar menos de ${AFFILIATE_KYC_MAX_BYTES / (1024 * 1024)} MB`);
    }
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return badRequest(res, 'Solo se permiten imágenes o PDF');
    }
    parsedDocs.push({
      id: String(doc?.id || `kyc-${uuidv4()}`),
      kind,
      fileName,
      mimeType,
      size,
      uploadedAt: new Date().toISOString(),
      dataUrl,
    });
  }

  const kinds = new Set(parsedDocs.map((d) => d.kind));
  if (!kinds.has('dni_front') || !kinds.has('dni_back')) {
    return badRequest(res, 'Faltan el anverso o el reverso del DNI/NIE');
  }

  try {
    const affiliate = await findAffiliateByCode(req, code.toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado o no activo' });
    }
    if (affiliate.kyc?.status === 'pending' && affiliate.kyc?.submittedAt) {
      return badRequest(res, 'Tu verificación ya está en revisión. Te avisaremos por email.');
    }
    if (affiliate.kyc?.status === 'approved') {
      return badRequest(res, 'Tu identidad ya está verificada');
    }

    const now = new Date().toISOString();
    const updated = {
      ...affiliate,
      kyc: {
        dni: dniNorm,
        legalName: legalNameNorm,
        address: addressNorm,
        city: cityNorm,
        postalCode: postalCodeNorm,
        country: countryNorm,
        iban: ibanNorm,
        billingTaxId: billingTaxIdNorm || undefined,
        documents: parsedDocs,
        submittedAt: now,
        status: 'pending',
        reviewedAt: undefined,
        reviewedBy: undefined,
        rejectionReason: undefined,
      },
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, affiliate._id, updated);

    logger.info(
      { tag: 'AFFILIATE_KYC', affiliateId: affiliate._id, dni: `${dniNorm.slice(0, 3)}***` },
      'KYC de afiliado enviado',
    );

    return res.json({
      ok: true,
      affiliate: sanitizeAffiliate(updated),
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_KYC', err }, 'Error al enviar KYC de afiliado');
    return res.status(500).json({ ok: false, error: 'No se pudo enviar la verificación' });
  }
}

export async function portalAcceptContract(req, res) {
  const { code } = req.params;
  const { version, accepted } = req.body || {};

  if (!code) return badRequest(res, 'Código requerido');
  if (!accepted) return badRequest(res, 'Debes aceptar el contrato para continuar');
  if (String(version || '').trim() !== AFFILIATE_AGREEMENT_VERSION_EXPORT) {
    return badRequest(res, 'Versión del contrato no válida. Recarga la página e inténtalo de nuevo.');
  }

  try {
    const affiliate = await findAffiliateByCode(req, code.toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado o no activo' });
    }
    if (!isAffiliateKycApproved(affiliate)) {
      return res.status(403).json({ ok: false, error: 'Debes completar y obtener la aprobación de tu verificación de identidad' });
    }

    const now = new Date().toISOString();
    const updated = {
      ...affiliate,
      contractAcceptedAt: now,
      contractVersion: AFFILIATE_AGREEMENT_VERSION_EXPORT,
      contractAcceptedIp: req.ip || req.headers['x-forwarded-for'] || '',
      contractAcceptedUserAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, affiliate._id, updated);

    logger.info(
      {
        tag: 'AFFILIATE_PORTAL',
        affiliateId: affiliate._id,
        version: AFFILIATE_AGREEMENT_VERSION_EXPORT,
        ip: updated.contractAcceptedIp,
      },
      'Contrato de afiliado aceptado',
    );

    return res.json({
      ok: true,
      affiliate: sanitizeAffiliate(updated),
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error al registrar aceptación de contrato');
    return res.status(500).json({ ok: false, error: 'No se pudo registrar la aceptación' });
  }
}

// ── Admin: Affiliates CRUD ─────────────────────────────────────────────────────

function adminAffiliateRecords(all, userId) {
  return all.filter(
    (d) => d.type === 'affiliate'
      && !d.deletedAt
      && (d.user_id === userId || d.user_id === 'public_request'),
  );
}

export async function listAffiliatesAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);

    const affiliates = adminAffiliateRecords(all, userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const enriched = await Promise.all(
      affiliates.map((row) => enrichAffiliateWithAccountMeta(req, row)),
    );

    return res.json({ ok: true, affiliates: enriched });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al listar afiliados');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar afiliados' });
  }
}

export async function affiliateRequestsSummaryAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);
    const affiliates = adminAffiliateRecords(all, userId);

    const summary = {
      total: affiliates.length,
      pending: 0,
      accepted: 0,
      rejected: 0,
    };
    for (const row of affiliates) {
      if (row.status === 'accepted') summary.accepted += 1;
      else if (row.status === 'rejected') summary.rejected += 1;
      else summary.pending += 1;
    }

    return res.json({ ok: true, ...summary });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al resumir solicitudes de afiliados');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar resumen' });
  }
}

export async function createAffiliateAdmin(req, res) {
  try {
    const { userId } = req.params;
    const { name, email, phone, whatsapp, company, commissionRate, status, notes } = req.body;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!name?.trim()) return badRequest(res, 'El nombre es obligatorio');
    if (!email?.trim()) return badRequest(res, 'El email es obligatorio');

    await ensureAffiliatesDb(req);
    const now = new Date().toISOString();
    const id = `aff-${uuidv4()}`;
    const affiliateCode = generateAffiliateCode();
    const referralCode = generateReferralCode();

    const doc = {
      _id: id,
      type: 'affiliate',
      user_id: userId,
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      whatsapp: whatsapp?.trim() || '',
      company: company?.trim() || '',
      affiliateCode,
      referralCode,
      commissionRate: Number(commissionRate) || DEFAULT_AFFILIATE_COMMISSION_RATE,
      status: status || 'pending',
      notes: notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);
    logger.info({ tag: 'AFFILIATE_ADMIN', userId, id, affiliateCode }, 'Afiliado creado');
    return res.status(201).json({ ok: true, affiliate: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al crear afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al crear afiliado' });
  }
}

export async function updateAffiliateAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!existing || existing.type !== 'affiliate' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }

    const { name, email, phone, whatsapp, company, commissionRate, status, notes } = req.body;
    const doc = {
      ...existing,
      name: name?.trim() ?? existing.name,
      email: email?.trim() ?? existing.email,
      phone: phone?.trim() ?? existing.phone,
      whatsapp: whatsapp?.trim() ?? existing.whatsapp ?? '',
      company: company?.trim() ?? existing.company,
      commissionRate: commissionRate !== undefined ? Number(commissionRate) : existing.commissionRate,
      status: status ?? existing.status,
      notes: notes?.trim() ?? existing.notes,
      user_id: existing.user_id === 'public_request' ? userId : existing.user_id,
      updatedAt: new Date().toISOString(),
    };

    await putDocument(req, AFFILIATES_DB, affiliateId, doc);
    return res.json({ ok: true, affiliate: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al actualizar afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar afiliado' });
  }
}

export async function handleAffiliateEmailAction(req, res) {
  const verified = verifyAffiliateEmailActionToken(req.query.token);
  if (!verified) {
    return res.status(400).send(buildAffiliateEmailActionResultHtml({
      ok: false,
      title: 'Enlace no válido o caducado',
      message: 'Este enlace ha expirado o no es válido. Abre el panel admin para gestionar la solicitud manualmente.',
      adminUrl: adminAffiliateRequestsUrl(),
    }));
  }

  try {
    await ensureAffiliatesDb(req);
    const affiliate = await getDocument(req, AFFILIATES_DB, verified.affiliateId);
    if (!affiliate || affiliate.type !== 'affiliate' || affiliate.deletedAt) {
      return res.status(404).send(buildAffiliateEmailActionResultHtml({
        ok: false,
        title: 'Solicitud no encontrada',
        message: 'No encontramos esta solicitud de afiliado. Puede que ya se haya eliminado.',
        adminUrl: adminAffiliateRequestsUrl(),
      }));
    }

    if (verified.action === 'pending') {
      return res.send(buildAffiliateEmailActionResultHtml({
        ok: true,
        title: 'Solicitud pendiente de revisión',
        message: `La solicitud de ${affiliate.name} se mantiene en estado pendiente. Puedes revisarla más tarde en el panel admin.`,
        affiliate,
        adminUrl: adminAffiliateRequestsUrl(),
        statusLabel: 'Pendiente',
      }));
    }

    const nextStatus = verified.action === 'accept' ? 'accepted' : 'rejected';
    const ownerUserId = await resolvePlatformAffiliateOwnerUserId(req);
    const result = await applyAffiliateStatusChange(req, verified.affiliateId, nextStatus, {
      ownerUserId,
      sendStatusEmail: true,
    });

    if (nextStatus === 'accepted') {
      return res.send(buildAffiliateEmailActionResultHtml({
        ok: true,
        title: result.unchanged ? 'Solicitud ya aceptada' : 'Solicitud aceptada',
        message: result.unchanged
          ? `${affiliate.name} ya estaba aceptado como afiliado.`
          : `Has aceptado a ${result.doc.name}. Se ha enviado un email con su código ${result.doc.affiliateCode || ''}.`,
        affiliate: result.doc,
        adminUrl: adminAffiliateRequestsUrl(),
        statusLabel: 'Aceptado',
        emailNote: result.statusEmailSent
          ? 'Correo enviado al solicitante.'
          : (result.statusEmailError || 'No se pudo enviar el correo al solicitante.'),
      }));
    }

    return res.send(buildAffiliateEmailActionResultHtml({
      ok: true,
      title: result.unchanged ? 'Solicitud ya rechazada' : 'Solicitud rechazada',
      message: result.unchanged
        ? `${affiliate.name} ya estaba marcado como rechazado.`
        : `Has rechazado la solicitud de ${result.doc.name}.`,
      affiliate: result.doc,
      adminUrl: adminAffiliateRequestsUrl(),
      statusLabel: 'Rechazado',
      emailNote: result.statusEmailSent
        ? 'Se notificó al solicitante por email.'
        : (result.statusEmailError || null),
    }));
  } catch (err) {
    logger.error({ tag: 'AFFILIATE', err }, 'Error en acción de email de afiliado');
    return res.status(500).send(buildAffiliateEmailActionResultHtml({
      ok: false,
      title: 'No se pudo completar la acción',
      message: err.message || 'Error interno. Inténtalo desde el panel admin.',
      adminUrl: adminAffiliateRequestsUrl(),
    }));
  }
}

export async function linkAffiliateAccountAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!existing || existing.type !== 'affiliate' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }
    if (existing.status !== 'accepted') {
      return badRequest(res, 'Solo se puede enlazar un afiliado aceptado');
    }
    if (isAffiliateAccountLinked(existing)) {
      const affiliate = await enrichAffiliateWithAccountMeta(req, existing);
      return res.json({ ok: true, affiliate, alreadyLinked: true });
    }

    const account = await findAccountByEmail(req, existing.email);
    if (!account?.user_id) {
      return badRequest(res, 'No hay cuenta Vertial con ese email. El afiliado debe registrarse primero.');
    }

    const linked = await linkAffiliateToVertialAccount(req, existing, account);
    const affiliate = await enrichAffiliateWithAccountMeta(req, linked);

    logger.info(
      { tag: 'AFFILIATE_ADMIN', userId, affiliateId, linkedAccountUserId: linked.linkedAccountUserId },
      'Afiliado enlazado manualmente con cuenta Vertial',
    );

    return res.json({ ok: true, affiliate, alreadyLinked: false });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al enlazar afiliado con cuenta Vertial');
    return res.status(500).json({ ok: false, error: err.message || 'Error al enlazar cuenta' });
  }
}

export async function updateAffiliateStatusAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'accepted', 'rejected'];

    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');
    if (!status || !validStatuses.includes(status)) return badRequest(res, 'Estado no válido');

    const result = await applyAffiliateStatusChange(req, affiliateId, status, {
      ownerUserId: userId,
      sendStatusEmail: true,
    });

    const affiliate = await enrichAffiliateWithAccountMeta(req, result.doc);

    return res.json({
      ok: true,
      affiliate,
      statusEmailSent: result.statusEmailSent,
      statusEmailError: result.statusEmailError,
    });
  } catch (err) {
    if (err.code === 'AFFILIATE_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al actualizar estado de afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar estado' });
  }
}

export async function getAffiliateKycAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const affiliate = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!affiliate || affiliate.type !== 'affiliate' || affiliate.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }

    const kyc = affiliate.kyc || null;
    return res.json({
      ok: true,
      affiliateId,
      affiliateName: affiliate.name,
      affiliateEmail: affiliate.email,
      kyc,
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_KYC', err }, 'Error al cargar KYC de afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar KYC' });
  }
}

export async function updateAffiliateKycStatusAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    const { status, rejectionReason } = req.body || {};
    const validStatuses = ['approved', 'rejected'];

    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');
    if (!status || !validStatuses.includes(status)) {
      return badRequest(res, 'Estado KYC no válido (approved o rejected)');
    }
    if (status === 'rejected' && !String(rejectionReason || '').trim()) {
      return badRequest(res, 'Indica el motivo del rechazo');
    }

    await ensureAffiliatesDb(req);
    const affiliate = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!affiliate || affiliate.type !== 'affiliate' || affiliate.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }
    if (!affiliate.kyc?.submittedAt) {
      return badRequest(res, 'Este afiliado aún no ha enviado documentación KYC');
    }

    const now = new Date().toISOString();
    const updated = {
      ...affiliate,
      kyc: {
        ...affiliate.kyc,
        status,
        reviewedAt: now,
        reviewedBy: userId,
        rejectionReason: status === 'rejected' ? String(rejectionReason).trim() : undefined,
      },
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, affiliateId, updated);

    logger.info(
      { tag: 'AFFILIATE_KYC', userId, affiliateId, status },
      'Estado KYC de afiliado actualizado',
    );

    const enriched = await enrichAffiliateWithAccountMeta(req, updated);
    return res.json({ ok: true, affiliate: enriched });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_KYC', err }, 'Error al actualizar estado KYC');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar KYC' });
  }
}

export async function deleteAffiliateAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!existing || existing.type !== 'affiliate' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }

    const now = new Date().toISOString();

    const all = await getAllDocuments(req, AFFILIATES_DB);
    const related = all.filter(
      (d) => d.affiliateId === affiliateId && !d.deletedAt,
    );
    await Promise.all(
      related.map((d) => putDocument(req, AFFILIATES_DB, d._id, { ...d, deletedAt: now })),
    );

    await putDocument(req, AFFILIATES_DB, affiliateId, { ...existing, deletedAt: now });

    logger.info({ tag: 'AFFILIATE_ADMIN', userId, affiliateId }, 'Afiliado eliminado');
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al eliminar afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al eliminar afiliado' });
  }
}

export async function clearAffiliateRequestsAdmin(req, res) {
  try {
    const { userId } = req.params;
    const { statuses } = req.body || {};
    const allowed = new Set(['pending', 'rejected', 'accepted']);
    const targetStatuses = Array.isArray(statuses) && statuses.length > 0
      ? statuses.filter((s) => allowed.has(s))
      : ['pending', 'rejected'];

    if (!userId) return badRequest(res, 'Falta userId');
    if (targetStatuses.length === 0) return badRequest(res, 'Estados no válidos');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);
    const now = new Date().toISOString();
    let removed = 0;

    const toRemove = all.filter(
      (d) => d.type === 'affiliate'
        && !d.deletedAt
        && targetStatuses.includes(d.status)
        && (d.user_id === userId || d.user_id === 'public_request'),
    );

    await Promise.all(toRemove.map(async (affiliate) => {
      const related = all.filter(
        (d) => d.affiliateId === affiliate._id && !d.deletedAt,
      );
      await Promise.all(
        related.map((d) => putDocument(req, AFFILIATES_DB, d._id, { ...d, deletedAt: now })),
      );
      await putDocument(req, AFFILIATES_DB, affiliate._id, { ...affiliate, deletedAt: now });
      removed += 1;
    }));

    logger.info({ tag: 'AFFILIATE_ADMIN', userId, removed, targetStatuses }, 'Historial de solicitudes de afiliados limpiado');
    return res.json({ ok: true, removed, statuses: targetStatuses });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al limpiar solicitudes de afiliados');
    return res.status(500).json({ ok: false, error: err.message || 'Error al limpiar solicitudes' });
  }
}

// ── Admin: Contacts CRUD ───────────────────────────────────────────────────────

export async function listContactsAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);
    const contacts = all
      .filter((d) => d.type === 'affiliate_contact' && !d.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.json({ ok: true, contacts });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al listar contactos');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar contactos' });
  }
}

export async function createContactAdmin(req, res) {
  try {
    const { userId } = req.params;
    const {
      affiliateId, affiliateName, contactName, contactEmail, contactPhone,
      contactType, company, notes, signedSaas, verticals,
      emailSent, emailOpened, cardAdded, isPaying,
      monthlyAmount, commissionPercent,
    } = req.body;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!contactName?.trim()) return badRequest(res, 'El nombre del contacto es obligatorio');
    if (!affiliateId) return badRequest(res, 'Falta affiliateId');

    const safeVerticals = Array.isArray(verticals)
      ? verticals.filter((v) => VERTICALS.includes(v))
      : [];

    await ensureAffiliatesDb(req);
    const now = new Date().toISOString();
    const id = `cnt-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'affiliate_contact',
      user_id: userId,
      affiliateId,
      affiliateName: affiliateName || '',
      contactName: contactName.trim(),
      contactEmail: contactEmail?.trim() || '',
      contactPhone: contactPhone?.trim() || '',
      contactType: contactType || 'lead',
      company: company?.trim() || '',
      notes: notes?.trim() || '',
      verticals: safeVerticals,
      signedSaas: Boolean(signedSaas),
      emailSent: Boolean(emailSent),
      emailSentAt: emailSent ? now : undefined,
      emailOpened: Boolean(emailOpened),
      emailOpenedAt: emailOpened ? now : undefined,
      cardAdded: Boolean(cardAdded),
      cardAddedAt: cardAdded ? now : undefined,
      isPaying: Boolean(isPaying),
      payingStartedAt: isPaying ? now : undefined,
      monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) || 0 : 0,
      commissionPercent: commissionPercent !== undefined ? Number(commissionPercent) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);
    return res.status(201).json({ ok: true, contact: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al crear contacto');
    return res.status(500).json({ ok: false, error: err.message || 'Error al crear contacto' });
  }
}

export async function updateContactAdmin(req, res) {
  try {
    const { userId, contactId } = req.params;
    if (!userId || !contactId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, contactId);
    if (!existing || existing.type !== 'affiliate_contact' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    }

    const {
      affiliateId, affiliateName, contactName, contactEmail, contactPhone,
      contactType, company, notes, signedSaas, verticals,
      emailSent, emailOpened, cardAdded, isPaying,
      monthlyAmount, commissionPercent,
    } = req.body;
    const safeVerticals = Array.isArray(verticals)
      ? verticals.filter((v) => VERTICALS.includes(v))
      : undefined;
    const now = new Date().toISOString();
    const doc = {
      ...existing,
      affiliateId: affiliateId ?? existing.affiliateId,
      affiliateName: affiliateName ?? existing.affiliateName,
      contactName: contactName?.trim() ?? existing.contactName,
      contactEmail: contactEmail?.trim() ?? existing.contactEmail,
      contactPhone: contactPhone?.trim() ?? existing.contactPhone,
      contactType: contactType ?? existing.contactType,
      company: company?.trim() ?? existing.company,
      notes: notes?.trim() ?? existing.notes,
      verticals: safeVerticals ?? existing.verticals ?? [],
      signedSaas: signedSaas !== undefined ? Boolean(signedSaas) : existing.signedSaas,
      emailSent: emailSent !== undefined ? Boolean(emailSent) : (existing.emailSent ?? false),
      emailSentAt: emailSent && !existing.emailSentAt ? now : existing.emailSentAt,
      emailOpened: emailOpened !== undefined ? Boolean(emailOpened) : (existing.emailOpened ?? false),
      emailOpenedAt: emailOpened && !existing.emailOpenedAt ? now : existing.emailOpenedAt,
      cardAdded: cardAdded !== undefined ? Boolean(cardAdded) : (existing.cardAdded ?? false),
      cardAddedAt: cardAdded && !existing.cardAddedAt ? now : existing.cardAddedAt,
      isPaying: isPaying !== undefined ? Boolean(isPaying) : (existing.isPaying ?? false),
      payingStartedAt: isPaying && !existing.payingStartedAt ? now : existing.payingStartedAt,
      monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) || 0 : (existing.monthlyAmount ?? 0),
      commissionPercent: commissionPercent !== undefined ? Number(commissionPercent) : existing.commissionPercent,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, contactId, doc);
    return res.json({ ok: true, contact: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al actualizar contacto');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar contacto' });
  }
}

export async function deleteContactAdmin(req, res) {
  try {
    const { userId, contactId } = req.params;
    if (!userId || !contactId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, contactId);
    if (!existing || existing.type !== 'affiliate_contact' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    }

    await putDocument(req, AFFILIATES_DB, contactId, { ...existing, deletedAt: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al eliminar contacto');
    return res.status(500).json({ ok: false, error: err.message || 'Error al eliminar contacto' });
  }
}

// ── Admin: Follow-ups CRUD ─────────────────────────────────────────────────────

export async function listFollowUpsAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);
    const followUps = all
      .filter((d) => d.type === 'affiliate_followup' && !d.deletedAt)
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({ ok: true, followUps });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al listar seguimientos');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar seguimientos' });
  }
}

export async function createFollowUpAdmin(req, res) {
  try {
    const { userId } = req.params;
    const { affiliateId, affiliateName, type, title, content, date } = req.body;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!title?.trim()) return badRequest(res, 'El título es obligatorio');
    if (!affiliateId) return badRequest(res, 'Falta affiliateId');

    await ensureAffiliatesDb(req);
    const now = new Date().toISOString();
    const id = `fu-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'affiliate_followup',
      user_id: userId,
      affiliateId,
      affiliateName: affiliateName || '',
      followUpType: type || 'note',
      title: title.trim(),
      content: content?.trim() || '',
      date: date || now.slice(0, 10),
      createdAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);
    return res.status(201).json({ ok: true, followUp: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al crear seguimiento');
    return res.status(500).json({ ok: false, error: err.message || 'Error al crear seguimiento' });
  }
}

export async function deleteFollowUpAdmin(req, res) {
  try {
    const { userId, followUpId } = req.params;
    if (!userId || !followUpId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, followUpId);
    if (!existing || existing.type !== 'affiliate_followup' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Seguimiento no encontrado' });
    }

    await putDocument(req, AFFILIATES_DB, followUpId, { ...existing, deletedAt: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al eliminar seguimiento');
    return res.status(500).json({ ok: false, error: err.message || 'Error al eliminar seguimiento' });
  }
}

// ── Admin: Commissions CRUD ────────────────────────────────────────────────────

export async function listCommissionsAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);
    const commissions = all
      .filter((d) => d.type === 'affiliate_commission' && !d.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.json({ ok: true, commissions });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al listar comisiones');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar comisiones' });
  }
}

export async function createCommissionAdmin(req, res) {
  try {
    const { userId } = req.params;
    const { affiliateId, affiliateName, description, amount, dueDate, contactId, contactName, clientId, clientName } = req.body;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!description?.trim()) return badRequest(res, 'La descripción es obligatoria');
    if (!affiliateId) return badRequest(res, 'Falta affiliateId');
    if (!amount || isNaN(Number(amount))) return badRequest(res, 'El importe es obligatorio');

    await ensureAffiliatesDb(req);
    const now = new Date().toISOString();
    const id = `afc-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'affiliate_commission',
      user_id: userId,
      affiliateId,
      affiliateName: affiliateName || '',
      contactId: contactId || undefined,
      contactName: contactName || undefined,
      clientId: clientId || undefined,
      clientName: clientName || undefined,
      description: description.trim(),
      amount: Number(amount),
      status: 'pending',
      dueDate: dueDate || undefined,
      paidAt: undefined,
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);
    return res.status(201).json({ ok: true, commission: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al crear comisión');
    return res.status(500).json({ ok: false, error: err.message || 'Error al crear comisión' });
  }
}

export async function updateCommissionStatusAdmin(req, res) {
  try {
    const { userId, commissionId } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'paid', 'cancelled'];

    if (!userId || !commissionId) return badRequest(res, 'Faltan parámetros');
    if (!status || !validStatuses.includes(status)) return badRequest(res, 'Estado no válido');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, commissionId);
    if (!existing || existing.type !== 'affiliate_commission' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Comisión no encontrada' });
    }

    const now = new Date().toISOString();
    const doc = {
      ...existing,
      status,
      paidAt: status === 'paid' ? now : existing.paidAt,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, commissionId, doc);
    return res.json({ ok: true, commission: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al actualizar estado de comisión');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar estado de comisión' });
  }
}

export async function deleteCommissionAdmin(req, res) {
  try {
    const { userId, commissionId } = req.params;
    if (!userId || !commissionId) return badRequest(res, 'Faltan parámetros');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, commissionId);
    if (!existing || existing.type !== 'affiliate_commission' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Comisión no encontrada' });
    }

    await putDocument(req, AFFILIATES_DB, commissionId, { ...existing, deletedAt: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al eliminar comisión');
    return res.status(500).json({ ok: false, error: err.message || 'Error al eliminar comisión' });
  }
}

// ── Public: Validate referral code ──────────────────────────────────────────────

export async function validateReferralCode(req, res) {
  const { code } = req.params;
  if (!code || typeof code !== 'string') {
    return badRequest(res, 'Código de referido requerido');
  }

  try {
    const affiliate = await findAffiliateByReferralCode(req, code.trim().toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.json({ ok: true, valid: false });
    }

    return res.json({
      ok: true,
      valid: true,
      affiliateName: affiliate.name,
      affiliateCompany: affiliate.company || '',
    });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE', err }, 'Error al validar código de referido');
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

// ── Portal: Referred registrations ──────────────────────────────────────────────

export async function portalReferredAccounts(req, res) {
  const { code } = req.params;
  if (!code) return badRequest(res, 'Código requerido');

  try {
    const affiliate = await findAffiliateByCode(req, code.toUpperCase());
    if (!affiliate || affiliate.status !== 'accepted') {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado o no activo' });
    }

    if (!affiliate.referralCode) {
      return res.json({ ok: true, referredAccounts: [] });
    }

    const { ACCOUNTS_DB } = await import('../services/couchdb.js');
    const accounts = await getAllDocuments(req, ACCOUNTS_DB);
    const referred = accounts
      .filter((a) => a.type === 'account' && a.referralCode === affiliate.referralCode && !a.deletedAt)
      .map((a) => ({
        id: a._id,
        fullName: a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim(),
        email: a.email || '',
        phone: a.phone || '',
        companyName: a.companyName || '',
        createdAt: a.createdAt,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return res.json({ ok: true, referredAccounts: referred });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error al cargar referidos');
    return res.status(500).json({ ok: false, error: 'Error al cargar referidos' });
  }
}

// ── Email builder ──────────────────────────────────────────────────────────────

async function sendAffiliateRequestEmails(payload) {
  const now = new Date().toISOString();
  const meta = { adminNotifiedAt: null, applicantNotifiedAt: null };
  const adminEmail = getAffiliateContactEmail();
  const adminHtml = buildAffiliateRequestEmail(payload);

  try {
    await sendEmail({
      to: adminEmail,
      subject: `Nueva solicitud de afiliado: ${payload.name}`,
      html: adminHtml,
      replyTo: payload.email,
    });
    meta.adminNotifiedAt = now;
    logger.info({ tag: 'AFFILIATE', to: adminEmail }, 'Email de solicitud enviado al admin');
  } catch (emailErr) {
    logger.warn({ tag: 'AFFILIATE', emailErr, to: adminEmail }, 'Fallo email admin de solicitud de afiliado');
    try {
      await sendAdminAlert({
        key: `affiliate_request_${payload.email}`,
        subject: `Nueva solicitud de afiliado: ${payload.name}`,
        html: adminHtml,
        cooldownMs: 60_000,
      });
      meta.adminNotifiedAt = now;
    } catch (alertErr) {
      logger.warn({ tag: 'AFFILIATE', alertErr }, 'Fallo alerta admin de solicitud de afiliado');
    }
  }

  try {
    await sendEmail({
      to: payload.email,
      subject: 'Hemos recibido tu solicitud de afiliación · Vertial',
      html: buildAffiliateApplicantConfirmationEmail(payload),
    });
    meta.applicantNotifiedAt = now;
    logger.info({ tag: 'AFFILIATE', to: payload.email }, 'Email de confirmación enviado al solicitante');
  } catch (emailErr) {
    logger.warn({ tag: 'AFFILIATE', emailErr, to: payload.email }, 'Fallo email de confirmación al solicitante');
  }

  return meta;
}

function buildAffiliateRequestEmail({ name, email, phone, whatsapp, company, website, verticals, message, affiliateCode, affiliateId }) {
  const verticalsHtml = (verticals || [])
    .map(
      (v) =>
        `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:3px 10px;border-radius:20px;font-size:13px;margin:2px 4px 2px 0;">${escapeHtml(v)}</span>`,
    )
    .join('');

  const rows = [
    ['Nombre', name],
    ['Email', email],
    ['Teléfono', phone || '—'],
    ['WhatsApp', whatsapp || phone || '—'],
    ['Empresa', company || '—'],
    ['Web', website || '—'],
    ...(affiliateCode ? [['Código reservado', affiliateCode]] : []),
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 16px;font-weight:600;color:#374151;background:#f9fafb;width:140px;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td>
        <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');

  const messageBlock = message
    ? `<tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#374151;font-size:14px;">Mensaje adicional</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
        </td></tr>`
    : '';

  const actionButtonsBlock = affiliateId
    ? `<tr><td style="padding:28px 32px 0;">
          <p style="margin:0 0 14px;font-weight:600;color:#374151;font-size:14px;">Gestionar solicitud</p>
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding-bottom:10px;">
                  <a href="${escapeHtml(buildAffiliateEmailActionUrl(affiliateId, 'accept'))}"
                     style="display:block;background:#16a34a;color:#fff;padding:14px 18px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">
                    ✅ Aceptar solicitud
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:10px;">
                  <a href="${escapeHtml(buildAffiliateEmailActionUrl(affiliateId, 'pending'))}"
                     style="display:block;background:#f59e0b;color:#fff;padding:14px 18px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">
                    ⏳ Mantener pendiente
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:10px;">
                  <a href="${escapeHtml(buildAffiliateEmailActionUrl(affiliateId, 'reject'))}"
                     style="display:block;background:#ef4444;color:#fff;padding:14px 18px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">
                    ❌ Rechazar solicitud
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${escapeHtml(adminAffiliateRequestsUrl())}"
                     style="display:block;background:#111827;color:#fff;padding:12px 18px;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;text-align:center;">
                    Abrir panel admin
                  </a>
                </td>
              </tr>
            </table>
          </td></tr></table>
          <p style="margin:14px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">Los enlaces de acción caducan a los 7 días. Al aceptar, el solicitante recibe su código por email automáticamente.</p>
        </td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">Vertial</span>
          <span style="color:#9ca3af;font-size:14px;margin-left:12px;">· Solicitud de afiliado</span>
        </td></tr>
        <tr><td style="padding:32px 32px 0;">
          <h2 style="margin:0 0 8px;color:#111;font-size:20px;">Nueva solicitud de afiliado</h2>
          <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">Has recibido una nueva solicitud para unirse al programa de afiliados de Vertial. Puedes gestionarla desde el panel admin.</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            ${rowsHtml}
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-weight:600;color:#374151;font-size:14px;">Verticales solicitadas</p>
          <div>${verticalsHtml || '<span style="color:#6b7280;font-size:14px;">—</span>'}</div>
        </td></tr>
        ${messageBlock}
        ${actionButtonsBlock}
        <tr><td style="padding:32px;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">Generado automáticamente desde <a href="${escapeHtml(affiliateRequestFormUrl())}" style="color:#2563eb;">${escapeHtml(affiliateRequestFormUrl().replace(/^https?:\/\//, ''))}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAffiliateApplicantConfirmationEmail({ name, verticals }) {
  const verticalsText = (verticals || []).map((v) => escapeHtml(v)).join(', ');
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">Vertial</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Hola ${escapeHtml(name)},</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Hemos recibido tu solicitud para unirte al <strong>programa de afiliados de Vertial</strong>.
            Nuestro equipo la revisará y te contactaremos en un plazo máximo de <strong>48 horas</strong>.
          </p>
          ${verticalsText ? `<p style="color:#555;margin:0 0 16px;line-height:1.6;">Sectores indicados: <strong>${verticalsText}</strong>.</p>` : ''}
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Cuando seas aceptado recibirás un correo con tu código de afiliado para acceder a tu panel.
          </p>
          <p style="color:#888;font-size:13px;margin:0;line-height:1.5;">
            Si tienes alguna duda, responde a este correo y te ayudaremos.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">Vertial · Programa de afiliados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAffiliateAcceptedEmail(affiliate) {
  const portalUrl = affiliatePortalUrl();
  const hasLinkedAccount = Boolean(affiliate.linkedAccountUserId || affiliate.portalAccessMode === 'account');
  const accessBlock = hasLinkedAccount
    ? `<p style="color:#555;margin:0 0 16px;line-height:1.6;">
         Accede a tu panel con el <strong>mismo email y contraseña</strong> que usas en Vertial:
       </p>
       <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="background:#111;border-radius:8px;">
         <a href="${escapeHtml(portalUrl)}"
            style="display:inline-block;background:#111;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
           Entrar al panel de afiliado
         </a>
       </td></tr></table>
       <p style="color:#6b7280;margin:0 0 16px;font-size:13px;line-height:1.5;">
         Tu código de referido para nuevos clientes sigue siendo
         <strong style="font-family:monospace;">${escapeHtml(affiliate.referralCode || '—')}</strong>
         (no lo uses para entrar al panel).
       </p>`
    : `<p style="color:#555;margin:0 0 16px;line-height:1.6;">
         Tu solicitud ha sido <strong>aceptada</strong>. Para activar tu acceso:
       </p>
       <ol style="color:#555;margin:0 0 16px;padding-left:20px;line-height:1.7;font-size:14px;">
         <li>Regístrate en Vertial con este email: <strong>${escapeHtml(affiliate.email)}</strong></li>
         <li>Entra al panel de afiliado con ese email y contraseña</li>
       </ol>
       <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;"><tr><td style="background:#2563eb;border-radius:8px;">
         <a href="${escapeHtml(`${getPublicSiteUrl()}/auth/register`)}"
            style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
           Crear cuenta Vertial
         </a>
       </td></tr></table>
       <p style="color:#555;margin:0 0 8px;line-height:1.6;font-size:14px;">
         Código de panel (alternativo): <strong style="font-family:monospace;letter-spacing:1px;">${escapeHtml(affiliate.affiliateCode || '')}</strong>
       </p>
       <p style="color:#555;margin:0 0 16px;line-height:1.6;font-size:14px;">
         Código de referido para clientes: <strong style="font-family:monospace;">${escapeHtml(affiliate.referralCode || '—')}</strong>
       </p>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#16a34a;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">Vertial · Afiliado aceptado</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">¡Bienvenido, ${escapeHtml(affiliate.name)}!</h2>
          ${accessBlock}
          <p style="color:#555;margin:0;line-height:1.6;font-size:14px;">
            Comisión base: <strong>${Number(affiliate.commissionRate) || DEFAULT_AFFILIATE_COMMISSION_RATE}%</strong>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">Vertial · Programa de afiliados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAffiliateRejectedEmail(affiliate) {
  const formUrl = affiliateRequestFormUrl();
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#111;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">Vertial</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:22px;">Hola ${escapeHtml(affiliate.name)},</h2>
          <p style="color:#555;margin:0 0 16px;line-height:1.6;">
            Gracias por tu interés en el programa de afiliados de Vertial. Tras revisar tu solicitud,
            en este momento <strong>no podemos aprobarla</strong>.
          </p>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Si crees que ha sido un error o tu situación ha cambiado, puedes volver a solicitar acceso
            o contactarnos respondiendo a este correo.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#2563eb;border-radius:8px;">
            <a href="${escapeHtml(formUrl)}"
               style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
              Volver a solicitar
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#aaa;font-size:12px;">Vertial · Programa de afiliados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAffiliateEmailActionResultHtml({
  ok,
  title,
  message,
  affiliate,
  adminUrl,
  statusLabel,
  emailNote,
}) {
  const accent = ok ? '#16a34a' : '#dc2626';
  const affiliateBlock = affiliate
    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:20px 0;text-align:left;">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Solicitante</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:#111;">${escapeHtml(affiliate.name)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#374151;">${escapeHtml(affiliate.email)}</p>
        ${affiliate.affiliateCode ? `<p style="margin:8px 0 0;font-size:12px;color:#374151;">Código: <strong style="font-family:monospace;">${escapeHtml(affiliate.affiliateCode)}</strong></p>` : ''}
        ${statusLabel ? `<p style="margin:8px 0 0;font-size:12px;color:#374151;">Estado: <strong>${escapeHtml(statusLabel)}</strong></p>` : ''}
      </div>`
    : '';
  const noteBlock = emailNote
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(emailNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${accent};padding:24px 28px;">
          <span style="color:#fff;font-size:20px;font-weight:bold;">Vertial · Afiliados</span>
        </td></tr>
        <tr><td style="padding:28px;text-align:center;">
          <h1 style="margin:0 0 12px;color:#111;font-size:24px;">${escapeHtml(title)}</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
          ${affiliateBlock}
          ${noteBlock}
          ${adminUrl ? `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr><td style="background:#111827;border-radius:10px;">
            <a href="${escapeHtml(adminUrl)}" style="display:inline-block;color:#fff;padding:12px 22px;text-decoration:none;font-weight:600;font-size:14px;">
              Ir al panel admin
            </a>
          </td></tr></table>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
