import { Router } from 'express';
import {
  acceptInvite,
  createJoinRequest,
  deleteUser,
  exportMyData,
  getBusinessJoinRequests,
  getBillingCard,
  getMyJoinRequests,
  getOnboarding,
  getUserActivity,
  googleLogin,
  inviteUser,
  listAllActivities,
  listRoles,
  listSessions,
  listUsers,
  login,
  logActivity,
  logout,
  posSwitchUser,
  recoverPassword,
  refreshToken,
  register,
  resendVerificationEmail,
  resetPasswordWithToken,
  resetUserPassword,
  reviewJoinRequest,
  revokeOtherSessionsEndpoint,
  revokeSessionEndpoint,
  saveOnboarding,
  saveBillingCard,
  searchBusinesses,
  teamLogin,
  updatePassword,
  updateProfile,
  verifyEmail,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, registerLimiter, recoverLimiter } from '../middleware/rateLimiter.js';
import {
  validate,
  validateParams,
  acceptInviteSchema,
  googleLoginSchema,
  inviteUserSchema,
  joinRequestSchema,
  joinRequestActionSchema,
  loginSchema,
  posSwitchUserSchema,
  recoverSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  saveBillingCardSchema,
  teamLoginSchema,
  updatePasswordSchema,
  userIdParamSchema,
} from '../middleware/validate.js';

const authRouter = Router();

// Rutas públicas con rate limiting y validación de input
authRouter.post('/register', registerLimiter, validate(registerSchema), register);
authRouter.post('/login', authLimiter, validate(loginSchema), login);
authRouter.post('/google-login', authLimiter, validate(googleLoginSchema), googleLogin);
authRouter.post('/logout', authLimiter, logout);
authRouter.post('/recover', recoverLimiter, validate(recoverSchema), recoverPassword);
authRouter.post('/reset-password', recoverLimiter, validate(resetPasswordSchema), resetPasswordWithToken);
authRouter.post('/refresh', authLimiter, validate(refreshTokenSchema), refreshToken);
authRouter.get('/verify-email', recoverLimiter, verifyEmail);
authRouter.post('/resend-verification', recoverLimiter, validate(recoverSchema), resendVerificationEmail);
// A-04: Aceptación de invitación de miembro
authRouter.post('/accept-invite', recoverLimiter, validate(acceptInviteSchema), acceptInvite);
// Team login: miembros entran con código de empresa + usuario + contraseña
authRouter.post('/team-login', authLimiter, validate(teamLoginSchema), teamLogin);
// POS switch: cambio rápido de usuario en TPV (requiere sesión activa)
authRouter.post('/pos-switch', requireAuth, validate(posSwitchUserSchema), posSwitchUser);

// Rutas protegidas con JWT y validación de input
authRouter.post('/invite', requireAuth, validate(inviteUserSchema), inviteUser);
authRouter.post('/activity', requireAuth, logActivity);
authRouter.get('/activities', requireAuth, listAllActivities);
authRouter.get('/users', requireAuth, listUsers);
authRouter.get('/roles', requireAuth, listRoles);
authRouter.put('/profile/:userId', requireAuth, validateParams(userIdParamSchema), updateProfile);
authRouter.put('/profile/:userId/password', requireAuth, validateParams(userIdParamSchema), validate(updatePasswordSchema), updatePassword);
authRouter.put('/profile/:userId/reset-password', requireAuth, validateParams(userIdParamSchema), resetUserPassword);
authRouter.get('/profile/:userId/card', requireAuth, validateParams(userIdParamSchema), getBillingCard);
authRouter.put('/profile/:userId/card', requireAuth, validateParams(userIdParamSchema), validate(saveBillingCardSchema), saveBillingCard);
authRouter.get('/profile/:userId/activity', requireAuth, validateParams(userIdParamSchema), getUserActivity);
authRouter.get('/profile/:userId/onboarding', requireAuth, validateParams(userIdParamSchema), getOnboarding);
authRouter.put('/profile/:userId/onboarding', requireAuth, validateParams(userIdParamSchema), saveOnboarding);
authRouter.delete('/profile/:userId', requireAuth, validateParams(userIdParamSchema), deleteUser);

// RGPD: Descargar mis datos personales
authRouter.get('/export-my-data', requireAuth, exportMyData);

// S-07: Gestión de sesiones simultáneas
authRouter.get('/sessions', requireAuth, listSessions);
authRouter.delete('/sessions/others', requireAuth, revokeOtherSessionsEndpoint);
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionEndpoint);

// Join requests: solicitudes de usuario para unirse a empresa
authRouter.post('/join-requests', requireAuth, validate(joinRequestSchema), createJoinRequest);
authRouter.get('/join-requests/mine', requireAuth, getMyJoinRequests);
authRouter.get('/join-requests/business/:businessId', requireAuth, getBusinessJoinRequests);
authRouter.put('/join-requests/:requestId', requireAuth, validate(joinRequestActionSchema), reviewJoinRequest);
authRouter.get('/businesses/search', requireAuth, searchBusinesses);

export { authRouter };
