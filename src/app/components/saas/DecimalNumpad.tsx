import { Delete } from 'lucide-react';
import { appendDecimalNumpadKey, DECIMAL_PAD_SEPARATOR } from '../../lib/decimalNumpadInput';

const ROWS: string[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  [DECIMAL_PAD_SEPARATOR, '0', 'backspace'],
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  maxDecimals?: number;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  /** Oculta la tecla decimal (p. ej. cantidades enteras). */
  hideDecimalKey?: boolean;
};

export function DecimalNumpad({
  value,
  onChange,
  maxDecimals = 2,
  disabled = false,
  className = '',
  compact = false,
  hideDecimalKey = false,
}: Props) {
  const layout = hideDecimalKey
    ? [...ROWS.slice(0, 3).flat(), 'blank', '0', 'backspace']
    : ROWS.flat();

  const btnClass = compact
    ? 'min-h-[44px] rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-bold text-gray-900 dark:text-gray-100 active:scale-[0.97] transition-transform touch-manipulation disabled:opacity-40'
    : 'min-h-[52px] rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xl font-bold text-gray-900 dark:text-gray-100 active:scale-[0.97] transition-transform touch-manipulation disabled:opacity-40';

  const blankMinH = compact ? 'min-h-[44px]' : 'min-h-[52px]';

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {layout.map((key, idx) => {
        if (key === 'blank') {
          return <div key={`blank-${idx}`} aria-hidden className={blankMinH} />;
        }
        return (
          <button
            key={`${key}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(appendDecimalNumpadKey(value, key, maxDecimals))}
            className={`${btnClass} ${
              key === 'backspace'
                ? 'flex items-center justify-center text-gray-500 dark:text-gray-400'
                : ''
            }`}
            aria-label={key === 'backspace' ? 'Borrar' : key === DECIMAL_PAD_SEPARATOR ? 'Punto decimal' : key}
          >
            {key === 'backspace' ? <Delete className={compact ? 'w-5 h-5' : 'w-6 h-6'} /> : key}
          </button>
        );
      })}
    </div>
  );
}
