import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  birthDateIsoToDisplay,
  formatBirthDateAsTyping,
  isCompleteBirthDateDisplay,
  parseBirthDateDisplay,
} from '../../lib/birthDateIso';

export interface BirthDateEsFieldHandle {
  commit: () => string;
  getDisplay: () => string;
}

interface BirthDateEsFieldProps {
  value: string;
  onChange: (isoValue: string) => void;
  disabled?: boolean;
  className?: string;
  errorClassName?: string;
  id?: string;
  error?: string;
  onEdit?: () => void;
}

function mergeInputClass(base: string, error?: string, errorClassName?: string) {
  if (!error) return base;
  const err = errorClassName || `${base} border-red-400 focus:border-red-500 dark:border-red-500`;
  return err.includes('border-red') ? err : `${base} border-red-400 focus:border-red-500 dark:border-red-500`;
}

/** Fecha de nacimiento en formato español: día / mes / año (15/06/1995). */
export const BirthDateEsField = forwardRef<BirthDateEsFieldHandle, BirthDateEsFieldProps>(
  function BirthDateEsField({
    value,
    onChange,
    disabled,
    className = '',
    errorClassName,
    id,
    error,
    onEdit,
  }, ref) {
    const [display, setDisplay] = useState(() => birthDateIsoToDisplay(value));

    useEffect(() => {
      setDisplay(birthDateIsoToDisplay(value));
    }, [value]);

    useImperativeHandle(ref, () => ({
      commit: () => {
        if (!display.trim()) {
          onChange('');
          return '';
        }
        if (!isCompleteBirthDateDisplay(display)) {
          return '';
        }
        const iso = parseBirthDateDisplay(display) || '';
        if (iso) onChange(iso);
        return iso;
      },
      getDisplay: () => display,
    }), [display, onChange]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onEdit?.();
      const formatted = formatBirthDateAsTyping(event.target.value);
      setDisplay(formatted);

      if (!formatted) {
        onChange('');
        return;
      }

      if (isCompleteBirthDateDisplay(formatted)) {
        onChange(parseBirthDateDisplay(formatted) || '');
      }
    };

    const handleBlur = () => {
      if (!display.trim()) {
        onChange('');
        return;
      }
      if (isCompleteBirthDateDisplay(display)) {
        onChange(parseBirthDateDisplay(display) || '');
        return;
      }
      setDisplay(birthDateIsoToDisplay(value));
    };

    return (
      <div>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          disabled={disabled}
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="dd/mm/aaaa"
          maxLength={10}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id || 'birthDate'}-error` : undefined}
          enterKeyHint="next"
          className={mergeInputClass(className, error, errorClassName)}
        />
        {!error ? (
          <p className="mt-1 text-[10px] text-gray-400">Día / mes / año — ej. 15/06/1995</p>
        ) : null}
      </div>
    );
  },
);
