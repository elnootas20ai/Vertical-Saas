// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearVertialClientCaches,
  clearVertialClientCachesForAppUpdate,
} from '../src/app/lib/clientSessionStorage';

describe('persistencia local de impresora', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('vertial_session_user', '{"user_id":"u1"}');
    localStorage.setItem('vertial_access_token', 'tok');
    localStorage.setItem('vertial_printer_config_v1', JSON.stringify({ networkHost: '192.168.1.10' }));
    localStorage.setItem('vertial_printer_config_pdv_badalona', JSON.stringify({ networkHost: '192.168.1.20' }));
    localStorage.setItem('vertial_lan_manual_confirmed_v1', '1');
    localStorage.setItem('vertial_cookie_consent', '1');
    localStorage.setItem('vertial_onboarding_completed:u1:biz1', '5');
    localStorage.setItem('vertial_onboarding_tour_ack:u1:biz1', '1');
  });

  it('logout no borra impresoras por tienda', () => {
    clearVertialClientCaches();
    expect(localStorage.getItem('vertial_session_user')).toBeNull();
    expect(localStorage.getItem('vertial_access_token')).toBeNull();
    expect(localStorage.getItem('vertial_printer_config_pdv_badalona')).toContain('192.168.1.20');
    expect(localStorage.getItem('vertial_printer_config_v1')).toContain('192.168.1.10');
    expect(localStorage.getItem('vertial_lan_manual_confirmed_v1')).toBe('1');
  });

  it('logout no borra tour/alta ya completados', () => {
    clearVertialClientCaches();
    expect(localStorage.getItem('vertial_onboarding_completed:u1:biz1')).toBe('5');
    expect(localStorage.getItem('vertial_onboarding_tour_ack:u1:biz1')).toBe('1');
  });

  it('update de app no borra impresoras por tienda', () => {
    clearVertialClientCachesForAppUpdate();
    expect(localStorage.getItem('vertial_session_user')).toBeNull();
    expect(localStorage.getItem('vertial_printer_config_pdv_badalona')).toContain('192.168.1.20');
    expect(localStorage.getItem('vertial_cookie_consent')).toBe('1');
  });
});
