import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, Users } from 'lucide-react';
import { searchConstructionClients, type ConstructionClient } from '../../lib/constructionApi';

interface Props {
  userId: string;
  value: string;
  clienteNombre: string;
  onChange: (clienteId: string, clienteNombre: string) => void;
  onCreateNew?: (nombre: string) => void;
  placeholder?: string;
}

export function ClienteAutocomplete({ userId, value, clienteNombre, onChange, onCreateNew, placeholder = 'Buscar cliente...' }: Props) {
  const [query, setQuery] = useState(clienteNombre || '');
  const [results, setResults] = useState<ConstructionClient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2 || !userId) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await searchConstructionClients(userId, q);
      setResults(r);
    } catch { setResults([]); }
    setLoading(false);
  }, [userId]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (value) onChange('', val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const selectClient = (c: ConstructionClient) => {
    setQuery(c.nombre);
    onChange(c._id, c.nombre);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setQuery(clienteNombre || ''); }, [clienteNombre]);

  const showCreate = query.length >= 2 && !results.some(r => r.nombre.toLowerCase() === query.toLowerCase());

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (query.length >= 2) setOpen(true); }}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400 text-sm"
        />
        {value && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500" title="Cliente vinculado" />}
      </div>

      {open && (query.length >= 2) && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 max-h-60 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-gray-400 text-center">Buscando...</div>}
          {!loading && results.map(c => (
            <button key={c._id} onClick={() => selectClient(c)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2.5 text-sm transition-colors">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{c.nombre}</div>
                <div className="text-xs text-gray-500 truncate">{[c.cif, c.telefono].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
          {!loading && showCreate && onCreateNew && (
            <button onClick={() => { onCreateNew(query); setOpen(false); }} className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2.5 text-sm border-t border-gray-100 dark:border-gray-600 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Crear nuevo cliente «{query}»</span>
            </button>
          )}
          {!loading && results.length === 0 && !showCreate && <div className="px-3 py-2 text-xs text-gray-400 text-center">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}
