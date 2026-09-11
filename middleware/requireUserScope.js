import { assertUserScope } from './assertUserScope.js';

/**
 * Express middleware: atar :userId (si existe) al JWT. Fail closed.
 * Compatible con rutas `/…/:userId` y `/tables/:userId`.
 */
export async function requireUserScope(req, res, next) {
  const userId = req.params?.userId;
  if (!userId) return next();
  try {
    const ok = await assertUserScope(req, res, userId);
    if (!ok) return;
    return next();
  } catch (err) {
    return res.status(403).json({ ok: false, error: 'Acceso denegado' });
  }
}

export { assertUserScope };
