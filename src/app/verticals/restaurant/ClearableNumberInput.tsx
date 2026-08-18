import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  /** Se llama al confirmar (blur o número válido mientras escribes). */
  onCommit: (n: number) => void;
};

/**
 * Número borrable con teclado: vacío mientras editas; al salir aplica min.
 */
export function ClearableNumberInput({
  value,
  min = 1,
  max,
  className,
  disabled,
  autoFocus,
  'aria-label': ariaLabel,
  onCommit,
}: Props) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  const commit = (raw: string, clampMin: boolean) => {
    if (raw === '') {
      if (clampMin) {
        setText(String(min));
        onCommit(min);
      }
      return;
    }
    let n = Number(raw);
    if (!Number.isFinite(n)) {
      if (clampMin) {
        setText(String(min));
        onCommit(min);
      }
      return;
    }
    n = Math.floor(n);
    if (clampMin) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    if (clampMin) setText(String(n));
    onCommit(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
        setText(raw);
        if (raw === '') return;
        commit(raw, false);
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(text, true);
      }}
    />
  );
}
