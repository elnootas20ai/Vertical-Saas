// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { clearVertialClientCachesForAppUpdate } from '../src/app/lib/clientSessionStorage';

describe('clearVertialClientCachesForAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('conserva el vínculo tablet TPV e impresoras tras update', () => {
    localStorage.setItem('vertial_session_user', '{"id":"x"}');
    localStorage.setItem('vertial_saved_worker_login', 'worker');
    localStorage.setItem('vertial_tpv_tablet_binding', '{"pdvId":"pdv-1","dataUserId":"owner"}');
    localStorage.setItem('vertial_printer_config_pdv_pdv-1', '{"ip":"1.2.3.4"}');
    localStorage.setItem('vertial_cookie_consent', '1');
    localStorage.setItem('vertial_force_fresh_login', '1');

    clearVertialClientCachesForAppUpdate();

    expect(localStorage.getItem('vertial_session_user')).toBeNull();
    expect(localStorage.getItem('vertial_saved_worker_login')).toBeNull();
    expect(localStorage.getItem('vertial_tpv_tablet_binding')).toBe(
      '{"pdvId":"pdv-1","dataUserId":"owner"}',
    );
    expect(localStorage.getItem('vertial_printer_config_pdv_pdv-1')).toBe('{"ip":"1.2.3.4"}');
    expect(localStorage.getItem('vertial_cookie_consent')).toBe('1');
    expect(localStorage.getItem('vertial_force_fresh_login')).toBe('1');
  });
});
