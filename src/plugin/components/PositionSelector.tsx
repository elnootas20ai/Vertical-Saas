import { useState } from 'react';
import { Move, Circle, MessageSquare } from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import type { BubblePosition, PopupPosition } from '../PluginPanel';
import { usePluginSettings } from '../PluginProvider';

type GridPosition = BubblePosition & PopupPosition;

interface Props {
  bubblePosition: BubblePosition;
  popupPosition: PopupPosition;
  onChangeBubblePosition: (pos: BubblePosition) => void;
  onChangePopupPosition: (pos: PopupPosition) => void;
}

const gridPositions: { id: GridPosition; row: number; col: number }[] = [
  { id: 'top-left',      row: 0, col: 0 },
  { id: 'top-center',    row: 0, col: 1 },
  { id: 'top-right',     row: 0, col: 2 },
  { id: 'center-left',   row: 1, col: 0 },
  { id: 'center',        row: 1, col: 1 },
  { id: 'center-right',  row: 1, col: 2 },
  { id: 'bottom-left',   row: 2, col: 0 },
  { id: 'bottom-center', row: 2, col: 1 },
  { id: 'bottom-right',  row: 2, col: 2 },
];

const posLabels: Record<string, string> = {
  'top-left': '↖',
  'top-center': '↑',
  'top-right': '↗',
  'center-left': '←',
  'center': '●',
  'center-right': '→',
  'bottom-left': '↙',
  'bottom-center': '↓',
  'bottom-right': '↘',
};

type Tab = 'bubble' | 'popup';

export function PositionSelector({
  bubblePosition,
  popupPosition,
  onChangeBubblePosition,
  onChangePopupPosition,
}: Props) {
  const { isDark, t } = usePluginSettings();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('bubble');

  const currentPos = tab === 'bubble' ? bubblePosition : popupPosition;
  const onChange = tab === 'bubble'
    ? (pos: GridPosition) => onChangeBubblePosition(pos)
    : (pos: GridPosition) => onChangePopupPosition(pos);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'size-6 rounded-md flex items-center justify-center transition-colors',
          open
            ? (isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800')
            : (isDark
              ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'),
        )}
        title={t('position')}
      >
        <Move className="size-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 top-8 z-[110] border rounded-xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-100 w-[180px]',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}
          >
            {/* Tabs */}
            <div className={cn('flex gap-1 mb-3 rounded-lg p-0.5', isDark ? 'bg-zinc-800/60' : 'bg-gray-100')}>
              <button
                onClick={() => setTab('bubble')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-all',
                  tab === 'bubble'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : (isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-400 hover:text-gray-700'),
                )}
              >
                <Circle className="size-2.5" />
                {t('bubble')}
              </button>
              <button
                onClick={() => setTab('popup')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-all',
                  tab === 'popup'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : (isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-400 hover:text-gray-700'),
                )}
              >
                <MessageSquare className="size-2.5" />
                {t('popup')}
              </button>
            </div>

            {/* Visual grid 3x3 */}
            <div
              className={cn(
                'relative w-full aspect-[16/12] rounded-lg border mb-2 p-1.5',
                isDark ? 'bg-zinc-800/60 border-zinc-700/50' : 'bg-gray-100 border-gray-200',
              )}
            >
              <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full">
                {gridPositions.map((pos) => {
                  const isActive = currentPos === pos.id;
                  const activeColor = tab === 'bubble' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-violet-600 shadow-violet-600/30';

                  const otherPos = tab === 'bubble' ? popupPosition : bubblePosition;
                  const isOther = otherPos === pos.id;

                  return (
                    <button
                      key={pos.id}
                      onClick={() => { onChange(pos.id); }}
                      className={cn(
                        'rounded-md flex items-center justify-center transition-all relative',
                        isActive
                          ? `${activeColor} shadow-md`
                          : (isDark ? 'bg-zinc-700/60 hover:bg-zinc-600/80' : 'bg-gray-200 hover:bg-gray-300'),
                      )}
                      title={pos.id}
                    >
                      <div className={cn(
                        'size-2 rounded-full transition-colors',
                        isActive ? 'bg-white' : 'bg-zinc-500',
                      )} />
                      {isOther && !isActive && (
                        <div className={cn(
                          'absolute size-1.5 rounded-full',
                          tab === 'bubble' ? 'bg-violet-500/60' : 'bg-emerald-500/60',
                        )} style={{ top: 2, right: 2 }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Screen icon in center */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-5 rounded-sm border border-zinc-600/20" />
              </div>
            </div>

            {/* Position label */}
            <div className="text-center">
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium',
                tab === 'bubble'
                  ? 'bg-emerald-600/15 text-emerald-400'
                  : 'bg-violet-600/15 text-violet-400',
              )}>
                {posLabels[currentPos]}
                <span className="capitalize">{currentPos.replace('-', ' ')}</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
