import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import {
  ACCOUNTS_DB,
  BUSINESSES_DB,
  CARDS_DB,
  ROLE_DEFINITIONS,
  buildAccountDocument,
  buildCardDocument,
  buildActivityRecord,
  buildJoinRequestDocument,
  buildTeamInvitationDocument,
  ensureDatabase,
  extractIp,
  findAccountByEmail,
  findAccountByInviteToken,
  findAccountByRefreshToken,
  findAccountByResetToken,
  findAccountByUserId,
  findAccountForEmailVerification,
  findCardByUserId,
  findBusinessById,
  findBusinessByCompanyCode,
  findPendingInvitationForEmailAndBusiness,
  findTeamInvitationById,
  findTeamMemberByUsername,
  findPendingJoinRequest,
  hashPassword,
  hashPosPin,
  generatePosPin,
  isValidPosPin,
  findPointOfSaleByTerminalCode,
  findWorkCenterById,
  resolveBusinessDocumentForPointOfSale,
  workerCanAccessPdvForTablet,
  sanitizePointOfSale,
  incrementFailedLoginAttempts,
  isAccountLocked,
  listAllBusinesses,
  listInvitationsByBusiness,
  listJoinRequestsByBusiness,
  listJoinRequestsByUser,
  listPendingInvitationsByEmail,
  logAccountActivity,
  listAccounts,
  normalizeNotificationPreferences,
  normalizePermissionMatrix,
  resetFailedLoginAttempts,
  revokeAllSessions,
  revokeRefreshToken,
  revokeSession,
  sanitizeAccount,
  sanitizeCard,
  sanitizeSession,
  saveAccount,
  saveBusiness,
  saveCard,
  saveEmailVerificationToken,
  markVerificationEmailSent,
  persistEmailVerificationAfterSend,
  saveInviteToken,
  saveJoinRequest,
  saveSession,
  saveResetToken,
  saveLoginOtp,
  canResendLoginOtp,
  findAccountByLoginOtp,
  clearLoginOtp,
  saveTeamInvitation,
  findJoinRequestById,
  softDeleteDocument,
  verifyPassword,
  writeChangelog,
} from '../services/couchdb.js';
import {
  mergeEmploymentInfo,
  mergePersonalData,
  computeWorkerProfileCompletion,
  hasMinimumWorkerIdentity,
  resolveRedirectAfterInvitationAccept,
  resolveWorkerSessionEntryPath,
  needsWorkerPayrollSetup,
  WORKER_DEFAULT_LANDING_PATH,
  WORKER_PAYROLL_SETUP_PATH,
  normalizeWorkerLandingPage,
} from '../services/workerProfileCompletion.js';
import { notifyManagersWorkerProfileEvents } from '../services/workerProfileNotifications.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, setAuthCookies, clearAuthCookies } from '../middleware/auth.js';
import {
  sendEmail,
  buildEmailVerificationEmail,
  buildInvitationEmail,
  buildPasswordResetEmail,
  buildLoginCodeEmail,
  buildAccountLockedEmail,
  buildTrialExpiringEmail,
  buildPaymentFailedEmail,
  buildGracePeriodEmail,
  buildSuspensionEmail,
  buildSetupWelcomeEmail,
} from '../services/email.js';
import { sendWelcomeEmail } from '../services/subscriptionLifecycle.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import { applySuperAdminSubscriptionActivation } from '../services/subscriptionAdminActivation.js';
import {
  applyAdminPlanLock,
  isAdminPlanLocked,
  preserveAdminLockedPlan,
} from '../shared/billing/adminPlanLock.js';
import { sendAdminAlert } from '../services/adminAlerts.js';
import logger from '../services/logger.js';
import { invalidateDb } from '../services/cache.js';
import { buildSubscriptionFromOnboarding } from '../shared/billing/onboardingSubscription.js';
import {
  provisionBusinessFromOnboarding,
  resolveBusinessNameFromOnboarding,
} from '../shared/billing/onboardingBusiness.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function getClientIp(req) {
  return extractIp(req);
}

const ADMIN_ONLY_LANDINGS = new Set([
  '/saas/dashboard',
  '/saas/finance',
  '/saas/reports',
  '/saas/team',
  '/saas/billing',
]);

/** Destino tras login con email según tipo de cuenta (gerente vs trabajador). */
function resolvePostLoginRedirect(account, { pendingInvitationsCount = 0 } = {}) {
  if (!account.emailVerified) {
    return '/auth/verify-email-pending';
  }
  if (pendingInvitationsCount > 0) {
    return '/saas/invitations';
  }

  const isUserAccount = account.accountType === 'user';
  const isInvitedWorker = Boolean(String(account.invitedBy || '').trim());
  const landing = String(account.landingPage || '').trim();
  const linkedBusiness = String(account.linkedBusinessId || '').trim();
  const hasWorkerLanding = landing.startsWith('/saas/worker');
  const isWorker = isUserAccount || isInvitedWorker || (hasWorkerLanding && Boolean(linkedBusiness));

  if (isUserAccount && !linkedBusiness) {
    return '/saas/user-dashboard';
  }

  if (isWorker) {
    if (linkedBusiness && needsWorkerPayrollSetup(account)) {
      return WORKER_PAYROLL_SETUP_PATH;
    }
    return resolveWorkerSessionEntryPath(account);
  }

  return '/auth/gate';
}

// S-01 + S-07: Emite tokens JWT, crea sesión y establece httpOnly cookies
async function issueTokens(req, res, account) {
  const sessionId = uuidv4();
  const tokenPayload = {
    userId: account.user_id,
    email: account.email,
    role: account.role,
    accountType: account.accountType || 'company',
    emailVerified: Boolean(account.emailVerified),
    sessionId,
  };
  const accessToken = signAccessToken(tokenPayload);
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  await saveSession(req, account, rawRefreshToken, sessionId, ip, userAgent);

  const refreshToken = signRefreshToken({ userId: account.user_id, raw: rawRefreshToken, sessionId });

  setAuthCookies(res, accessToken, refreshToken);

  return { accessToken, refreshToken, sessionId };
}

function splitFullName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const parts = normalized.split(' ');
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

function generateTemporaryPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function register(req, res) {
  try {
    const { firstName, lastName, email, phone, password, googleCredential, accountType = 'company', referralCode } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return badRequest(res, 'Faltan campos obligatorios');
    }

    if (accountType === 'company' && !phone) {
      return badRequest(res, 'El teléfono es obligatorio para cuentas de empresa');
    }

    if (String(password).length < 8) {
      return badRequest(res, 'La contraseña debe tener al menos 8 caracteres');
    }

    let googleUser = null;
    if (googleCredential) {
      try {
        googleUser = await verifyGoogleIdToken(googleCredential);
        if (googleUser.email.toLowerCase() !== String(email).trim().toLowerCase()) {
          return badRequest(res, 'El email del formulario no coincide con la cuenta de Google');
        }
      } catch (gErr) {
        console.error('[AUTH] Error verificando Google credential en registro:', gErr?.message);
        return badRequest(res, 'Token de Google inválido o expirado. Intenta de nuevo.');
      }
    }

    let resolvedReferralCode = '';
    let referredByAffiliateId = '';
    if (referralCode && typeof referralCode === 'string' && referralCode.trim()) {
      try {
        const { findAffiliateByReferralCode } = await import('./affiliateController.js');
        const affiliate = await findAffiliateByReferralCode(req, referralCode.trim().toUpperCase());
        if (affiliate && affiliate.status === 'accepted') {
          resolvedReferralCode = affiliate.referralCode;
          referredByAffiliateId = affiliate._id;
        }
      } catch (refErr) {
        console.error('[AUTH] Error validando referralCode:', refErr?.message);
      }
    }

    await ensureDatabase(req, ACCOUNTS_DB);
    const existingAccount = await findAccountByEmail(req, email);
    if (existingAccount) {
      return res.status(409).json({ ok: false, error: 'Este email ya está registrado' });
    }

    const isUserAccount = accountType === 'user';

    const account = buildAccountDocument({
      firstName,
      lastName,
      email,
      phone: phone || '',
      password,
      accountType,
      avatar: googleUser?.avatar || '',
      provider: googleUser ? 'google' : 'email',
      emailVerified: googleUser ? googleUser.emailVerified : false,
    });

    if (resolvedReferralCode) {
      account.referralCode = resolvedReferralCode;
      account.referredByAffiliateId = referredByAffiliateId;
    }

    if (googleUser) {
      account.googleId = googleUser.googleId;
      account.googleScopes = googleUser.scopes;
      account.googleProfile = {
        locale: googleUser.locale,
        picture: googleUser.avatar,
        name: googleUser.fullName,
      };
    }

    let savedAccount = await saveAccount(req, account);

    let verificationEmailSent = Boolean(googleUser);
    if (!googleUser) {
      try {
        savedAccount = await sendAccountVerificationEmail(req, savedAccount);
        verificationEmailSent = true;
      } catch (emailError) {
        logger.error(
          { tag: 'AUTH_REGISTER', email: savedAccount.email, err: emailError?.message || emailError },
          'Error enviando email de verificación en registro',
        );
      }
    }

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'team',
      action: googleUser ? 'Cuenta creada con Google OAuth' : 'Cuenta creada',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      metadata: googleUser
        ? { googleId: googleUser.googleId, scopes: googleUser.scopes, accountType }
        : { accountType },
    });

    const referralDisplay = String(resolvedReferralCode || referralCode || '').trim() || '—';
    const accountTypeLabel =
      accountType === 'company' ? 'Empresa' : accountType === 'user' ? 'Usuario' : escapeHtml(String(accountType || '—'));
    const providerLabel =
      savedAccount.provider === 'google'
        ? 'Google'
        : savedAccount.provider === 'email'
          ? 'Correo electrónico'
          : escapeHtml(String(savedAccount.provider || '—'));

    sendAdminAlert({
      key: `user_registered:${savedAccount.user_id}`,
      subject: `Nuevo registro · ${savedAccount.fullName || savedAccount.email}`,
      html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#18181b 0%,#27272a 100%);padding:22px 26px;">
            <p style="margin:0;color:#fafafa;font-size:15px;font-weight:600;letter-spacing:-0.02em;">Vertial</p>
            <p style="margin:6px 0 0;color:#a1a1aa;font-size:13px;line-height:1.4;">Nueva cuenta en la plataforma</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 26px 22px;">
            <p style="margin:0 0 18px;color:#52525b;font-size:14px;line-height:1.55;">Se ha completado un registro. Datos del perfil:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#18181b;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;width:38%;vertical-align:top;">Nombre</td><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${escapeHtml(savedAccount.fullName || '—')}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;vertical-align:top;">Correo</td><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-weight:500;"><a href="mailto:${encodeURIComponent(savedAccount.email || '')}" style="color:#18181b;text-decoration:none;">${escapeHtml(savedAccount.email || '—')}</a></td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;vertical-align:top;">Tipo de cuenta</td><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${accountTypeLabel}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;vertical-align:top;">Acceso</td><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-weight:500;">${providerLabel}</td></tr>
              <tr><td style="padding:10px 0;color:#71717a;vertical-align:top;">Referido</td><td style="padding:10px 0;font-weight:500;">${referralDisplay === '—' ? '—' : escapeHtml(referralDisplay)}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 26px 22px;">
            <p style="margin:0;padding:12px 14px;background:#fafafa;border-radius:10px;font-size:12px;color:#71717a;line-height:1.5;">Mensaje automático del sistema. La facturación y el plan se gestionan desde el panel del cliente cuando corresponda.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      cooldownMs: 0,
    }).catch(() => null);

    let pendingInvitationsCount = 0;
    try {
      const pending = await listPendingInvitationsByEmail(req, savedAccount.email);
      pendingInvitationsCount = pending.length;
    } catch (invErr) {
      console.error('[AUTH] Error consultando invitaciones pendientes en register:', invErr?.message);
    }

    let redirectTo;
    if (!savedAccount.emailVerified) {
      redirectTo = '/auth/verify-email-pending';
    } else if (pendingInvitationsCount > 0) {
      redirectTo = '/saas/invitations';
    } else if (isUserAccount) {
      redirectTo = '/saas/user-dashboard';
    } else {
      redirectTo = '/auth/onboarding/business-type';
    }

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    return res.status(201).json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
      redirectTo,
      pendingInvitationsCount,
      verificationEmailSent,
    });
  } catch (error) {
    if (error?.code === 'ACCOUNT_EMAIL_CONFLICT') {
      return res.status(409).json({ ok: false, error: 'Este email ya está registrado' });
    }
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al registrar la cuenta',
    });
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) : null;

