/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  readPushConsent,
  shouldShowPushSoftPrompt,
  writePushConsent,
} from '../src/app/lib/pushPermissionConsent.ts';

describe('pushPermissionConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('unset por defecto → hay que pedir permiso del sistema', () => {
    expect(readPushConsent('u1').decision).toBe('unset');
    expect(shouldShowPushSoftPrompt('u1')).toBe(true);
  });

  it('accepted → no preguntar más', () => {
    writePushConsent('u1', 'accepted');
    expect(readPushConsent('u1').decision).toBe('accepted');
    expect(shouldShowPushSoftPrompt('u1')).toBe(false);
  });

  it('declined → no preguntar más', () => {
    writePushConsent('u1', 'declined');
    expect(readPushConsent('u1').decision).toBe('declined');
    expect(shouldShowPushSoftPrompt('u1')).toBe(false);
  });

  it('aislado por usuario', () => {
    writePushConsent('ceo', 'accepted');
    expect(shouldShowPushSoftPrompt('worker')).toBe(true);
  });
});
