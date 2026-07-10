/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  acknowledgeLocalNetworkPermission,
  dispatchLocalNetworkPermissionAttempted,
  dispatchNativeLocalNetworkPermissionPrompt,
  hasAcknowledgedLocalNetworkPermission,
  LAN_PERMISSION_ATTEMPTED_EVENT,
  LAN_PERMISSION_MODAL_EVENT,
  resetLocalNetworkPermissionAck,
} from '../src/app/lib/vertialPrint/localNetworkPermission';

describe('localNetworkPermission', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks acknowledgement in localStorage', () => {
    expect(hasAcknowledgedLocalNetworkPermission()).toBe(false);
    acknowledgeLocalNetworkPermission();
    expect(hasAcknowledgedLocalNetworkPermission()).toBe(true);
    resetLocalNetworkPermissionAck();
    expect(hasAcknowledgedLocalNetworkPermission()).toBe(false);
  });

  it('dispatchNativeLocalNetworkPermissionPrompt resets ack and emits modal event', () => {
    acknowledgeLocalNetworkPermission();
    let promptCount = 0;
    window.addEventListener(LAN_PERMISSION_MODAL_EVENT, () => {
      promptCount += 1;
    });
    dispatchNativeLocalNetworkPermissionPrompt();
    expect(hasAcknowledgedLocalNetworkPermission()).toBe(false);
    expect(promptCount).toBe(1);
  });

  it('dispatchLocalNetworkPermissionAttempted emits scan event', () => {
    let attempted = 0;
    window.addEventListener(LAN_PERMISSION_ATTEMPTED_EVENT, () => {
      attempted += 1;
    });
    dispatchLocalNetworkPermissionAttempted();
    expect(attempted).toBe(1);
  });
});
