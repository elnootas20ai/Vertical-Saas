interface BadgeStatusProps {
  label: string;
  status: 'available' | 'coming-soon';
}

export function BadgeStatus({ label, status }: BadgeStatusProps) {
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-full">
      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
      {label}
    </span>
  );
}
