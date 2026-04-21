import {
  X, Clock, CheckCircle2, XCircle, Eye, AlertTriangle,
  Send, Ban, Download, FileText, PenLine, User, Mail,
  Calendar, ExternalLink,
} from 'lucide-react';
import {
  type SignatureRequestRecord,
  SIGNATURE_STATUS_CONFIG,
  SIGNER_STATUS_CONFIG,
  getSignatureProgress,
} from '../../lib/signatureApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: SignatureRequestRecord | null;
  onRemind: (req: SignatureRequestRecord) => void;
  onCancel: (req: SignatureRequestRecord) => void;
  onRefresh: () => void;
}

const SIGNER_ICON: Record<string, typeof Clock> = {
  pending: Clock, viewed: Eye, signed: CheckCircle2, rejected: XCircle, expired: AlertTriangle,
};

const EVENT_ICON: Record<string, typeof Clock> = {
  created: FileText, sent: Send, viewed: Eye, signed: CheckCircle2,
  rejected: XCircle, expired: AlertTriangle, cancelled: Ban,
  reminder_sent: Send, completed: CheckCircle2, downloaded: Download,
};

export function SignatureDetailDrawer({ open, onOpenChange, request, onRemind, onCancel }: Props) {
  if (!open || !request) return null;

  const cfg = SIGNATURE_STATUS_CONFIG[request.status] || SIGNATURE_STATUS_CONFIG.draft;
  const progress = getSignatureProgress(request.signers);
  const isActive = ['pending', 'partially_signed'].includes(request.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Detalle de firma</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Document info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                <FileText className={`w-6 h-6 ${cfg.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{request.documentName}</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1 ${cfg.bg} ${cfg.color}`}>
                  {cfg.label} ({progress.signed}/{progress.total})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-400 dark:text-gray-500">Creada</p>
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  {new Date(request.createdAt).toLocaleDateString('es-ES')}
                </p>
              </div>
              <div>
                <p className="text-gray-400 dark:text-gray-500">Caduca</p>
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  {request.expiresAt ? new Date(request.expiresAt).toLocaleDateString('es-ES') : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 dark:text-gray-500">Creada por</p>
                <p className="font-medium text-gray-700 dark:text-gray-300">{request.createdByName || '—'}</p>
              </div>
              {request.linkedEntityName && (
                <div>
                  <p className="text-gray-400 dark:text-gray-500">Vinculado a</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">{request.linkedEntityName}</p>
                </div>
              )}
            </div>
          </div>

          {/* Signers */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Firmantes
            </p>
            <div className="space-y-2">
              {request.signers.map((signer) => {
                const sCfg = SIGNER_STATUS_CONFIG[signer.status] || SIGNER_STATUS_CONFIG.pending;
                const SIcon = SIGNER_ICON[signer.status] || Clock;

                return (
                  <div key={signer.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <SIcon className={`w-5 h-5 ${sCfg.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{signer.name || signer.email}</p>
                        <span className={`text-[10px] font-medium ${sCfg.color}`}>{sCfg.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{signer.email}</p>
                      {signer.signedAt && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Firmado el {new Date(signer.signedAt).toLocaleString('es-ES')}
                        </p>
                      )}
                      {signer.rejectedAt && (
                        <p className="text-[10px] text-red-500 mt-0.5">
                          Rechazó el {new Date(signer.rejectedAt).toLocaleString('es-ES')}
                          {signer.rejectionReason && `: "${signer.rejectionReason}"`}
                        </p>
                      )}
                      {signer.viewedAt && signer.status === 'viewed' && (
                        <p className="text-[10px] text-blue-500 mt-0.5">
                          Visto el {new Date(signer.viewedAt).toLocaleString('es-ES')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          {request.events.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Historial
              </p>
              <div className="space-y-0 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-gray-200 dark:before:bg-gray-700">
                {[...request.events].reverse().map((event) => {
                  const EIcon = EVENT_ICON[event.action] || Clock;
                  return (
                    <div key={event.id} className="flex items-start gap-3 pb-3 relative">
                      <div className="w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center z-10 shrink-0">
                        <EIcon className="w-3 h-3 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0 -mt-0.5">
                        <p className="text-xs text-gray-700 dark:text-gray-300">{event.details || event.action}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(event.timestamp).toLocaleString('es-ES')}
                          {event.actorName && event.actorName !== 'Sistema' && ` — ${event.actorName}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            {isActive && (
              <button
                type="button"
                onClick={() => onRemind(request)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
                Enviar recordatorio a todos
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={() => onCancel(request)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              >
                <Ban className="w-4 h-4" />
                Cancelar solicitud
              </button>
            )}
            {request.status === 'completed' && request.signedFileUrl && (
              <a
                href={request.signedFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                Descargar documento firmado
              </a>
            )}
            {request.sourceFileUrl && (
              <a
                href={request.sourceFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver documento original
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
