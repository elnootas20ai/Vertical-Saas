import { sendEmail } from '../services/email.js';
import logger from '../services/logger.js';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  deleteDocument,
  findAccountByUserId,
} from '../services/couchdb.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

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

function getAffiliateContactEmail() {
  return (
    process.env.AFFILIATE_EMAIL ||
    process.env.DEFAULT_CONTACT_EMAIL ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    'hola@vertialapp.com'
  );
}

function getPublicSiteUrl() {
  return process.env.APP_URL || 'https://vertialapp.com';
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

    const doc = {
      _id: id,
      type: 'affiliate',
      user_id: 'public_request',
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      whatsapp: whatsapp?.trim() || phone?.trim() || '',
      company: company?.trim() || '',
      website: website?.trim() || '',
      verticals: verticals || [],
      message: message?.trim() || '',
      affiliateCode,
      referralCode,
      commissionRate: 10,
      status: 'pending',
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, AFFILIATES_DB, id, doc);

    logger.info({ tag: 'AFFILIATE', email, verticals, affiliateCode }, 'Solicitud de afiliado recibida');

    try {
      const affiliateEmail = getAffiliateContactEmail();
      const html = buildAffiliateRequestEmail({ name, email, phone, whatsapp, company, website, verticals, message });
      await sendEmail({
        to: affiliateEmail,
        subject: `Nueva solicitud de afiliado: ${name.trim()}`,
        html,
      });
    } catch (emailErr) {
      logger.warn({ tag: 'AFFILIATE', emailErr }, 'No se pudo enviar email de notificación (la solicitud se guardó correctamente)');
    }

    return res.json({ ok: true, message: 'Solicitud enviada correctamente.' });
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

    return res.json({ ok: true, affiliate: sanitizeAffiliate(affiliate) });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_PORTAL', err }, 'Error en login de portal');
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

function sanitizeAffiliate(aff) {
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
  };
}

// ── Admin: Affiliates CRUD ─────────────────────────────────────────────────────

export async function listAffiliatesAdmin(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureAffiliatesDb(req);
    const all = await getAllDocuments(req, AFFILIATES_DB);

    const affiliates = all
      .filter((d) => d.type === 'affiliate' && !d.deletedAt)
      .filter((d) => d.user_id === userId || d.user_id === 'public_request')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.json({ ok: true, affiliates });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al listar afiliados');
    return res.status(500).json({ ok: false, error: err.message || 'Error al cargar afiliados' });
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
      commissionRate: Number(commissionRate) || 10,
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

export async function updateAffiliateStatusAdmin(req, res) {
  try {
    const { userId, affiliateId } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'accepted', 'rejected'];

    if (!userId || !affiliateId) return badRequest(res, 'Faltan parámetros');
    if (!status || !validStatuses.includes(status)) return badRequest(res, 'Estado no válido');

    await ensureAffiliatesDb(req);
    const existing = await getDocument(req, AFFILIATES_DB, affiliateId);
    if (!existing || existing.type !== 'affiliate' || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Afiliado no encontrado' });
    }

    const doc = {
      ...existing,
      status,
      user_id: existing.user_id === 'public_request' ? userId : existing.user_id,
      updatedAt: new Date().toISOString(),
    };
    await putDocument(req, AFFILIATES_DB, affiliateId, doc);
    return res.json({ ok: true, affiliate: doc });
  } catch (err) {
    logger.error({ tag: 'AFFILIATE_ADMIN', err }, 'Error al actualizar estado de afiliado');
    return res.status(500).json({ ok: false, error: err.message || 'Error al actualizar estado' });
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

function buildAffiliateRequestEmail({ name, email, phone, whatsapp, company, website, verticals, message }) {
  const verticalsHtml = verticals
    .map(
      (v) =>
        `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:3px 10px;border-radius:20px;font-size:13px;margin:2px 4px 2px 0;">${v}</span>`,
    )
    .join('');

  const rows = [
    ['Nombre', name],
    ['Email', email],
    ['Teléfono', phone || '—'],
    ['WhatsApp', whatsapp || phone || '—'],
    ['Empresa', company || '—'],
    ['Web', website || '—'],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 16px;font-weight:600;color:#374151;background:#f9fafb;width:140px;border-bottom:1px solid #e5e7eb;">${label}</td>
        <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${value}</td>
      </tr>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">UDAR</span>
          <span style="color:#9ca3af;font-size:14px;margin-left:12px;">· Solicitud de afiliado</span>
        </td></tr>
        <tr><td style="padding:32px 32px 0;">
          <h2 style="margin:0 0 8px;color:#111;font-size:20px;">Nueva solicitud de afiliado</h2>
          <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">Has recibido una nueva solicitud para unirse al programa de afiliados de UDAR.</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            ${rowsHtml}
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-weight:600;color:#374151;font-size:14px;">Verticales solicitadas</p>
          <div>${verticalsHtml}</div>
        </td></tr>
        ${
          message
            ? `<tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#374151;font-size:14px;">Mensaje adicional</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;color:#374151;font-size:14px;line-height:1.6;">${message.replace(/\n/g, '<br>')}</div>
        </td></tr>`
            : ''
        }
        <tr><td style="padding:32px;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">Este correo fue generado automáticamente desde el formulario de afiliados de <a href="${getPublicSiteUrl()}" style="color:#2563eb;">${getPublicSiteUrl().replace(/^https?:\/\//, '')}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
