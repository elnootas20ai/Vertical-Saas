import { useState } from 'react';
import {
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Zap,
  X,
} from 'lucide-react';
import type { QueueItem } from '../types';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

interface Props {
  queue: QueueItem[];
  onAdd: (message: string, priority: 'normal' | 'high') => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onReorder: (itemId: string, direction: 'up' | 'down') => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string }> = {
  pending: { icon: Clock, color: 'text-zinc-400' },
  processing: { icon: Loader2, color: 'text-blue-400' },
  done: { icon: CheckCircle2, color: 'text-emerald-400' },
  error: { icon: AlertCircle, color: 'text-red-400' },
};

export function AgentQueue({ queue, onAdd, onRemove, onClear, onReorder }: Props) {
  const { isDark, t } = usePluginSettings();
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');

  const pending = queue.filter((i) => i.status === 'pending');
  const processing = queue.filter((i) => i.status === 'processing');
  const done = queue.filter((i) => i.status === 'done' || i.status === 'error');

  const handleAdd = () => {
    if (!newMsg.trim()) return;
    onAdd(newMsg.trim(), priority);
    setNewMsg('');
    setPriority('normal');
    setShowAdd(false);
  };

  return (
    <div className={cn('border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 transition-colors',
          isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-gray-50',
        )}
      >
        <ListOrdered className="size-3 text-violet-400" />
        <span className={cn('text-[10px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
          {t('queue')}
        </span>
        {pending.length > 0 && (
          <span className="text-[9px] bg-violet-600/20 text-violet-300 px-1.5 py-0.5 rounded-full font-medium">
            {pending.length}
          </span>
        )}
        {processing.length > 0 && (
          <Loader2 className="size-2.5 text-blue-400 animate-spin" />
        )}
        <span className="flex-1" />
        {expanded ? <ChevronUp className="size-3 text-zinc-500" /> : <ChevronDown className="size-3 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1.5 animate-in slide-in-from-top-1 duration-100">
          {/* Actions */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-violet-600/15 text-violet-300 hover:bg-violet-600/25 transition-colors"
            >
              <Plus className="size-2.5" /> {t('add')}
            </button>
            {pending.length > 0 && (
              <button
                onClick={onClear}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors',
                  isDark
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
                )}
              >
                <Trash2 className="size-2.5" /> {t('clean')}
              </button>
            )}
          </div>

          {/* Add form */}
          {showAdd && (
            <div
              className={cn(
                'rounded-lg p-2 space-y-1.5 border',
                isDark ? 'bg-zinc-900 border-zinc-700/50' : 'bg-gray-50 border-gray-200',
              )}
            >
              <textarea
                className={cn(
                  'w-full bg-transparent text-[11px] resize-none outline-none min-h-[40px] max-h-[80px] leading-relaxed',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
                )}
                rows={2}
                placeholder={t('queuePlaceholder')}
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPriority((p) => p === 'normal' ? 'high' : 'normal')}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors',
                    priority === 'high'
                      ? 'bg-amber-600/20 text-amber-300'
                      : isDark
                        ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                        : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                  )}
                >
                  <Zap className="size-2" />
                  {priority === 'high' ? t('high') : t('normal')}
                </button>
                <span className="flex-1" />
                <button
                  onClick={() => { setShowAdd(false); setNewMsg(''); }}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] transition-colors',
                    isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newMsg.trim()}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    newMsg.trim()
                      ? 'bg-violet-600 text-white hover:bg-violet-500'
                      : cn(
                          'cursor-not-allowed',
                          isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
                        ),
                  )}
                >
                  {t('add')}
                </button>
              </div>
            </div>
          )}

          {/* Queue items */}
          {queue.length === 0 ? (
            <p className={cn('text-[10px] text-center py-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {t('emptyQueue')}
            </p>
          ) : (
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
              {/* Processing */}
              {processing.map((item) => (
                <QueueItemRow key={item.id} item={item} />
              ))}
              {/* Pending */}
              {pending.map((item, i) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  index={i}
                  total={pending.length}
                  onRemove={() => onRemove(item.id)}
                  onMoveUp={i > 0 ? () => onReorder(item.id, 'up') : undefined}
                  onMoveDown={i < pending.length - 1 ? () => onReorder(item.id, 'down') : undefined}
                />
              ))}
              {/* Done (últimos 3) */}
              {done.slice(-3).map((item) => (
                <QueueItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: QueueItem['status'], t: (key: string) => string): string {
  switch (status) {
    case 'pending':
      return t('pending');
    case 'processing':
      return t('processing');
    case 'done':
      return t('completed');
    case 'error':
      return t('error');
    default:
      return t('pending');
  }
}

function QueueItemRow({
  item,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: QueueItem;
  index?: number;
  total?: number;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { isDark, t } = usePluginSettings();
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const isPending = item.status === 'pending';
  const isProcessing = item.status === 'processing';
  const label = statusLabel(item.status, t);

  const queueBtnClass = isDark
    ? 'hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200'
    : 'hover:bg-gray-200 text-gray-400 hover:text-gray-700';

  return (
    <div
      className={cn(
        'flex items-start gap-1.5 px-2 py-1.5 rounded-md text-[10px] group',
        isProcessing && 'bg-blue-950/30 border border-blue-900/30',
        isPending && (isDark ? 'bg-zinc-900/50 hover:bg-zinc-800/50' : 'bg-gray-50 hover:bg-gray-100'),
        item.status === 'done' && 'opacity-50',
        item.status === 'error' && 'bg-red-950/20 opacity-70',
      )}
    >
      <Icon className={cn('size-3 shrink-0 mt-0.5', cfg.color, isProcessing && 'animate-spin')} />
      <div className="flex-1 min-w-0">
        <p className={cn('truncate leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700')}>
          {item.message}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[8px]', cfg.color)}>{label}</span>
          {item.priority === 'high' && (
            <span className="text-[8px] text-amber-400 flex items-center gap-0.5">
              <Zap className="size-1.5" /> {t('high')}
            </span>
          )}
          {typeof index === 'number' && (
            <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-500')}>
              #{index + 1}/{total}
            </span>
          )}
        </div>
      </div>
      {isPending && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              className={cn('size-4 rounded flex items-center justify-center', queueBtnClass)}
            >
              <ArrowUp className="size-2.5" />
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              className={cn('size-4 rounded flex items-center justify-center', queueBtnClass)}
            >
              <ArrowDown className="size-2.5" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="size-4 rounded hover:bg-red-900/40 flex items-center justify-center text-zinc-500 hover:text-red-400"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
