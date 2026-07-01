import type { ReactNode } from 'react';

type VehicleShellBlockProps = {
  className?: string;
  children?: ReactNode;
  label?: string;
};

/** Bloque estructural vacío — solo define zonas de layout. */
export function VehicleShellBlock({ className = '', children, label }: VehicleShellBlockProps) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-900 ${className}`}
      aria-hidden={!label}
    >
      {label ? (
        <span className="sr-only">{label}</span>
      ) : null}
      {children}
    </div>
  );
}

export function VehicleShellLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-gray-100/90 dark:bg-gray-800/80 ${className}`}
      aria-hidden
    />
  );
}
