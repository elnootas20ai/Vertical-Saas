/**
 * Pantalla nueva del vertical bar/restaurante (núcleo).
 * Contenido se irá montando pantalla a pantalla — sin reutilizar Delivery.
 */
import { UtensilsCrossed } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';

type Props = {
  title: string;
  subtitle?: string;
};

export function RestaurantPlaceholderPage({ title, subtitle }: Props) {
  return (
    <Layout title={title} subtitle={subtitle || 'Bar / Restaurante'}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-200 dark:bg-stone-800">
          <UtensilsCrossed className="h-8 w-8 text-stone-600 dark:text-stone-300" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{title}</h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Módulo nuevo de bar/restaurante. Aquí montamos {title.toLowerCase()} sin mezclar con Delivery.
          </p>
        </div>
      </div>
    </Layout>
  );
}
