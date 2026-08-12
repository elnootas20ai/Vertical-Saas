/**
 * Core RRHH: enlaces / QR de invitación por centro de trabajo.
 * El trabajador escanea, se registra (o entra) y se une al equipo con tienda + rol.
 */
import crypto from 'node:crypto';
import { canManageBusinessTeam } from '../services/businessAccess.js';
import {
  buildWorkerInviteLinkDocument,
  findAccountByUserId,
  findBusinessById,
  findWorkCenterById,
  findWorkerInviteLinkById,
  findWorkerInviteLinkByToken,
  hashToken,
  isWorkerInviteLinkRedeemable,
  listAllBusinesses,
  listWorkerInviteLinksByBusiness,
  logAccountActivity,
  normalizePermissionMatrix,
  sanitizeAccount,
  sanitizeWorkerInviteLink,
  saveAccount,
  saveBusiness,
  saveWorkerInviteLink,
  upsertWorkerInviteTokenPointer,
} from '../services/couchdb.js';
import { isCouchConflictError, withCouchConflictRetry } from '../services/couchConflictRetry.js';
import {
  applyInviteScheduleTemplate,
  getShiftTemplateMeta,
} from '../services/inviteScheduleAssign.js';
import { applyInviteRoleTasks } from '../services/inviteRoleTasksAssign.js';
import {
  computeWorkerProfileCompletion,
  hasMinimumWorkerIdentity,
  mergeEmploymentInfo,
  resolveRedirectAfterInvitationAccept,
  WORKER_DEFAULT_LANDING_PATH,
} from '../services/workerProfileCompletion.js';
import { evaluateWorkerSeatCapacity } from '../services/workerSeatLimits.js';
import { sendEmail, buildWorkerWelcomeEmail } from '../services/email.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function getAppBaseUrl() {
  const explicit = String(process.env.APP_URL || process.env.VITE_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return 'https://vertialapp.com';
}

function buildJoinUrl(rawToken) {
  return `${getAppBaseUrl()}/auth/join?token=${encodeURIComponent(rawToken)}`;
}

function defaultRoleForBusinessType(businessType) {
  const bt = String(businessType || '').trim();
  if (bt === 'realEstate' || bt === 'events') return 'Comercial';
  if (bt === 'restaurant' || bt === 'bar' || bt === 'cafe') return 'Mostrador / Atención';
  if (bt === 'butcherShop') return 'Mostrador / Atención';
  if (bt === 'delivery') return 'Mostrador / Atención';
  return 'Usuario';
}

async function assertCanManageTeam(req, businessId) {
  const actorUserId = String(req.authUser?.userId || '').trim();
  if (!actorUserId) return { ok: false, status: 401, error: 'No autenticado' };
  const business = await findBusinessById(req, businessId);
  if (!business) return { ok: false, status: 404, error: 'Empresa no encontrada' };
  if (!canManageBusinessTeam(business, actorUserId)) {
    return { ok: false, status: 403, error: 'No tienes permiso para gestionar el equipo' };
  }
  return { ok: true, business, actorUserId };
}

async function sendJoinWelcomeEmail(account, { companyName, storeName, role }) {
  const to = String(account?.email || '').trim().toLowerCase();
  if (!to || !to.includes('@') || account?.workerWelcomeEmailSentAt) return;
  try {
    const { subject, html } = buildWorkerWelcomeEmail({
      name: account.fullName || account.firstName || '',
      companyName: companyName || account.companyName || '',
      storeName: storeName || '',
      role: role || account.role || '',
      scheduleLabel: '',
    });
    await sendEmail({ to, subject, html });
    // mark sent if possible — best-effort via caller save
  } catch (err) {
    console.error('[AUTH] Welcome email (QR join):', err?.message);
  }
}

