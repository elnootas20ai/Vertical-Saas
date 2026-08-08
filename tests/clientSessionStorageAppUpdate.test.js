// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearVertialClientCaches,
  clearVertialClientCachesForAppUpdate,
} from '../src/app/lib/clientSessionStorage';

describe('clearVertialClientCaches (logout / salir TPV)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('conserva deviceId y binding tablet al cerrar sesión', () => {
    localStorage.setItem('vertial_session_user', '{"id":"x"}');
    localStorage.setItem('vertial_tpv_tablet_binding', '{"pdvId":"pdv-1"}');
    localStorage.setItem('vertial_tpv_device_id', 'device-stable-xyz');
    localStorage.setItem('vertial_businesses_cache:u1', '[]');

    clearVertialClientCaches();

    expect(localStorage.getItem('vertial_session_user')).toBeNull();
    expect(localStorage.getItem('vertial_businesses_cache:u1')).toBeNull();
    expect(localStorage.getItem('vertial_tpv_tablet_binding')).toBe('{"pdvId":"pdv-1"}');
    expect(localStorage.getItem('vertial_tpv_device_id')).toBe('device-stable-xyz');
  });
});

describe('clearVertialClientCachesForAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('conserva el vínculo tablet TPV e impresoras tras update', () => {
    localStorage.setItem('vertial_session_user', '{"id":"x"}');
    localStorage.setItem('vertial_saved_worker_login', 'worker');
    localStorage.setItem('vertial_tpv_tablet_binding', '{"pdvId":"pdv-1","dataUserId":"owner"}');
    localStorage.setItem('vertial_tpv_device_id', 'device-stable-abc');
    localStorage.setItem('vertial_printer_config_pdv_pdv-1', '{"ip":"1.2.3.4"}');
    localStorage.setItem('vertial_cookie_consent', '1');
    localStorage.setItem('vertial_force_fresh_login', '1');

    clearVertialClientCachesForAppUpdate();

    expect(localStorage.getItem('vertial_session_user')).toBeNull();
    expect(localStorage.getItem('vertial_saved_worker_login')).toBeNull();
    // Binding se limpia a propósito (hay que volver a meter el código).
    expect(localStorage.getItem('vertial_tpv_tablet_binding')).toBeNull();
    // Device id se conserva para no pedir aprobación otra vez.
    expect(localStorage.getItem('vertial_tpv_device_id')).toBe('device-stable-abc');
    expect(localStorage.getItem('vertial_printer_config_pdv_pdv-1')).toBe('{"ip":"1.2.3.4"}');
    expect(localStorage.getItem('vertial_cookie_consent')).toBe('1');
    expect(localStorage.getItem('vertial_force_fresh_login')).toBe('1');
  });
});
