import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink, FileText, Shield, Scale, Cookie } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { LegalDocumentBody } from './LegalDocumentBody';
import {
  getLegalDoc,
  REGISTER_LEGAL_SUMMARY,
  type LegalDocId,
} from '../../content/legal/vertialLegal';

type TabId = 'resumen' | LegalDocId;

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'resumen', label: 'Resumen', icon: FileText },
  { id: 'terminos', label: 'Términos', icon: FileText },
  { id: 'privacidad', label: 'Privacidad', icon: Shield },
  { id: 'aviso-legal', label: 'Aviso legal', icon: Scale },
  { id: 'cookies', label: 'Cookies', icon: Cookie },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function LegalAgreementsModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('resumen');
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const doc = tab !== 'resumen' ? getLegalDoc(tab) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-agreements-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="legal-agreements-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Acuerdos legales
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Lee el detalle antes de crear tu cuenta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'resumen' ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Al marcar «He leído y acepto los acuerdos legales» confirmas que conoces y aceptas:
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
                {REGISTER_LEGAL_SUMMARY.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Puedes consultar el texto íntegro en cada pestaña o abrir los documentos en una nueva ventana.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {(['terminos', 'privacidad', 'aviso-legal', 'cookies'] as LegalDocId[]).map((id) => (
                  <Link
                    key={id}
                    to={`/legal/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-800"
                  >
                    {getLegalDoc(id)?.title}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          ) : doc ? (
            <div className="text-sm">
              <LegalDocumentBody doc={doc} />
            </div>
          ) : null}
        </div>

        <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
