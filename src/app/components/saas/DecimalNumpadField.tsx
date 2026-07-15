import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { DecimalNumpad } from './DecimalNumpad';
import { sanitizeDecimalTyping } from '../../lib/decimalNumpadInput';

function useAutoShowNumpad(explicit?: boolean): boolean {
  const [auto, setAuto] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (explicit !== undefined) return;
    const mq = window.matchMedia('(max-width: 1023px), (pointer: coarse)');
    const update = () => setAuto(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [explicit]);

  return explicit ?? auto;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxDecimals?: number;
  className?: string;
  inputClassName?: string;
  numpadClassName?: string;
  showNumpad?: boolean;
  compactNumpad?: boolean;
  suffix?: ReactNode;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

export function DecimalNumpadField({
  value,
  onChange,
  placeholder = '0.00',
  disabled = false,
  maxDecimals = 2,
  className = '',
  inputClassName = '',
  numpadClassName = '',
  showNumpad,
  compactNumpad = false,
  suffix,
  autoFocus = false,
  inputRef,
}: Props) {
  const padVisible = useAutoShowNumpad(showNumpad);

  return (
    <div className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode={padVisible ? 'none' : 'decimal'}
          readOnly={padVisible}
          autoFocus={autoFocus}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(sanitizeDecimalTyping(e.target.value, maxDecimals))}
          className={inputClassName}
        />
        {suffix}
      </div>
      {padVisible ? (
        <DecimalNumpad
          value={value}
          onChange={onChange}
          maxDecimals={maxDecimals}
          disabled={disabled}
          compact={compactNumpad}
          hideDecimalKey={maxDecimals <= 0}
          className={numpadClassName || 'mt-2'}
        />
      ) : null}
    </div>
  );
}
