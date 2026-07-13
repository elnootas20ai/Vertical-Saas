import appleSignin from 'apple-signin-auth';

/** Bundle ID iOS nativo (audience del identityToken). */
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.vertial.app';

/**
 * Verifica el JWT de Apple (Sign in with Apple) emitido en iOS nativo.
 * @returns {{ appleId: string, email: string, emailVerified: boolean }}
 */
export async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken || typeof identityToken !== 'string') {
    throw new Error('Token de Apple obligatorio');
  }

  const payload = await appleSignin.verifyIdToken(identityToken, {
    audience: APPLE_CLIENT_ID,
  });

  if (!payload?.sub) {
    throw new Error('Token de Apple inválido: sin identificador');
  }

  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true';

  return {
    appleId: String(payload.sub),
    email: payload.email ? String(payload.email).trim().toLowerCase() : '',
    emailVerified,
  };
}
