import { useState, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { X, Sparkles, Loader2, CheckCircle2, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiParseEntriesRequest } from '../../lib/aiParserApi';
import { useAuth } from '../../context/AuthContext';

export interface AIFieldDef {
  key: string;
  label: string;
  type?: string;
}

interface AIAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: string;
  moduleLabel: string;
  fields: AIFieldDef[];
  onEntriesParsed: (entries: Record<string, unknown>[]) => void;
  placeholder?: string;
}

export function AIAddModal({
  isOpen,
  onClose,
  module,
  moduleLabel,
  fields,
  onEntriesParsed,
  placeholder,
}: AIAddModalProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<Record<string, unknown>[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const handleParse = useCallback(async () => {
    if (!user?.id || text.trim().length < 5) {
      toast.error('Escribe al menos una descripción breve');
      return;
    }
    setLoading(true);
    setError('');
    setParsedEntries(null);
    try {
      const result = await aiParseEntriesRequest(user.id, module, text, fields);
      if (result.ok && result.entries.length > 0) {
        setParsedEntries(result.entries);
        setSummary(result.summary || '');
      } else {
        setError('No se pudieron extraer datos del texto. Intenta describir con más detalle.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar con IA');
    } finally {
      setLoading(false);
    }
  }, [user?.id, text, module, fields]);

  const handleConfirm = () => {
    if (parsedEntries && parsedEntries.length > 0) {
      onEntriesParsed(parsedEntries);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setText('');
    setParsedEntries(null);
    setSummary('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const removeEntry = (idx: number) => {
    setParsedEntries(prev => prev ? prev.filter((_, i) => i !== idx) : null);
  };

  useModalClose(isOpen, handleClose);

  if (!isOpen) return null;

  const defaultPlaceholder = `Describe los datos que quieres añadir a ${moduleLabel}. Puedes pegar texto libre, listas, datos copiados de un email, etc.\n\nEjemplo:\n"Proveedor García SL, CIF B12345678, teléfono 600123456, email garcia@email.com, dirección Calle Mayor 5 Madrid"\n\nLa IA reconocerá la información automáticamente.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Crear con IA
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {moduleLabel} — Describe los datos en texto libre
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {!parsedEntries ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Describe lo que quieres añadir
                </label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-violet-500 dark:focus:border-violet-400 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm resize-none transition-colors"
                  placeholder={placeholder || defaultPlaceholder}
                  autoFocus
                  disabled={loading}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {text.length} caracteres
                  </span>
                  {text.length > 0 && text.length < 10 && (
                    <span className="text-xs text-amber-500">Añade más detalle para mejores resultados</span>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">Error</p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <div className="p-4 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl">
                <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                  La IA analizará tu texto y extraerá los datos automáticamente para crear las entradas en <strong>{moduleLabel}</strong>.
                  Puedes pegar texto de emails, WhatsApp, documentos o escribir en formato libre.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">{summary}</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Revisa los datos y confirma para crear las entradas.
                  </p>
                </div>
              </div>

              {/* Parsed entries preview */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Entradas detectadas ({parsedEntries.length})
                </h3>
                {parsedEntries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Entrada {idx + 1}
                      </span>
                      <button
                        onClick={() => removeEntry(idx)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(entry).map(([key, val]) => {
                        if (val === null || val === undefined || val === '') return null;
                        const field = fields.find(f => f.key === key);
                        const displayLabel = field?.label || key;
                        const displayVal = Array.isArray(val)
                          ? `${val.length} elemento(s)`
                          : typeof val === 'object'
                          ? JSON.stringify(val)
                          : String(val);
                        return (
                          <div key={key} className="text-sm">
                            <span className="text-gray-500 dark:text-gray-400 text-xs">{displayLabel}:</span>{' '}
                            <span className="text-gray-900 dark:text-gray-100 font-medium">{displayVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3 flex-shrink-0 bg-gray-50 dark:bg-gray-900">
          {!parsedEntries ? (
            <>
              <button
                onClick={handleClose}
                className="px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <div className="flex-1" />
              <button
                onClick={handleParse}
                disabled={loading || text.trim().length < 5}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analizar con IA
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setParsedEntries(null); setError(''); }}
                className="px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                Volver a editar
              </button>
              <div className="flex-1" />
              <button
                onClick={handleConfirm}
                disabled={!parsedEntries || parsedEntries.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Crear {parsedEntries.length} entrada{parsedEntries.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
