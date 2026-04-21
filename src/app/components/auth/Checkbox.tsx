import { Check } from 'lucide-react';
import { InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export function Checkbox({ label, error, className = '', ...props }: CheckboxProps) {
  return (
    <div className="w-full">
      <label className="flex items-start gap-3 cursor-pointer">
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:bg-[#0f1419] peer-checked:border-[#0f1419] flex items-center justify-center transition-colors">
            <Check className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" />
          </div>
        </div>
        <span className="text-sm text-gray-700">{label}</span>
      </label>
      {error && (
        <p className="mt-1 text-sm text-red-600 ml-8">{error}</p>
      )}
    </div>
  );
}
