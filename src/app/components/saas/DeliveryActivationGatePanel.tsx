import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Lock, Store } from 'lucide-react';
import { ACCESO__Button } from '../design-system/ACCESO__Button';
import {
  DELIVERY_MARCA_SETTINGS_PATH,
  DELIVERY_TIENDA_SETTINGS_PATH,
} from '../../lib/deliveryActivationGates';

type GateKind = 'store_pdv' | 'brand';

const COPY: Record<
  GateKind,
  { title: string; description: string; cta: string; route: string }
> = {
  store_pdv: {
    title: 'Primero: tienda y PDV',
    description:
      'Sin un local y una caja (PDV) activos no puedes configurar marca, catálogo ni vender. Es el primer paso del alta delivery.',
    cta: 'Ir a Tienda y crear PDV',
    route: DELIVERY_TIENDA_SETTINGS_PATH,
  },
  brand: {
    title: 'Configura tu marca antes',
    description:
      'El catálogo y los precios van ligados a una marca (tu carta). Completa la marca en Ajustes antes de seguir.',
    cta: 'Ir a Marca',
    route: DELIVERY_MARCA_SETTINGS_PATH,
  },
};

export function DeliveryActivationGatePanel({ kind }: { kind: GateKind }) {
  const navigate = useNavigate();
  const copy = COPY[kind];

  return (
    <div className="mx-auto max-w-lg rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-6 sm:p-8 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
        {kind === 'store_pdv' ? (
          <Store className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        ) : (
          <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        )}
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{copy.title}</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{copy.description}</p>
      </div>
      <p className="flex items-start justify-center gap-2 text-xs text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Sigue el orden del panel «Alta delivery» en el menú lateral.
      </p>
      <ACCESO__Button
        variant="primary"
        onClick={() => navigate(copy.route)}
        className="inline-flex items-center gap-2"
      >
        {copy.cta}
        <ArrowRight className="w-4 h-4" />
      </ACCESO__Button>
    </div>
  );
}
