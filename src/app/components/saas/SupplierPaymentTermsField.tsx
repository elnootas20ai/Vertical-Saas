import { useEffect, useState } from 'react';
import {
  SUPPLIER_PAYMENT_TERMS_MANUAL,
  SUPPLIER_PAYMENT_TERMS_PRESETS,
  isSupplierPaymentTermsPreset,
} from '../../lib/supplierPaymentTerms';

const selectClass =
  'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

type Props = {
  value: string;
  onChange: (next: string) => void;
  labelClassName?: string;
  inputClassName?: string;
};

/**
 * Desplegable de condiciones de pago + texto libre si eliges «Manual».
 */
export function SupplierPaymentTermsField({
  value,
  onChange,
  labelClassName = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5',
  inputClassName = selectClass,
}: Props) {
  const trimmed = String(value || '').trim();
  const [manualMode, setManualMode] = useState(
    () => Boolean(trimmed) && !isSupplierPaymentTermsPreset(trimmed),
  );

  useEffect(() => {
    const v = String(value || '').trim();
    if (v && !isSupplierPaymentTermsPreset(v)) setManualMode(true);
    if (v && isSupplierPaymentTermsPreset(v)) setManualMode(false);
  }, [value]);

  const selectValue = manualMode
    ? SUPPLIER_PAYMENT_TERMS_MANUAL
    : trimmed && isSupplierPaymentTermsPreset(trimmed)
      ? trimmed
      : '';

  return (
    <div className="space-y-2">
      <div>
        <label className={labelClassName}>Condiciones de pago</label>
        <select
          className={inputClassName}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === SUPPLIER_PAYMENT_TERMS_MANUAL) {
              setManualMode(true);
              if (isSupplierPaymentTermsPreset(trimmed)) onChange('');
              return;
            }
            setManualMode(false);
            onChange(next);
          }}
        >
          <option value="">Sin especificar</option>
          {SUPPLIER_PAYMENT_TERMS_PRESETS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={SUPPLIER_PAYMENT_TERMS_MANUAL}>Manual…</option>
        </select>
      </div>
      {manualMode && (
        <input
          className={inputClassName}
          placeholder="Escribe la condición (ej. 21 días fecha factura)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}
