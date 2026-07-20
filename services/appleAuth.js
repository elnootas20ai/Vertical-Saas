import appleSignin from 'apple-signin-auth';

/** Bundle ID iOS nativo (audience del identityToken en app). */
const APPLE_CLIENT_ID = String(process.env.APPLE_CLIENT_ID || 'com.vertial.app').trim();

/**
 * Services ID de Sign in with Apple para web (audience distinto al Bundle ID).
 * En Apple Developer → Identifiers → Services IDs.
 */
const APPLE_SERVICES_ID = String(
  process.env.APPLE_SERVICES_ID || process.env.APPLE_WEB_CLIENT_ID || 'com.vertial.app.web',
).trim();

function appleAudiences() {
  return [...new Set([APPLE_CLIENT_ID, APPLE_SERVICES_ID].filter(Boolean))];
}

/**
 * Verifica el JWT de Apple (Sign in with Apple) de iOS nativo o web.
 * @returns {{ appleId: string, email: string, emailVerified: boolean }}
 */
export async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken || typeof identityToken !== 'string') {
    throw new Error('Token de Apple obligatorio');
  }

  const audiences = appleAudiences();
  let payload = null;
  let lastError = null;

  for (const audience of audiences) {
    try {
      payload = await appleSignin.verifyIdToken(identityToken, { audience });
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!payload?.sub) {
    const detail = lastError instanceof Error ? lastError.message : 'audiencia no válida';
    throw new Error(`Token de Apple inválido: ${detail}`);
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
