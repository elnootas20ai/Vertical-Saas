import { Link } from 'react-router-dom';
import { FileText, Shield, Cookie, Scale } from 'lucide-react';
import { LEGAL_DOC_LIST, VERTIAL_LEGAL_ENTITY } from '../../content/legal/vertialLegal';

const DOC_ICONS = {
  'aviso-legal': Scale,
  terminos: FileText,
  privacidad: Shield,
  cookies: Cookie,
} as const;

export function LegalHubPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <Link
          to="/"
          className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Volver al inicio
        </Link>

        <header className="mt-8">
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Información legal</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Documentación contractual y de privacidad de {VERTIAL_LEGAL_ENTITY.name} para el uso de Vertial
            (plataforma SaaS).
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Titular del servicio
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <strong>Razón social:</strong> {VERTIAL_LEGAL_ENTITY.name}
            </li>
            <li>
              <strong>NIF:</strong> {VERTIAL_LEGAL_ENTITY.nif}
            </li>
            <li>
              <strong>Dirección:</strong> {VERTIAL_LEGAL_ENTITY.address}
            </li>
            <li>
              <strong>Email:</strong>{' '}
              <a href={`mailto:${VERTIAL_LEGAL_ENTITY.email}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {VERTIAL_LEGAL_ENTITY.email}
              </a>
            </li>
            <li>
              <strong>Teléfono:</strong> {VERTIAL_LEGAL_ENTITY.phone}
            </li>
          </ul>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {LEGAL_DOC_LIST.map((doc) => {
            const Icon = DOC_ICONS[doc.id];
            return (
              <Link
                key={doc.id}
                to={`/legal/${doc.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-400">
                      {doc.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{doc.subtitle}</p>
                    <span className="mt-3 inline-block text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Leer documento →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500 dark:text-slate-500">
          © {new Date().getFullYear()} {VERTIAL_LEGAL_ENTITY.name} · {VERTIAL_LEGAL_ENTITY.website}
        </p>
      </div>
    </main>
  );
}
