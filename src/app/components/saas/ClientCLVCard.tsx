import { useEffect, useState } from 'react';
import { TrendingUp, Star, Award, Target, Calendar, ShoppingCart } from 'lucide-react';
import { getClientCLVRequest, type ClientCLV } from '../../lib/crmApi';

interface Props {
  userId: string;
  clientId: string;
}

const SEGMENT_CONFIG = {
  vip:    { label: 'VIP',    color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200', icon: Star,   dotColor: 'bg-purple-500' },
  high:   { label: 'Alto',   color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',   icon: TrendingUp, dotColor: 'bg-blue-500' },
  medium: { label: 'Medio',  color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  icon: Target, dotColor: 'bg-green-500' },
  low:    { label: 'Bajo',   color: 'text-gray-600 dark:text-gray-400',   bg: 'bg-gray-50 dark:bg-gray-800',    border: 'border-gray-200 dark:border-gray-700',   icon: Award,  dotColor: 'bg-gray-400' },
};

function formatCurrency(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K€`;
  return `${value.toFixed(0)}€`;
}

export function ClientCLVCard({ userId, clientId }: Props) {
  const [clv, setCLV] = useState<ClientCLV | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getClientCLVRequest(userId, clientId)
      .then(data => { setCLV(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId, clientId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-5 animate-pulse">
        <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-1/3 mb-3" />
        <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-2/3" />
      </div>
    );
  }

  if (!clv) return null;

  const seg = SEGMENT_CONFIG[clv.segment] || SEGMENT_CONFIG.low;
  const SegIcon = seg.icon;

  const stats = [
    { label: 'Ingresos totales', value: formatCurrency(clv.totalRevenue), icon: ShoppingCart },
    { label: 'CLV proyectado (3 años)', value: formatCurrency(clv.projectedCLV), icon: TrendingUp },
    { label: 'Transacciones', value: String(clv.totalTransactions), icon: Calendar },
    { label: 'Vehículos comprados', value: String(clv.vehiclesPurchasedCount), icon: Award },
  ];

  return (
    <div className={`rounded-2xl border-2 ${seg.border} ${seg.bg} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${seg.bg}`}>
            <SegIcon className={`w-4 h-4 ${seg.color}`} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer Lifetime Value</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${seg.dotColor}`} />
              <span className={`text-xs font-bold ${seg.color}`}>Segmento {seg.label}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{formatCurrency(clv.projectedCLV)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">CLV 36 meses</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white dark:bg-gray-800/70 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{stat.label}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {clv.relationshipDays > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
          Cliente desde hace {clv.relationshipDays} días · Promedio {formatCurrency(clv.avgMonthlyRevenue)}/mes
        </p>
      )}
    </div>
  );
}
