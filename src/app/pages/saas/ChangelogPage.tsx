import { useMemo } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Layers,
  Rocket,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import type { ChangelogEntry } from '../../lib/settingsApi';
import { PLATFORM_CHANGELOG } from '../../../../shared/platformChangelog.js';

function tagConfig(tag: ChangelogEntry['tag']) {
  switch (tag) {
    case 'nuevo':
      return { label: 'Nuevo', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', icon: <Rocket className="w-3 h-3" /> };
    case 'mejora':
      return { label: 'Mejora', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: <Zap className="w-3 h-3" /> };
    case 'fix':
      return { label: 'Corrección', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: <Wrench className="w-3 h-3" /> };
    case 'deprecado':
      return { label: 'Aviso', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: <AlertTriangle className="w-3 h-3" /> };
    default:
      return { label: tag, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: <Layers className="w-3 h-3" /> };
  }
}

function statusConfig(status: ChangelogEntry['status']) {
  switch (status) {
    case 'avance':
      return { label: 'En avance', bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', icon: <TrendingUp className="w-3 h-3" /> };
    case 'proximamente':
      return { label: 'Próximamente', bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', icon: <Clock className="w-3 h-3" /> };
    case 'disponible':
    default:
      return { label: 'Ya disponible', bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800', icon: <CheckCircle className="w-3 h-3" /> };
  }
}

function EntryList({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  tone: 'emerald' | 'violet';
}) {
  if (items.length === 0) return null;
  const titleClass = tone === 'violet'
    ? 'text-violet-800 dark:text-violet-200'
    : 'text-emerald-800 dark:text-emerald-200';
  const iconClass = tone === 'violet' ? 'text-violet-500' : 'text-emerald-500';

  return (
    <div className="mt-4">
      <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${titleClass}`}>{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className={`mt-0.5 shrink-0 ${iconClass}`}>{icon}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangelogCard({ entry, isLatest }: { entry: ChangelogEntry; isLatest: boolean }) {
  const tag = tagConfig(entry.tag);
  const status = statusConfig(entry.status);
  const premiereDate = new Date(entry.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const improvements = entry.improvements?.length ? entry.improvements : (entry.items ?? []);
  const advances = entry.advances ?? [];
  const isInProgress = entry.status === 'avance' || entry.status === 'proximamente';

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-2xl border ${isLatest ? 'border-blue-200 shadow-lg shadow-blue-50 dark:border-blue-800 dark:shadow-none' : 'border-gray-200 dark:border-gray-700'} p-6 transition-all hover:border-gray-300 dark:hover:border-gray-600`}>
      {isLatest && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-sm">
            <Sparkles className="w-3 h-3" />
            {isInProgress ? 'Lo último en camino' : 'Lo último publicado'}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl ${tag.bg} border ${tag.border} flex items-center justify-center shrink-0`}>
          <span className={tag.text}>{tag.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">{entry.title}</h3>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tag.bg} ${tag.text} ${tag.border}`}>
              {tag.icon}
              {tag.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${status.bg} ${status.text} ${status.border}`}>
              {status.icon}
              {status.label}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isInProgress ? 'Estreno previsto: ' : 'Estreno: '}
              <span className="font-semibold text-gray-700 dark:text-gray-300">{premiereDate}</span>
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{entry.description}</p>

      <EntryList
        title="Qué mejora"
        items={improvements}
        icon={<CheckCircle className="w-4 h-4" />}
        tone="emerald"
      />

      <EntryList
        title="Avances"
        items={advances}
        icon={<TrendingUp className="w-4 h-4" />}
        tone="violet"
      />
    </div>
  );
}

export function ChangelogPage() {
  const entries = useMemo(
    () => PLATFORM_CHANGELOG.slice(0, 30) as ChangelogEntry[],
    [],
  );

  const stats = useMemo(() => {
    const disponibles = entries.filter((e) => e.status === 'disponible' || !e.status).length;
    const enAvance = entries.filter((e) => e.status === 'avance' || e.status === 'proximamente').length;
    return { disponibles, enAvance };
  }, [entries]);

  return (
    <Layout title="Novedades" subtitle="Estrenos, avances y mejoras para tu negocio">
      <div className="max-w-3xl space-y-6">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black">Qué hay de nuevo</h2>
              <p className="text-sm text-blue-200">Estrenos, avances y mejoras</p>
            </div>
          </div>
          <p className="text-blue-100 text-sm leading-relaxed mb-4">
            Fecha de estreno, qué mejora en tu día a día y en qué estamos avanzando. Todo explicado para ti y tu equipo, sin tecnicismos.
          </p>
          {entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                {stats.disponibles} ya disponibles
              </span>
              {stats.enAvance > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {stats.enAvance} en avance
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {entries.map((entry, i) => (
            <ChangelogCard key={`${entry.date}-${entry.title}`} entry={entry} isLatest={i === 0} />
          ))}
          {entries.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Layers className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
              <p className="text-sm">Todavía no hay novedades publicadas</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