const GOOGLE_SCOPES_GRANTED = ['openid', 'email', 'profile'];

async function verifyGoogleIdToken(credential) {
  if (!googleOAuthClient) {
    throw new Error('Google OAuth no configurado: falta GOOGLE_CLIENT_ID');
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) throw new Error('Token de Google inválido: sin payload');
  if (!payload.email) throw new Error('Token de Google inválido: sin email');

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    firstName: payload.given_name || '',
    lastName: payload.family_name || '',
    fullName: payload.name || '',
    avatar: payload.picture || '',
    locale: payload.locale || '',
    scopes: GOOGLE_SCOPES_GRANTED,
  };
}

export async function googleLogin(req, res) {
  try {
    const { credential } = req.body || {};

    if (!credential) {
      return badRequest(res, 'Se requiere el token de Google (credential)');
    }

    const googleUser = await verifyGoogleIdToken(credential);

    await ensureDatabase(req, ACCOUNTS_DB);
    const account = await findAccountByEmail(req, googleUser.email);

    if (!account) {
      return res.status(404).json({
        ok: false,
        code: 'GOOGLE_ACCOUNT_NOT_FOUND',
        error: 'No existe una cuenta con este email. Debes registrarte primero.',
        googleUser: {
          email: googleUser.email,
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          fullName: googleUser.fullName,
          avatar: googleUser.avatar,
          googleId: googleUser.googleId,
          locale: googleUser.locale,
          emailVerified: googleUser.emailVerified,
        },
      });
    }

    const updatedAccount = {
      ...account,
      firstName: googleUser.firstName || account.firstName,
      lastName: googleUser.lastName || account.lastName,
      fullName: googleUser.fullName || account.fullName || `${googleUser.firstName} ${googleUser.lastName}`.trim(),
      avatar: googleUser.avatar || account.avatar,
      provider: 'google',
      emailVerified: googleUser.emailVerified || account.emailVerified,
      googleId: googleUser.googleId,
      googleScopes: googleUser.scopes,
      googleProfile: {
        locale: googleUser.locale,
        picture: googleUser.avatar,
        name: googleUser.fullName,
      },
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedAccount = await saveAccount(req, updatedAccount);
    const ip = getClientIp(req);

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'login',
      action: 'Inicio de sesión con Google OAuth',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      ip,
      metadata: {
        googleId: googleUser.googleId,
        scopes: googleUser.scopes,
        ip,
        userAgent: req.headers['user-agent'] || '',
      },
    });

    void writeChangelog(req, {
      entity: 'login',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName || savedAccount.email,
      action: 'login',
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName || savedAccount.email,
      changes: {},
      metadata: {
        provider: 'google',
        email: savedAccount.email,
        role: savedAccount.role,
        scopes: googleUser.scopes,
        ip,
        userAgent: req.headers['user-agent'] || '',
      },
    });

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    let redirectTo = '/saas/dashboard';
    if (!savedAccount.emailVerified) {
      redirectTo = '/auth/verify-email-pending';
    }
    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
      redirectTo,
    });
  } catch (error) {
    console.error('[AUTH] Google login error:', error?.message || error);
    return res.status(401).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al verificar las credenciales de Google',
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    const ip = getClientIp(req);

    if (!email || !password) {
      return badRequest(res, 'Email y contraseña son obligatorios');
    }

    let account = await findAccountByEmail(req, email);

    if (!account) {
      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos' });
    }

    // S-03: Verificar bloqueo temporal
    const lockStatus = isAccountLocked(account);
    if (lockStatus.locked) {
      const remainingMin = Math.ceil(lockStatus.remainingMs / 60000);
      return res.status(423).json({
        ok: false,
        error: `Cuenta bloqueada temporalmente. Inténtalo de nuevo en ${remainingMin} minuto${remainingMin !== 1 ? 's' : ''} o usa un código por email.`,
        code: 'ACCOUNT_LOCKED',
        lockUntil: lockStatus.lockUntil,
        canUseLoginCode: true,
      });
    }

    // A-02: Limpieza lazy — el bloqueo expiró; resetear contador para dar inicio fresco
    if (lockStatus.wasExpired) {
      try {
        account = await saveAccount(req, {
          ...account,
          failedLoginAttempts: 0,
          lockUntil: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (cleanupErr) {
        console.error('[AUTH] Error en limpieza lazy de bloqueo:', cleanupErr?.message);
      }
    }

    // S-03: Verificar contraseña — si falla, incrementar contador
    if (!verifyPassword(password, account.passwordHash)) {
      const { justLocked, lockUntil, failedLoginAttempts } = await incrementFailedLoginAttempts(req, account);

      if (justLocked) {
        try {
          const { subject, html } = buildAccountLockedEmail(account.email, lockUntil, ip);
          await sendEmail({ to: account.email, subject, html });
        } catch (emailErr) {
          console.error('[AUTH] Error enviando email de bloqueo:', emailErr?.message);
        }
        await logAccountActivity(req, {
          actorUserId: account.user_id,
          actorName: account.fullName,
          targetUserId: account.user_id,
          type: 'security',
          action: 'Cuenta bloqueada por intentos fallidos',
          entityId: account.user_id,
          entityLabel: account.fullName,
          ip,
          metadata: { failedLoginAttempts, lockUntil, ip },
        });
      }

      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos' });
    }

    // S-03: Login exitoso → resetear contador
    const savedAccount = await saveAccount(req, {
      ...account,
      status: 'active',
      inviteStatus: account.inviteStatus === 'pending' ? 'accepted' : account.inviteStatus,
      lastLoginAt: new Date().toISOString(),
      failedLoginAttempts: 0,
      lockUntil: null,
      updatedAt: new Date().toISOString(),
    });

    // S-04: Log de actividad con IP
    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'login',
      action: 'Inicio de sesión',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      ip,
      metadata: { ip, userAgent: req.headers['user-agent'] || '' },
    });

    void writeChangelog(req, {
      entity: 'login',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName || savedAccount.email,
      action: 'login',
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName || savedAccount.email,
      changes: {},
      metadata: { email: savedAccount.email, role: savedAccount.role, ip, userAgent: req.headers['user-agent'] || '' },
    });

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);

    let pendingInvitationsCount = 0;
    try {
      const pending = await listPendingInvitationsByEmail(req, savedAccount.email);
      pendingInvitationsCount = pending.length;
    } catch (invErr) {
      console.error('[AUTH] Error consultando invitaciones pendientes en login:', invErr?.message);
    }

    const redirectTo = resolvePostLoginRedirect(savedAccount, { pendingInvitationsCount });

    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
      redirectTo,
      pendingInvitationsCount,
    });
  } catch (error) {
    console.error('[AUTH] login error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al iniciar sesión',
    });
  }
}

/** Envía un código de 6 dígitos al email para entrar sin esperar bloqueos por contraseña. */
export async function requestLoginCode(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return badRequest(res, 'El email es obligatorio');
    }

    invalidateDb(ACCOUNTS_DB);
    const account = await findAccountByEmail(req, email);

    if (!account) {
      logger.warn({ tag: 'AUTH_LOGIN_CODE', hint: 'no_account' }, 'Código solicitado para email sin cuenta');
      return res.json({ ok: true, message: 'Si el email existe, recibirás un código en breve' });
    }

    if (!canResendLoginOtp(account)) {
      return res.status(429).json({
        ok: false,
        code: 'LOGIN_CODE_COOLDOWN',
        error: 'Ya enviamos un código recientemente. Revisa tu correo o espera 1 minuto.',
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await saveLoginOtp(req, account, code);

    const { subject, html } = buildLoginCodeEmail(account.email, code);
    await sendEmail({ to: account.email, subject, html, requireDelivery: true });

    logger.info({ tag: 'AUTH_LOGIN_CODE', to: account.email }, 'Código de acceso enviado');

    await logAccountActivity(req, {
      actorUserId: account.user_id,
      actorName: account.fullName,
      targetUserId: account.user_id,
      type: 'security',
      action: 'Solicitud de código de acceso por email',
      entityId: account.user_id,
      entityLabel: account.fullName,
      ip: getClientIp(req),
    });

    return res.json({ ok: true, message: 'Si el email existe, recibirás un código en breve' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al enviar el código',
    });
  }
}

/** Verifica el código de email y abre sesión (resetea bloqueos por contraseña). */
export async function verifyLoginCode(req, res) {
  try {
    const { email, code } = req.body || {};
    const ip = getClientIp(req);

    if (!email || !code) {
      return badRequest(res, 'Email y código son obligatorios');
    }

    invalidateDb(ACCOUNTS_DB);
    const account = await findAccountByLoginOtp(req, email, code);
    if (!account) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_LOGIN_CODE',
        error: 'Código inválido o expirado. Solicita uno nuevo.',
      });
    }

    let savedAccount = await resetFailedLoginAttempts(req, account);
    savedAccount = await clearLoginOtp(req, savedAccount);
    savedAccount = await saveAccount(req, {
      ...savedAccount,
      status: 'active',
      inviteStatus: savedAccount.inviteStatus === 'pending' ? 'accepted' : savedAccount.inviteStatus,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'login',
      action: 'Inicio de sesión con código por email',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      ip,
      metadata: { ip, userAgent: req.headers['user-agent'] || '', method: 'login_code' },
    });

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);

    let pendingInvitationsCount = 0;
    try {
      const pending = await listPendingInvitationsByEmail(req, savedAccount.email);
      pendingInvitationsCount = pending.length;
    } catch (invErr) {
      console.error('[AUTH] Error consultando invitaciones (login code):', invErr?.message);
    }

    const redirectTo = resolvePostLoginRedirect(savedAccount, { pendingInvitationsCount });

    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
      redirectTo,
      pendingInvitationsCount,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al verificar el código',
    });
  }
}

export async function listUsers(req, res) {
  try {
    const businessId = req.query.businessId || '';
    let accounts = await listAccounts(req);

    let memberById = new Map();
    if (businessId) {
      const business = await findBusinessById(req, businessId);
      if (business) {
        const members = Array.isArray(business.members) ? business.members : [];
        for (const member of members) {
          const uid = String(member?.user_id || '').trim();
          if (uid && !memberById.has(uid)) memberById.set(uid, member);
        }
        const memberIds = new Set([
          business.owner_user_id,
          ...memberById.keys(),
        ].filter(Boolean));
        accounts = accounts.filter((a) => memberIds.has(a.user_id));
      }
    }

    const seenUserIds = new Set();
    const users = [];
    for (const account of accounts) {
      if (!account?.user_id || seenUserIds.has(account.user_id)) continue;
      seenUserIds.add(account.user_id);
      const sanitized = sanitizeAccount(account);
      const member = memberById.get(account.user_id);
      if (member?.fullName?.trim() && !String(sanitized.fullName || '').trim()) {
        sanitized.fullName = member.fullName.trim();
      }
      if (member?.email?.trim() && !String(sanitized.email || '').trim()) {
        sanitized.email = member.email.trim();
      }
      users.push(sanitized);
    }

    return res.json({
      ok: true,
      users,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar usuarios',
    });
  }
}

