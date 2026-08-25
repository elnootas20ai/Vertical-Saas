/** Gate de mocks dashboard — SOLO uriel@admin.com. Sin deps pesadas (seguro en AuthContext). */
import { isVertialSuperAdminEmail } from './superAdmin';

export { isVertialSuperAdminEmail };

let _sessionEmail: string | null = null;

export function setAdminDemoSessionEmail(email: string | null | undefined) {
  _sessionEmail = email ? String(email).trim().toLowerCase() : null;
}

export function getAdminDemoSessionEmail(): string | null {
  return _sessionEmail;
}

export function shouldUseAdminDashboardDemo(email?: string | null | undefined): boolean {
  return isVertialSuperAdminEmail(email ?? _sessionEmail);
}

export const ADMIN_DEMO_BADGE_LABEL = 'Datos de ejemplo · solo admin';
