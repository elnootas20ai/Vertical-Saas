import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Loader2, Mail, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import type { TeamInvitation } from '../../lib/authApi';

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

export function Invitations() {
  const navigate = useNavigate();
  const { listMyInvitations, acceptInvitation, rejectInvitation } = useAuth();
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listMyInvitations();
      setInvitations(list);
    } finally {
      setIsLoading(false);
    }
  }, [listMyInvitations]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const handleAccept = async (invitation: TeamInvitation) => {
    setBusyId(invitation.invitationId);
    const result = await acceptInvitation(invitation.invitationId);
    setBusyId(null);

    if (!result.success) {
      toast.error(result.error || 'No se pudo aceptar la invitación.');
      return;
    }

    toast.success(`Te uniste a ${invitation.businessName || 'este equipo'}.`);
    window.dispatchEvent(new CustomEvent('vertial:invitations:refresh'));
    await loadInvitations();

    if (result.redirectTo) {
      navigate(result.redirectTo);
    }
  };

  const handleReject = async (invitation: TeamInvitation) => {
    setBusyId(invitation.invitationId);
    const result = await rejectInvitation(invitation.invitationId);
    setBusyId(null);

    if (!result.success) {
      toast.error(result.error || 'No se pudo rechazar la invitación.');
      return;
    }

    toast.success('Invitación rechazada.');
    window.dispatchEvent(new CustomEvent('vertial:invitations:refresh'));
    await loadInvitations();
  };

  return (
    <Layout
      title="Invitaciones"
      subtitle="Acepta o rechaza las invitaciones para unirte a equipos dentro de Vertial."
    >
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-3xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 dark:from-violet-950/40 dark:via-gray-900 dark:to-fuchsia-950/30 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  Para trabajadores e invitados
                </p>
                <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Tus invitaciones pendientes
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  Cuando una empresa te invita con tu email, aparece aquí. Al aceptar, Vertial te conecta con ese equipo y te lleva a tu zona de trabajo.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white/80 dark:bg-gray-800/70 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{invitations.length}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">pendientes</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando invitaciones...
            </div>
          </div>
        ) : invitations.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-gray-100">
              No tienes invitaciones pendientes
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
              Si una empresa te invita, aparecerá aquí automáticamente cuando entres con el mismo email.
            </p>
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="mt-5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              Ir a mi zona
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {invitations.map((invitation) => {
              const isBusy = busyId === invitation.invitationId;
              return (
                <article
                  key={invitation.invitationId}
                  className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40">
                        <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {invitation.businessName || 'Equipo de Vertial'}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Te han invitado a unirte como <strong>{invitation.role || 'Usuario'}</strong>.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 font-medium text-gray-600 dark:text-gray-300">
                            <UserRound className="h-3.5 w-3.5" />
                            {invitation.invitedByName || 'Invitación interna'}
                          </span>
                          {invitation.expiresAt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300">
                              <Clock3 className="h-3.5 w-3.5" />
                              Caduca el {formatDate(invitation.expiresAt)}
                            </span>
                          )}
                        </div>
                        {invitation.message && (
                          <p className="mt-3 rounded-2xl bg-gray-50 dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                            {invitation.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReject(invitation)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAccept(invitation)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Aceptar invitación
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