export async function listRoles(req, res) {
  try {
    const accounts = await listAccounts(req);
    const counts = accounts.reduce((acc, account) => {
      const role = account.role || 'Admin';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      ok: true,
      roles: ROLE_DEFINITIONS.map((role) => ({
        ...role,
        users: counts[role.id] || 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar roles',
    });
  }
}

export async function updateProfile(req, res) {
  try {
    const rawUserId = req.params.userId;
    const userId = String(rawUserId || '').trim().replace(/^account:/, '');
    const authUserId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
    const targetUserId = userId;

    if (authUserId && targetUserId && authUserId !== targetUserId) {
      const actorEmail = req.authUser?.email || '';
      if (!isVertialSuperAdminEmail(actorEmail)) {
        const actor = authUserId ? await findAccountByUserId(req, authUserId) : null;
        const isManager = actor && ['Admin', 'Gerente', 'Administrador', 'Encargado'].includes(String(actor.role || ''));
        if (!isManager) {
          return res.status(403).json({ ok: false, error: 'No puedes modificar el perfil de otro usuario.' });
        }
      }
    }

    const account = await findAccountByUserId(req, userId);

    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const {
      firstName,
      lastName,
      phone,
      avatar,
      email,
      fullName,
      role,
      status,
      permissions,
      employment,
      personalData,
      inviteStatus,
      lastLoginAt,
      companyName,
      onboardingCompleted,
      onboardingData,
      paymentSummary,
      subscription,
    } = req.body || {};

    if (email !== undefined) {
      const normalizedIncomingEmail = String(email).trim().toLowerCase();
      const currentEmail = String(account.email || '').toLowerCase();
      if (normalizedIncomingEmail && normalizedIncomingEmail !== currentEmail) {
        const collision = await findAccountByEmail(req, normalizedIncomingEmail);
        if (collision && collision.user_id !== account.user_id) {
          return res.status(409).json({
            ok: false,
            code: 'EMAIL_TAKEN',
            error: 'Ya existe otra cuenta con ese email.',
          });
        }
      }
    }

    const normalizedFullName = fullName !== undefined ? String(fullName).trim() : '';
    const derivedNames =
      normalizedFullName && firstName === undefined && lastName === undefined
        ? splitFullName(normalizedFullName)
        : null;
    const nextFirstName =
      firstName !== undefined
        ? String(firstName).trim()
        : (derivedNames?.firstName || account.firstName);
    const nextLastName =
      lastName !== undefined
        ? String(lastName).trim()
        : (derivedNames?.lastName || account.lastName);
    const nextFullName = normalizedFullName || `${nextFirstName} ${nextLastName}`.trim();

    let nextSubscription = account.subscription || null;
    if (subscription !== undefined) {
      let merged = { ...(account.subscription || {}), ...subscription };
      const actorEmail = req.authUser?.email || '';
      if (isVertialSuperAdminEmail(actorEmail)) {
        if (Object.prototype.hasOwnProperty.call(subscription, 'extraPointOfSaleSlots')) {
          const extra = Math.floor(Number(subscription.extraPointOfSaleSlots) || 0);
          merged.extraPointOfSaleSlots = Math.max(0, Math.min(99, extra));
        }
        if (Object.prototype.hasOwnProperty.call(subscription, 'extraCommercialBrandSlots')) {
          const extraBrands = Math.floor(Number(subscription.extraCommercialBrandSlots) || 0);
          merged.extraCommercialBrandSlots = Math.max(0, Math.min(99, extraBrands));
        }
        if (Object.prototype.hasOwnProperty.call(subscription, 'extraBusinessSlots')) {
          const extraBiz = Math.floor(Number(subscription.extraBusinessSlots) || 0);
          merged.extraBusinessSlots = Math.max(0, Math.min(99, extraBiz));
        }
        if (Object.prototype.hasOwnProperty.call(subscription, 'adminProAccess')) {
          merged.adminProAccess = Boolean(subscription.adminProAccess);
        }
        if (Object.prototype.hasOwnProperty.call(subscription, 'billingExempt')) {
          merged.billingExempt = Boolean(subscription.billingExempt);
        }
        if (
          Object.prototype.hasOwnProperty.call(subscription, 'selectedPlanId')
          || Object.prototype.hasOwnProperty.call(subscription, 'planName')
        ) {
          merged = applyAdminPlanLock(
            merged,
            subscription.selectedPlanId ?? merged.selectedPlanId,
            subscription.planName ?? merged.planName,
          );
        } else if (isAdminPlanLocked(account.subscription)) {
          merged = preserveAdminLockedPlan(merged, account.subscription);
        }
        merged = applySuperAdminSubscriptionActivation(merged, account.subscription);
      } else {
        merged.extraPointOfSaleSlots = account.subscription?.extraPointOfSaleSlots ?? 0;
        merged.extraCommercialBrandSlots = account.subscription?.extraCommercialBrandSlots ?? 0;
        merged.extraBusinessSlots = account.subscription?.extraBusinessSlots ?? 0;
        merged.adminProAccess = Boolean(account.subscription?.adminProAccess);
        merged.billingExempt = Boolean(account.subscription?.billingExempt);
      }
      nextSubscription = merged;
    }

    const completingOnboarding =
      onboardingCompleted !== undefined &&
      Boolean(onboardingCompleted) &&
      !account.onboardingCompleted;
    const onbForProvision =
      onboardingData !== undefined ? onboardingData : account.onboardingData;
    if (completingOnboarding && onbForProvision) {
      nextSubscription = preserveAdminLockedPlan(
        buildSubscriptionFromOnboarding(
          onbForProvision,
          nextSubscription || account.subscription || {},
        ),
        account.subscription || {},
      );
    }

    const nextEmployment = employment !== undefined
      ? mergeEmploymentInfo(account.employment, employment)
      : account.employment;
    const nextPersonalData = personalData !== undefined
      ? mergePersonalData(account.personalData, personalData)
      : account.personalData;
    const nextPhone = phone !== undefined ? String(phone).trim() : account.phone;

    const profileDraft = {
      ...account,
      firstName: nextFirstName,
      lastName: nextLastName,
      fullName: nextFullName,
      phone: nextPhone,
      employment: nextEmployment,
      personalData: nextPersonalData,
    };
    const workerProfileCompletion = computeWorkerProfileCompletion(profileDraft);
    const workerIdentityCompleted = hasMinimumWorkerIdentity(profileDraft);

    let nextOnboardingData = onboardingData !== undefined ? onboardingData : account.onboardingData;
    if (
      isVertialSuperAdminEmail(actorEmail)
      && subscription !== undefined
      && nextSubscription?.adminPlanLocked
      && nextSubscription?.selectedPlanId
    ) {
      nextOnboardingData = {
        ...(nextOnboardingData || {}),
        subscriptionSelection: {
          ...(nextOnboardingData?.subscriptionSelection || {}),
          recommendedPlanId: nextSubscription.selectedPlanId,
        },
      };
    }

    const updatedAccount = {
      ...account,
      firstName: nextFirstName,
      lastName: nextLastName,
      fullName: nextFullName,
      email: email !== undefined ? String(email).trim().toLowerCase() : account.email,
      phone: nextPhone,
      avatar: avatar !== undefined ? String(avatar).trim() : account.avatar,
      role: role !== undefined ? String(role).trim() : account.role,
      status: status !== undefined ? String(status).trim() : account.status,
      inviteStatus: inviteStatus !== undefined ? String(inviteStatus).trim() : account.inviteStatus,
      permissions: permissions !== undefined ? permissions : account.permissions,
      employment: nextEmployment,
      personalData: nextPersonalData,
      workerProfileCompletion,
      workerIdentityCompleted,
      lastLoginAt: lastLoginAt !== undefined ? String(lastLoginAt).trim() : account.lastLoginAt,
      companyName: companyName !== undefined ? String(companyName).trim() : account.companyName,
      onboardingCompleted:
        onboardingCompleted !== undefined ? Boolean(onboardingCompleted) : account.onboardingCompleted,
      onboardingData: nextOnboardingData,
      paymentSummary: paymentSummary !== undefined ? paymentSummary : account.paymentSummary,
      subscription: nextSubscription,
      updatedAt: new Date().toISOString(),
    };

    const savedAccount = await saveAccount(req, updatedAccount);
    const persistedAccount = (await findAccountByUserId(req, savedAccount.user_id)) || savedAccount;

    if (savedAccount.linkedBusinessId && (fullName !== undefined || email !== undefined || role !== undefined)) {
      try {
        const business = await findBusinessById(req, savedAccount.linkedBusinessId);
        if (business && Array.isArray(business.members)) {
          const members = business.members.map((m) => {
            if (m.user_id !== savedAccount.user_id) return m;
            return {
              ...m,
              fullName: savedAccount.fullName || m.fullName,
              email: savedAccount.email || m.email,
              role: savedAccount.role || m.role,
            };
          });
          await saveBusiness(req, { ...business, members, updatedAt: new Date().toISOString() });
        }
      } catch {
        /* roster sync best-effort */
      }
    }
    const actorId = req.body?.actorUserId || userId;
    const actorNameStr = req.body?.actorName || savedAccount.fullName;
    await logAccountActivity(req, {
      actorUserId: actorId,
      actorName: actorNameStr,
      targetUserId: savedAccount.user_id,
      type: 'team',
      action: 'Perfil actualizado',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
    });

    try {
      await notifyManagersWorkerProfileEvents(req, {
        accountBefore: account,
        accountAfter: persistedAccount,
      });
    } catch (notifyErr) {
      console.warn('[updateProfile] worker profile notify:', notifyErr?.message);
    }
    const profileDiff = {};
    for (const key of ['role', 'status', 'email', 'companyName', 'subscription']) {
      if (JSON.stringify(account[key]) !== JSON.stringify(updatedAccount[key])) {
        profileDiff[key] = { before: account[key] ?? null, after: updatedAccount[key] ?? null };
      }
    }
    if (Object.keys(profileDiff).length > 0) {
      await writeChangelog(req, {
        entity: 'account',
        entityId: `account:${savedAccount.user_id}`,
        entityLabel: savedAccount.fullName,
        action: 'update',
        actorUserId: actorId,
        actorName: actorNameStr,
        changes: profileDiff,
        metadata: { email: savedAccount.email, ip: getClientIp(req) },
      });
    }

    return res.json({
      ok: true,
      user: sanitizeAccount(persistedAccount),
    });
  } catch (error) {
    if (error?.code === 'ACCOUNT_EMAIL_CONFLICT') {
      return res.status(409).json({
        ok: false,
        code: 'EMAIL_TAKEN',
        error: 'Ya existe otra cuenta con ese email.',
      });
    }
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar el perfil',
    });
  }
}

export async function updatePassword(req, res) {
  try {
    const userId = req.params.userId;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return badRequest(res, 'Debes indicar la contraseña actual y la nueva');
    }

    if (String(newPassword).length < 8) {
      return badRequest(res, 'La nueva contraseña debe tener al menos 8 caracteres');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    if (!verifyPassword(currentPassword, account.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta' });
    }

    const savedAccount = await saveAccount(req, {
      ...account,
      password: undefined,
      passwordHash: hashPassword(newPassword),
      refreshTokenHash: null,
      refreshTokenExpiry: null,
      updatedAt: new Date().toISOString(),
    });
    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'security',
      action: 'Contraseña actualizada',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
    });
    await writeChangelog(req, {
      entity: 'account',
      entityId: `account:${savedAccount.user_id}`,
      entityLabel: savedAccount.fullName,
      action: 'update',
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      changes: { password: { before: '[redacted]', after: '[redacted]' } },
      metadata: { event: 'password_changed', email: savedAccount.email, ip: getClientIp(req) },
    });

    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar la contraseña',
    });
  }
}

