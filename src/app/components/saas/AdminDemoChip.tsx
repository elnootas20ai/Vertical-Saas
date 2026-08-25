import { ADMIN_DEMO_BADGE_LABEL } from '../../lib/adminDashboardDemoGate';

/** Chip visible solo cuando el dashboard admin está en modo mock. */
export function AdminDemoChip({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
      {ADMIN_DEMO_BADGE_LABEL}
    </span>
  );
}
