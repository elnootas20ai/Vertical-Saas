/**
 * Núcleo vacío del vertical bar/restaurante.
 * Delivery no toca estas rutas; producto sala se reconstruye desde aquí.
 */
import { UtensilsCrossed } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';

type Props = {
  title: string;
  subtitle?: string;
};

export function RestaurantRebuildStub({ title, subtitle }: Props) {
  return (
    <Layout title={title} subtitle={subtitle || 'Bar / Restaurante'}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-200 dark:bg-stone-800">
          <UtensilsCrossed className="h-8 w-8 text-stone-600 dark:text-stone-300" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
            Se hace de nuevo
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Esta pantalla del bar/restaurante ya no usa el flujo mezclado con Delivery.
            Aquí va el producto nuevo cuando lo definamos.
          </p>
        </div>
      </div>
    </Layout>
  );
}