export async function saveBillingCard(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(req, userId);

    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const { cardNumber, cardHolderName, expiryDate, cvv, billingMode, selectedPlanId } = req.body || {};

    if (!cardNumber || !cardHolderName || !expiryDate || !cvv) {
      return badRequest(res, 'Faltan datos obligatorios de la tarjeta');
    }

    await ensureDatabase(req, CARDS_DB);
    const existingCard = await findCardByUserId(req, userId);
    const baseCard = buildCardDocument({
      userId,
      cardNumber,
      cardHolderName,
      expiryDate,
      cvv,
      billingMode,
      selectedPlanId,
    });

    const savedCard = await saveCard(req, existingCard ? { ...existingCard, ...baseCard, updatedAt: new Date().toISOString() } : baseCard);

    const onboardingData = account.onboardingData || {};
    const dataForProvision = {
      ...onboardingData,
      subscriptionSelection: {
        ...(onboardingData.subscriptionSelection || {}),
        recommendedPlanId:
          selectedPlanId || onboardingData.subscriptionSelection?.recommendedPlanId || 'basic',
        billingMode: billingMode || onboardingData.subscriptionSelection?.billingMode || 'monthly',
      },
    };
    const nextSubscription = preserveAdminLockedPlan(
      buildSubscriptionFromOnboarding(
        dataForProvision,
        account.subscription || {},
        { selectedPlanId, billingMode },
      ),
      account.subscription || {},
    );

    const savedAccount = await saveAccount(req, {
      ...account,
      paymentSummary: {
        cardId: savedCard._id,
        lastFourDigits: savedCard.lastFourDigits,
        cardHolderName: savedCard.cardHolderName,
        expiryDate: savedCard.expiryDate,
        billingMode: savedCard.billingMode,
        selectedPlanId: savedCard.selectedPlanId,
      },
      subscription: nextSubscription,
      updatedAt: new Date().toISOString(),
    });

    let accountAfterProvision = savedAccount;
    if (!account.onboardingCompleted) {
      try {
        const provision = await provisionBusinessFromOnboarding(req, savedAccount);
        if (provision.ok && provision.businessId) {
          const resolvedName = resolveBusinessNameFromOnboarding(savedAccount);
          accountAfterProvision = await saveAccount(req, {
            ...savedAccount,
            companyName: resolvedName || savedAccount.companyName,
            onboardingData: {
              ...(savedAccount.onboardingData || {}),
              businessId: provision.businessId,
              suppressAutoProvision: false,
            },
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (provisionErr) {
        console.error('[AUTH] Error provisionando empresa desde onboarding (tarjeta):', provisionErr?.message);
      }
    }

    return res.json({
      ok: true,
      user: sanitizeAccount(accountAfterProvision),
      card: sanitizeCard(savedCard),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar la tarjeta',
    });
  }
}

export async function getBillingCard(req, res) {
  try {
    const userId = req.params.userId;
    const card = await findCardByUserId(req, userId);

    if (!card) {
      return res.status(404).json({ ok: false, error: 'Tarjeta no encontrada' });
    }

    return res.json({
      ok: true,
      card: sanitizeCard(card),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar la tarjeta',
    });
  }
}

export async function inviteUser(req, res) {
  try {
    const { name, email, role = 'Usuario', phone = '', invitedBy = '', companyName = '', businessId = '', permissions, landingPage = WORKER_DEFAULT_LANDING_PATH, position = '', contractType = '', grossMonthlySalary = '', workCenterId = '', message = '' } = req.body || {};

    if (!email) {
      return badRequest(res, 'El email es obligatorio');
    }

    const actorUserId = String(req.authUser?.userId || '').trim();
    let invitedByDisplay = String(req.authUser?.email || '').trim();
    if (actorUserId) {
      try {
        const inviter = await findAccountByUserId(req, actorUserId);
        if (inviter?.fullName?.trim()) {
          invitedByDisplay = inviter.fullName.trim();
        }
      } catch {
        /* noop */
      }
    }

    await ensureDatabase(req, ACCOUNTS_DB);

    // Validar que la empresa existe si se proporciona businessId
    let business = null;
    if (businessId) {
      business = await findBusinessById(req, businessId);
      if (!business) {
        return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
      }
    }

    const existingAccount = await findAccountByEmail(req, email);
    const resolvedCompanyName = business?.name || companyName;
    const normalizedEmail = String(email).trim().toLowerCase();

    // Nuevo flujo: solo se puede invitar a personas que ya tengan cuenta en Vertial.
    // El invitado verá la invitación dentro de la app al iniciar sesión y la aceptará en un clic.
    if (!existingAccount) {
      return res.status(404).json({
        ok: false,
        code: 'USER_NOT_REGISTERED',
        error: 'Este email no está registrado en Vertial. La persona debe crearse una cuenta antes de poder ser invitada al equipo.',
      });
    }

    if (business) {
      const isOwnerOfThis = business.owner_user_id === existingAccount.user_id;
      const isAlreadyMember = Array.isArray(business.members)
        && business.members.some((m) => m.user_id === existingAccount.user_id);
      if (isOwnerOfThis || isAlreadyMember) {
        return res.status(409).json({
          ok: false,
          code: 'ALREADY_MEMBER',
          error: 'Este usuario ya forma parte del equipo de esta empresa.',
        });
      }
    }

    try {
      const allBusinesses = await listAllBusinesses(req);
      const ownsOtherBusiness = allBusinesses.find(
        (b) => b.owner_user_id === existingAccount.user_id && b.business_id !== (business?.business_id || ''),
      );
      if (ownsOtherBusiness) {
        return res.status(409).json({
          ok: false,
          code: 'OWNER_OF_OTHER_BUSINESS',
          error: `Este usuario administra otra empresa (${ownsOtherBusiness.name || 'sin nombre'}). Por ahora no puede unirse a un segundo equipo.`,
        });
      }
    } catch (lookupErr) {
      console.error('[AUTH] Error comprobando empresas del invitado:', lookupErr?.message);
    }

    // ¿Ya hay una invitación pendiente igual? La reutilizamos en lugar de crear duplicados.
    let existingInvitation = null;
    if (business?.business_id) {
      existingInvitation = await findPendingInvitationForEmailAndBusiness(req, normalizedEmail, business.business_id);
    }

    const invitationDoc = existingInvitation
      ? { ...existingInvitation, updatedAt: new Date().toISOString() }
      : buildTeamInvitationDocument({
        email: normalizedEmail,
        fullName: name,
        phone,
        businessId: business?.business_id || '',
        businessName: resolvedCompanyName,
        role,
        permissions: normalizePermissionMatrix(permissions, role || 'Usuario'),
        landingPage,
        employment: {
          position,
          contractType,
          salary: grossMonthlySalary,
          salesPointId: workCenterId,
        },
        invitedBy: actorUserId || String(invitedBy || '').trim(),
        invitedByName: invitedByDisplay,
        message,
      });

    let plainPosPin = String(req.body?.posPin || '').trim();
    if (plainPosPin && !isValidPosPin(plainPosPin)) {
      return badRequest(res, 'El PIN de TPV debe tener entre 4 y 6 dígitos numéricos');
    }
    if (!plainPosPin) plainPosPin = generatePosPin();
    invitationDoc.posPinHash = hashPosPin(plainPosPin);

    // Si la invitación ya existía pero algún dato ha cambiado, actualizamos.
    if (existingInvitation) {
      invitationDoc.fullName = String(name || existingInvitation.fullName || '').trim();
      invitationDoc.phone = String(phone || existingInvitation.phone || '').trim();
      invitationDoc.role = role || existingInvitation.role || 'Usuario';
      invitationDoc.permissions = normalizePermissionMatrix(permissions, invitationDoc.role);
      invitationDoc.landingPage = landingPage || existingInvitation.landingPage;
      invitationDoc.employment = {
        position,
        contractType,
        salary: grossMonthlySalary,
        salesPointId: workCenterId,
      };
      invitationDoc.message = String(message || existingInvitation.message || '').trim();
      invitationDoc.businessName = resolvedCompanyName || existingInvitation.businessName;
    }

    const savedInvitation = await saveTeamInvitation(req, invitationDoc);

    await logAccountActivity(req, {
      actorUserId: actorUserId || String(invitedBy || '').trim(),
      actorName: invitedByDisplay,
      targetUserId: existingAccount?.user_id || '',
      type: 'team',
      action: existingInvitation ? 'Invitación actualizada' : 'Invitación creada',
      entityId: savedInvitation.invitation_id,
      entityLabel: savedInvitation.fullName || savedInvitation.email,
      metadata: {
        email: savedInvitation.email,
        role: savedInvitation.role,
        businessId: business?.business_id || '',
        companyName: resolvedCompanyName,
        existingUser: Boolean(existingAccount),
      },
    });

    return res.status(existingInvitation ? 200 : 201).json({
      ok: true,
      invitation: sanitizeInvitation(savedInvitation),
      isExistingUser: Boolean(existingAccount),
      companyCode: business?.companyCode || '',
      inviteExpiresAt: savedInvitation.expiresAt,
      posPin: plainPosPin,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al invitar usuario',
    });
  }
}

/**
 * Lookup ligero para el modal de invitación.
 * Devuelve si el email está registrado en Vertial y, si lo está, su nombre y si ya es
 * miembro/propietario del negocio que se está invitando. Permite validar en vivo antes
 * de pulsar "Enviar invitación".
 */
export async function lookupInviteEmail(req, res) {
  try {
    const rawEmail = String((req.body && req.body.email) || req.query.email || '').trim().toLowerCase();
    const businessId = String((req.body && req.body.businessId) || req.query.businessId || '').trim();

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.json({ ok: true, exists: false });
    }

    await ensureDatabase(req, ACCOUNTS_DB);
    const account = await findAccountByEmail(req, rawEmail);

    if (!account) {
      return res.json({
        ok: true,
        exists: false,
        code: 'USER_NOT_REGISTERED',
      });
    }

    let alreadyMember = false;
    let isOwner = false;
    if (businessId) {
      const business = await findBusinessById(req, businessId);
      if (business) {
        isOwner = business.owner_user_id === account.user_id;
        alreadyMember = Array.isArray(business.members)
          && business.members.some((m) => m.user_id === account.user_id);
      }
    }

    let ownsOtherBusinessName = '';
    try {
      const allBusinesses = await listAllBusinesses(req);
      const other = allBusinesses.find(
        (b) => b.owner_user_id === account.user_id && b.business_id !== businessId,
      );
      if (other) ownsOtherBusinessName = other.name || '';
    } catch {
      /* noop */
    }

    return res.json({
      ok: true,
      exists: true,
      email: account.email,
      fullName: account.fullName || '',
      alreadyMember,
      isOwner,
      ownsOtherBusinessName,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error consultando el email',
    });
  }
}

// A-04b: Reenviar invitación — genera nuevo token y vuelve a mandar el email.
export async function resendInvite(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const isExistingUser = Boolean(account.pendingTeamInvite);
    const isPendingNew = account.inviteStatus === 'pending' || account.status === 'pending';
    if (!isExistingUser && !isPendingNew) {
      return res.status(400).json({
        ok: false,
        error: 'Este usuario no tiene una invitación pendiente que reenviar.',
      });
    }

    const businessId = account.pendingTeamInvite?.businessId || account.linkedBusinessId || '';
    const business = businessId ? await findBusinessById(req, businessId) : null;
    const role = account.pendingTeamInvite?.role || account.role || 'Usuario';
    const companyName = account.pendingTeamInvite?.businessName || business?.name || account.companyName || '';

    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const refreshedAccount = await saveInviteToken(req, account, rawInviteToken);

    let emailSent = false;
    try {
      const { subject, html } = buildInvitationEmail({
        name: refreshedAccount.fullName,
        email: refreshedAccount.email,
        inviteToken: rawInviteToken,
        invitedBy: req.authUser?.userId || refreshedAccount.invitedBy || '',
        role,
        companyName,
        isExistingUser,
      });
      await sendEmail({ to: refreshedAccount.email, subject, html });
      emailSent = true;
    } catch (emailErr) {
      console.error('[AUTH] Error reenviando email de invitación:', emailErr?.message);
    }

    await logAccountActivity(req, {
      actorUserId: req.authUser?.userId || account.user_id,
      actorName: '',
      targetUserId: account.user_id,
      type: 'team',
      action: 'Invitación reenviada',
      entityId: account.user_id,
      entityLabel: account.fullName,
      metadata: { email: account.email, businessId, isExistingUser },
    });

    return res.json({
      ok: true,
      user: sanitizeAccount(refreshedAccount),
      emailSent,
      isExistingUser,
      inviteExpiresAt: refreshedAccount.inviteExpiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al reenviar la invitación',
    });
  }
}

// ─── Team invitations (in-app) ──────────────────────────────────────────────

async function loadAuthAccount(req) {
  const userId = req.authUser?.userId;
  if (!userId) return null;
  return findAccountByUserId(req, userId);
}

function sanitizeInvitation(inv) {
  if (!inv) return null;
  return {
    invitationId: inv.invitation_id,
    email: inv.email,
    fullName: inv.fullName,
    phone: inv.phone || '',
    businessId: inv.business_id,
    businessName: inv.businessName,
    role: inv.role,
    permissions: inv.permissions || null,
    landingPage: inv.landingPage || WORKER_DEFAULT_LANDING_PATH,
    employment: inv.employment || null,
    invitedBy: inv.invitedBy,
    invitedByName: inv.invitedByName,
    message: inv.message || '',
    status: inv.status,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

export async function listMyInvitations(req, res) {
  try {
    const account = await loadAuthAccount(req);
    if (!account) return res.status(401).json({ ok: false, error: 'No autenticado' });
    const invitations = await listPendingInvitationsByEmail(req, account.email);
    return res.json({ ok: true, invitations: invitations.map(sanitizeInvitation) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al listar invitaciones',
    });
  }
}

export async function acceptInvitation(req, res) {
  try {
    const account = await loadAuthAccount(req);
    if (!account) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const invitationId = req.params.invitationId;
    const invitation = await findTeamInvitationById(req, invitationId);
    if (!invitation || invitation.type !== 'team_invitation' || invitation.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
    }

    const business = invitation.business_id ? await findBusinessById(req, invitation.business_id) : null;
    if (!business) {
      return res.status(404).json({ ok: false, error: 'La empresa que envió la invitación ya no existe.' });
    }

    const isOwner = business.owner_user_id === account.user_id;
    const members = Array.isArray(business.members) ? business.members : [];
    const isAlreadyMember = members.some((m) => m.user_id === account.user_id);

    if (invitation.status !== 'pending') {
      const alreadyLinked = isAlreadyMember
        || String(account.linkedBusinessId || '') === String(business.business_id || '');
      if (invitation.status === 'accepted' && alreadyLinked) {
        const freshAccount = (await findAccountByUserId(req, account.user_id)) || account;
        return res.json({
          ok: true,
          alreadyAccepted: true,
          user: sanitizeAccount(freshAccount),
          redirectTo: resolveRedirectAfterInvitationAccept(freshAccount),
        });
      }
      return res.status(409).json({
        ok: false,
        code: 'INVITATION_NOT_PENDING',
        error: invitation.status === 'accepted'
          ? 'Esta invitación ya fue aceptada.'
          : 'Esta invitación ya no está activa.',
      });
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ ok: false, code: 'INVITATION_EXPIRED', error: 'La invitación ha caducado.' });
    }
    if (invitation.email !== String(account.email).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Esta invitación no es para tu cuenta.' });
    }

    const now = new Date().toISOString();

    const inviteName = String(invitation.fullName || '').trim();
    const invitePhone = String(invitation.phone || '').trim();
    const resolvedFullName = inviteName || String(account.fullName || '').trim();
    const resolvedPhone = invitePhone || String(account.phone || '').trim();

    if (!isOwner && !isAlreadyMember) {
      const newMember = {
        user_id: account.user_id,
        fullName: resolvedFullName,
        email: account.email,
        role: invitation.role || 'Usuario',
        permissions: normalizePermissionMatrix(invitation.permissions, invitation.role || 'Usuario'),
        joinedAt: now,
      };
      await saveBusiness(req, {
        ...business,
        members: [...members, newMember],
        updatedAt: now,
      });
    } else if (!isOwner && isAlreadyMember) {
      const nextMembers = members.map((member) => {
        if (member.user_id !== account.user_id) return member;
        return {
          ...member,
          fullName: resolvedFullName || member.fullName,
          role: invitation.role || member.role || 'Usuario',
          permissions: normalizePermissionMatrix(invitation.permissions, invitation.role || 'Usuario'),
        };
      });
      await saveBusiness(req, {
        ...business,
        members: nextMembers,
        updatedAt: now,
      });
    }

    const inviteEmployment = invitation.employment || {};
    const mergedEmployment = mergeEmploymentInfo(account.employment, {
      position: inviteEmployment.position || invitation.role || '',
      contractType: inviteEmployment.contractType || '',
      salary: inviteEmployment.salary || '',
      salesPointId: inviteEmployment.salesPointId || '',
    });
    const profileDraft = {
      ...account,
      fullName: resolvedFullName,
      phone: resolvedPhone,
      employment: mergedEmployment,
      personalData: account.personalData,
      invitedBy: account.invitedBy || invitation.invitedBy || '',
    };
    const workerProfileCompletion = computeWorkerProfileCompletion(profileDraft);
    const workerIdentityCompleted = hasMinimumWorkerIdentity(profileDraft);

    const updatedAccount = await saveAccount(req, {
      ...account,
      fullName: resolvedFullName,
      phone: resolvedPhone,
      linkedBusinessId: account.linkedBusinessId || business.business_id,
      invitedBy: profileDraft.invitedBy,
      role: account.role && account.role !== 'Usuario' ? account.role : (invitation.role || 'Usuario'),
      permissions: normalizePermissionMatrix(invitation.permissions, invitation.role || 'Usuario'),
      landingPage: invitation.landingPage || account.landingPage || WORKER_DEFAULT_LANDING_PATH,
      employment: mergedEmployment,
      workerProfileCompletion,
      workerIdentityCompleted,
      pendingTeamInvite: null,
      inviteStatus: 'accepted',
      posPinHash: invitation.posPinHash || account.posPinHash || '',
      updatedAt: now,
    });

    const savedInvitation = await saveTeamInvitation(req, {
      ...invitation,
      status: 'accepted',
      acceptedBy: account.user_id,
      acceptedAt: now,
      updatedAt: now,
    });

    await logAccountActivity(req, {
      actorUserId: account.user_id,
      actorName: account.fullName,
      targetUserId: account.user_id,
      type: 'team',
      action: 'Invitación aceptada',
      entityId: savedInvitation.invitation_id,
      entityLabel: savedInvitation.businessName,
      metadata: { businessId: business.business_id, role: invitation.role },
    });

    return res.json({
      ok: true,
      invitation: sanitizeInvitation(savedInvitation),
      user: sanitizeAccount(updatedAccount),
      redirectTo: resolveRedirectAfterInvitationAccept(updatedAccount),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al aceptar la invitación',
    });
  }
}

export async function rejectInvitation(req, res) {
  try {
    const account = await loadAuthAccount(req);
    if (!account) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const invitationId = req.params.invitationId;
    const invitation = await findTeamInvitationById(req, invitationId);
    if (!invitation || invitation.type !== 'team_invitation' || invitation.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
    }
    if (invitation.email !== String(account.email).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Esta invitación no es para tu cuenta.' });
    }
    if (invitation.status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Esta invitación ya no está activa.' });
    }

    const now = new Date().toISOString();
    const saved = await saveTeamInvitation(req, {
      ...invitation,
      status: 'rejected',
      rejectedAt: now,
      updatedAt: now,
    });

    await logAccountActivity(req, {
      actorUserId: account.user_id,
      actorName: account.fullName,
      targetUserId: account.user_id,
      type: 'team',
      action: 'Invitación rechazada',
      entityId: saved.invitation_id,
      entityLabel: saved.businessName,
      metadata: { businessId: invitation.business_id },
    });

    return res.json({ ok: true, invitation: sanitizeInvitation(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al rechazar la invitación',
    });
  }
}

export async function listBusinessInvitations(req, res) {
  try {
    const businessId = req.params.businessId;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const includeAll = String(req.query.includeAll || '').toLowerCase() === 'true';
    const invitations = await listInvitationsByBusiness(req, businessId, { includeAll });
    return res.json({ ok: true, invitations: invitations.map(sanitizeInvitation) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al listar invitaciones',
    });
  }
}

export async function revokeInvitation(req, res) {
  try {
    const invitationId = req.params.invitationId;
    const invitation = await findTeamInvitationById(req, invitationId);
    if (!invitation || invitation.type !== 'team_invitation' || invitation.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
    }
    if (invitation.status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Solo se pueden revocar invitaciones pendientes.' });
    }

    const now = new Date().toISOString();
    const saved = await saveTeamInvitation(req, {
      ...invitation,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    });

    await logAccountActivity(req, {
      actorUserId: req.authUser?.userId || '',
      actorName: '',
      targetUserId: '',
      type: 'team',
      action: 'Invitación revocada',
      entityId: saved.invitation_id,
      entityLabel: saved.email,
      metadata: { businessId: invitation.business_id },
    });

    return res.json({ ok: true, invitation: sanitizeInvitation(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al revocar la invitación',
    });
  }
}

export async function resendInvitation(req, res) {
  try {
    const invitationId = req.params.invitationId;
    const invitation = await findTeamInvitationById(req, invitationId);
    if (!invitation || invitation.type !== 'team_invitation' || invitation.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
    }
    if (invitation.status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Solo se pueden renovar invitaciones pendientes.' });
    }

    const now = new Date();
    const newExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const saved = await saveTeamInvitation(req, {
      ...invitation,
      expiresAt: newExpires,
      updatedAt: now.toISOString(),
    });

    return res.json({ ok: true, invitation: sanitizeInvitation(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al renovar la invitación',
    });
  }
}

export async function resetUserPassword(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const generatedPassword = generateTemporaryPassword(14);
    const savedAccount = await saveAccount(req, {
      ...account,
      password: undefined,
      passwordHash: hashPassword(generatedPassword),
      updatedAt: new Date().toISOString(),
    });

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'security',
      action: 'Contraseña restablecida',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
    });
    await writeChangelog(req, {
      entity: 'account',
      entityId: `account:${savedAccount.user_id}`,
      entityLabel: savedAccount.fullName,
      action: 'update',
      actorUserId: userId,
      actorName: savedAccount.fullName,
      changes: { password: { before: '[redacted]', after: '[redacted]' } },
      metadata: { event: 'password_reset', email: savedAccount.email, ip: getClientIp(req) },
    });

    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      generatedPassword,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al restablecer la contraseña',
    });
  }
}

