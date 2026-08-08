/** Helpers UI del QR / enlace de invitación (core RRHH). */

export {
  previewWorkerInviteLinkRequest,
  createWorkerInviteLinkRequest,
  listWorkerInviteLinksRequest,
  revokeWorkerInviteLinkRequest,
  redeemWorkerInviteLinkRequest,
  type WorkerInviteLink,
  type WorkerInviteLinkPreview,
} from './authApi';

export function buildWorkerJoinPath(token: string): string {
  return `/auth/join?token=${encodeURIComponent(token)}`;
}

export function buildWorkerJoinQrImageUrl(joinUrl: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(joinUrl)}&margin=8&color=111111&bgcolor=FFFFFF`;
}
