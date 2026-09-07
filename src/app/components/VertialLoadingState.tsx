import { VertialLogo } from './VertialLogo';

interface VertialLoadingStateProps {
  label?: string;
  variant?: 'fullscreen' | 'content';
}

export function VertialLoadingState({
  label = 'Cargando…',
  variant = 'content',
}: VertialLoadingStateProps) {
  const isFullscreen = variant === 'fullscreen';

  return (
    <div
      className={
        isFullscreen
          ? 'flex min-h-screen items-center justify-center bg-[var(--v-surface,#f5f7fb)] px-4 dark:bg-slate-950'
          : 'flex min-h-[42vh] items-center justify-center px-4'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 flex min-w-52 flex-col items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/85 px-8 py-6 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85">
        <VertialLogo size="md" />
        <div
          className="h-1 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          aria-hidden="true"
        >
          <div
            className="h-full w-full motion-safe:animate-pulse"
            style={{ background: 'linear-gradient(90deg, #22c55e 0%, #14b8a6 52%, #2563eb 100%)' }}
          />
        </div>
        <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
    </div>
  );
}
