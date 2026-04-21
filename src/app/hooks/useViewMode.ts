import { useState, useEffect } from 'react';

type ViewMode = 'cards' | 'table';

export function useViewMode(moduleKey: string, defaultView: ViewMode = 'cards'): [ViewMode, (view: ViewMode) => void] {
  const storageKey = `viewMode_${moduleKey}`;
  
  const [view, setView] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(storageKey);
    return (stored === 'cards' || stored === 'table') ? stored : defaultView;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, view);
  }, [view, storageKey]);

  return [view, setView];
}
