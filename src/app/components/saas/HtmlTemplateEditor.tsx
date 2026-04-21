import { useMemo, useRef, useState } from 'react';
import { Eye, FileCode2 } from 'lucide-react';
import { buildTemplatePreview, type DocumentTemplateVariable } from '../../lib/documentTemplates';

interface HtmlTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: DocumentTemplateVariable[];
}

export function HtmlTemplateEditor({ value, onChange, variables }: HtmlTemplateEditorProps) {
  const [activeView, setActiveView] = useState<'code' | 'preview'>('code');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const groupedVariables = useMemo(() => {
    return variables.reduce<Record<string, DocumentTemplateVariable[]>>((accumulator, variable) => {
      if (!accumulator[variable.category]) {
        accumulator[variable.category] = [];
      }

      accumulator[variable.category].push(variable);
      return accumulator;
    }, {});
  }, [variables]);

  const previewHtml = useMemo(() => buildTemplatePreview(value), [value]);

  const insertVariable = (variableKey: string) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(`${value}${value ? '\n' : ''}${variableKey}`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${variableKey}${value.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursorPosition = start + variableKey.length;
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Editor HTML</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Edita el HTML base e inserta variables reutilizables con <code>{'{{...}}'}</code>.</p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1">
          <button
            type="button"
            onClick={() => setActiveView('code')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'code' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-900/30' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            HTML
          </button>
          <button
            type="button"
            onClick={() => setActiveView('preview')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'preview' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-900/30' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Eye className="w-4 h-4" />
            Vista previa
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Variables disponibles</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
            <div key={category} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{category}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {categoryVariables.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    className="rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    title={variable.description}
                  >
                    {variable.key}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeView === 'code' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[320px] w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 font-mono text-sm leading-6 text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500"
          placeholder="<section>...</section>"
        />
      ) : (
        <div className="min-h-[320px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
    </div>
  );
}
