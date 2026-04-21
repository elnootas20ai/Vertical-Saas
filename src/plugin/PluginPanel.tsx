import { useState, useEffect, useCallback } from 'react';
import { Terminal } from 'lucide-react';
import { Plugin } from './Plugin';
import { PluginProvider } from './PluginProvider';
import { cn } from '../app/components/ui/utils';

const STORAGE_KEY = 'pluginPanelOpen';
const EXPANDED_KEY = 'pluginPanelExpanded';
const BUBBLE_POS_KEY = 'pluginBubblePosition';
const POPUP_POS_KEY = 'pluginPopupPosition';
const SHORTCUT_KEY = 'pluginShortcut';

export type BubblePosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type PopupPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type PanelPosition = BubblePosition;

export interface ShortcutConfig {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  label: string;
}

const DEFAULT_SHORTCUT: ShortcutConfig = {
  key: 'j',
  ctrl: true,
  shift: true,
  alt: false,
  label: 'Ctrl+Shift+J',
};

function loadShortcut(): ShortcutConfig {
  try {
    const raw = localStorage.getItem(SHORTCUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fallback */ }
  return DEFAULT_SHORTCUT;
}

const bubblePositionConfig: Record<BubblePosition, string> = {
  'top-left':      'top-4 left-4',
  'top-center':    'top-4 left-1/2 -translate-x-1/2',
  'top-right':     'top-4 right-4',
  'center-left':   'top-1/2 -translate-y-1/2 left-4',
  'center':        'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'center-right':  'top-1/2 -translate-y-1/2 right-4',
  'bottom-left':   'bottom-20 md:bottom-6 left-4',
  'bottom-center': 'bottom-20 md:bottom-6 left-1/2 -translate-x-1/2',
  'bottom-right':  'bottom-20 md:bottom-6 right-4',
};

const popupPositionConfig: Record<PopupPosition, {
  panel: string;
  panelHidden: string;
  rounded: string;
}> = {
  'top-left': {
    panel: 'top-0 left-0',
    panelHidden: '-translate-x-full',
    rounded: 'rounded-r-xl border-r',
  },
  'top-center': {
    panel: 'top-0 left-1/2 -translate-x-1/2',
    panelHidden: '-translate-y-full left-1/2 -translate-x-1/2',
    rounded: 'rounded-b-xl border-b border-x',
  },
  'top-right': {
    panel: 'top-0 right-0',
    panelHidden: 'translate-x-full',
    rounded: 'rounded-l-xl border-l',
  },
  'center-left': {
    panel: 'top-1/2 -translate-y-1/2 left-0',
    panelHidden: '-translate-x-full top-1/2 -translate-y-1/2',
    rounded: 'rounded-r-xl border-r',
  },
  'center': {
    panel: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    panelHidden: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-90 opacity-0',
    rounded: 'rounded-xl border',
  },
  'center-right': {
    panel: 'top-1/2 -translate-y-1/2 right-0',
    panelHidden: 'translate-x-full top-1/2 -translate-y-1/2',
    rounded: 'rounded-l-xl border-l',
  },
  'bottom-left': {
    panel: 'bottom-0 left-0',
    panelHidden: '-translate-x-full',
    rounded: 'rounded-r-xl border-r',
  },
  'bottom-center': {
    panel: 'bottom-0 left-1/2 -translate-x-1/2',
    panelHidden: 'translate-y-full left-1/2 -translate-x-1/2',
    rounded: 'rounded-t-xl border-t border-x',
  },
  'bottom-right': {
    panel: 'bottom-0 right-0',
    panelHidden: 'translate-x-full',
    rounded: 'rounded-l-xl border-l',
  },
};

export function PluginPanel() {
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [expanded, setExpanded] = useState(() => localStorage.getItem(EXPANDED_KEY) === 'true');
  const [bubblePos, setBubblePos] = useState<BubblePosition>(
    () => (localStorage.getItem(BUBBLE_POS_KEY) as BubblePosition) || 'bottom-right',
  );
  const [popupPos, setPopupPos] = useState<PopupPosition>(
    () => (localStorage.getItem(POPUP_POS_KEY) as PopupPosition) || 'top-right',
  );
  const [shortcut, setShortcut] = useState<ShortcutConfig>(loadShortcut);
  const [quickCommandTrigger, setQuickCommandTrigger] = useState(0);
  const [elementPickerTrigger, setElementPickerTrigger] = useState(0);

  const pluginCwd = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('pluginCwd') || undefined;
    } catch { return undefined; }
  })();

  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(open)); }, [open]);
  useEffect(() => { localStorage.setItem(EXPANDED_KEY, String(expanded)); }, [expanded]);
  useEffect(() => { localStorage.setItem(BUBBLE_POS_KEY, bubblePos); }, [bubblePos]);
  useEffect(() => { localStorage.setItem(POPUP_POS_KEY, popupPos); }, [popupPos]);
  useEffect(() => { localStorage.setItem(SHORTCUT_KEY, JSON.stringify(shortcut)); }, [shortcut]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const toggleExpand = useCallback(() => setExpanded((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const matchCtrl = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
      const matchShift = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const matchAlt = shortcut.alt ? e.altKey : !e.altKey;

      if (matchCtrl && matchShift && matchAlt && e.key.toLowerCase() === shortcut.key.toLowerCase()) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        setQuickCommandTrigger((n) => n + 1);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [shortcut]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyE' || e.key.toLowerCase() === 'e')) {
        if (!open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          setElementPickerTrigger((n) => n + 1);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  const popCfg = popupPositionConfig[popupPos];
  const panelWidth = expanded ? 'w-[720px] max-w-[calc(100vw-8px)]' : 'w-[440px] max-w-[calc(100vw-8px)]';
  const isEdgeFull = popupPos === 'top-left' || popupPos === 'top-right';
  const panelHeight = isEdgeFull ? 'h-full' : 'h-[85vh] max-h-[900px]';

  const openTransform = popupPos === 'center'
    ? '-translate-x-1/2 -translate-y-1/2 scale-100 opacity-100'
    : popupPos === 'top-center'
      ? '-translate-x-1/2 translate-y-0'
      : popupPos === 'bottom-center'
        ? '-translate-x-1/2 translate-y-0'
        : popupPos === 'center-left' || popupPos === 'center-right'
          ? '-translate-y-1/2 translate-x-0'
          : 'translate-x-0 translate-y-0';

  return (
    <PluginProvider>
    <>
      {!open && (
        <button
          onClick={toggle}
          className={cn(
            'fixed z-[9999] size-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95 group',
            bubblePositionConfig[bubblePos],
          )}
          title={`Open Agent Hub (${shortcut.label})`}
        >
          <Terminal className="size-5" />
          <span className="absolute -top-0.5 -right-0.5 size-3 bg-emerald-400 rounded-full border-2 border-gray-900" />
          <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[9px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {shortcut.label}
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[9998] md:hidden"
          onClick={toggle}
        />
      )}

      <div
        data-plugin-panel
        className={cn(
          'fixed z-[9999] transition-all duration-300 ease-in-out overflow-hidden',
          panelWidth,
          panelHeight,
          open ? openTransform : popCfg.panelHidden,
          open ? popCfg.panel : popCfg.panel,
        )}
      >
        <Plugin
          onClose={toggle}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          bubblePosition={bubblePos}
          popupPosition={popupPos}
          onChangeBubblePosition={setBubblePos}
          onChangePopupPosition={setPopupPos}
          roundedClass={popCfg.rounded}
          quickCommandTrigger={quickCommandTrigger}
          elementPickerTrigger={elementPickerTrigger}
          shortcut={shortcut}
          onChangeShortcut={setShortcut}
          defaultCwd={pluginCwd}
        />
      </div>
    </>
    </PluginProvider>
  );
}
