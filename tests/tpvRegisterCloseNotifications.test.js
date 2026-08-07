import { describe, expect, it } from 'vitest';
import { resolveTpvCloseNotificationRecipients } from '../services/tpvRegisterCloseNotifications.js';

describe('tpvRegisterCloseNotifications recipients', () => {
  it('incluye owner y gerentes', () => {
    const ids = resolveTpvCloseNotificationRecipients(
      {
        owner_user_id: 'owner-1',
        members: [
          { user_id: 'mgr-1', role: 'gerente' },
          { user_id: 'worker-1', role: 'reparto' },
        ],
      },
      'closer-1',
    );
    expect(ids).toContain('owner-1');
    expect(ids).toContain('mgr-1');
    expect(ids).not.toContain('worker-1');
  });
});
