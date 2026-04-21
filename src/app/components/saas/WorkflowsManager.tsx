import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listWorkflowsRequest, createWorkflowRequest, updateWorkflowRequest,
  deleteWorkflowRequest, triggerWorkflowRunRequest,
  type Workflow, type WorkflowAction, type WorkflowTrigger,
} from '../../lib/workflowsApi';
import { v4 as uuidv4 } from 'uuid';
import {
  Plus, Trash2, Edit2, Power, X, Check,
  Zap, Mail, Tag, ArrowRight, Clock, AlertTriangle, RefreshCw,
} from 'lucide-react';

const TRIGGER_OPTIONS = [
  { id: 'no_contact_days', label: 'Sin contacto en N dias' },
  { id: 'status_is', label: 'Estado del lead es' },
  { id: 'created_days_ago', label: 'Lead creado hace N dias' },
];

const ACTION_OPTIONS = [
  { id: 'send_email', label: 'Enviar email recordatorio', icon: Mail },
  { id: 'add_task', label: 'Crear tarea para comercial', icon: AlertTriangle },
  { id: 'change_status', label: 'Cambiar estado del lead', icon: ArrowRight },
  { id: 'add_tag', label: 'Anadir etiqueta', icon: Tag },
];

const LEAD_STATUSES = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', appointment: 'Cita',
  reserved: 'Reservado', negotiation: 'Negociacion', won: 'Ganado', lost: 'Perdido',
};

function emptyAction(): WorkflowAction {
  return { id: uuidv4(), order: 0, type: 'send_email', delayDays: 0 };
}

function emptyWorkflow(): Partial<Workflow> {
  return {
    name: '',
    description: '',
    enabled: true,
    entityType: 'lead',
    trigger: { type: 'no_contact_days', days: 3 },
    actions: [emptyAction()],
  };
}