export async function deleteUser(req, res) {
  try {
    const userId = String(req.params.userId || '').trim();
    const authUserId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
    const actorEmail = req.authUser?.email || '';
    const isSuperAdmin = isVertialSuperAdminEmail(actorEmail);

    if (authUserId && userId && authUserId !== userId) {
      if (!isSuperAdmin) {
        const actor = authUserId ? await findAccountByUserId(req, authUserId) : null;
        const isManager = actor && ['Admin', 'Gerente', 'Administrador', 'Encargado'].includes(String(actor.role || ''));
        if (!isManager) {
          return res.status(403).json({ ok: false, error: 'No puedes eliminar otro usuario.' });
        }
      }
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    if (isVertialSuperAdminEmail(account.email)) {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar la cuenta de super-admin.' });
    }

    // Limpiar negocios del owner y membership en otros negocios.
    try {
      const allBusinesses = await listAllBusinesses(req);
      for (const business of allBusinesses) {
        if (String(business.owner_user_id || '').trim() === account.user_id) {
          if (isSuperAdmin) {
            await softDeleteDocument(req, BUSINESSES_DB, business._id);
          }
          continue;
        }
        const members = Array.isArray(business.members) ? business.members : [];
        const filtered = members.filter((m) => m && m.user_id !== account.user_id);
        if (filtered.length !== members.length) {
          await saveBusiness(req, {
            ...business,
            members: filtered,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (cleanupErr) {
      console.error('[AUTH] Error limpiando business al borrar usuario:', cleanupErr?.message);
    }

    if (isSuperAdmin) {
      try {
        const card = await findCardByUserId(req, account.user_id);
        if (card?._id) {
          await softDeleteDocument(req, CARDS_DB, card._id);
        }
      } catch (cardErr) {
        console.error('[AUTH] Error eliminando tarjeta al borrar usuario:', cardErr?.message);
      }
    }

    await softDeleteDocument(req, ACCOUNTS_DB, account._id);
    await writeChangelog(req, {
      entity: 'account',
      entityId: account._id,
      entityLabel: account.fullName,
      action: 'delete',
      actorUserId: req.body?.actorUserId || authUserId || userId,
      actorName: req.body?.actorName || account.fullName,
      changes: { before: { email: account.email, role: account.role, status: account.status } },
      metadata: { email: account.email, ip: getClientIp(req), deletedBySuperAdmin: isSuperAdmin },
    });
    return res.json({ ok: true, id: account.user_id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar el usuario',
    });
  }
}

export async function getUserActivity(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    return res.json({
      ok: true,
      activities: Array.isArray(account.recentActivity) ? account.recentActivity : [],
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar la actividad',
    });
  }
}

export async function listAllActivities(req, res) {
  try {
    const accounts = await listAccounts(req);
    const activities = accounts.flatMap((account) =>
      Array.isArray(account.recentActivity)
        ? account.recentActivity.map((activity) => ({
            ...activity,
            actorName: activity.actorName || account.fullName || account.email || '',
          }))
        : [],
    );

    activities.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({ ok: true, activities });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar las actividades',
    });
  }
}

export async function logActivity(req, res) {
  try {
    const {
      actorUserId,
      actorName = '',
      targetUserId,
      type = 'system',
      action,
      entityId = '',
      entityLabel = '',
      metadata = {},
    } = req.body || {};

    if (!actorUserId || !action) {
      return badRequest(res, 'actorUserId y action son obligatorios');
    }

    const activity = buildActivityRecord({
      actorUserId,
      actorName,
      targetUserId: targetUserId || actorUserId,
      type,
      action,
      entityId,
      entityLabel,
      metadata,
    });

    await logAccountActivity(req, activity);
    return res.json({ ok: true, activity });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar la actividad',
    });
  }
}

// S-01 + S-07: Refresh token — lee de cookie httpOnly, crea nueva sesión (sliding window)
export async function refreshToken(req, res) {
  try {
    // S-01: Leer refresh token de cookie httpOnly primero, fallback a body (compatibilidad)
    const cookieToken = req.cookies?.refresh_token;
    const bodyToken = req.body?.refreshToken;
    const rawToken = cookieToken || bodyToken;

    if (!rawToken) {
      return res.status(400).json({ ok: false, error: 'Refresh token requerido' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch {
      clearAuthCookies(res);
      return res.status(401).json({ ok: false, error: 'Refresh token inválido o expirado' });
    }

    // S-07: Buscar en sesiones (nuevo modelo) o campo legacy
    const result = await findAccountByRefreshToken(req, decoded.raw);
    if (!result || result.account.user_id !== decoded.userId) {
      clearAuthCookies(res);
      return res.status(401).json({ ok: false, error: 'Refresh token no reconocido' });
    }

    const { account, session } = result;

    // S-07: Revocar sesión anterior antes de crear una nueva (token rotation)
    if (session?.sessionId) {
      await revokeSession(req, account, session.sessionId);
    }

    const { accessToken, refreshToken: newRefreshToken } = await issueTokens(req, res, account);
    return res.json({ ok: true, accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al refrescar el token',
    });
  }
}

// S-07: Listar sesiones activas del usuario actual
export async function listSessions(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    // Obtener sessionId de la cookie actual para marcar la sesión activa
    const currentSessionId = req.authUser?.sessionId || null;

    // Leer sesiones directamente del documento
    const sessions = Array.isArray(account.sessions)
      ? account.sessions.filter((s) => s && s.expiry && new Date(s.expiry) > new Date())
      : [];

    return res.json({
      ok: true,
      sessions: sessions.map((s) => sanitizeSession(s, currentSessionId)),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar sesiones' });
  }
}

// S-07: Revocar una sesión específica
export async function revokeSessionEndpoint(req, res) {
  try {
    const userId = req.authUser?.userId;
    const { sessionId } = req.params;

    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId requerido' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await revokeSession(req, account, sessionId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'security',
      action: 'Sesión revocada',
      entityId: userId,
      entityLabel: account.fullName,
      ip: getClientIp(req),
      metadata: { revokedSessionId: sessionId },
    });

    // Si revoca su propia sesión actual, limpiar cookies
    if (sessionId === req.authUser?.sessionId) {
      clearAuthCookies(res);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al revocar sesión' });
  }
}

// S-07: Revocar todas las demás sesiones (mantener solo la actual)
export async function revokeOtherSessionsEndpoint(req, res) {
  try {
    const userId = req.authUser?.userId;
    const currentSessionId = req.authUser?.sessionId;

    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await revokeAllSessions(req, account, currentSessionId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'security',
      action: 'Todas las demás sesiones revocadas',
      entityId: userId,
      entityLabel: account.fullName,
      ip: getClientIp(req),
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al revocar sesiones' });
  }
}

// S-06: Solicitar recuperación de contraseña
export async function recoverPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return badRequest(res, 'El email es obligatorio');
    }

    // Lista de cuentas en memoria (TTL ~30s): tras un registro reciente puede no incluir la cuenta nueva.
    invalidateDb(ACCOUNTS_DB);

    const account = await findAccountByEmail(req, email);

    // No revelar si el email existe o no (prevención de enumeración)
    if (!account) {
      logger.warn(
        { tag: 'AUTH_RECOVER', hint: 'no_account' },
        'Recuperación solicitada para un email sin cuenta en esta base (no se envía correo).',
      );
      return res.json({ ok: true, message: 'Si el email existe, recibirás un enlace en breve' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    await saveResetToken(req, account, rawToken);

    const { subject, html } = buildPasswordResetEmail(email, rawToken);
    await sendEmail({ to: email, subject, html, requireDelivery: true });

    logger.info({ tag: 'AUTH_RECOVER', to: email }, 'Correo de recuperación de contraseña enviado');

    await logAccountActivity(req, {
      actorUserId: account.user_id,
      actorName: account.fullName,
      targetUserId: account.user_id,
      type: 'security',
      action: 'Solicitud de recuperación de contraseña',
      entityId: account.user_id,
      entityLabel: account.fullName,
    });

    return res.json({ ok: true, message: 'Si el email existe, recibirás un enlace en breve' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al procesar la recuperación',
    });
  }
}

// S-06: Restablecer contraseña con token
export async function resetPasswordWithToken(req, res) {
  try {
    const { token, email, newPassword } = req.body || {};

    if (!token || !email || !newPassword) {
      return badRequest(res, 'Token, email y nueva contraseña son obligatorios');
    }

    if (String(newPassword).length < 8) {
      return badRequest(res, 'La contraseña debe tener al menos 8 caracteres');
    }

    const account = await findAccountByResetToken(req, token);
    if (!account || account.email.toLowerCase() !== String(email).trim().toLowerCase()) {
      return res.status(400).json({ ok: false, error: 'Token inválido o expirado' });
    }

    const savedAccount = await saveAccount(req, {
      ...account,
      passwordHash: hashPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpiry: null,
      refreshTokenHash: null,
      refreshTokenExpiry: null,
      sessions: [],
      updatedAt: new Date().toISOString(),
    });
    // S-01: Limpiar cookies al resetear contraseña
    clearAuthCookies(res);

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'security',
      action: 'Contraseña restablecida mediante enlace',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
    });

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al restablecer la contraseña',
    });
  }
}

// S-01 + S-07: Cerrar sesión — limpia cookies y revoca la sesión actual
export async function logout(req, res) {
  try {
    // S-01: Leer token de cookie primero, fallback a body
    const cookieToken = req.cookies?.refresh_token;
    const bodyToken = req.body?.refreshToken;
    const rawToken = cookieToken || bodyToken;

    // S-01: Siempre limpiar las cookies httpOnly
    clearAuthCookies(res);

    if (rawToken) {
      let decoded;
      try {
        decoded = verifyRefreshToken(rawToken);
      } catch {
        return res.json({ ok: true });
      }

      const account = await findAccountByUserId(req, decoded.userId);
      if (account) {
        // S-07: Revocar solo la sesión actual (no todas)
        if (decoded.sessionId) {
          await revokeSession(req, account, decoded.sessionId);
        } else {
          await revokeRefreshToken(req, account);
        }
        await logAccountActivity(req, {
          actorUserId: account.user_id,
          actorName: account.fullName,
          targetUserId: account.user_id,
          type: 'login',
          action: 'Cierre de sesión',
          entityId: account.user_id,
          entityLabel: account.fullName,
          ip: getClientIp(req),
          metadata: { sessionId: decoded.sessionId || null },
        });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cerrar sesión',
    });
  }
}

// AUTH-02: Verificar email con token
export async function verifyEmail(req, res) {
  try {
    const { token, email } = req.query || {};

    if (!token || !email) {
      return badRequest(res, 'Token y email son obligatorios');
    }

    const account = await findAccountForEmailVerification(req, String(email), String(token));
    if (!account) {
      return res.status(400).json({ ok: false, error: 'Enlace de verificación inválido o expirado' });
    }

    const savedAccount = await saveAccount(req, {
      ...account,
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationExpiry: null,
      updatedAt: new Date().toISOString(),
    });

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'security',
      action: 'Email verificado',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
    });

    sendWelcomeEmail(savedAccount).catch(() => null);

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al verificar el email',
    });
  }
}

