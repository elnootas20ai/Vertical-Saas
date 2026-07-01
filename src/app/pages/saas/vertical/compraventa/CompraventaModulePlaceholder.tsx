import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Layout } from '../../../../components/saas/Layout';

type CompraventaModulePlaceholderProps = {
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
};

export function CompraventaModulePlaceholder({
  title,
  subtitle,
  Icon: IconComponent = Sparkles,
}: CompraventaModulePlaceholderProps) {
  return (
    <Layout title={title} subtitle={subtitle ?? 'Compraventa'}>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <IconComponent className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          Este módulo estará disponible pronto. La navegación ya está preparada.
        </p>
      </div>
    </Layout>
  );
}
