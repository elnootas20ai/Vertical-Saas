import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, X, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import type { TeamInvitation } from '../../lib/authApi';

export function PendingInvitationsBanner() {
  const navigate = useNavigate();
  const { isAuthenticated, user, listMyInvitations, acceptInvitation, rejectInvitation } = useAuth();
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setInvitations([]);
      return;
    }
    const list = await listMyInvitations();
    setInvitations(list);
  }, [isAuthenticated, listMyInvitations]);

  useEffect(() => {
    void load();
  }, [load, user?.user_id]);

  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener('vertial:invitations:refresh', handler);
    return () => window.removeEventListener('vertial:invitations:refresh', handler);
  }, [load]);

  if (!isAuthenticated) return null;
  if (dismissed) return null;
  if (invitations.length === 0) return null;

  const handleAccept = async (inv: TeamInvitation) => {
    setBusyId(inv.invitationId);
    const result = await acceptInvitation(inv.invitationId);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error || 'No se pudo aceptar la invitación.');
      return;
    }
    toast.success(`Te uniste a ${inv.businessName}.`);
    await load();
    if (result.redirectTo) {
      navigate(result.redirectTo);
    }
  };

  const handleReject = async (inv: TeamInvitation) => {
    setBusyId(inv.invitationId);
    const result = await rejectInvitation(inv.invitationId);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error || 'No se pudo rechazar la invitación.');
      return;
    }
    toast.success('Invitación rechazada.');
    await load();
  };

  return (
    <div className="px-3 md:px-4 pt-3">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-900/30 dark:to-fuchsia-900/30 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-violet-600 dark:text-violet-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-violet-900 dark:text-violet-100">
                {invitations.length === 1
                  ? 'Tienes una invitación pendiente'
                  : `Tienes ${invitations.length} invitaciones pendientes`}
              </p>
              <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
                Acepta para unirte al equipo o recházala si no la esperabas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/saas/invitations')}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              Ver invitaciones
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              title="Ocultar"
              className="rounded-lg p-1 text-violet-700/60 hover:bg-violet-100 dark:hover:bg-violet-900/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {invitations.map((inv) => {
            const isBusy = busyId === inv.invitationId;
            return (
              <div
                key={inv.invitationId}
                className="flex flex-col gap-2 rounded-xl bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-800 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {inv.businessName || 'Equipo'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    Te invitan como <strong>{inv.role}</strong>
                    {inv.invitedByName ? ` · ${inv.invitedByName}` : ''}
                    {inv.expiresAt ? ` · caduca el ${new Date(inv.expiresAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReject(inv)}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAccept(inv)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Aceptar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
