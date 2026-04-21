import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Trash2, ChevronDown, Plus, X } from 'lucide-react';
import type { FilterPreset } from '../../hooks/useSavedFilters';

interface Props<T> {
  presets: FilterPreset<T>[];
  activePresetId?: string | null;
  onApply: (preset: FilterPreset<T>) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  currentFiltersEmpty?: boolean;
  label?: string;
}

export function SavedFiltersPanel<T>({
  presets,
  activePresetId,
  onApply,
  onSave,
  onDelete,
  currentFiltersEmpty = false,
  label = 'Vistas',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSaveForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (showSaveForm) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showSaveForm]);

  const handleSave = () => {
    if (!newName.trim()) return;
    onSave(newName.trim());
    setNewName('');
    setShowSaveForm(false);
    setOpen(false);
  };

  const activePreset = presets.find(p => p.id === activePresetId);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2.5 border-2 rounded-xl text-sm font-medium transition-colors ${
          activePreset
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
            : open
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
        }`}
        title="Vistas guardadas"
      >
        {activePreset ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        <span className="hidden sm:inline">
          {activePreset ? activePreset.name : label}
        </span>
        {presets.length > 0 && !activePreset && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${open ? 'bg-white text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
            {presets.length}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-40 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Vistas guardadas</p>
            {!currentFiltersEmpty && (
              <button
                onClick={() => setShowSaveForm(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Guardar actual
              </button>
            )}
          </div>

          {/* Save form */}
          {showSaveForm && (
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-950/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Nombre para esta vista:</p>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveForm(false); }}
                  placeholder="Ej: Sin vender, Disponibles BMW…"
                  className="flex-1 text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg outline-none focus:border-blue-400"
                  maxLength={40}
                />
                <button
                  onClick={handleSave}
                  disabled={!newName.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}

          {/* Presets list */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {presets.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bookmark className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Sin vistas guardadas</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Aplica filtros y pulsa "Guardar actual"</p>
              </div>
            ) : (
              presets.map(preset => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-2 px-3 py-2.5 group transition-colors ${
                    activePresetId === preset.id
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <button
                    onClick={() => { onApply(preset); setOpen(false); }}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    {activePresetId === preset.id
                      ? <BookmarkCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      : <Bookmark className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    }
                    <span className={`text-sm truncate ${activePresetId === preset.id ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {preset.name}
                    </span>
                  </button>
                  <button
                    onClick={() => onDelete(preset.id)}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-all flex-shrink-0"
                    title="Eliminar vista"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {activePresetId && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
              <button
                onClick={() => { onApply({ id: '', name: '', filters: null as T, createdAt: '' }); setOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-3 h-3" />
                Limpiar vista activa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
