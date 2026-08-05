import { useMemo, useState } from 'react';
import { IceCream, Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';

type Flavor = {
  id: string;
  name: string;
  price: number;
};

type CartLine = Flavor & { qty: number };

type SaleTicket = {
  id: string;
  at: string;
  total: number;
  lines: { name: string; qty: number; price: number }[];
};

const DEMO_FLAVORS: Flavor[] = [
  { id: 'vainilla', name: 'Vainilla', price: 2.5 },
  { id: 'chocolate', name: 'Chocolate', price: 2.5 },
  { id: 'fresa', name: 'Fresa', price: 2.8 },
  { id: 'cookies', name: 'Cookies', price: 3.2 },
  { id: 'pistacho', name: 'Pistacho', price: 3.5 },
  { id: 'limon', name: 'Limón', price: 2.6 },
];

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** TPV Heladería — independiente (no usa TPV Delivery). */
export function HeladeriaTpvPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tickets, setTickets] = useState<SaleTicket[]>([]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart],
  );

  function addFlavor(flavor: Flavor) {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === flavor.id);
      if (existing) {
        return prev.map((l) => (l.id === flavor.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { ...flavor, qty: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function clearCart() {
    setCart([]);
  }

  function charge() {
    if (!cart.length) {
      toast.error('Añade al menos un sabor');
      return;
    }
    const ticket: SaleTicket = {
      id: `T-${Date.now().toString(36).toUpperCase()}`,
      at: new Date().toLocaleString('es-ES'),
      total,
      lines: cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
    };
    setTickets((prev) => [ticket, ...prev].slice(0, 20));
    setCart([]);
    toast.success(`Ticket ${ticket.id} · ${formatEur(ticket.total)}`);
  }

  return (
    <HeladeriaMvpShell
      title="TPV Heladería"
      subtitle="Mostrador independiente · cobro rápido MVP"
      area="tpv"
      actions={
        <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={clearCart} disabled={!cart.length}>
          <Trash2 className="h-4 w-4" />
          Vaciar
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className={`${VERTIAL_SURFACE} p-4`}>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Sabores</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEMO_FLAVORS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addFlavor(f)}
                className="rounded-xl border border-stone-200 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:border-stone-800 dark:bg-stone-950 dark:hover:bg-blue-950/30"
              >
                <div className="flex items-center gap-2">
                  <IceCream className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{f.name}</span>
                </div>
                <p className="mt-1 text-xs text-stone-500">{formatEur(f.price)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className={`${VERTIAL_SURFACE} flex flex-col p-4`}>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ticket actual</h2>
          <ul className="mt-3 flex-1 space-y-2">
            {!cart.length ? (
              <li className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-400 dark:border-stone-700">
                Sin líneas
              </li>
            ) : (
              cart.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{l.name}</p>
                    <p className="text-xs text-stone-500">{formatEur(l.price)} · ud</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      onClick={() => changeQty(l.id, -1)}
                      aria-label="Quitar"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{l.qty}</span>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      onClick={() => changeQty(l.id, 1)}
                      aria-label="Añadir"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-xl font-semibold text-stone-900 dark:text-stone-100">
                {formatEur(total)}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${VERTIAL_BTN_DANGER} flex-1`} onClick={clearCart} disabled={!cart.length}>
                Anular
              </button>
              <button type="button" className={`${VERTIAL_BTN_PRIMARY} flex-1`} onClick={charge} disabled={!cart.length}>
                Cobrar
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className={`${VERTIAL_SURFACE} p-4`}>
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          Tickets cobrados (sesión)
        </h2>
        {!tickets.length ? (
          <p className="mt-2 text-sm text-stone-500">Aún no hay tickets en esta sesión.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-800"
              >
                <div>
                  <p className="font-mono text-xs text-stone-400">{t.id}</p>
                  <p className="text-sm text-stone-700 dark:text-stone-200">
                    {t.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')}
                  </p>
                  <p className="text-xs text-stone-500">{t.at}</p>
                </div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {formatEur(t.total)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </HeladeriaMvpShell>
  );
}