// AUTH-02: Reenviar email de verificación (cooldown 60 s)
const RESEND_COOLDOWN_MS = 60 * 1000;

async function resolveFreshAccount(req, account) {
  const byEmail = account?.email ? await findAccountByEmail(req, account.email) : null;
  if (byEmail) return byEmail;
  if (account?.user_id) {
    const byId = await findAccountByUserId(req, account.user_id);
    if (byId) return byId;
  }
  return account;
}

async function sendAccountVerificationEmail(req, account) {
  const fresh = await resolveFreshAccount(req, account);
  const rawToken = crypto.randomBytes(32).toString('hex');
  // Guardar token antes de enviar el correo: el enlace es válido en cuanto el usuario lo recibe.
  const latest = await resolveFreshAccount(req, fresh);
  const saved = await persistEmailVerificationAfterSend(req, latest, rawToken);

  const { subject, html } = buildEmailVerificationEmail(saved.email, rawToken);
  try {
    await sendEmail({
      to: saved.email,
      subject,
      html,
      requireDelivery: process.env.NODE_ENV === 'production',
    });
  } catch (emailErr) {
    logger.error(
      { tag: 'AUTH_VERIFY_SEND', email: saved.email, err: emailErr?.message || emailErr },
      'Token guardado pero falló el envío del correo de verificación',
    );
    if (process.env.NODE_ENV === 'production') throw emailErr;
  }

  if (process.env.NODE_ENV !== 'production') {
    const baseUrl = String(process.env.APP_URL || `http://localhost:${process.env.VITE_PORT || 3015}`).replace(/\/+$/, '');
    const verifyUrl = `${baseUrl}/auth/verify-email-pending?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(saved.email)}`;
    logger.info(
      { tag: 'AUTH_VERIFY_DEV', email: saved.email, verifyUrl },
      'Enlace de verificación (solo desarrollo — cópialo si no llega el correo)',
    );
  }

  return saved;
}

export async function resendVerificationEmail(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return badRequest(res, 'El email es obligatorio');
    }

    const account = await findAccountByEmail(req, email);

    if (!account) {
      if (process.env.NODE_ENV === 'development') {
        return res.status(404).json({
          ok: false,
          error: 'No hay ninguna cuenta con este email. Regístrate de nuevo o comprueba que escribiste el mismo correo.',
          emailSent: false,
        });
      }
      return res.json({ ok: true, message: 'Si el email existe, recibirás un enlace en breve', emailSent: false });
    }

    if (account.emailVerified) {
      return res.json({
        ok: true,
        message: 'Este email ya está verificado. Puedes iniciar sesión.',
        emailSent: false,
        alreadyVerified: true,
      });
    }

    if (account.lastVerificationEmailSentAt) {
      const elapsed = Date.now() - new Date(account.lastVerificationEmailSentAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          ok: false,
          error: `Debes esperar ${retryAfter} segundos antes de solicitar otro enlace`,
          retryAfter,
        });
      }
    }

    await sendAccountVerificationEmail(req, account);

    return res.json({
      ok: true,
      message: 'Correo de verificación enviado. Revisa tu bandeja y la carpeta de spam.',
      emailSent: true,
    });
  } catch (error) {
    logger.error(
      { tag: 'AUTH_RESEND_VERIFY', email: req.body?.email, err: error?.message || error },
      'Error al reenviar verificación',
    );
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al reenviar el email de verificación',
      emailSent: false,
    });
  }
}

