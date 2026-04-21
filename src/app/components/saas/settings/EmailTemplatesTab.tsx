import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { EmailTemplate } from '../../../lib/settingsApi';
import { getEmailTemplates, saveEmailTemplates } from '../../../lib/settingsApi';

interface Props {
  userId: string;
}

interface TemplateEditorProps {
  template: EmailTemplate;
  onSave: (t: EmailTemplate) => void;
  onCancel: () => void;
}

function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  useModalClose(true, onCancel);
  const [t, setT] = useState<EmailTemplate>({ ...template });
  const [activeTab, setActiveTab] = useState<'subject' | 'body' | 'vars'>('subject');

  const detectedVars = (() => {
    const matches = (t.subject + t.body).match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <input
                type="text"
                value={t.name}
                onChange={(e) => setT((prev) => ({ ...prev, name: e.target.value }))}
                className="font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 outline-none text-base"
                placeholder="Nombre de la plantilla"
              />
              {t.isSystem && <span className="text-[10px] text-amber-600 font-semibold">SISTEMA</span>}
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {(['subject', 'body', 'vars'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === tab ? 'bg-gray-900 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {tab === 'subject' ? 'Asunto' : tab === 'body' ? 'Cuerpo HTML' : 'Variables'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'subject' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Asunto del email. Puedes usar variables como <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{firstName}}'}</code>.</p>
              <input
                type="text"
                value={t.subject}
                onChange={(e) => setT((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder="Asunto del email..."
              />
            </div>
          )}
          {activeTab === 'body' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Cuerpo HTML del email. Usa etiquetas HTML estándar y variables <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{variable}}'}</code>.</p>
              <textarea
                value={t.body}
                onChange={(e) => setT((prev) => ({ ...prev, body: e.target.value }))}
                rows={16}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-mono resize-none"
                placeholder="<h1>Hola {{firstName}},</h1>..."
              />
            </div>
          )}
          {activeTab === 'vars' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Variables detectadas automáticamente en el asunto y cuerpo de la plantilla.</p>
              {detectedVars.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detectedVars.map((v) => (
                    <div key={v} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200">
                      <Tag className="w-3 h-3 text-blue-600" />
                      <code className="text-xs font-mono text-blue-800">{'{{' + v + '}}'}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No se detectaron variables. Usa la sintaxis <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{variable}}'}</code> en el asunto o cuerpo.</p>
              )}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Variables de sistema disponibles:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['firstName', 'lastName', 'clientName', 'businessName', 'senderName', 'date', 'total', 'vehicleName', 'inviteUrl'].map((v) => (
                    <code key={v} className="text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-lg text-gray-600 dark:text-gray-400">{'{{' + v + '}}'}</code>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ ...t, variables: detectedVars })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors"
          >
            <Save className="w-4 h-4" />
            Aplicar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmailTemplatesTab({ userId }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getEmailTemplates(userId)
      .then(setTemplates)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSaveTemplate = (updated: EmailTemplate) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditing(null);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddTemplate = () => {
    const newTemplate: EmailTemplate = {
      id: uuidv4(),
      name: 'Nueva plantilla',
      subject: '',
      body: '<h1>Hola {{firstName}},</h1>\n<p></p>\n<p>Saludos,<br>{{businessName}}</p>',
      variables: [],
      isSystem: false,
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setEditing(newTemplate);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const saved = await saveEmailTemplates(userId, templates);
      setTemplates(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Plantillas de email</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{templates.length} plantilla{templates.length !== 1 ? 's' : ''} configurada{templates.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={handleAddTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-sm font-semibold text-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva plantilla
          </button>
        </div>

        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{t.subject || '— sin asunto —'}</p>
                </div>
                {t.isSystem && (
                  <span className="shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">SISTEMA</span>
                )}
                {t.variables.length > 0 && (
                  <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">{t.variables.length} var{t.variables.length !== 1 ? 's' : ''}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                    className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors text-gray-400 dark:text-gray-500 hover:text-blue-600"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!t.isSystem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 dark:text-gray-500 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {expanded === t.id ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
              </div>
              {expanded === t.id && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-3 mb-1.5">Vista previa del asunto</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">{t.subject || <span className="text-gray-400 dark:text-gray-500 italic">Sin asunto</span>}</p>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-3 mb-1.5">Variables</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.variables.length > 0 ? (
                      t.variables.map((v) => (
                        <code key={v} className="text-[11px] bg-white dark:bg-gray-800 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-lg">{'{{' + v + '}}'}</code>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Sin variables definidas</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Plantillas de email guardadas correctamente</p>
        </div>
      )}

      <button
        onClick={() => void handleSaveAll()}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
      >
        <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
        {saving ? 'Guardando...' : 'Guardar todas las plantillas'}
      </button>

      {editing && (
        <TemplateEditor
          template={editing}
          onSave={handleSaveTemplate}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
