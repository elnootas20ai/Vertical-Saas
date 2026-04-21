import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';

interface FunnelStage {
  id: string;
  label: string;
  count: number;
  value: number;
  color: string;
  bg: string;
}

interface SalesFunnelProps {
  stages: FunnelStage[];
  onStageClick?: (stageId: string) => void;
  compact?: boolean;
}

export function SalesFunnel({ stages, onStageClick, compact = false }: SalesFunnelProps) {
  const maxCount = useMemo(() => Math.max(...stages.map((s) => s.count), 1), [stages]);

  const conversionRates = useMemo(() => {
    return stages.map((s, i) => {
      if (i === 0) return 100;
      const prev = stages[i - 1].count;
      return prev > 0 ? Math.round((s.count / prev) * 100) : 0;
    });
  }, [stages]);

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <TrendingDown className="w-8 h-8 mb-2" />
        <p className="text-sm">Sin datos de embudo</p>
      </div>
    );
  }

  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div className={`space-y-1.5 ${compact ? '' : 'space-y-2'}`}>
      {stages.map((stage, i) => {
        const widthPct = Math.max(20, (stage.count / maxCount) * 100);

        return (
          <button
            key={stage.id}
            onClick={() => onStageClick?.(stage.id)}
            className="w-full group focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <div
                  className={`relative h-${compact ? '8' : '10'} rounded-lg transition-all duration-300 group-hover:opacity-90 group-hover:shadow-sm overflow-hidden`}
                  style={{ width: `${widthPct}%` }}
                >
                  <div className={`absolute inset-0 ${stage.bg} rounded-lg`} />
                  <div
                    className={`absolute inset-0 rounded-lg opacity-80`}
                    style={{
                      background: `linear-gradient(90deg, ${stage.color}22 0%, ${stage.color}44 100%)`,
                    }}
                  />
                  <div className="relative flex items-center justify-between h-full px-3">
                    <span className={`text-xs font-semibold truncate ${compact ? '' : 'text-sm'}`} style={{ color: stage.color }}>
                      {stage.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: stage.color }}>
                        {stage.count}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`flex flex-col items-end min-w-[60px] ${compact ? 'min-w-[50px]' : ''}`}>
                {stage.value > 0 && (
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {formatValue(stage.value)}&euro;
                  </span>
                )}
                {i > 0 && (
                  <span className={`text-[10px] font-medium ${conversionRates[i] >= 50 ? 'text-emerald-600' : conversionRates[i] >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                    {conversionRates[i]}%
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
