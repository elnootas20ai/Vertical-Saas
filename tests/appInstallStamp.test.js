// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shouldWipeSessionOnStampChange } from '../src/app/lib/appInstallStamp';

describe('shouldWipeSessionOnStampChange', () => {
  it('nunca borra sesión (política tipo Instagram)', () => {
    expect(shouldWipeSessionOnStampChange(null, 'native:1.0:34')).toBe(false);
    expect(shouldWipeSessionOnStampChange(null, 'native:1.0:34', { hasPersistedSession: true })).toBe(false);
    expect(shouldWipeSessionOnStampChange('native:1.0:33', 'native:1.0:34')).toBe(false);
    expect(
      shouldWipeSessionOnStampChange('native:1.8:50:old-bundle', 'native:1.8:50:new-bundle'),
    ).toBe(false);
    expect(shouldWipeSessionOnStampChange('native:1.0:40:a', 'native:1.1:1:a')).toBe(false);
  });
});
