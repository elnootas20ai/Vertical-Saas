/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

function makeJwt(expSecondsFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  );
  return `${header}.${payload}.sig`;
}

describe('auth session expiry helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getAccessTokenSecondsLeft lee exp del JWT', async () => {
    const token = makeJwt(600);
    localStorage.setItem('vertial_access_token', token);
    const { getAccessTokenSecondsLeft, loadStoredTokens } = await import('../src/app/lib/authApi');
    loadStoredTokens();
    const left = getAccessTokenSecondsLeft();
    expect(left).not.toBeNull();
    expect(left!).toBeGreaterThan(590);
    expect(left!).toBeLessThanOrEqual(600);
  });

  it('ensureFreshAccessToken no refresca si quedan > 2 min', async () => {
    const token = makeJwt(600);
    localStorage.setItem('vertial_access_token', token);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { ensureFreshAccessToken, loadStoredTokens } = await import('../src/app/lib/authApi');
    loadStoredTokens();
    const outcome = await ensureFreshAccessToken(120);
    expect(outcome).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('ensureFreshAccessToken intenta refresh si quedan < 2 min', async () => {
    const token = makeJwt(30);
    localStorage.setItem('vertial_access_token', token);
    localStorage.setItem('vertial_refresh_token', 'refresh-x');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          accessToken: makeJwt(900),
          refreshToken: 'refresh-y',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { ensureFreshAccessToken, loadStoredTokens } = await import('../src/app/lib/authApi');
    loadStoredTokens();
    const outcome = await ensureFreshAccessToken(120);
    expect(outcome).toBe('refreshed');
    expect(fetchSpy).toHaveBeenCalled();
    const callUrl = String(fetchSpy.mock.calls[0]?.[0] || '');
    expect(callUrl).toContain('/api/auth/refresh');
    fetchSpy.mockRestore();
  });

  it('tryRefreshToken reintenta sin cookie si el primer refresh falla 401', async () => {
    const token = makeJwt(30);
    localStorage.setItem('vertial_access_token', token);
    localStorage.setItem('vertial_refresh_token', 'refresh-body');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const creds = (init as RequestInit | undefined)?.credentials;
      if (creds === 'include') {
        return new Response(JSON.stringify({ ok: false, error: 'Refresh token no reconocido' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          accessToken: makeJwt(900),
          refreshToken: 'refresh-new',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const { ensureFreshAccessToken, loadStoredTokens } = await import('../src/app/lib/authApi');
    loadStoredTokens();
    const outcome = await ensureFreshAccessToken(120);
    expect(outcome).toBe('refreshed');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.credentials).toBe('include');
    expect((fetchSpy.mock.calls[1]?.[1] as RequestInit)?.credentials).toBe('omit');
    fetchSpy.mockRestore();
  });

  it('tryRefreshToken trata 429 como network (no cierra sesión)', async () => {
    const token = makeJwt(30);
    localStorage.setItem('vertial_access_token', token);
    localStorage.setItem('vertial_refresh_token', 'refresh-x');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { ensureFreshAccessToken, loadStoredTokens } = await import('../src/app/lib/authApi');
    loadStoredTokens();
    const outcome = await ensureFreshAccessToken(120);
    expect(outcome).toBe('network');
    fetchSpy.mockRestore();
  });
});
