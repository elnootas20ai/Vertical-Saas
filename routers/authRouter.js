import { Router } from 'express';
import {
  acceptInvite,
  acceptInvitation,
  createJoinRequest,
  deleteUser,
  exportMyData,
  getBusinessJoinRequests,
  getBillingCard,
  getMyJoinRequests,
  getNotificationPreferences,
  getOnboarding,
  getMe,
  getUserActivity,
  googleLogin,
  inviteUser,
  lookupInviteEmail,
  listAllActivities,
  listBusinessInvitations,
  listMyInvitations,
  listRoles,
  listSessions,
  listUsers,
  requestLoginCode,
  verifyLoginCode,
  login,
  logActivity,
  logout,
  posSwitchUser,
  recoverPassword,
  refreshToken,
  register,
  rejectInvitation,
  resendInvitation,
  resendInvite,
  resendVerificationEmail,
  resetPasswordWithToken,
  resetUserPassword,
  reviewJoinRequest,
  revokeInvitation,
  revokeOtherSessionsEndpoint,
  revokeSessionEndpoint,
  saveOnboarding,
  saveBillingCard,
  activateOnboardingTrialWithoutCard,
  searchBusinesses,
  setUserPosPin,
  teamLogin,
  tpvTabletActivate,
  tpvTabletSwitch,
  updateNotificationPreferences,
  updatePassword,
  updateProfile,
  verifyEmail,
} from '../controllers/authController.js';
import { requireAuth, requireAuthAndEmailVerified, requireAuthForProfileUpdate, optionalAuth } from '../middleware/auth.js';
import { authSessionLimiter, emailVerificationLimiter, loginCodeLimiter, loginLimiter, registerLimiter, recoverLimiter, teamLoginLimiter, tpvTabletAuthLimiter } from '../middleware/rateLimiter.js';
import {
  validate,
  validateParams,
  acceptInviteSchema,
  businessIdParamSchema,
  googleLoginSchema,
  inviteUserSchema,
  invitationIdParamSchema,
  joinRequestSchema,
  joinRequestActionSchema,
  loginSchema,
  loginCodeVerifySchema,
  posSwitchUserSchema,
  recoverSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  saveBillingCardSchema,
  activateOnboardingTrialSchema,
  setPosPinSchema,
  teamLoginSchema,
  tpvTabletLoginSchema,
  updatePasswordSchema,
  userIdParamSchema,
} from '../middleware/validate.js';

const authRouter = Router();

// Rutas públicas con rate limiting y validación de input
authRouter.post('/register', registerLimiter, validate(registerSchema), register);
authRouter.post('/login', loginLimiter, validate(loginSchema), login);
authRouter.post('/google-login', loginLimiter, validate(googleLoginSchema), googleLogin);
authRouter.post('/logout', authSessionLimiter, logout);
authRouter.post('/login-code/request', loginCodeLimiter, validate(recoverSchema), requestLoginCode);
authRouter.post('/login-code/verify', loginCodeLimiter, validate(loginCodeVerifySchema), verifyLoginCode);
authRouter.post('/recover', recoverLimiter, validate(recoverSchema), recoverPassword);
authRouter.post('/reset-password', recoverLimiter, validate(resetPasswordSchema), resetPasswordWithToken);
authRouter.post('/refresh', authSessionLimiter, validate(refreshTokenSchema), refreshToken);
authRouter.get('/verify-email', emailVerificationLimiter, verifyEmail);
authRouter.post('/resend-verification', emailVerificationLimiter, validate(recoverSchema), resendVerificationEmail);
// A-04: Aceptación de invitación de miembro
authRouter.post('/accept-invite', recoverLimiter, validate(acceptInviteSchema), acceptInvite);
// Team login: miembros entran con código de empresa + usuario + contraseña
authRouter.post('/team-login', teamLoginLimiter, validate(teamLoginSchema), teamLogin);
// TPV tablet: código de tienda (conserva sesión actual si ya estás logueado)
authRouter.post('/tpv-tablet/activate', tpvTabletAuthLimiter, optionalAuth, validate(tpvTabletLoginSchema), tpvTabletActivate);
authRouter.post('/tpv-tablet/switch', tpvTabletAuthLimiter, optionalAuth, validate(tpvTabletLoginSchema), tpvTabletSwitch);
// POS switch: cambio rápido de usuario en TPV (requiere sesión activa)
authRouter.post('/pos-switch', requireAuthAndEmailVerified, validate(posSwitchUserSchema), posSwitchUser);

// Perfil actual desde BD (alinear caché local con servidor tras despliegue o cambios de cuenta)
authRouter.get('/me', requireAuth, getMe);

