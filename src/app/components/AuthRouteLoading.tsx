import { Loader2 } from 'lucide-react';

export function AuthRouteLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-3 p-6">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label={label} />
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
