import type { LegalDocument } from '../../content/legal/vertialLegal';

export function LegalDocumentBody({ doc }: { doc: LegalDocument }) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-slate-500 dark:text-slate-400">Última actualización: {doc.lastUpdated}</p>
        <p className="mt-3 text-base leading-relaxed text-slate-700 dark:text-slate-300">{doc.subtitle}</p>
      </header>

      {doc.sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{section.title}</h2>
          {section.paragraphs?.map((p, i) => (
            <p key={i} className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {p}
            </p>
          ))}
          {section.bullets && section.bullets.length > 0 ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {section.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