export async function createWorkerInviteLink(req, res) {
  try {
    const {
      businessId,
      workCenterId,
      role: roleRaw,
      permissions,
      landingPage,
      scheduleTemplateId = '',
      position = '',
      maxUses,
      expiresInDays = 90,
    } = req.body || {};

    const wcId = String(workCenterId || '').trim();
    if (!String(businessId || '').trim()) return badRequest(res, 'businessId es obligatorio');
    if (!wcId) return badRequest(res, 'Debes elegir una tienda u oficina');

    const access = await assertCanManageTeam(req, businessId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
    const { business, actorUserId } = access;

    const workCenter = await findWorkCenterById(req, wcId);
    if (!workCenter) {
      return res.status(404).json({ ok: false, error: 'Centro de trabajo no encontrado' });
    }
    const wcBusinessId = String(workCenter.business_id || workCenter.businessId || '').replace(/^business:/, '').trim();
    const bizId = String(business.business_id || '').trim();
    if (wcBusinessId && wcBusinessId !== bizId) {
      return badRequest(res, 'Esa tienda no pertenece a esta empresa');
    }

    const role = String(roleRaw || '').trim() || defaultRoleForBusinessType(business.businessType);
    const resolvedPermissions = normalizePermissionMatrix(permissions, role);
    const resolvedLanding = String(landingPage || '').trim() || WORKER_DEFAULT_LANDING_PATH;

    let inviteWeeklyHours;
    let inviteWorkday = '';
    const tid = String(scheduleTemplateId || '').trim();
    if (tid) {
      const meta = await getShiftTemplateMeta(req, bizId, tid);
      if (meta.ok && meta.weeklyHours != null) {
        inviteWeeklyHours = meta.weeklyHours;
        inviteWorkday = meta.workday || '';
      }
    }

    const employment = {
      position: String(position || '').trim() || role,
      workday: inviteWorkday || 'completa',
      ...(inviteWeeklyHours != null && inviteWeeklyHours > 0 ? { hoursPerWeek: inviteWeeklyHours } : {}),
      salesPointId: wcId,
    };

    let invitedByName = '';
    try {
      const inviter = await findAccountByUserId(req, actorUserId);
      invitedByName = String(inviter?.fullName || '').trim();
    } catch {
      /* noop */
    }
    if (!invitedByName) invitedByName = String(business.name || '').trim();

    // Un QR activo por tienda+rol: revocar anteriores al regenerar.
    const existing = await listWorkerInviteLinksByBusiness(req, bizId, { includeInactive: false });
    const now = new Date().toISOString();
    for (const prev of existing) {
      if (prev.workCenterId === wcId && String(prev.role || '') === role) {
        await saveWorkerInviteLink(req, {
          ...prev,
          status: 'revoked',
          revokedAt: now,
          updatedAt: now,
        });
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const doc = buildWorkerInviteLinkDocument({
      tokenHash: hashToken(rawToken),
      businessId: bizId,
      businessName: business.name || '',
      workCenterId: wcId,
      workCenterName: String(workCenter.name || '').trim(),
      role,
      permissions: resolvedPermissions,
      landingPage: resolvedLanding,
      employment,
      scheduleTemplateId: tid,
      invitedBy: actorUserId,
      invitedByName,
      maxUses: maxUses == null || maxUses === '' ? null : maxUses,
      expiresInDays: Number(expiresInDays) || 90,
    });

    const saved = await saveWorkerInviteLink(req, doc);
    try {
      await upsertWorkerInviteTokenPointer(req, saved.tokenHash, saved.link_id);
    } catch (ptrErr) {
      console.error('[AUTH] QR invite token ptr:', ptrErr?.message);
    }

    await logAccountActivity(req, {
      actorUserId,
      actorName: invitedByName,
      targetUserId: business.owner_user_id,
      type: 'team',
      action: 'Enlace QR de invitación creado',
      entityId: saved.link_id,
      entityLabel: `${saved.workCenterName || 'Centro'} · ${role}`,
      metadata: { businessId: bizId, workCenterId: wcId, role },
    });

    return res.status(201).json({
      ok: true,
      inviteLink: sanitizeWorkerInviteLink(saved),
      token: rawToken,
      joinUrl: buildJoinUrl(rawToken),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear el enlace de invitación',
    });
  }
}

export async function listWorkerInviteLinks(req, res) {
  try {
    const businessId = String(req.params.businessId || '').trim();
    if (!businessId) return badRequest(res, 'businessId obligatorio');
    const access = await assertCanManageTeam(req, businessId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const links = await listWorkerInviteLinksByBusiness(req, businessId, { includeInactive });
    links.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({
      ok: true,
      inviteLinks: links.map((d) => sanitizeWorkerInviteLink(d)),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al listar enlaces',
    });
  }
}

export async function revokeWorkerInviteLink(req, res) {
  try {
    const linkId = String(req.params.linkId || '').trim();
    if (!linkId) return badRequest(res, 'linkId obligatorio');

    const doc = await findWorkerInviteLinkById(req, linkId);
    if (!doc || doc.type !== 'worker_invite_link' || doc.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Enlace no encontrado' });
    }

    const access = await assertCanManageTeam(req, doc.business_id);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const now = new Date().toISOString();
    const saved = await saveWorkerInviteLink(req, {
      ...doc,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    });

    await logAccountActivity(req, {
      actorUserId: access.actorUserId,
      actorName: '',
      targetUserId: access.business.owner_user_id,
      type: 'team',
      action: 'Enlace QR de invitación revocado',
      entityId: saved.link_id,
      entityLabel: saved.workCenterName || saved.link_id,
      metadata: { businessId: saved.business_id },
    });

    return res.json({ ok: true, inviteLink: sanitizeWorkerInviteLink(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al revocar el enlace',
    });
  }
}

export async function previewWorkerInviteLink(req, res) {
  try {
    const token = String(req.query.token || req.params.token || '').trim();
    if (!token) return badRequest(res, 'Token obligatorio');

    const doc = await findWorkerInviteLinkByToken(req, token);
    if (!doc) {
      return res.status(404).json({ ok: false, code: 'JOIN_NOT_FOUND', error: 'Enlace no válido o revocado.' });
    }
    if (!isWorkerInviteLinkRedeemable(doc)) {
      const expired = doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now();
      return res.status(410).json({
        ok: false,
        code: expired ? 'JOIN_EXPIRED' : 'JOIN_INACTIVE',
        error: expired ? 'Este enlace ha caducado.' : 'Este enlace ya no está activo.',
      });
    }

    return res.json({
      ok: true,
      preview: {
        businessName: doc.businessName || 'Empresa',
        workCenterName: doc.workCenterName || 'Centro',
        role: doc.role || 'Usuario',
        expiresAt: doc.expiresAt || '',
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar el enlace',
    });
  }
}

export async function redeemWorkerInviteLink(req, res) {
  try {
    const userId = String(req.authUser?.userId || '').trim();
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const token = String(req.body?.token || '').trim();
    if (!token) return badRequest(res, 'Token obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if ((account.accountType || 'company') === 'company') {
      return res.status(409).json({
        ok: false,
        code: 'COMPANY_ACCOUNT',
        error: 'Esta es una cuenta de empresa. Entra con Acceso empleado para unirte al equipo.',
      });
    }

    const acceptDay = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    /** @type {{ alreadyMember: boolean, business: any, doc: any, newMember?: any } | null} */
    let joinState = null;

    try {
      joinState = await withCouchConflictRetry(async () => {
        const doc = await findWorkerInviteLinkByToken(req, token);
        if (!doc) {
          const err = new Error('Enlace no válido o revocado.');
          err.statusCode = 404;
          err.code = 'JOIN_NOT_FOUND';
          throw err;
        }
        if (!isWorkerInviteLinkRedeemable(doc)) {
          const err = new Error('Este enlace ya no está activo.');
          err.statusCode = 410;
          err.code = 'JOIN_INACTIVE';
          throw err;
        }

        const business = await findBusinessById(req, doc.business_id);
        if (!business) {
          const err = new Error('La empresa ya no existe.');
          err.statusCode = 404;
          throw err;
        }

        const members = Array.isArray(business.members) ? business.members : [];
        const isOwner = business.owner_user_id === account.user_id;
        const isAlreadyMember = members.some((m) => m.user_id === account.user_id);
        if (isOwner || isAlreadyMember) {
          return { alreadyMember: true, business, doc };
        }

        try {
          const allBusinesses = await listAllBusinesses(req);
          const ownsOther = allBusinesses.find(
            (b) => b.owner_user_id === account.user_id && b.business_id !== business.business_id,
          );
          if (ownsOther) {
            const err = new Error(
              `Administras otra empresa (${ownsOther.name || 'sin nombre'}). No puedes unirte a un segundo equipo.`,
            );
            err.statusCode = 409;
            err.code = 'OWNER_OF_OTHER_BUSINESS';
            throw err;
          }
        } catch (lookupErr) {
          if (lookupErr?.code === 'OWNER_OF_OTHER_BUSINESS') throw lookupErr;
          console.error('[AUTH] QR join owns-other check:', lookupErr?.message);
        }

        const seatCheck = await evaluateWorkerSeatCapacity(req, business, { seatsNeeded: 1 });
        if (!seatCheck.ok) {
          const err = new Error(seatCheck.error || 'No hay plazas de trabajador disponibles.');
          err.statusCode = 403;
          err.code = seatCheck.code || 'WORKER_SEAT_LIMIT';
          err.workerSeats = {
            used: seatCheck.used,
            limit: seatCheck.limit,
            remaining: seatCheck.remaining,
          };
          throw err;
        }

        const now = new Date().toISOString();
        const inviteEmployment = doc.employment || {};
        const salesPointId = String(inviteEmployment.salesPointId || doc.workCenterId || '').trim();
        const role = doc.role || 'Usuario';
        const permissions = normalizePermissionMatrix(doc.permissions, role);
        const resolvedFullName = String(account.fullName || '').trim();

        const newMember = {
          user_id: account.user_id,
          fullName: resolvedFullName,
          email: account.email,
          role,
          permissions,
          joinedAt: now,
          employment: {
            salesPointId: salesPointId || undefined,
            position: inviteEmployment.position || role,
            contractType: inviteEmployment.contractType || undefined,
            workday: inviteEmployment.workday || 'completa',
            startDate: acceptDay,
            ...(inviteEmployment.hoursPerWeek != null ? { hoursPerWeek: inviteEmployment.hoursPerWeek } : {}),
          },
        };

        await saveBusiness(req, {
          ...business,
          members: [...members, newMember],
          updatedAt: now,
        });

        return { alreadyMember: false, business, doc, newMember, now, salesPointId, role, permissions, inviteEmployment, resolvedFullName };
      }, { maxAttempts: 8, baseDelayMs: 55 });
    } catch (err) {
      const status = Number(err?.statusCode || 0);
      if (status === 404 || status === 403 || status === 410 || status === 409) {
        const body = {
          ok: false,
          code: err.code,
          error: err.message || 'No se pudo unir al equipo',
        };
        if (err.workerSeats) body.workerSeats = err.workerSeats;
        return res.status(status).json(body);
      }
      if (isCouchConflictError(err)) {
        return res.status(503).json({
          ok: false,
          code: 'JOIN_BUSY',
          error: 'Muchas personas entrando a la vez. Espera un segundo y pulsa de nuevo.',
        });
      }
      throw err;
    }

    if (joinState.alreadyMember) {
      const fresh = (await findAccountByUserId(req, account.user_id)) || account;
      return res.json({
        ok: true,
        alreadyMember: true,
        user: sanitizeAccount(fresh),
        redirectTo: resolveRedirectAfterInvitationAccept(fresh),
      });
    }

    const {
      business,
      doc,
      newMember,
      now,
      salesPointId,
      role,
      permissions,
      inviteEmployment,
      resolvedFullName,
    } = joinState;

    const mergedEmployment = mergeEmploymentInfo(account.employment, {
      ...inviteEmployment,
      position: inviteEmployment.position || role,
      salesPointId: salesPointId || String(account.employment?.salesPointId || '').trim(),
      workday: inviteEmployment.workday || 'completa',
      startDate: String(inviteEmployment.startDate || account.employment?.startDate || '').trim() || acceptDay,
    });

    const profileDraft = {
      ...account,
      employment: mergedEmployment,
      invitedBy: account.invitedBy || doc.invitedBy || '',
    };

    let updatedAccount = await saveAccount(req, {
      ...account,
      accountType: 'user',
      linkedBusinessId: business.business_id,
      companyName: business.name || account.companyName,
      invitedBy: profileDraft.invitedBy,
      role,
      permissions,
      landingPage: doc.landingPage || account.landingPage || WORKER_DEFAULT_LANDING_PATH,
      employment: mergedEmployment,
      workerProfileCompletion: computeWorkerProfileCompletion(profileDraft),
      workerIdentityCompleted: hasMinimumWorkerIdentity(profileDraft),
      pendingTeamInvite: null,
      inviteStatus: 'accepted',
      updatedAt: now,
    });

    // useCount con reintento: no debe tumbar el join si ya eres miembro.
    try {
      await withCouchConflictRetry(async () => {
        const freshLink = (await findWorkerInviteLinkById(req, doc.link_id)) || doc;
        if (!freshLink || freshLink.deletedAt) return;
        const useCount = Number(freshLink.useCount || 0) + 1;
        let linkStatus = freshLink.status;
        if (freshLink.maxUses != null && useCount >= Number(freshLink.maxUses)) {
          linkStatus = 'exhausted';
        }
        await saveWorkerInviteLink(req, {
          ...freshLink,
          useCount,
          status: linkStatus,
          updatedAt: new Date().toISOString(),
        });
      }, { maxAttempts: 6, baseDelayMs: 40 });
    } catch (countErr) {
      console.error('[AUTH] QR join useCount:', countErr?.message);
    }

    if (doc.scheduleTemplateId) {
      let workCenterName = doc.workCenterName || '';
      if (!workCenterName && salesPointId) {
        try {
          const wc = await findWorkCenterById(req, salesPointId);
          workCenterName = String(wc?.name || '').trim();
        } catch {
          /* noop */
        }
      }
      const scheduleResult = await applyInviteScheduleTemplate(req, {
        businessId: business.business_id,
        memberId: account.user_id,
        memberName: resolvedFullName,
        templateId: doc.scheduleTemplateId,
        workCenterId: salesPointId,
        workCenterName,
      });
      if (scheduleResult.applied && scheduleResult.weeklyHours != null && scheduleResult.weeklyHours > 0) {
        const syncedEmployment = mergeEmploymentInfo(updatedAccount.employment, {
          hoursPerWeek: scheduleResult.weeklyHours,
          workday: scheduleResult.workday || inviteEmployment.workday || 'completa',
        });
        updatedAccount = await saveAccount(req, {
          ...updatedAccount,
          employment: syncedEmployment,
          workerProfileCompletion: computeWorkerProfileCompletion({
            ...updatedAccount,
            employment: syncedEmployment,
          }),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    try {
      await applyInviteRoleTasks(req, {
        businessId: business.business_id,
        memberId: account.user_id,
        role,
        businessType: business.businessType,
      });
    } catch (taskErr) {
      console.error('[AUTH] QR join role tasks:', taskErr?.message);
    }

    void sendJoinWelcomeEmail(updatedAccount, {
      companyName: business.name || '',
      storeName: doc.workCenterName || '',
      role,
    }).then(async () => {
      try {
        const fresh = await findAccountByUserId(req, account.user_id);
        if (fresh && !fresh.workerWelcomeEmailSentAt) {
          await saveAccount(req, {
            ...fresh,
            workerWelcomeEmailSentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        /* noop */
      }
    });

    await logAccountActivity(req, {
      actorUserId: account.user_id,
      actorName: resolvedFullName,
      targetUserId: business.owner_user_id,
      type: 'team',
      action: 'Unión al equipo por QR / enlace',
      entityId: doc.link_id,
      entityLabel: business.name || '',
      metadata: {
        businessId: business.business_id,
        workCenterId: salesPointId,
        role,
        via: 'worker_invite_link',
      },
    });

    return res.json({
      ok: true,
      user: sanitizeAccount(updatedAccount),
      redirectTo: resolveRedirectAfterInvitationAccept(updatedAccount),
    });
  } catch (error) {
    if (isCouchConflictError(error)) {
      return res.status(503).json({
        ok: false,
        code: 'JOIN_BUSY',
        error: 'Muchas personas entrando a la vez. Espera un segundo y pulsa de nuevo.',
      });
    }
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al unirse al equipo',
    });
  }
}
