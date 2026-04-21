import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

const PREFIXES = [
  { code: '+34', country: 'España', flag: '🇪🇸' },
  { code: '+33', country: 'Francia', flag: '🇫🇷' },
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+44', country: 'Reino Unido', flag: '🇬🇧' },
  { code: '+49', country: 'Alemania', flag: '🇩🇪' },
  { code: '+39', country: 'Italia', flag: '🇮🇹' },
  { code: '+212', country: 'Marruecos', flag: '🇲🇦' },
  { code: '+40', country: 'Rumanía', flag: '🇷🇴' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴' },
  { code: '+593', country: 'Ecuador', flag: '🇪🇨' },
  { code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { code: '+52', country: 'México', flag: '🇲🇽' },
  { code: '+51', country: 'Perú', flag: '🇵🇪' },
  { code: '+1', country: 'Estados Unidos', flag: '🇺🇸' },
];

interface PhonePrefixSelectorProps {
  value: string;
  onChange: (prefix: string) => void;
  className?: string;
  compact?: boolean;
}

export function PhonePrefixSelector({ value, onChange, className = '', compact = true }: PhonePrefixSelectorProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = PREFIXES.find(p => p.code === value) || PREFIXES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const filtered = filter
    ? PREFIXES.filter(p =>
        p.country.toLowerCase().includes(filter.toLowerCase()) ||
        p.code.includes(filter)
      )
    : PREFIXES;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setFilter(''); }}
        className="flex items-center gap-1 px-2.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 h-full"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="tabular-nums">{selected.code}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Buscar país..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:border-gray-400 dark:focus:border-gray-500 outline-none text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={p.code}
                type="button"
                onClick={() => { onChange(p.code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  p.code === value
                    ? 'bg-gray-100 dark:bg-gray-700 font-semibold text-gray-900 dark:text-gray-100'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-base leading-none">{p.flag}</span>
                <span className="tabular-nums font-medium w-12">{p.code}</span>
                {!compact && <span className="text-gray-500 dark:text-gray-400 truncate">{p.country}</span>}
                {compact && <span className="text-gray-500 dark:text-gray-400 truncate">{p.country}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
