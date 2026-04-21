import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

interface TabLoaderProps {
  text?: string;
  /** Compact mode for inline/section loaders instead of full-tab */
  compact?: boolean;
}

export function TabLoader({ text, compact }: TabLoaderProps) {
  const { isDark } = usePluginSettings();

  const size = compact ? 'size-7' : 'size-10';
  const glowSize = compact ? 'size-14' : 'size-20';
  const pingSize = compact ? 'size-10' : 'size-14';
  const thickness = compact ? '2px' : '2.5px';

  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-4 animate-in fade-in duration-500',
      compact ? 'py-10' : 'flex-1 h-full min-h-0',
    )}>
      <div className="relative flex items-center justify-center">
        {/* Ambient glow */}
        <div className={cn(
          glowSize,
          'absolute rounded-full blur-2xl animate-pulse',
          isDark
            ? 'bg-gradient-to-tr from-violet-600/30 via-fuchsia-500/25 to-amber-400/20'
            : 'bg-gradient-to-tr from-violet-400/20 via-fuchsia-400/15 to-amber-300/15',
        )} />

        {/* Pulsing outer ring */}
        <div
          className={cn(
            pingSize,
            'absolute rounded-full animate-ping',
            isDark ? 'border border-violet-500/15' : 'border border-violet-400/10',
          )}
          style={{ animationDuration: '2.5s' }}
        />

        {/* Spinning gradient ring */}
        <div
          className={cn(size, 'relative rounded-full animate-spin')}
          style={{
            background: 'conic-gradient(from 0deg, #8b5cf6, #d946ef, #f59e0b, #06b6d4, transparent)',
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}), #000 calc(100% - ${thickness}))`,
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}), #000 calc(100% - ${thickness}))`,
            animationDuration: '1.2s',
          }}
        />

        {/* Center dot glow */}
        <div className={cn(
          'absolute rounded-full',
          compact ? 'size-1.5' : 'size-2',
          isDark
            ? 'bg-violet-400/60 shadow-[0_0_8px_2px_rgba(139,92,246,0.3)]'
            : 'bg-violet-500/50 shadow-[0_0_8px_2px_rgba(139,92,246,0.2)]',
        )} />
      </div>

      {text && (
        <p className={cn(
          'font-medium animate-pulse',
          compact ? 'text-[10px]' : 'text-[11px]',
          'bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent',
        )}>
          {text}
        </p>
      )}
    </div>
  );
}
