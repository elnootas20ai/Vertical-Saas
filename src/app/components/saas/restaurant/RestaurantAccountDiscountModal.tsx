import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { DecimalNumpadField } from '../DecimalNumpadField';
import { parseDecimalPadValue } from '../../../lib/decimalNumpadInput';
import { computePromoDiscount, findActivePromotionByCode } from '../../../lib/promoCodes';
import {
  loyaltyDiscountFromPoints,
  maxRedeemablePoints,
} from '../../../lib/restaurantLoyalty';

function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type Props = {
  subtotal: number;
  currentDiscount?: number;
  currentDiscountPercent?: number;
  onApply: (payload: {
    discountPercent?: number;
    discount?: number;
    reason: string;
    loyaltyRedeem?: { points: number; clientId?: string; reason?: string };
  }) => void;
  onClear: () => void;
  onClose: () => void;
  submitting?: boolean;
  /** Puntos disponibles del cliente CRM vinculado. */
  loyaltyPoints?: number;
  clientId?: string;
  clientName?: string;
};

export function RestaurantAccountDiscountModal({
  subtotal,
  currentDiscount = 0,
  currentDiscountPercent = 0,
  onApply,
  onClear,
  onClose,
  submitting = false,
  loyaltyPoints = 0,
  clientId = '',
  clientName = '',
}: Props) {
  const [tab, setTab] = useState<'manual' | 'promo' | 'loyalty'>('manual');
  const [mode, setMode] = useState<'percent' | 'fixed'>(
    currentDiscountPercent > 0 ? 'percent' : 'fixed',
  );
  const [value, setValue] = useState(
    String(currentDiscountPercent > 0 ? currentDiscountPercent : currentDiscount || ''),
  );
  const [reason, setReason] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [pointsInput, setPointsInput] = useState('');

  const availablePts = Math.max(0, Math.floor(Number(loyaltyPoints) || 0));
  const maxPts = useMemo(
    () => maxRedeemablePoints(availablePts, subtotal),
    [availablePts, subtotal],
  );

  const preview = (() => {
    const num = parseDecimalPadValue(value);
    if (isNaN(num) || num <= 0) return 0;
    if (mode === 'percent') {
      return Math.round(subtotal * Math.min(num, 100) / 100 * 100) / 100;
    }
    return Math.min(num, subtotal);
  })();

  const loyaltyPreview = (() => {
    const pts = Math.min(maxPts, Math.max(0, Math.floor(parseDecimalPadValue(pointsInput) || 0)));
    return loyaltyDiscountFromPoints(pts);
  })();

  const applyPromo = () => {
    const promo = findActivePromotionByCode(promoCode);
    if (!promo) {
      toast.error('Código no válido o caducado');
      return;
    }
    const { discount } = computePromoDiscount(subtotal, promo);
    if (!(discount > 0)) {
      toast.error('Esta promo no aplica un descuento de cuenta (revisa tipo en Promociones)');
      return;
    }
    onApply({
      discount: Math.min(discount, subtotal),
      reason: `PROMO ${promo.code}${promo.name ? ` · ${promo.name}` : ''}`,
    });
  };

  const applyLoyalty = () => {
    if (!clientId || clientId.startsWith('tpv-')) {
      toast.error('Vincula un cliente CRM para canjear puntos');
      return;
    }
    const pts = Math.floor(parseDecimalPadValue(pointsInput) || 0);
    if (!(pts > 0)) {
      toast.error('Indica puntos a canjear');
      return;
    }
    if (pts > maxPts) {
      toast.error(maxPts <= 0
        ? 'No hay puntos canjeables para esta cuenta'
        : `Máximo ${maxPts} pts en esta cuenta`);
      return;
    }
    const discount = loyaltyDiscountFromPoints(pts);
    onApply({
      discount,
      reason: `LOYALTY ${pts} pts`,
      loyaltyRedeem: { points: pts, clientId, reason: `LOYALTY ${pts} pts` },
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Descuento en cuenta</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Subtotal: <span className="font-bold tabular-nums">{formatEuro(subtotal)}</span>
          </p>

          <div className="flex gap-2">
            {([
              { id: 'manual' as const, label: 'Manual' },
              { id: 'promo' as const, label: 'Promo' },
              { id: 'loyalty' as const, label: 'Puntos' },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 min-h-[40px] rounded-lg border-2 text-sm font-semibold ${
                  tab === t.id
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'promo' ? (
            <>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Código (ej. HAPPY10)"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-semibold tracking-wide uppercase"
                autoCapitalize="characters"
              />
              <p className="text-xs text-gray-500">
                Usa promociones activas de la empresa (% o importe fijo).
              </p>
              <div className="flex gap-2">
                {(currentDiscount > 0 || currentDiscountPercent > 0) ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClear}
                    className="flex-1 min-h-[44px] rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-sm"
                  >
                    Quitar
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={submitting || !promoCode.trim()}
                  onClick={applyPromo}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Aplicando…' : 'Aplicar promo'}
                </button>
              </div>
            </>
          ) : tab === 'loyalty' ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  {clientName || 'Cliente'} · {availablePts} pts
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                  10 pts = 1 € · máx. canjeable ahora: {maxPts} pts
                </p>
              </div>
              <DecimalNumpadField
                value={pointsInput}
                onChange={setPointsInput}
                placeholder={maxPts > 0 ? String(maxPts) : '0'}
                showNumpad
                maxDecimals={0}
                inputClassName="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting || maxPts <= 0}
                  onClick={() => setPointsInput(String(maxPts))}
                  className="min-h-[44px] rounded-xl border-2 border-gray-200 px-3 text-xs font-semibold dark:border-gray-700"
                >
                  Todo
                </button>
                {(currentDiscount > 0 || currentDiscountPercent > 0) ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClear}
                    className="flex-1 min-h-[44px] rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-sm"
                  >
                    Quitar
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={submitting || maxPts <= 0}
                  onClick={applyLoyalty}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Aplicando…' : loyaltyPreview > 0 ? `Canjear −${formatEuro(loyaltyPreview)}` : 'Canjear'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                {(['percent', 'fixed'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 min-h-[40px] rounded-lg border-2 text-sm font-semibold ${
                      mode === m
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {m === 'percent' ? '% Porcentaje' : '€ Importe'}
                  </button>
                ))}
              </div>
              <DecimalNumpadField
                value={value}
                onChange={setValue}
                placeholder={mode === 'percent' ? '10' : '5.00'}
                showNumpad
                maxDecimals={2}
                inputClassName="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (opcional)"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
              />
              {preview > 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
                  Descuento: -{formatEuro(preview)}
                </p>
              ) : null}
              <div className="flex gap-2">
                {(currentDiscount > 0 || currentDiscountPercent > 0) ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClear}
                    className="flex-1 min-h-[44px] rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-sm"
                  >
                    Quitar
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    const num = parseDecimalPadValue(value);
                    if (isNaN(num) || num <= 0) {
                      toast.error(mode === 'percent' ? 'Indica un % mayor que 0' : 'Indica un importe mayor que 0');
                      return;
                    }
                    if (mode === 'percent') {
                      onApply({ discountPercent: Math.min(100, num), reason });
                    } else {
                      onApply({ discount: num, reason });
                    }
                  }}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Aplicando…' : 'Aplicar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
