import { useState } from 'react';
import {
  Building2,
  CheckCircle,
  Download,
  Eye,
  FileText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { AuthUser } from '../../../lib/authApi';
import {
  formatVerificationFileSize,
  getCompanyVerificationSnapshot,
  labelForVerificationKind,
  patchCompanyVerificationReview,
  type CompanyVerificationReviewStatus,
  type OnboardingVerificationDocument,
} from '../../../lib/onboardingCompanyVerification';

type Props = {
  account: AuthUser;
  adminLabel: string;
  onSaved: (updated: AuthUser) => void;
  onSave: (
    userId: string,
    data: Partial<AuthUser>,
  ) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
};

function openDocument(doc: OnboardingVerificationDocument) {
  if (!doc.dataUrl) return;
  const w = window.open(doc.dataUrl, '_blank', 'noopener,noreferrer');
  if (!w) {
    const a = document.createElement('a');
    a.href = doc.dataUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }
}

function downloadDocument(doc: OnboardingVerificationDocument) {
  if (!doc.dataUrl) return;
  const a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.fileName || 'documento';
  a.click();
}

export function AdminCompanyVerificationPanel({
  account,
  adminLabel,
  onSaved,
  onSave,
}: Props) {
  const snapshot = getCompanyVerificationSnapshot(account.onboardingData);
  const [adminNote, setAdminNote] = useState(snapshot.review?.adminNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!snapshot.hasDocuments && !snapshot.note && !snapshot.taxId) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <p className="text-sm">Este cliente no ha subido documentos de verificación en el onboarding.</p>
        </div>
      </div>
    );
  }

  const applyReview = async (status: CompanyVerificationReviewStatus) => {
    setSaving(true);
    setError('');
    const nextOnboarding = patchCompanyVerificationReview(account.onboardingData, {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminLabel,
      adminNote: adminNote.trim() || undefined,
    });
    const result = await onSave(account.user_id, { onboardingData: nextOnboarding });
    setSaving(false);
    if (!result.success) {
      setError(result.error || 'No se pudo guardar la revisión');
      return;
    }
    if (result.user) onSaved(result.user);
  };

  const statusTone =
    snapshot.review?.status === 'approved'
      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
      : snapshot.review?.status === 'rejected'
        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
        : snapshot.needsReview
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40';

  return (
    <div className={`rounded-2xl border p-4 space-y-4 ${statusTone}`}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Verificación de empresa
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Documentos enviados en el alta (onboarding). Misma información que ve el cliente al registrarse.
          </p>
        </div>
        {snapshot.needsReview ? (
          <span className="shrink-0 inline-flex items-center rounded-full bg-amber-200 dark:bg-amber-800 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-100">
            Pendiente de revisión
          </span>
        ) : snapshot.review?.status === 'approved' ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-200 dark:bg-emerald-800 px-2.5 py-1 text-[11px] font-bold text-emerald-900 dark:text-emerald-100">
            <CheckCircle className="w-3.5 h-3.5" /> Aprobada
          </span>
        ) : snapshot.review?.status === 'rejected' ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-200 dark:bg-red-800 px-2.5 py-1 text-[11px] font-bold text-red-900 dark:text-red-100">
            <XCircle className="w-3.5 h-3.5" /> Rechazada
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {(snapshot.tradeName || account.companyName) && (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <span>
              <span className="text-gray-500">Comercial:</span>{' '}
              {snapshot.tradeName || account.companyName}
            </span>
          </div>
        )}
        {snapshot.taxId && (
          <div className="text-gray-700 dark:text-gray-300">
            <span className="text-gray-500">CIF/NIF:</span>{' '}
            <span className="font-mono font-semibold">{snapshot.taxId}</span>
          </div>
        )}
        {snapshot.legalName && (
          <div className="text-gray-700 dark:text-gray-300 sm:col-span-2">
            <span className="text-gray-500">Razón social:</span> {snapshot.legalName}
          </div>
        )}
        {snapshot.businessType && (
          <div className="text-gray-700 dark:text-gray-300">
            <span className="text-gray-500">Tipo negocio:</span> {snapshot.businessType}
          </div>
        )}
      </div>

      {snapshot.note ? (
        <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Nota del cliente
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200">{snapshot.note}</p>
        </div>
      ) : null}

      {snapshot.documents.length > 0 ? (
        <ul className="space-y-2">
          {snapshot.documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5"
            >
              <FileText className="w-4 h-4 text-gray-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={doc.fileName}>
                  {doc.fileName}
                </p>
                <p className="text-[11px] text-gray-500">
                  {labelForVerificationKind(doc.kind)} · {formatVerificationFileSize(doc.size)}
                  {doc.uploadedAt
                    ? ` · ${new Date(doc.uploadedAt).toLocaleDateString('es-ES')}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openDocument(doc)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Ver documento"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => downloadDocument(doc)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Descargar"
              >
                <Download className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 italic">Solo nota o CIF, sin archivos adjuntos.</p>
      )}

      {snapshot.review?.reviewedAt && (
        <p className="text-[11px] text-gray-500">
          Última revisión:{' '}
          {new Date(snapshot.review.reviewedAt).toLocaleString('es-ES')}
          {snapshot.review.reviewedBy ? ` · ${snapshot.review.reviewedBy}` : ''}
        </p>
      )}

      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
          Nota interna (solo admin)
        </label>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ej. CIF validado en AEAT, falta licencia de apertura…"
          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !snapshot.hasDocuments}
          onClick={() => void applyReview('approved')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          Aprobar
        </button>
        <button
          type="button"
          disabled={saving || !snapshot.hasDocuments}
          onClick={() => void applyReview('rejected')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          Rechazar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void applyReview('pending')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50"
        >
          Marcar pendiente
        </button>
      </div>
    </div>
  );
}