function WorkflowCard({
  wf, onEdit, onDelete, onToggle,
}: { wf: Workflow; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 transition-all ${wf.enabled ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${wf.enabled ? 'bg-indigo-100' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Zap className={`w-4.5 h-4.5 ${wf.enabled ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{wf.name}</p>
              {wf.description && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{wf.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onToggle} className={`p-1.5 rounded-lg transition-colors ${wf.enabled ? 'bg-green-50 hover:bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-400 dark:text-gray-500'}`}>
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={onEdit} className="p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors text-gray-600 dark:text-gray-400">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
            <Clock className="w-3 h-3" />
            {wf.trigger?.type === 'no_contact_days' && `Sin contacto ${wf.trigger.days}d`}
            {wf.trigger?.type === 'status_is' && `Estado: ${STATUS_LABELS[wf.trigger.status || ''] || wf.trigger.status}`}
            {wf.trigger?.type === 'created_days_ago' && `Creado hace ${wf.trigger.days}d`}
          </span>
          <span className="text-gray-300">{'->'}</span>
          {wf.actions.map((a) => {
            const opt = ACTION_OPTIONS.find((o) => o.id === a.type);
            const Icon = opt?.icon || Zap;
            return (
              <span key={a.id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full">
                <Icon className="w-3 h-3" />
                {opt?.label || a.type}
                {a.delayDays > 0 && <span className="text-gray-400 dark:text-gray-500">(+{a.delayDays}d)</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WorkflowModal({
  initial, onSave, onClose,
}: { initial: Partial<Workflow>; onSave: (data: Partial<Workflow>) => void; onClose: () => void }) {
  useModalClose(true, onClose);
  const [form, setForm] = useState<Partial<Workflow>>(initial);

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTrigger = (patch: Partial<WorkflowTrigger>) =>
    setForm((prev) => ({ ...prev, trigger: { ...prev.trigger, ...patch } as WorkflowTrigger }));

  const addAction = () =>
    set('actions', [...(form.actions || []), { ...emptyAction(), order: (form.actions || []).length }]);

  const updateAction = (idx: number, patch: Partial<WorkflowAction>) =>
    set('actions', (form.actions || []).map((a, i) => i === idx ? { ...a, ...patch } : a));

  const removeAction = (idx: number) =>
    set('actions', (form.actions || []).filter((_, i) => i !== idx));

  const canSave = form.name?.trim() && (form.actions || []).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{initial.id ? 'Editar workflow' : 'Nuevo workflow'}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-2xl">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Nombre *</label>
              <input
                value={form.name || ''}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ej: Recordatorio sin contacto 3 dias"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 focus:bg-white focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Descripcion</label>
              <input
                value={form.description || ''}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Descripcion opcional..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 focus:bg-white focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Disparador (CUANDO)
            </p>
            <div className="space-y-2">
              <select
                value={form.trigger?.type || 'no_contact_days'}
                onChange={(e) => setTrigger({ type: e.target.value as WorkflowTrigger['type'] })}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border-2 border-indigo-100 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-400 focus:outline-none"
              >
                {TRIGGER_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>

              {(form.trigger?.type === 'no_contact_days' || form.trigger?.type === 'created_days_ago') && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={form.trigger?.days ?? 3}
                    onChange={(e) => setTrigger({ days: Number(e.target.value) })}
                    className="w-20 px-3 py-2 bg-white dark:bg-gray-800 border-2 border-indigo-100 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-400 focus:outline-none"
                  />
                  <span className="text-sm text-indigo-700">dias</span>
                </div>
              )}
              {form.trigger?.type === 'status_is' && (
                <select
                  value={form.trigger?.status || 'new'}
                  onChange={(e) => setTrigger({ status: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border-2 border-indigo-100 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-400 focus:outline-none"
                >
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5" /> Acciones (ENTONCES)
            </p>
            <div className="space-y-3">
              {(form.actions || []).map((action, idx) => (
                <div key={action.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-emerald-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={action.type}
                      onChange={(e) => updateAction(idx, { type: e.target.value as WorkflowAction['type'] })}
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:border-emerald-400 focus:outline-none"
                    >
                      {ACTION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl px-2 py-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">+</span>
                      <input
                        type="number"
                        min={0}
                        value={action.delayDays}
                        onChange={(e) => updateAction(idx, { delayDays: Number(e.target.value) })}
                        className="w-10 bg-transparent text-xs text-gray-700 dark:text-gray-300 focus:outline-none text-center"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">d</span>
                    </div>
                    <button onClick={() => removeAction(idx)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addAction}
                className="flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-1 hover:bg-emerald-100 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Anadir accion
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl text-sm transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {initial.id ? 'Guardar cambios' : 'Crear workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface WorkflowsManagerProps {
  openCreateSignal?: number;
  onLoaded?: (workflows: Workflow[]) => void;
  /** Solo carga datos y muestra el modal; sin lista ni cabecera (p. ej. embebido en Pipeline). */
  compact?: boolean;
}

export function WorkflowsManager({ openCreateSignal = 0, onLoaded, compact = false }: WorkflowsManagerProps) {
  const { user: authUser } = useAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<Workflow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = authUser?.user_id || '';

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await listWorkflowsRequest(userId);
      setWorkflows(list);
      onLoaded?.(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudieron cargar los workflows.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId, onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (openCreateSignal > 0) {
      setEditTarget(emptyWorkflow());
    }
  }, [openCreateSignal]);

  const handleSave = async (data: Partial<Workflow>) => {
    if (!userId) return;
    try {
      if (data.id) {
        const updated = await updateWorkflowRequest(userId, data.id, data);
        setWorkflows((prev) => {
          const next = prev.map((w) => w.id === updated.id ? updated : w);
          onLoaded?.(next);
          return next;
        });
      } else {
        const created = await createWorkflowRequest(userId, data);
        setWorkflows((prev) => {
          const next = [created, ...prev];
          onLoaded?.(next);
          return next;
        });
      }
      setEditTarget(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo guardar el workflow.';
      setError(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!userId || !confirm('Eliminar este workflow?')) return;
    try {
      await deleteWorkflowRequest(userId, id);
      setWorkflows((prev) => {
        const next = prev.filter((w) => w.id !== id);
        onLoaded?.(next);
        return next;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo eliminar el workflow.';
      setError(message);
    }
  };

  const handleToggle = async (wf: Workflow) => {
    if (!userId) return;
    try {
      const updated = await updateWorkflowRequest(userId, wf.id, { ...wf, enabled: !wf.enabled });
      setWorkflows((prev) => {
        const next = prev.map((w) => w.id === updated.id ? updated : w);
        onLoaded?.(next);
        return next;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo actualizar el workflow.';
      setError(message);
    }
  };

  const handleRunNow = async () => {
    if (!userId) return;
    setRunning(true);
    try {
      await triggerWorkflowRunRequest(userId);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo ejecutar workflows.';
      setError(message);
    } finally {
      setRunning(false);
    }
  };

  const enabledCount = workflows.filter((w) => w.enabled).length;

  if (compact) {
    return (
      <>
        {error && (
          <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] p-3 bg-red-50 dark:bg-red-950/90 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-200 flex items-center gap-2 shadow-lg">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 min-w-0">{error}</span>
            <button type="button" onClick={() => setError(null)} className="flex-shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}
        {editTarget && (
          <WorkflowModal
            initial={editTarget}
            onSave={handleSave}
            onClose={() => setEditTarget(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-indigo-600" />
            Workflows
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Automatiza seguimientos de leads · {enabledCount} activo{enabledCount !== 1 ? 's' : ''} de {workflows.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunNow}
            disabled={running || !enabledCount}
            className="flex items-center gap-2 px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            Ejecutar ahora
          </button>
          <button
            onClick={() => setEditTarget(emptyWorkflow())}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo workflow
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800">
          <div className="w-16 h-16 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin workflows todavia</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Crea tu primer workflow de seguimiento automatico</p>
          <button
            onClick={() => setEditTarget(emptyWorkflow())}
            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear workflow
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onEdit={() => setEditTarget(wf)}
              onDelete={() => handleDelete(wf.id)}
              onToggle={() => handleToggle(wf)}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <WorkflowModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
