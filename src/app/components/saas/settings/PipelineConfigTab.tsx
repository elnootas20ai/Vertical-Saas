import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { PipelineStage } from '../../../lib/settingsApi';
import { getPipelineConfig, savePipelineConfig } from '../../../lib/settingsApi';

interface Props {
  userId: string;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  new:         { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  contacted:   { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  appointment: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  reserved:    { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  negotiation: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  won:         { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  lost:        { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'new',         label: 'Nuevo',       visible: true, order: 0 },
  { id: 'contacted',   label: 'Contactado',  visible: true, order: 1 },
  { id: 'appointment', label: 'Cita',        visible: true, order: 2 },
  { id: 'reserved',    label: 'Reservado',   visible: true, order: 3 },
  { id: 'negotiation', label: 'Negociación', visible: true, order: 4 },
  { id: 'won',         label: 'Ganado',      visible: true, order: 5 },
  { id: 'lost',        label: 'Perdido',     visible: true, order: 6 },
];

export function PipelineConfigTab({ userId }: Props) {
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getPipelineConfig(userId)
      .then((data) => setStages([...data].sort((a, b) => a.order - b.order)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleLabelChange = (id: string, newLabel: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, label: newLabel } : s)));
  };

  const toggleVisible = (id: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
  };

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStages(next.map((s, i) => ({ ...s, order: i })));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...stages];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setStages(next.map((s, i) => ({ ...s, order: i })));
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleReset = () => setStages(DEFAULT_STAGES);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const saved = await savePipelineConfig(userId, stages);
      setStages([...saved].sort((a, b) => a.order - b.order));
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
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-5">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Etapas del pipeline de ventas</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Personaliza los nombres, el orden y la visibilidad de cada etapa. Arrastra para reordenar.</p>
        </div>

        <div className="space-y-2">
          {stages.map((stage, idx) => {
            const colors = STAGE_COLORS[stage.id] || { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-400' };
            const isFixed = stage.id === 'won' || stage.id === 'lost';
            return (
              <div
                key={stage.id}
                draggable={!isFixed}
                onDragStart={() => !isFixed && handleDragStart(idx)}
                onDragOver={(e) => !isFixed && handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  dragIdx === idx ? 'border-blue-300 bg-blue-50 scale-[1.01]' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } ${!stage.visible ? 'opacity-50' : ''}`}
              >
                <div className={`cursor-grab text-gray-300 hover:text-gray-500 ${isFixed ? 'cursor-not-allowed opacity-30' : ''}`}>
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors.dot}`} />
                <input
                  type="text"
                  value={stage.label}
                  onChange={(e) => handleLabelChange(stage.id, e.target.value)}
                  maxLength={40}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none text-sm font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                />
                <div className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
                  {stage.id}
                </div>
                {!isFixed && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveStage(idx, -1)} disabled={idx === 0} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    </button>
                    <button onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    </button>
                    <button onClick={() => toggleVisible(stage.id)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={stage.visible ? 'Ocultar etapa' : 'Mostrar etapa'}>
                      {stage.visible ? <Eye className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
                    </button>
                  </div>
                )}
                {isFixed && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono shrink-0">fija</span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Las etapas "won" y "lost" son fijas y no se pueden mover ni ocultar.</p>
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
          <p className="text-sm text-green-700">Etapas del pipeline guardadas correctamente</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Restablecer
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
          {saving ? 'Guardando...' : 'Guardar etapas'}
        </button>
      </div>
    </div>
  );
}
