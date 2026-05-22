import { Link, useParams } from 'react-router-dom';
import { LegalDocumentBody } from '../../components/legal/LegalDocumentBody';
import { getLegalDoc, LEGAL_DOC_LIST } from '../../content/legal/vertialLegal';

export function LegalDocumentPage() {
  const { docSlug } = useParams<{ docSlug: string }>();
  const doc = getLegalDoc(docSlug);

  if (!doc) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16 dark:bg-gray-950">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Documento no encontrado</h1>
          <Link to="/legal" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Volver a información legal
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400">
            Inicio
          </Link>
          <span>/</span>
          <Link to="/legal" className="hover:text-blue-600 dark:hover:text-blue-400">
            Legal
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{doc.title}</span>
        </nav>

        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">{doc.title}</h1>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 md:p-8 dark:border-slate-800 dark:bg-slate-900">
          <LegalDocumentBody doc={doc} />
        </div>

        <aside className="mt-8 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Otros documentos</p>
          <ul className="mt-2 space-y-1">
            {LEGAL_DOC_LIST.filter((d) => d.id !== doc.id).map((d) => (
              <li key={d.id}>
                <Link to={`/legal/${d.id}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
