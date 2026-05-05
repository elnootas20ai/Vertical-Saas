import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Layers,
  RefreshCw,
  Rocket,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import type { ChangelogEntry } from '../../lib/settingsApi';
import { getPlatformChangelog } from '../../lib/settingsApi';

function tagConfig(tag: ChangelogEntry['tag']) {
  switch (tag) {
    case 'nuevo':
      return { label: 'Nuevo', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <Rocket className="w-3 h-3" /> };
    case 'mejora':
      return { label: 'Mejora', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <Zap className="w-3 h-3" /> };
    case 'fix':
      return { label: 'Fix', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Wrench className="w-3 h-3" /> };
    case 'deprecado':
      return { label: 'Deprecado', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: <AlertTriangle className="w-3 h-3" /> };
    default:
      return { label: tag, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: <Layers className="w-3 h-3" /> };
  }
}

function ChangelogCard({ entry, isLatest }: { entry: ChangelogEntry; isLatest: boolean }) {
  const tag = tagConfig(entry.tag);
  const date = new Date(entry.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-2xl border ${isLatest ? 'border-blue-200 shadow-lg shadow-blue-50' : 'border-gray-200 dark:border-gray-700'} p-6 transition-all hover:border-gray-300 dark:hover:border-gray-600`}>
      {isLatest && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-sm">
            <Sparkles className="w-3 h-3" />
            Última versión
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${tag.bg} border ${tag.border} flex items-center justify-center`}>
            <span className={tag.text}>{tag.icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">{entry.title}</h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tag.bg} ${tag.text} ${tag.border}`}>
                {tag.icon}
                {tag.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{date}</p>
          </div>
        </div>
        <div className="shrink-0">
          <code className="text-sm font-mono font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-lg">v{entry.version}</code>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{entry.description}</p>

      <ul className="space-y-2">
        {entry.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getPlatformChangelog(30)
      .then((data) => setEntries(data.changelog))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Novedades" subtitle="Historial de actualizaciones de la plataforma">
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black">Novedades de Vertial</h2>
              <p className="text-sm text-blue-200">Changelog de la plataforma</p>
            </div>
          </div>
          <p className="text-blue-100 text-sm leading-relaxed">
            Aquí encontrarás todas las nuevas funcionalidades, mejoras y correcciones que publicamos en cada versión de la plataforma. Actualizado con cada despliegue.
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {entries.map((entry, i) => (
              <ChangelogCard key={entry.version} entry={entry} isLatest={i === 0} />
            ))}
            {entries.length === 0 && (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Layers className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No hay entradas en el changelog</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