// Rutas protegidas con JWT y validación de input
authRouter.post('/invite', requireAuthAndEmailVerified, validate(inviteUserSchema), inviteUser);
// Lookup ligero para previsualizar a quién estás invitando antes de enviar la invitación.
authRouter.post('/invite/lookup', requireAuthAndEmailVerified, lookupInviteEmail);
authRouter.post('/activity', requireAuthAndEmailVerified, logActivity);
authRouter.get('/activities', requireAuthAndEmailVerified, listAllActivities);
authRouter.get('/users', requireAuthAndEmailVerified, listUsers);
authRouter.get('/roles', requireAuthAndEmailVerified, listRoles);
authRouter.put('/profile/:userId', requireAuthForProfileUpdate, validateParams(userIdParamSchema), updateProfile);
authRouter.put('/profile/:userId/password', requireAuthAndEmailVerified, validateParams(userIdParamSchema), validate(updatePasswordSchema), updatePassword);
authRouter.put('/profile/:userId/pos-pin', requireAuthAndEmailVerified, validateParams(userIdParamSchema), validate(setPosPinSchema), setUserPosPin);
authRouter.put('/profile/:userId/reset-password', requireAuthAndEmailVerified, validateParams(userIdParamSchema), resetUserPassword);
authRouter.post('/profile/:userId/resend-invite', requireAuthAndEmailVerified, validateParams(userIdParamSchema), resendInvite);
authRouter.get('/profile/:userId/card', requireAuthAndEmailVerified, validateParams(userIdParamSchema), getBillingCard);
authRouter.put('/profile/:userId/card', requireAuthAndEmailVerified, validateParams(userIdParamSchema), validate(saveBillingCardSchema), saveBillingCard);
authRouter.put(
  '/profile/:userId/onboarding/activate-trial',
  requireAuthAndEmailVerified,
  validateParams(userIdParamSchema),
  validate(activateOnboardingTrialSchema),
  activateOnboardingTrialWithoutCard,
);
authRouter.get('/profile/:userId/activity', requireAuthAndEmailVerified, validateParams(userIdParamSchema), getUserActivity);
authRouter.get('/profile/:userId/onboarding', requireAuthAndEmailVerified, validateParams(userIdParamSchema), getOnboarding);
authRouter.put('/profile/:userId/onboarding', requireAuthAndEmailVerified, validateParams(userIdParamSchema), saveOnboarding);
authRouter.delete('/profile/:userId', requireAuthAndEmailVerified, validateParams(userIdParamSchema), deleteUser);

// RGPD: Descargar mis datos personales
authRouter.get('/export-my-data', requireAuthAndEmailVerified, exportMyData);

// S-07: Gestión de sesiones simultáneas
authRouter.get('/sessions', requireAuthAndEmailVerified, listSessions);
authRouter.delete('/sessions/others', requireAuthAndEmailVerified, revokeOtherSessionsEndpoint);
authRouter.delete('/sessions/:sessionId', requireAuthAndEmailVerified, revokeSessionEndpoint);

// Join requests: solicitudes de usuario para unirse a empresa
authRouter.post('/join-requests', requireAuthAndEmailVerified, validate(joinRequestSchema), createJoinRequest);
authRouter.get('/join-requests/mine', requireAuthAndEmailVerified, getMyJoinRequests);
authRouter.get('/join-requests/business/:businessId', requireAuthAndEmailVerified, getBusinessJoinRequests);
authRouter.put('/join-requests/:requestId', requireAuthAndEmailVerified, validate(joinRequestActionSchema), reviewJoinRequest);
authRouter.get('/businesses/search', requireAuthAndEmailVerified, searchBusinesses);

// Team invitations (in-app): invitar por email, aceptar/rechazar dentro de Vertial.
// Ver /invitations/mine + accept/reject con solo sesión: el invitado puede ver y actuar
// sin depender de verificación de email (la invitación ya va al email de la cuenta).
authRouter.get('/invitations/mine', requireAuth, listMyInvitations);
authRouter.post('/invitations/:invitationId/accept', requireAuth, validateParams(invitationIdParamSchema), acceptInvitation);
authRouter.post('/invitations/:invitationId/reject', requireAuth, validateParams(invitationIdParamSchema), rejectInvitation);
authRouter.post('/invitations/:invitationId/resend', requireAuthAndEmailVerified, validateParams(invitationIdParamSchema), resendInvitation);
authRouter.delete('/invitations/:invitationId', requireAuthAndEmailVerified, validateParams(invitationIdParamSchema), revokeInvitation);
authRouter.get('/businesses/:businessId/invitations', requireAuthAndEmailVerified, validateParams(businessIdParamSchema), listBusinessInvitations);

// Preferencias personales de notificación (silenciar categorías concretas)
authRouter.get('/preferences', requireAuth, getNotificationPreferences);
authRouter.patch('/preferences', requireAuth, updateNotificationPreferences);

export { authRouter };
