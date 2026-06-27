import { ReactNode } from 'react';

interface BrowserFrameProps {
  children?: ReactNode;
  className?: string;
  /** Variante oscura para hero de landing */
  dark?: boolean;
}

export function BrowserFrame({ children, className = '', dark = false }: BrowserFrameProps) {
  return (
    <div className={`rounded-2xl overflow-hidden ${dark ? 'bg-zinc-900' : 'bg-white'} ${className}`}>
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${dark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
        </div>
        <div className="flex-1 ml-3">
          <div className={`rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5 border ${dark ? 'bg-zinc-900 text-zinc-500 border-zinc-800' : 'bg-white text-slate-400 border-slate-200'}`}>
            <div className={`w-3 h-3 rounded-full shrink-0 ${dark ? 'bg-emerald-500/30' : 'bg-slate-200'}`} />
            vertialapp.com
          </div>
        </div>
      </div>
      <div className={dark ? 'bg-zinc-900' : 'bg-gradient-to-br from-blue-50/50 to-white'}>
        {children}
      </div>
    </div>
  );
}
