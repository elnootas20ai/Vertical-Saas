export type OperationStatus = 'pending' | 'in_progress' | 'delayed' | 'completed';

interface Props {
  status: OperationStatus;
}

const statusConfig: Record<OperationStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pendiente', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700', icon: '⏳' },
  in_progress: { label: 'En progreso', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '⚙️' },
  delayed: { label: 'Retrasado', color: 'bg-red-100 text-red-700 border-red-200', icon: '⚠️' },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-700 border-green-200', icon: '✓' },
};

export function SAAS__StatusBadge({ status }: Props) {
  const config = statusConfig[status];
  
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full border ${config.color}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
