import { Check } from 'lucide-react';

export interface ACCESO__StepperProps {
  steps: string[];
  currentStep: number;
  /** Permite ir a pasos ya alcanzados (índice ≤ paso actual) haciendo clic; no salta a pasos futuros. */
  onStepClick?: (stepIndex: number) => void;
}

export function ACCESO__Stepper({ steps, currentStep, onStepClick }: ACCESO__StepperProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isReachable = index <= currentStep;
          const isInteractive = Boolean(onStepClick) && isReachable;
          const circleClass = `
                w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all shrink-0
                ${index < currentStep
                  ? 'bg-green-500 text-white'
                  : index === currentStep
                  ? 'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-900/40'
                  : 'bg-gray-200 text-gray-500 dark:text-gray-400'
                }
              `;
          const labelClass = `
                mt-2 text-xs md:text-sm font-medium text-center px-0.5
                ${index === currentStep ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}
              `;

          const inner = (
            <>
              <div className={circleClass}>
                {index < currentStep ? (
                  <Check className="w-5 h-5" aria-hidden />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span className={labelClass}>{step}</span>
            </>
          );

          return (
            <div key={index} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1 min-w-0">
                {isInteractive ? (
                  <button
                    type="button"
                    onClick={() => onStepClick!(index)}
                    className={`flex flex-col items-center w-full max-w-[8rem] rounded-xl -m-1 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                      index === currentStep
                        ? 'cursor-default'
                        : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                    aria-current={index === currentStep ? 'step' : undefined}
                    aria-label={
                      index === currentStep
                        ? `Paso actual: ${step}`
                        : `Ir al paso ${index + 1}: ${step}`
                    }
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="flex flex-col items-center w-full max-w-[8rem]">{inner}</div>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`
                h-1 flex-1 mx-2 transition-all shrink min-w-[0.5rem]
                ${index < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}
              `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
