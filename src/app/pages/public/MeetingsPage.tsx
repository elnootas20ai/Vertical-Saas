import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CalendarDays, ExternalLink } from 'lucide-react';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function normalizeSchedulerUrl(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function MeetingsPage() {
  const navigate = useNavigate();
  const schedulerUrl = useMemo(
    () => normalizeSchedulerUrl(env.VITE_MEETING_SCHEDULER_URL || env.VITE_SCHEDULER_URL || ''),
    [],
  );

  return (
    <div className="min-h-dvh bg-[#070a0f] text-white">
      <Header landingDark />
      <main className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <CalendarDays className="w-4 h-4" />
                Agenda
              </div>
              <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">Reserva una reunión</h1>
              <p className="mt-2 text-zinc-400 max-w-2xl">
                Elige un hueco en el calendario y te llega la invitación por email automáticamente.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/#contacto')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900/70"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
              {schedulerUrl ? (
                <a
                  href={schedulerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-[#07120f] hover:bg-emerald-400"
                >
                  Abrir en nueva pestaña
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : null}
            </div>
          </div>

          {!schedulerUrl ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
              <p className="font-bold">Agenda no configurada</p>
              <p className="mt-2 text-sm text-amber-100/90">
                Falta definir <code className="font-mono">VITE_MEETING_SCHEDULER_URL</code> (por ejemplo un enlace de
                Calendly o Cal.com). Cuando esté, aquí aparecerá el calendario embebido.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/40">
              <iframe
                title="Agenda Vertial"
                src={schedulerUrl}
                className="w-full h-[75vh] min-h-[620px] bg-white"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </main>
      <Footer landingDark />
    </div>
  );
}