// AUTH-03: Obtener progreso de onboarding
export async function getOnboarding(req, res) {
  try {
    const { userId } = req.params;
    const account = await findAccountByUserId(req, userId);

    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    return res.json({
      ok: true,
      onboardingCompleted: Boolean(account.onboardingCompleted),
      onboardingData: account.onboardingData || {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar el progreso de onboarding',
    });
  }
}

// AUTH-03: Guardar progreso de onboarding
export async function saveOnboarding(req, res) {
  try {
    const { userId } = req.params;
    const { onboardingData, onboardingCompleted } = req.body || {};

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const wasIncomplete = !account.onboardingCompleted;
    const prevVerificationDocCount = Array.isArray(account.onboardingData?.companyProfile?.verificationDocuments)
      ? account.onboardingData.companyProfile.verificationDocuments.length
      : 0;
    const nextOnboardingData =
      onboardingData !== undefined ? onboardingData : account.onboardingData;
    const willComplete =
      onboardingCompleted !== undefined ? Boolean(onboardingCompleted) : account.onboardingCompleted;
    let nextSubscription = account.subscription;
    if (wasIncomplete && willComplete && nextOnboardingData) {
      nextSubscription = preserveAdminLockedPlan(
        buildSubscriptionFromOnboarding(nextOnboardingData, account.subscription || {}),
        account.subscription || {},
      );
    }
    let savedAccount = await saveAccount(req, {
      ...account,
      onboardingCompleted: willComplete,
      onboardingData: nextOnboardingData,
      subscription: nextSubscription,
      companyName:
        resolveBusinessNameFromOnboarding({
          ...account,
          onboardingData: nextOnboardingData,
        }) || account.companyName,
      updatedAt: new Date().toISOString(),
    });

    if (wasIncomplete && willComplete) {
      try {
        const provision = await provisionBusinessFromOnboarding(req, savedAccount);
        if (provision.ok && provision.businessId) {
          savedAccount = await saveAccount(req, {
            ...savedAccount,
            onboardingData: {
              ...(savedAccount.onboardingData || {}),
              businessId: provision.businessId,
              suppressAutoProvision: false,
            },
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (provisionErr) {
        console.error('[AUTH] Error provisionando empresa desde onboarding:', provisionErr?.message);
      }
    }

    const nextVerificationDocCount = Array.isArray(
      savedAccount.onboardingData?.companyProfile?.verificationDocuments,
    )
      ? savedAccount.onboardingData.companyProfile.verificationDocuments.length
      : 0;
    if (nextVerificationDocCount > prevVerificationDocCount) {
      await logAccountActivity(req, {
        actorUserId: savedAccount.user_id,
        actorName: savedAccount.fullName,
        targetUserId: savedAccount.user_id,
        type: 'team',
        action: 'Documentos de verificación de empresa subidos',
        entityId: savedAccount.user_id,
        entityLabel: savedAccount.companyName || savedAccount.fullName,
        metadata: {
          verificationDocumentCount: nextVerificationDocCount,
          taxId: savedAccount.onboardingData?.companyProfile?.taxId || '',
        },
      }).catch(() => {});
    }

    if (wasIncomplete && Boolean(onboardingCompleted)) {
      const onb = savedAccount.onboardingData || {};
      const trial = onb.trial || {};
      const emailData = buildSetupWelcomeEmail({
        firstName: savedAccount.firstName,
        companyName: savedAccount.companyName,
        planName: savedAccount.subscription?.planName || 'Basic',
        trialEndDate: trial.endDate || savedAccount.subscription?.trialEndsAt || null,
        businessType: onb.businessType || '',
        modules: onb.requestedModules || {},
      });
      sendEmail({ to: savedAccount.email, subject: emailData.subject, html: emailData.html }).catch(() => {});
    }

    return res.json({
      ok: true,
      onboardingCompleted: Boolean(savedAccount.onboardingCompleted),
      onboardingData: savedAccount.onboardingData || {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar el progreso de onboarding',
    });
  }
}

// A-04: Aceptar invitación — distingue dos flujos:
//  · Usuario nuevo (cuenta creada como `pending`): debe fijar contraseña.
//  · Usuario ya registrado (tiene `pendingTeamInvite`): solo le añadimos al equipo.
export async function acceptInvite(req, res) {
  try {
    const { token, email, newPassword } = req.body || {};

    if (!token || !email) {
      return badRequest(res, 'Token y email son obligatorios');
    }

    const account = await findAccountByInviteToken(req, String(token));
    if (!account || account.email.toLowerCase() !== String(email).trim().toLowerCase()) {
      return res.status(400).json({ ok: false, error: 'Enlace de invitación inválido o expirado' });
    }

    const teamInvite = account.pendingTeamInvite || null;
    const isExistingUser = Boolean(teamInvite);

    if (!isExistingUser) {
      if (!newPassword) {
        return badRequest(res, 'La nueva contraseña es obligatoria para activar la cuenta');
      }
      if (String(newPassword).length < 8) {
        return badRequest(res, 'La contraseña debe tener al menos 8 caracteres');
      }
    }

    const isTeamInvite = isExistingUser || account.onboardingData?.source === 'team-invite';
    const now = new Date().toISOString();

    let savedBusiness = null;
    if (isExistingUser && teamInvite?.businessId) {
      try {
        const business = await findBusinessById(req, teamInvite.businessId);
        if (business) {
          const members = Array.isArray(business.members) ? business.members : [];
          const alreadyMember = members.some((m) => m.user_id === account.user_id);
          if (!alreadyMember) {
            savedBusiness = await saveBusiness(req, {
              ...business,
              members: [
                ...members,
                {
                  user_id: account.user_id,
                  fullName: account.fullName,
                  email: account.email,
                  role: teamInvite.role || 'Usuario',
                  permissions: teamInvite.permissions || normalizePermissionMatrix(undefined, teamInvite.role || 'Usuario'),
                  joinedAt: now,
                },
              ],
              updatedAt: now,
            });
          } else {
            savedBusiness = business;
          }
        }
      } catch (memberErr) {
        console.error('[AUTH] Error añadiendo a business.members al aceptar invitación:', memberErr?.message);
      }
    }

    const updatedAccountDoc = {
      ...account,
      inviteStatus: 'accepted',
      status: 'active',
      emailVerified: true,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      pendingTeamInvite: null,
      onboardingCompleted: isTeamInvite,
      updatedAt: now,
    };

    if (!isExistingUser) {
      updatedAccountDoc.passwordHash = hashPassword(newPassword);
    } else if (teamInvite) {
      // Reflect the invite's chosen role/landing/employment in the account so the UI lo coja.
      if (teamInvite.role) updatedAccountDoc.role = teamInvite.role;
      if (teamInvite.permissions) updatedAccountDoc.permissions = teamInvite.permissions;
      if (teamInvite.landingPage) updatedAccountDoc.landingPage = teamInvite.landingPage;
      if (teamInvite.employment) {
        updatedAccountDoc.employment = mergeEmploymentInfo(account.employment, teamInvite.employment);
      }
      if (teamInvite.businessId) updatedAccountDoc.linkedBusinessId = teamInvite.businessId;
      if (teamInvite.businessName) updatedAccountDoc.companyName = teamInvite.businessName;
      updatedAccountDoc.invitedBy = account.invitedBy || teamInvite.invitedBy || '';
      updatedAccountDoc.workerProfileCompletion = computeWorkerProfileCompletion({
        ...updatedAccountDoc,
        employment: updatedAccountDoc.employment || account.employment,
        personalData: account.personalData,
      });
    }

    const savedAccount = await saveAccount(req, updatedAccountDoc);

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'team',
      action: isExistingUser ? 'Invitación aceptada (usuario existente)' : 'Invitación aceptada',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      metadata: isExistingUser
        ? { businessId: teamInvite?.businessId || '', businessName: teamInvite?.businessName || '' }
        : {},
    });

    const redirectTo = isTeamInvite
      ? (teamInvite?.landingPage || savedAccount.landingPage || '/saas/dashboard')
      : '/auth/onboarding/business-type';

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      accessToken,
      refreshToken,
      redirectTo,
      isExistingUser,
      joinedBusiness: savedBusiness
        ? { business_id: savedBusiness.business_id, name: savedBusiness.name || '' }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al aceptar la invitación',
    });
  }
}

/** GET /api/auth/me — perfil actual desde BD (sincroniza caché local, p. ej. flags de UI). */
export async function getMe(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account || account.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Tras verificar en otro dispositivo, el JWT del PC puede quedar desactualizado.
    const jwtVerified = Boolean(req.authUser?.emailVerified);
    const dbVerified = Boolean(account.emailVerified);
    if (jwtVerified !== dbVerified) {
      await issueTokens(req, res, account);
    }

    return res.json({
      ok: true,
      user: sanitizeAccount(account),
    });
  } catch (error) {
    console.error('[AUTH] getMe error:', error?.message || error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar el perfil',
    });
  }
}

// ─── RGPD: Descargar mis datos personales ────────────────────────────────────

