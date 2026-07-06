import {
  BookOpen, CheckCircle2, Download, ExternalLink, FileText, ListChecks, Target,
} from 'lucide-react';
import {
  AFFILIATE_ACTION_PLAN,
  AFFILIATE_SALES_PITCH,
  AFFILIATE_SALES_RESOURCES,
} from '../../content/affiliate/affiliateSalesKit';

export function AffiliateResourcesSection() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Materiales comerciales</h1>
        <p className="text-sm text-slate-500 mt-1">
          Plan de acción, argumentario y documentos para vender Vertial con criterio.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {AFFILIATE_SALES_RESOURCES.map((resource) => {
          const Icon = resource.type === 'pdf' ? FileText : resource.type === 'checklist' ? ListChecks : BookOpen;
          return (
            <div key={resource.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-violet-600" />
              </div>
              <p className="font-bold text-slate-900">{resource.title}</p>
              <p className="text-sm text-slate-500 mt-2 flex-1">{resource.description}</p>
              {resource.downloadUrl ? (
                <a
                  href={resource.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
                >
                  <Download className="w-4 h-4" />
                  Descargar PDF
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              ) : (
                <span className="mt-4 text-xs font-semibold text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Incluido abajo
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-900">Plan de acción — 30 días</h2>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-4">
          {AFFILIATE_ACTION_PLAN.map((phase) => (
            <div key={phase.step} className="rounded-xl border border-slate-100 p-4 bg-slate-50/50">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Fase {phase.step}</p>
              <p className="font-semibold text-slate-900 mt-1">{phase.title}</p>
              <ul className="mt-3 space-y-2">
                {phase.tasks.map((task) => (
                  <li key={task} className="flex gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-200/70">Argumentario rápido</p>
        <h2 className="text-xl font-black mt-2">{AFFILIATE_SALES_PITCH.headline}</h2>
        <ul className="mt-4 space-y-2">
          {AFFILIATE_SALES_PITCH.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-blue-100/90">
              <span className="text-emerald-400">•</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-900 mb-4">Objeciones frecuentes</h2>
        <div className="space-y-4">
          {AFFILIATE_SALES_PITCH.objections.map(({ q, a }) => (
            <div key={q} className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-900">{q}</p>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Los PDF descargables se irán ampliando. Si necesitas material personalizado para tu vertical, escribe a{' '}
        <a href="mailto:hola@vertialapp.com" className="text-blue-600 hover:underline">hola@vertialapp.com</a>.
      </p>
    </div>
  );
}
