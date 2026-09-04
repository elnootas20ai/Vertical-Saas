/**
 * Input numérico sin flechas: se puede vaciar el 0 y escribir normal.
 * Entero (qty) o decimal (precio / importe).
 */
import { useState, type InputHTMLAttributes } from 'react';

type Mode = 'int' | 'decimal';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: number;
  onChange: (next: number) => void;
  mode?: Mode;
  /** Valor al dejar el campo vacío al salir (default 0). */
  emptyAs?: number;
};

function clamp(n: number, min?: number, max?: number): number {
  let out = n;
  if (typeof min === 'number' && Number.isFinite(min)) out = Math.max(min, out);
  if (typeof max === 'number' && Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function parseIntDraft(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function parseDecimalDraft(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '' || t === '.') return null;
  if (!/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function displayFromValue(value: number, mode: Mode): string {
  if (!Number.isFinite(value) || value === 0) return '';
  if (mode === 'int') return String(Math.floor(value));
  return String(value);
}

function resolveBounds(min: Props['min'], max: Props['max']): { minN?: number; maxN?: number } {
  return {
    minN: min !== undefined && min !== '' ? Number(min) : undefined,
    maxN: max !== undefined && max !== '' ? Number(max) : undefined,
  };
}

export function VertialNumericInput({
  value,
  onChange,
  mode = 'int',
  emptyAs = 0,
  min,
  max,
  className,
  onBlur,
  onFocus,
  ...rest
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const { minN, maxN } = resolveBounds(min, max);
  const shown = draft !== null ? draft : displayFromValue(value, mode);

  const commit = (n: number) => onChange(clamp(n, minN, maxN));

  return (
    <input
      {...rest}
      type="text"
      inputMode={mode === 'int' ? 'numeric' : 'decimal'}
      autoComplete="off"
      className={className}
      value={shown}
      onFocus={(e) => {
        setDraft(displayFromValue(value, mode));
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = mode === 'decimal' ? e.target.value.replace(',', '.') : e.target.value;
        if (mode === 'int') {
          if (raw !== '' && !/^\d*$/.test(raw)) return;
        } else if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) {
          return;
        }
        setDraft(raw);
        if (raw === '') return;
        const parsed = mode === 'int' ? parseIntDraft(raw) : parseDecimalDraft(raw);
        if (parsed === null) return;
        commit(parsed);
      }}
      onBlur={(e) => {
        const raw = (draft ?? '').trim();
        if (raw === '' || raw === '.') {
          commit(emptyAs);
        } else {
          const parsed = mode === 'int' ? parseIntDraft(raw) : parseDecimalDraft(raw);
          if (parsed !== null) commit(parsed);
        }
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
