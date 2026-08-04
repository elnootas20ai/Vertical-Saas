import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Tip invisible hasta hover / toque. Sin iconos: el propio texto es la zona.
 * Tablet: toca el texto → cuadradito 2,8 s.
 */
export function QuietTip({
  tip,
  children,
  className = '',
}: {
  tip: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const showBrief = () => {
    setOpen(true);
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 2800);
  };

  return (
    <span
      className={`relative inline-flex max-w-full ${className}`}
      onMouseEnter={() => {
        clearTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        clearTimer();
        setOpen(false);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          e.preventDefault();
          showBrief();
        }
      }}
    >
      <span className="touch-manipulation select-none">{children}</span>
      {open ? (
        <span
          role="tooltip"
          className="absolute z-[140] left-0 bottom-[calc(100%+6px)] w-max max-w-[15rem] rounded-lg border border-stone-700 bg-stone-900 px-2.5 py-2 text-[11px] font-medium leading-snug text-white shadow-lg pointer-events-none"
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}
