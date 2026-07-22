import { z } from 'zod';

/** Zod v4 expone `issues`; APIs antiguas usaban `errors`. */
function zodIssues(zodError) {
  const raw = zodError?.issues ?? zodError?.errors;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Middleware genérico de validación con Zod.
 * Valida req.body contra el schema proporcionado.
 * En caso de error devuelve 400 con los mensajes de validación.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = zodIssues(result.error).map((e) => ({
        field: Array.isArray(e.path) ? e.path.join('.') : '',
        message: e.message,
      }));
      return res.status(400).json({ ok: false, error: 'Datos de entrada inválidos', errors });
    }
    req.body = result.data;
    return next();
  };
}

/**
 * Middleware genérico para validar parámetros de ruta (req.params).
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = zodIssues(result.error).map((e) => ({
        field: Array.isArray(e.path) ? e.path.join('.') : '',
        message: e.message,
      }));
      return res.status(400).json({ ok: false, error: 'Parámetros de ruta inválidos', errors });
    }
    req.params = result.data;
    return next();
  };
}

// ─── Esquemas de autenticación ────────────────────────────────────────────────

export const registerSchema = z.object({
  firstName: z.string().min(1, 'El nombre es obligatorio').max(100).trim(),
  lastName: z.string().min(1, 'El apellido es obligatorio').max(100).trim(),
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  phone: z.string().max(30).trim().optional().default(''),
  password: z.string().max(128).optional().default(''),
  googleCredential: z.string().max(4096).optional(),
  appleCredential: z.string().max(8192).optional(),
  accountType: z.enum(['user', 'company']).optional().default('company'),
  referralCode: z.string().max(20).trim().optional(),
}).superRefine((data, ctx) => {
  const social = Boolean(data.googleCredential || data.appleCredential);
  if (!social && (!data.password || data.password.length < 8)) {
    ctx.addIssue({
      code: 'custom',
      message: 'La contraseña debe tener al menos 8 caracteres',
      path: ['password'],
    });
  }
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});

export const recoverSchema = z.object({
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
});

export const loginCodeVerifySchema = z.object({
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token obligatorio').max(128),
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});

// S-01: refreshToken es opcional en body porque viene en httpOnly cookie
export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es obligatoria').max(128),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(128),
});

export const inviteUserSchema = z.object({
  name: z.string().max(200).trim().optional().default(''),
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  role: z.string().min(1).max(100).trim().optional().default('Usuario'),
  phone: z.string().max(30).trim().optional().default(''),
  invitedBy: z.string().max(100).optional().default(''),
  companyName: z.string().max(200).trim().optional().default(''),
  businessId: z.string().max(100).trim().optional().default(''),
  // Matriz anidada { módulo: { view, edit } }; z.record(z.unknown()) puede fallar según versión de Zod.
  permissions: z.any().optional(),
  landingPage: z.string().max(200).trim().optional().default('/saas/worker/tasks'),
  position: z.string().max(200).trim().optional().default(''),
  contractType: z.string().max(100).trim().optional().default(''),
  grossMonthlySalary: z.string().max(50).trim().optional().default(''),
  payPeriodsPerYear: z.coerce.number().int().min(12).max(16).optional(),
  workCenterId: z.string().max(100).trim().optional().default(''),
  scheduleTemplateId: z.string().max(200).trim().optional().default(''),
  message: z.string().max(500).trim().optional().default(''),
  posPin: z.string().regex(/^\d{4,6}$/, 'El PIN de TPV debe tener entre 4 y 6 dígitos').optional(),
});

export const saveBillingCardSchema = z.object({
  cardNumber: z.string().min(12, 'Número de tarjeta inválido').max(19).trim(),
  cardHolderName: z.string().min(1, 'El nombre del titular es obligatorio').max(200).trim(),
  expiryDate: z
    .string()
    .regex(/^\d{2}\/\d{2}$/, 'Formato de fecha inválido (MM/AA)')
    .trim(),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido').trim(),
  billingMode: z.enum(['monthly', 'annual']).optional().default('monthly'),
  selectedPlanId: z.string().max(100).optional().default(''),
});

export const activateOnboardingTrialSchema = z.object({
  billingMode: z.enum(['monthly', 'annual']).optional().default('monthly'),
  selectedPlanId: z.string().max(100).optional().default('basic'),
});

export const googleLoginSchema = z.object({
  credential: z.string().min(1, 'Token de Google obligatorio').max(4096),
});

export const appleLoginSchema = z.object({
  identityToken: z.string().min(1, 'Token de Apple obligatorio').max(8192),
  givenName: z.string().max(100).trim().optional(),
  familyName: z.string().max(100).trim().optional(),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'userId obligatorio').max(100),
});

export const invitationIdParamSchema = z.object({
  invitationId: z.string().min(1, 'invitationId obligatorio').max(100),
});

export const businessIdParamSchema = z.object({
  businessId: z.string().min(1, 'businessId obligatorio').max(100),
});

// A-04: Aceptar invitación de miembro
// newPassword es opcional: si la cuenta ya existe (invitación a usuario registrado), no hace falta.
export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Token obligatorio').max(128),
  email: z.string().email('Email inválido').max(254).trim().toLowerCase(),
  newPassword: z
    .string()
    .max(128)
    .optional()
    .refine((v) => v === undefined || v === '' || v.length >= 8, {
      message: 'La contraseña debe tener al menos 8 caracteres',
    }),
});

export const joinRequestSchema = z.object({
  businessId: z.string().min(1, 'businessId obligatorio').max(100).trim(),
  message: z.string().max(500).trim().optional().default(''),
});

export const joinRequestActionSchema = z.object({
  action: z.enum(['accepted', 'rejected']),
});

export const teamLoginSchema = z.object({
  companyCode: z.string().min(1, 'El código de empresa es obligatorio').max(20).trim(),
  username: z.string().min(1, 'El usuario es obligatorio').max(100).trim(),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});

export const posSwitchUserSchema = z.object({
  username: z.string().min(1, 'El usuario es obligatorio').max(100).trim(),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});

export const tpvTabletLoginSchema = z.object({
  terminalCode: z.string().min(4, 'El código de tienda es obligatorio').max(12).trim(),
});

export const setPosPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos'),
});