export async function exportMyData(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const sanitized = sanitizeAccount(account);

    const sessions = Array.isArray(account.sessions)
      ? account.sessions
          .filter((s) => s && s.expiry && new Date(s.expiry) > new Date())
          .map((s) => sanitizeSession(s, req.authUser?.sessionId))
      : [];

    const activities = Array.isArray(account.recentActivity) ? account.recentActivity : [];

    const exportData = {
      exportedAt: new Date().toISOString(),
      subject: 'personal_data',
      profile: {
        userId: sanitized.user_id,
        email: sanitized.email,
        firstName: sanitized.firstName,
        lastName: sanitized.lastName,
        fullName: sanitized.fullName,
        phone: sanitized.phone,
        avatar: sanitized.avatar,
        role: sanitized.role,
        companyName: sanitized.companyName,
        provider: sanitized.provider,
        createdAt: sanitized.createdAt,
        updatedAt: sanitized.updatedAt,
        lastLoginAt: sanitized.lastLoginAt,
        emailVerified: sanitized.emailVerified,
        onboardingCompleted: sanitized.onboardingCompleted,
        landingPage: sanitized.landingPage,
      },
      employment: sanitized.employment || null,
      permissions: sanitized.permissions || null,
      activeSessions: sessions,
      recentActivity: activities,
    };

    const filename = `mis-datos-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json(exportData);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al exportar datos personales',
    });
  }
}

// ─── Join Requests: solicitudes de usuario para unirse a empresa ──────────

export async function createJoinRequest(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const { businessId, message = '' } = req.body || {};
    if (!businessId) return badRequest(res, 'businessId es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const existing = await findPendingJoinRequest(req, userId, businessId);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Ya tienes una solicitud pendiente para esta empresa' });
    }

    const joinRequest = buildJoinRequestDocument({
      userId,
      userFullName: account.fullName,
      userEmail: account.email,
      businessId: business.business_id,
      businessName: business.name || '',
      message,
    });

    const saved = await saveJoinRequest(req, joinRequest);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: business.owner_user_id,
      type: 'team',
      action: 'Solicitud de unión a empresa enviada',
      entityId: saved.request_id,
      entityLabel: business.name || '',
      metadata: { businessId: business.business_id, message },
    });

    return res.status(201).json({ ok: true, joinRequest: saved });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear la solicitud',
    });
  }
}

export async function getMyJoinRequests(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const requests = await listJoinRequestsByUser(req, userId);
    return res.json({ ok: true, joinRequests: requests });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar solicitudes',
    });
  }
}

export async function getBusinessJoinRequests(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'businessId obligatorio');

    const requests = await listJoinRequestsByBusiness(req, businessId);
    return res.json({ ok: true, joinRequests: requests });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar solicitudes',
    });
  }
}

export async function reviewJoinRequest(req, res) {
  try {
    const userId = req.authUser?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const { requestId } = req.params;
    const { action } = req.body || {};

    if (!requestId) return badRequest(res, 'requestId obligatorio');
    if (!['accepted', 'rejected'].includes(action)) return badRequest(res, 'Acción inválida');

    const joinRequest = await findJoinRequestById(req, requestId);
    if (!joinRequest) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (joinRequest.status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Esta solicitud ya fue procesada' });
    }

    const now = new Date().toISOString();
    const updated = {
      ...joinRequest,
      status: action,
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    };
    const saved = await saveJoinRequest(req, updated);

    if (action === 'accepted') {
      const applicant = await findAccountByUserId(req, joinRequest.user_id);
      const business = await findBusinessById(req, joinRequest.business_id);

      if (applicant && business) {
        const members = Array.isArray(business.members) ? business.members : [];
        const alreadyMember = members.some((m) => m.user_id === applicant.user_id);

        if (!alreadyMember) {
          const newMember = {
            user_id: applicant.user_id,
            fullName: applicant.fullName,
            email: applicant.email,
            role: 'Usuario',
            permissions: normalizePermissionMatrix(undefined, 'Usuario'),
            joinedAt: now,
          };
          await saveBusiness(req, {
            ...business,
            members: [...members, newMember],
            updatedAt: now,
          });
        }

        await saveAccount(req, {
          ...applicant,
          linkedBusinessId: business.business_id,
          companyName: business.name || applicant.companyName,
          updatedAt: now,
        });
      }
    }

    const reviewer = await findAccountByUserId(req, userId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: reviewer?.fullName || '',
      targetUserId: joinRequest.user_id,
      type: 'team',
      action: action === 'accepted' ? 'Solicitud de unión aceptada' : 'Solicitud de unión rechazada',
      entityId: saved.request_id,
      entityLabel: joinRequest.businessName,
      metadata: { businessId: joinRequest.business_id, action },
    });

    return res.json({ ok: true, joinRequest: saved });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al procesar la solicitud',
    });
  }
}

export async function searchBusinesses(req, res) {
  try {
    const { q = '' } = req.query || {};
    const businesses = await listAllBusinesses(req);
    const query = String(q).trim().toLowerCase();

    const results = query
      ? businesses.filter((b) =>
          (b.name || '').toLowerCase().includes(query) ||
          (b.legalName || '').toLowerCase().includes(query) ||
          (b.taxId || '').toLowerCase().includes(query)
        )
      : businesses;

    return res.json({
      ok: true,
      businesses: results.slice(0, 20).map((b) => ({
        business_id: b.business_id,
        name: b.name || '',
        legalName: b.legalName || '',
        city: b.city || '',
        businessType: b.businessType || '',
        logo: b.logo || '',
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al buscar empresas',
    });
  }
}

// ─── Team Login: miembros de equipo entran con código de empresa + usuario + contraseña ──

export async function teamLogin(req, res) {
  try {
    const { companyCode, username, password } = req.body || {};
    const ip = getClientIp(req);

    if (!companyCode || !username || !password) {
      return badRequest(res, 'Código de empresa, usuario y contraseña son obligatorios');
    }

    const business = await findBusinessByCompanyCode(req, companyCode);
    if (!business) {
      return res.status(401).json({ ok: false, error: 'Código de empresa, usuario o contraseña incorrectos' });
    }

    const account = await findTeamMemberByUsername(req, business.business_id, username);
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Código de empresa, usuario o contraseña incorrectos' });
    }

    const lockStatus = isAccountLocked(account);
    if (lockStatus.locked) {
      const remainingMin = Math.ceil(lockStatus.remainingMs / 60000);
      return res.status(423).json({
        ok: false,
        error: `Cuenta bloqueada temporalmente. Inténtalo de nuevo en ${remainingMin} minuto${remainingMin !== 1 ? 's' : ''} o usa un código por email.`,
        code: 'ACCOUNT_LOCKED',
        lockUntil: lockStatus.lockUntil,
        canUseLoginCode: true,
      });
    }

    if (lockStatus.wasExpired) {
      try {
        await saveAccount(req, {
          ...account,
          failedLoginAttempts: 0,
          lockUntil: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (cleanupErr) {
        console.error('[AUTH] Error en limpieza lazy de bloqueo (team):', cleanupErr?.message);
      }
    }

    if (!verifyPassword(password, account.passwordHash)) {
      await incrementFailedLoginAttempts(req, account);
      return res.status(401).json({ ok: false, error: 'Código de empresa, usuario o contraseña incorrectos' });
    }

    const savedAccount = await saveAccount(req, {
      ...account,
      status: 'active',
      lastLoginAt: new Date().toISOString(),
      failedLoginAttempts: 0,
      lockUntil: null,
      updatedAt: new Date().toISOString(),
    });

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'login',
      action: 'Inicio de sesión de equipo',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      ip,
      metadata: {
        loginType: 'team',
        companyCode,
        businessId: business.business_id,
        businessName: business.name,
        ip,
        userAgent: req.headers['user-agent'] || '',
      },
    });

    void writeChangelog(req, {
      entity: 'login',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName || savedAccount.email,
      action: 'login',
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName || savedAccount.email,
      changes: {},
      metadata: {
        loginType: 'team',
        companyCode,
        businessId: business.business_id,
        email: savedAccount.email,
        role: savedAccount.role,
        ip,
        userAgent: req.headers['user-agent'] || '',
      },
    });

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    let redirectTo = savedAccount.landingPage || '/saas/dashboard';
    if (!savedAccount.emailVerified) {
      redirectTo = '/auth/verify-email-pending';
    }
    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      business: {
        business_id: business.business_id,
        name: business.name,
        logo: business.logo || '',
        companyCode: business.companyCode,
      },
      accessToken,
      refreshToken,
      redirectTo,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al iniciar sesión de equipo',
    });
  }
}

// ─── POS Switch User: cambio rápido de usuario en el TPV sin cerrar sesión de empresa ──

export async function posSwitchUser(req, res) {
  try {
    const { username, password } = req.body || {};
    const currentUser = req.authUser;

    if (!currentUser?.userId) {
      return res.status(401).json({ ok: false, error: 'Se requiere una sesión activa de empresa' });
    }

    if (!username || !password) {
      return badRequest(res, 'Usuario y contraseña son obligatorios');
    }

    const currentAccount = await findAccountByUserId(req, currentUser.userId);
    if (!currentAccount) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }

    const businessId = currentAccount.linkedBusinessId;
    if (!businessId) {
      return badRequest(res, 'La sesión actual no está vinculada a una empresa');
    }

    const business = await findBusinessById(req, businessId);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    }

    const targetAccount = await findTeamMemberByUsername(req, businessId, username);
    if (!targetAccount) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    if (!verifyPassword(password, targetAccount.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    const ip = getClientIp(req);
    const savedAccount = await saveAccount(req, {
      ...targetAccount,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await logAccountActivity(req, {
      actorUserId: savedAccount.user_id,
      actorName: savedAccount.fullName,
      targetUserId: savedAccount.user_id,
      type: 'login',
      action: 'Cambio de usuario en TPV',
      entityId: savedAccount.user_id,
      entityLabel: savedAccount.fullName,
      ip,
      metadata: {
        loginType: 'pos-switch',
        previousUserId: currentUser.userId,
        businessId,
        ip,
        userAgent: req.headers['user-agent'] || '',
      },
    });

    const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);
    return res.json({
      ok: true,
      user: sanitizeAccount(savedAccount),
      business: {
        business_id: business.business_id,
        name: business.name,
        logo: business.logo || '',
      },
      accessToken,
      refreshToken,
      switchedFrom: currentUser.userId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cambiar de usuario',
    });
  }
}

// ─── TPV Tablet: código de tienda (fichaje + sesión TPV) ─────────────────────

async function resolveBusinessForPointOfSale(req, pdv) {
  return resolveBusinessDocumentForPointOfSale(req, pdv);
}

async function resolveTabletSessionAccount(req, business, pdv) {
  const ownerId = String(business.owner_user_id || '').trim();
  if (ownerId) {
    const owner = await findAccountByUserId(req, ownerId);
    if (owner && !owner.deletedAt && owner.status !== 'inactive') return owner;
  }

  const dataUserId = String(pdv.user_id || '').trim();
  if (dataUserId && dataUserId !== ownerId) {
    const dataUser = await findAccountByUserId(req, dataUserId);
    if (dataUser && !dataUser.deletedAt && dataUser.status !== 'inactive') return dataUser;
  }

  const members = Array.isArray(business.members) ? business.members : [];
  for (const member of members) {
    const memberId = String(member.user_id || '').trim();
    if (!memberId || memberId === ownerId) continue;
    const account = await findAccountByUserId(req, memberId);
    if (!account || account.deletedAt || account.status === 'inactive') continue;
    if (workerCanAccessPdvForTablet(account, business, pdv)) return account;
  }

  return null;
}

async function performTpvTabletLogin(req, res, { terminalCode }) {
  const ip = getClientIp(req);

  if (!terminalCode) {
    return badRequest(res, 'El código de tienda es obligatorio');
  }

  const pdv = await findPointOfSaleByTerminalCode(req, terminalCode);
  if (!pdv) {
    return res.status(401).json({ ok: false, error: 'Código de tienda incorrecto' });
  }

  const business = await resolveBusinessForPointOfSale(req, pdv);
  if (!business) {
    return res.status(401).json({ ok: false, error: 'Código de tienda incorrecto' });
  }

  const account = await resolveTabletSessionAccount(req, business, pdv);
  if (!account) {
    return res.status(401).json({ ok: false, error: 'Código de tienda incorrecto' });
  }

  const lockStatus = isAccountLocked(account);
  if (lockStatus.locked) {
    const remainingMin = Math.ceil(lockStatus.remainingMs / 60000);
    return res.status(423).json({
      ok: false,
      error: `Cuenta bloqueada temporalmente. Inténtalo de nuevo en ${remainingMin} minuto${remainingMin !== 1 ? 's' : ''}.`,
      code: 'ACCOUNT_LOCKED',
      lockUntil: lockStatus.lockUntil,
    });
  }

  if (!workerCanAccessPdvForTablet(account, business, pdv)) {
    return res.status(403).json({
      ok: false,
      error: 'No tienes acceso a esta tienda. Pide al encargado que te asigne el local correcto.',
      code: 'STORE_NOT_ASSIGNED',
    });
  }

  const savedAccount = await saveAccount(req, {
    ...account,
    status: 'active',
    linkedBusinessId: account.linkedBusinessId || business.business_id,
    lastLoginAt: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockUntil: null,
    updatedAt: new Date().toISOString(),
  });

  await logAccountActivity(req, {
    actorUserId: savedAccount.user_id,
    actorName: savedAccount.fullName,
    targetUserId: savedAccount.user_id,
    type: 'login',
    action: 'Inicio de sesión TPV tablet',
    entityId: savedAccount.user_id,
    entityLabel: savedAccount.fullName,
    ip,
    metadata: {
      loginType: 'tpv-tablet',
      terminalCode: String(terminalCode).trim().toUpperCase(),
      pdvId: pdv._id,
      businessId: business.business_id,
      ip,
      userAgent: req.headers['user-agent'] || '',
    },
  });

  const { accessToken, refreshToken } = await issueTokens(req, res, savedAccount);

  return res.json({
    ok: true,
    user: sanitizeAccount(savedAccount),
    business: {
      business_id: business.business_id,
      name: business.name,
      logo: business.logo || '',
      owner_user_id: business.owner_user_id || '',
    },
    pointOfSale: sanitizePointOfSale(pdv),
    terminalBinding: {
      terminalCode: String(pdv.terminalCode || terminalCode).trim().toUpperCase(),
      pdvId: pdv._id,
      workCenterId: pdv.workCenterId || '',
      businessId: business.business_id,
      dataUserId: pdv.user_id,
      tpvVertical: 'delivery',
    },
    accessToken,
    refreshToken,
    redirectTo: '/saas/worker/tpv/delivery',
    needsClockIn: true,
  });
}

export async function tpvTabletActivate(req, res) {
  try {
    const { terminalCode } = req.body || {};
    return performTpvTabletLogin(req, res, { terminalCode });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al activar el TPV tablet',
    });
  }
}

export async function tpvTabletSwitch(req, res) {
  try {
    const { terminalCode } = req.body || {};
    return performTpvTabletLogin(req, res, { terminalCode });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al acceder al TPV tablet',
    });
  }
}

export async function setUserPosPin(req, res) {
  try {
    const targetUserId = String(req.params.userId || '').trim();
    const { pin } = req.body || {};
    const actor = req.authUser;

    if (!targetUserId) return badRequest(res, 'Falta userId');
    if (!isValidPosPin(pin)) {
      return badRequest(res, 'El PIN debe tener entre 4 y 6 dígitos numéricos');
    }

    const target = await findAccountByUserId(req, targetUserId);
    if (!target) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const actorAccount = actor?.userId ? await findAccountByUserId(req, actor.userId) : null;
    let businessId = target.linkedBusinessId || actorAccount?.linkedBusinessId || '';
    if (!businessId) {
      const allBusinesses = await listAllBusinesses(req);
      const owned = allBusinesses.find((b) => b.owner_user_id === target.user_id);
      if (owned) businessId = owned.business_id;
    }
    if (!businessId) {
      return res.status(403).json({ ok: false, error: 'No se puede determinar la empresa del usuario' });
    }

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const actorId = actor?.userId || '';
    const isOwner = business.owner_user_id === actorId;
    const actorMember = (business.members || []).find((m) => m.user_id === actorId);
    const canManage = isOwner || actorMember?.role === 'Admin' || actorAccount?.role === 'Admin';
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para cambiar el PIN TPV' });
    }

    const saved = await saveAccount(req, {
      ...target,
      posPinHash: hashPosPin(pin),
      updatedAt: new Date().toISOString(),
    });

    return res.json({ ok: true, user: sanitizeAccount(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar el PIN TPV',
    });
  }
}

// ─── Preferencias de notificación (personales del usuario) ──────────────────────

/**
 * GET /api/auth/preferences
 *
 * Devuelve las preferencias personales de notificación del usuario autenticado.
 * Si nunca las ha tocado, devuelve los defaults (clockin entradas/retrasos
 * activados, descansos silenciados, etc.).
 */
export async function getNotificationPreferences(req, res) {
  try {
    const userId = req.authUser?.user_id;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    return res.json({
      ok: true,
      notificationPreferences: normalizeNotificationPreferences(account.notificationPreferences),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener preferencias',
    });
  }
}

/**
 * PATCH /api/auth/preferences
 *
 * Actualiza las preferencias personales de notificación. Solo el propio usuario
 * puede modificarlas. Acepta una mezcla parcial del objeto (merge profundo
 * con los defaults para garantizar consistencia).
 */
export async function updateNotificationPreferences(req, res) {
  try {
    const userId = req.authUser?.user_id;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const incoming = req.body?.notificationPreferences || req.body || {};
    const current = normalizeNotificationPreferences(account.notificationPreferences);
    const merged = normalizeNotificationPreferences({
      ...current,
      ...incoming,
      clockin: { ...current.clockin, ...(incoming.clockin || {}) },
      team: { ...current.team, ...(incoming.team || {}) },
    });

    const saved = await saveAccount(req, {
      ...account,
      notificationPreferences: merged,
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      notificationPreferences: normalizeNotificationPreferences(saved.notificationPreferences),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar preferencias',
    });
  }
}
