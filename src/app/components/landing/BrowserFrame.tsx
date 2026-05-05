import { ReactNode } from 'react';

interface BrowserFrameProps {
  children?: ReactNode;
  className?: string;
}

export function BrowserFrame({ children, className = '' }: BrowserFrameProps) {
  return (
    <div className={`bg-white rounded-2xl overflow-hidden ${className}`}>
      {/* Browser header */}
      <div className="bg-slate-100 px-4 py-3 flex items-center gap-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 ml-3">
          <div className="bg-white rounded-md px-3 py-1.5 text-xs text-slate-400 border border-slate-200 flex items-center gap-1.5">
            <div className="w-3 h-3 bg-slate-200 rounded-full flex-shrink-0" />
            app.vertialapp.com
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-gradient-to-br from-blue-50/50 to-white">
        {children}
      </div>
    </div>
  );
}
